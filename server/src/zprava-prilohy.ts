/**
 * Chat message attachments.
 *
 * Bytes go to R2 under `chat-prilohy/<uuid>.<ext>`. The object key is never
 * built from the user-supplied filename. JSON responses carry metadata only;
 * download is GET /api/diskuze/prilohy/:id with the same read permission as
 * the parent thread.
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Request, Response } from "express";
import { skupinaZpravy } from "../../drizzle/schema/chat_skupiny";
import { soukromeZpravy } from "../../drizzle/schema/soukrome_zpravy";
import { zpravy } from "../../drizzle/schema/zpravy";
import {
  jeDruhZpravaPrilohy,
  zpravaPrilohy,
  type DruhZpravaPrilohy,
} from "../../drizzle/schema/zprava_prilohy";
import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type ApiZpravaPriloha,
} from "../../src/shared/api-types";
import type { Db } from "./db";
import { posliObrazek } from "./obrazek-nahled";
import {
  nactiObrazekKOdeslani,
  pripravObrazekKUlozeni,
  r2Pozadavek,
  smazObrazekR2Tise,
  ulozPripravenyObrazek,
  type R2Nastaveni,
} from "./r2-fotky";

const POVOLENE_PRIPONY = new Set<string>(VALIDACE.prilohaPovolenePripony);

/** Whole multipart body: 5 × 10 MiB plus room for boundaries and text fields. */
export const PRILOHY_TELO_MAX_BAJTU =
  VALIDACE.prilohyMaxPocet * VALIDACE.prilohaMaxBajtu + 256 * 1024;

const CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  gpx: "application/gpx+xml",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  heic: "image/heic",
};

const NAHLED_OBRAZKU = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** Raster attachments that go through the WebP helper. GIF and HEIC stay original when it returns null. */
const OBRAZKY_K_DERIVACI = new Set<string>(["png", "jpg", "jpeg", "webp", "gif", "heic"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KLIC_RE = new RegExp(
  `^chat-prilohy/${UUID_RE.source.slice(1, -1)}\\.(?:${[...POVOLENE_PRIPONY].join("|")})$`,
  "i",
);

export class ChybiUlozistePriloh extends Error {
  constructor() {
    super("r2-chybi");
    this.name = "ChybiUlozistePriloh";
  }
}

export type DuvodPrilohy = "velikost" | "format" | "pocet" | "chybi";

export interface PripravenaPriloha {
  nazev: string;
  pripona: string;
  contentType: string;
  bajty: Buffer;
}

export interface NahranaPriloha {
  klic: string;
  nazev: string;
  bajty: number;
  contentType: string;
}

export interface NacteneTeloZpravy {
  text: string;
  soubory: PripravenaPriloha[];
  pole: { channel: string; partnerId: string };
}

export type VysledekTelaZpravy =
  | { ok: true; zdroj: "json"; telo: unknown }
  | { ok: true; zdroj: "multipart"; data: NacteneTeloZpravy }
  | { ok: false; hlaska: string; chyby: Record<string, string[]> };

/** Preview flag for png / jpeg / webp / gif. HEIC stays download-only. */
export function jeNahledObrazku(contentType: string): boolean {
  return NAHLED_OBRAZKU.has(contentType);
}

export function contentTypePrilohy(pripona: string): string | null {
  return CONTENT_TYPE[pripona.toLowerCase()] ?? null;
}

/**
 * Basename only, control characters removed, capped at 120.
 * Empty when the name is `.` or `..` after stripping.
 */
export function zobrazovaciNazevPrilohy(surovy: string): string {
  const bezKontrol = surovy.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, "");
  const casti = bezKontrol.split(/[/\\]/);
  const bazovy = (casti[casti.length - 1] ?? "").replace(/["\\]/g, "").trim();
  if (bazovy === "." || bazovy === "..") return "";
  return Array.from(bazovy).slice(0, 120).join("");
}

/**
 * Allowlisted extension from the basename (before the 120-char cap).
 * The extension is the only type signal; HTML, SVG, JS, and EXE never pass.
 */
export function rozpoznejNazevPrilohy(
  surovy: string,
): { ok: true; nazev: string; pripona: string } | { ok: false; duvod: "format" | "chybi" } {
  const bezKontrol = surovy.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, "");
  const casti = bezKontrol.split(/[/\\]/);
  const bazovy = (casti[casti.length - 1] ?? "").replace(/["\\]/g, "").trim();
  if (bazovy.length === 0 || bazovy === "." || bazovy === "..") {
    return { ok: false, duvod: "chybi" };
  }
  const shoda = /\.([A-Za-z0-9]{1,10})$/.exec(bazovy);
  const pripona = shoda?.[1]?.toLowerCase() ?? "";
  if (!POVOLENE_PRIPONY.has(pripona)) return { ok: false, duvod: "format" };
  const nazev = zobrazovaciNazevPrilohy(bazovy);
  return {
    ok: true,
    nazev: nazev.length > 0 ? nazev : `soubor.${pripona}`,
    pripona,
  };
}

/** `chat-prilohy/<uuid>.<ext>`. Null when the extension is not allowlisted. */
export function klicChatPrilohy(pripona: string, id: string = randomUUID()): string | null {
  const ext = pripona.toLowerCase();
  if (!POVOLENE_PRIPONY.has(ext)) return null;
  if (!UUID_RE.test(id)) return null;
  return `chat-prilohy/${id}.${ext}`;
}

export function jeKlicChatPrilohy(klic: string): boolean {
  if (klic.toLowerCase().endsWith(".nahled.webp")) return false;
  return KLIC_RE.test(klic) && !klic.includes("..");
}

/** RFC 5987 `filename*`. Inline only for previewable images. */
export function hlavickaContentDisposition(nazev: string, inline: boolean): string {
  const bezpecny = zobrazovaciNazevPrilohy(nazev);
  const jmeno = bezpecny.length > 0 ? bezpecny : "soubor";
  const ascii = jmeno
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\;]/g, "_")
    .trim();
  const fallback = ascii.length > 0 ? ascii : "soubor";
  const hvezdicka = encodeURIComponent(jmeno).replace(/[!'()*]/g, (znak) =>
    `%${znak.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const dispozice = inline ? "inline" : "attachment";
  return `${dispozice}; filename="${fallback}"; filename*=UTF-8''${hvezdicka}`;
}

/**
 * Empty text is valid only when at least one file is present.
 * A message with neither text nor a file is rejected. Cap stays 1000.
 */
export function zkontrolujTextZpravy(
  text: string,
  pocetSouboru: number,
): { ok: true; text: string } | { ok: false; hlaska: string } {
  const cisty = text.trim();
  if (cisty.length > VALIDACE.zpravaTextMaxDelka) {
    return { ok: false, hlaska: VALIDACNI_ZPRAVY.zpravaTextDlouhy };
  }
  if (cisty.length === 0 && pocetSouboru < 1) {
    return { ok: false, hlaska: VALIDACNI_ZPRAVY.zpravaTextPovinny };
  }
  return { ok: true, text: cisty };
}

function hlaskaSouboru(duvod: DuvodPrilohy): string {
  if (duvod === "velikost") return "Soubor může mít nejvýš 10 MB.";
  if (duvod === "format") return "Ten typ souboru nejde přiložit.";
  if (duvod === "pocet") return "K jedné zprávě jde přiložit nejvýš 5 souborů.";
  return "Vyber soubor.";
}

function chybaSouboru(duvod: DuvodPrilohy): VysledekTelaZpravy {
  return {
    ok: false,
    hlaska: "Zkontroluj zvýrazněná pole.",
    chyby: { soubor: [hlaskaSouboru(duvod)] },
  };
}

function hraniceZHlavicky(contentType: string): string | null {
  const shoda = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const hranice = (shoda?.[1] ?? shoda?.[2] ?? "").trim();
  if (hranice.length === 0 || hranice.length > 200) return null;
  return hranice;
}

/** Field name. Must not match the `name` inside `filename`. */
function ctiJmenoPole(hlavicka: string): string {
  const shoda = /(?:^|[\s;])name="([^"]*)"/i.exec(hlavicka);
  return shoda?.[1] ?? "";
}

/** Prefer RFC 5987 `filename*` over the quoted `filename`. */
function ctiFilename(hlavicka: string): string {
  const hvezdicka = /filename\*=UTF-8''([^;\r\n]+)/i.exec(hlavicka);
  if (hvezdicka?.[1] !== undefined) {
    try {
      return decodeURIComponent(hvezdicka[1].trim());
    } catch {
      return "";
    }
  }
  const uvozovky = /(?:^|[\s;])filename="([^"]*)"/i.exec(hlavicka)?.[1] ?? "";
  if (uvozovky.length > 0) return uvozovky;
  const hole = /filename=([^;\s]+)/i.exec(hlavicka);
  return hole?.[1] ?? "";
}

/**
 * Multipart field `text` plus repeated `soubor`.
 * Also reads optional `channel` and `partnerId` text fields.
 * Does not trust the part Content-Type.
 */
export function rozdelPrilohyMultipart(
  telo: Buffer,
  contentType: string,
):
  | { ok: true; text: string; soubory: PripravenaPriloha[]; pole: { channel: string; partnerId: string } }
  | { ok: false; duvod: DuvodPrilohy } {
  if (telo.length > PRILOHY_TELO_MAX_BAJTU) return { ok: false, duvod: "velikost" };
  const hranice = hraniceZHlavicky(contentType);
  if (hranice === null) return { ok: false, duvod: "chybi" };
  const znacka = Buffer.from(`--${hranice}`);
  let text = "";
  let channel = "";
  let partnerId = "";
  const soubory: PripravenaPriloha[] = [];
  let pozice = telo.indexOf(znacka);
  if (pozice < 0) return { ok: false, duvod: "chybi" };
  while (pozice >= 0) {
    let start = pozice + znacka.length;
    if (telo[start] === 45 && telo[start + 1] === 45) break;
    if (telo[start] === 13 && telo[start + 1] === 10) start += 2;
    else if (telo[start] === 10) start += 1;
    const dalsi = telo.indexOf(znacka, start);
    if (dalsi < 0) break;
    let konec = dalsi;
    if (konec >= 2 && telo[konec - 2] === 13 && telo[konec - 1] === 10) konec -= 2;
    else if (konec >= 1 && telo[konec - 1] === 10) konec -= 1;
    const cast = telo.subarray(start, konec);
    const oddelovac = cast.indexOf(Buffer.from("\r\n\r\n"));
    if (oddelovac >= 0) {
      const hlavicka = cast.subarray(0, oddelovac).toString("utf8");
      const data = cast.subarray(oddelovac + 4);
      const jmeno = ctiJmenoPole(hlavicka);
      if (jmeno === "text") text = data.toString("utf8");
      else if (jmeno === "channel") channel = data.toString("utf8");
      else if (jmeno === "partnerId") partnerId = data.toString("utf8");
      else if (jmeno === "soubor") {
        if (soubory.length >= VALIDACE.prilohyMaxPocet) return { ok: false, duvod: "pocet" };
        if (data.length === 0) return { ok: false, duvod: "chybi" };
        if (data.length > VALIDACE.prilohaMaxBajtu) return { ok: false, duvod: "velikost" };
        const rozpoznane = rozpoznejNazevPrilohy(ctiFilename(hlavicka));
        if (!rozpoznane.ok) return rozpoznane;
        const typ = contentTypePrilohy(rozpoznane.pripona);
        if (typ === null) return { ok: false, duvod: "format" };
        soubory.push({
          nazev: rozpoznane.nazev,
          pripona: rozpoznane.pripona,
          contentType: typ,
          bajty: Buffer.from(data),
        });
      }
    }
    pozice = dalsi;
  }
  return { ok: true, text, soubory, pole: { channel: channel.trim(), partnerId: partnerId.trim() } };
}

/** Same raw-body cap as photo upload. Stops reading once `maxBajtu` is passed. */
export function ctiSuroveTelo(req: Request, maxBajtu: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const kusy: Buffer[] = [];
    let nacteno = 0;
    req.on("data", (dil: Buffer) => {
      nacteno += dil.length;
      if (nacteno > maxBajtu) {
        reject(new Error("velikost"));
        req.destroy();
        return;
      }
      kusy.push(dil);
    });
    req.on("end", () => resolve(Buffer.concat(kusy)));
    req.on("error", () => reject(new Error("cteni")));
  });
}

function jeMultipart(req: Request): boolean {
  const hlavicka = req.header("content-type") ?? "";
  return hlavicka.toLowerCase().includes("multipart/form-data");
}

/**
 * JSON stays `{ text }` (and the endpoint's existing extra fields).
 * Multipart is `text` + repeated `soubor`.
 */
export async function nactiTeloZpravy(req: Request): Promise<VysledekTelaZpravy> {
  if (!jeMultipart(req)) return { ok: true, zdroj: "json", telo: req.body as unknown };
  const contentType = req.header("content-type") ?? "";
  let telo: Buffer;
  try {
    telo = await ctiSuroveTelo(req, PRILOHY_TELO_MAX_BAJTU);
  } catch (chyba: unknown) {
    const velikost = chyba instanceof Error && chyba.message === "velikost";
    return chybaSouboru(velikost ? "velikost" : "chybi");
  }
  const rozdelene = rozdelPrilohyMultipart(telo, contentType);
  if (!rozdelene.ok) return chybaSouboru(rozdelene.duvod);
  const text = zkontrolujTextZpravy(rozdelene.text, rozdelene.soubory.length);
  if (!text.ok) {
    return {
      ok: false,
      hlaska: "Zkontroluj zvýrazněná pole.",
      chyby: { text: [text.hlaska] },
    };
  }
  return {
    ok: true,
    zdroj: "multipart",
    data: {
      text: text.text,
      soubory: rozdelene.soubory,
      pole: rozdelene.pole,
    },
  };
}

export function naApiPrilohu(radek: {
  id: string;
  nazev: string;
  bajty: number;
  contentType: string;
}): ApiZpravaPriloha {
  return {
    id: radek.id,
    nazev: radek.nazev,
    bajty: radek.bajty,
    contentType: radek.contentType,
    jeObrazek: jeNahledObrazku(radek.contentType),
  };
}

/** Attachments of visible messages only. Callers pass ids already filtered by soft-delete. */
export async function nactiMapuPriloh(
  db: Db,
  druh: DruhZpravaPrilohy,
  zpravaIds: readonly string[],
): Promise<Map<string, ApiZpravaPriloha[]>> {
  const mapa = new Map<string, ApiZpravaPriloha[]>();
  const ids = [...new Set(zpravaIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return mapa;
  const radky = await db
    .select({
      id: zpravaPrilohy.id,
      zpravaId: zpravaPrilohy.zpravaId,
      nazev: zpravaPrilohy.nazev,
      bajty: zpravaPrilohy.bajty,
      contentType: zpravaPrilohy.contentType,
    })
    .from(zpravaPrilohy)
    .where(and(eq(zpravaPrilohy.druh, druh), inArray(zpravaPrilohy.zpravaId, ids)))
    .orderBy(asc(zpravaPrilohy.vytvoreno), asc(zpravaPrilohy.id));
  for (const radek of radky) {
    const seznam = mapa.get(radek.zpravaId) ?? [];
    seznam.push(naApiPrilohu(radek));
    mapa.set(radek.zpravaId, seznam);
  }
  return mapa;
}

async function smazCerstvouZpravu(
  db: Db,
  druh: DruhZpravaPrilohy,
  id: string,
): Promise<void> {
  if (druh === "zprava") {
    await db.delete(zpravy).where(eq(zpravy.id, id));
    return;
  }
  if (druh === "soukroma") {
    await db.delete(soukromeZpravy).where(eq(soukromeZpravy.id, id));
    return;
  }
  await db.delete(skupinaZpravy).where(eq(skupinaZpravy.id, id));
}

/**
 * PutObject first, then the message row, then attachment rows.
 * Any failure after a successful upload deletes those objects.
 * A failed attachment insert also deletes the message row just created.
 */
export async function zalozZpravuSPrilohami<T extends { id: string }>(
  nastaveni: R2Nastaveni | null,
  soubory: readonly PripravenaPriloha[],
  druh: DruhZpravaPrilohy,
  db: Db,
  vlozZpravu: () => Promise<T | undefined>,
): Promise<T> {
  if (soubory.length > 0 && nastaveni === null) throw new ChybiUlozistePriloh();
  const nahrane: NahranaPriloha[] = [];
  try {
    if (nastaveni !== null) {
      for (const soubor of soubory) {
        if (OBRAZKY_K_DERIVACI.has(soubor.pripona)) {
          const pripraveno = await pripravObrazekKUlozeni(
            soubor.bajty,
            soubor.contentType,
            soubor.pripona,
            "plna",
            (ext) => klicChatPrilohy(ext),
          );
          if (pripraveno === null) throw new Error("klic");
          await ulozPripravenyObrazek(nastaveni, pripraveno);
          nahrane.push({
            klic: pripraveno.klic,
            nazev: soubor.nazev,
            bajty: pripraveno.bajty.length,
            contentType: pripraveno.contentType,
          });
          continue;
        }
        const klic = klicChatPrilohy(soubor.pripona);
        if (klic === null) throw new Error("klic");
        await r2Pozadavek(nastaveni, "PUT", klic, soubor.bajty, soubor.contentType);
        nahrane.push({
          klic,
          nazev: soubor.nazev,
          bajty: soubor.bajty.length,
          contentType: soubor.contentType,
        });
      }
    }
    const zprava = await vlozZpravu();
    if (zprava === undefined) throw new Error("prazdny-returning");
    if (nahrane.length === 0) return zprava;
    try {
      await db.insert(zpravaPrilohy).values(
        nahrane.map((priloha) => ({
          druh,
          zpravaId: zprava.id,
          nazev: priloha.nazev,
          klic: priloha.klic,
          bajty: priloha.bajty,
          contentType: priloha.contentType,
        })),
      );
    } catch (chyba) {
      await smazCerstvouZpravu(db, druh, zprava.id).catch(() => undefined);
      throw chyba;
    }
    return zprava;
  } catch (chyba) {
    if (nastaveni !== null && nahrane.length > 0) {
      await Promise.all(nahrane.map((priloha) => smazObrazekR2Tise(nastaveni, priloha.klic)));
    }
    throw chyba;
  }
}

export interface PrilohaKeStazeni {
  id: string;
  nazev: string;
  klic: string;
  contentType: string;
}

export type PristupPrilohy =
  | { stav: "chybi" }
  | { stav: "verejna"; priloha: PrilohaKeStazeni }
  | { stav: "soukroma"; priloha: PrilohaKeStazeni; klicVlakna: string }
  | { stav: "skupina"; priloha: PrilohaKeStazeni; skupinaId: string };

/** Hidden when the parent message is missing or soft-deleted. */
export async function nactiPristupPrilohy(db: Db, id: string): Promise<PristupPrilohy> {
  if (!UUID_RE.test(id)) return { stav: "chybi" };
  const nalezene = await db
    .select({
      id: zpravaPrilohy.id,
      druh: zpravaPrilohy.druh,
      zpravaId: zpravaPrilohy.zpravaId,
      nazev: zpravaPrilohy.nazev,
      klic: zpravaPrilohy.klic,
      contentType: zpravaPrilohy.contentType,
    })
    .from(zpravaPrilohy)
    .where(eq(zpravaPrilohy.id, id))
    .limit(1);
  const radek = nalezene[0];
  if (radek === undefined || !jeDruhZpravaPrilohy(radek.druh)) return { stav: "chybi" };
  if (!jeKlicChatPrilohy(radek.klic)) return { stav: "chybi" };
  const priloha: PrilohaKeStazeni = {
    id: radek.id,
    nazev: radek.nazev,
    klic: radek.klic,
    contentType: radek.contentType,
  };
  if (radek.druh === "zprava") {
    const rodic = await db
      .select({ smazanoAt: zpravy.smazanoAt })
      .from(zpravy)
      .where(eq(zpravy.id, radek.zpravaId))
      .limit(1);
    if (rodic[0] === undefined || rodic[0].smazanoAt !== null) return { stav: "chybi" };
    return { stav: "verejna", priloha };
  }
  if (radek.druh === "soukroma") {
    const rodic = await db
      .select({ klic: soukromeZpravy.klic, smazanoAt: soukromeZpravy.smazanoAt })
      .from(soukromeZpravy)
      .where(eq(soukromeZpravy.id, radek.zpravaId))
      .limit(1);
    const veta = rodic[0];
    if (veta === undefined || veta.smazanoAt !== null) return { stav: "chybi" };
    return { stav: "soukroma", priloha, klicVlakna: veta.klic };
  }
  const rodic = await db
    .select({ skupinaId: skupinaZpravy.skupinaId, smazanoAt: skupinaZpravy.smazanoAt })
    .from(skupinaZpravy)
    .where(eq(skupinaZpravy.id, radek.zpravaId))
    .limit(1);
  const veta = rodic[0];
  if (veta === undefined || veta.smazanoAt !== null) return { stav: "chybi" };
  return { stav: "skupina", priloha, skupinaId: veta.skupinaId };
}

/**
 * Streams one object. Content-Type comes from the key extension, not the client
 * and not a tampered row. Images that preview use `inline`; everything else
 * (including HEIC, HTML, SVG) is `attachment`. `nosniff` blocks content sniffing.
 */
export async function posliUlozenouPrilohu(
  res: Response,
  nastaveni: R2Nastaveni,
  priloha: PrilohaKeStazeni,
  nahled = false,
): Promise<void> {
  if (!jeKlicChatPrilohy(priloha.klic)) throw new Error("klic");
  const tecka = priloha.klic.lastIndexOf(".");
  const pripona = tecka < 0 ? "" : priloha.klic.slice(tecka + 1).toLowerCase();
  const contentType = contentTypePrilohy(pripona);
  if (contentType === null) throw new Error("typ");
  const objekt = await nactiObrazekKOdeslani(
    nastaveni,
    priloha.klic,
    nahled && jeNahledObrazku(contentType),
    contentType,
  );
  const inline = jeNahledObrazku(contentType);
  res.setHeader("Content-Disposition", hlavickaContentDisposition(priloha.nazev, inline));
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "private, max-age=2592000");
  await posliObrazek(res, objekt.bajty, objekt.contentType, objekt.prekodovatNahled);
}
