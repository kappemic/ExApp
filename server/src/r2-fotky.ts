/**
 * Cloudflare R2 photo upload (S3-compatible SigV4, no extra SDK).
 * Secrets stay in server env. This module never logs credentials or file bytes.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Response as ExpressResponse } from "express";
import {
  bajtyAvataru,
  bajtyNahledu,
  bajtyPlneFotky,
  bajtyZpevniku,
  posliObrazek,
  WEBP_CONTENT_TYPE,
} from "./obrazek-nahled";
import { FOTKA_POPIS_MAX_DELKA } from "./validace";

export const FOTKA_MAX_BAJTU = 8 * 1024 * 1024;
/** Room for multipart headers around the 8 MB file. */
export const FOTKA_TELO_MAX_BAJTU = FOTKA_MAX_BAJTU + 64 * 1024;
/** Profile avatar file cap. Multipart overhead sits in the body cap. */
export const AVATAR_MAX_BAJTU = 5 * 1024 * 1024;
export const AVATAR_TELO_MAX_BAJTU = AVATAR_MAX_BAJTU + 64 * 1024;

export const FOTKY_NEJSOU_NASTAVENE_ZPRAVA =
  "Úložiště fotek není nastavené. Doplň R2 klíče v .env.local a restartuj server." as const;

export type PriponaFotky = "jpg" | "png" | "webp";

export interface R2Nastaveni {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

const NAZVY_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

/** Null when any required value is missing or the public URL is not https. */
export function ctiR2Nastaveni(env: NodeJS.ProcessEnv): R2Nastaveni | null {
  const hodnoty = NAZVY_ENV.map((nazev) => (env[nazev] ?? "").trim());
  if (hodnoty.some((hodnota) => hodnota.length === 0)) return null;
  const accountId = hodnoty[0] ?? "";
  const accessKeyId = hodnoty[1] ?? "";
  const secretAccessKey = hodnoty[2] ?? "";
  const bucket = hodnoty[3] ?? "";
  const surovaUrl = hodnoty[4] ?? "";
  let parsed: URL;
  try {
    parsed = new URL(surovaUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const cesta = parsed.pathname.replace(/\/+$/, "");
  const publicBaseUrl = `${parsed.origin}${cesta === "/" ? "" : cesta}`;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

/** Sniff JPEG / PNG / WebP. The client filename is not trusted. */
export function rozpoznajObrazek(bajty: Buffer): PriponaFotky | null {
  if (bajty.length >= 3 && bajty[0] === 0xff && bajty[1] === 0xd8 && bajty[2] === 0xff) {
    return "jpg";
  }
  if (
    bajty.length >= 8 &&
    bajty[0] === 0x89 &&
    bajty[1] === 0x50 &&
    bajty[2] === 0x4e &&
    bajty[3] === 0x47
  ) {
    return "png";
  }
  if (
    bajty.length >= 12 &&
    bajty.toString("ascii", 0, 4) === "RIFF" &&
    bajty.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/** Object key. Null when the expedition id or uuid is unsafe. */
export function klicFotky(
  expeditionId: string,
  pripona: PriponaFotky,
  id: string = randomUUID(),
): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(expeditionId)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return `vypravy/${expeditionId}/${id}.${pripona}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Object key for an extra album. Null when either id is not a uuid. */
export function klicAlbaFotky(
  albumId: string,
  pripona: PriponaFotky,
  id: string = randomUUID(),
): string | null {
  if (!UUID_RE.test(albumId) || !UUID_RE.test(id)) return null;
  return `alba/${albumId}/${id}.${pripona}`;
}

/** Screenshots per direction (outbound / return) on one expedition. */
export const CESTA_SNIMKU_NA_SMER = 8;
/** Whole multipart body cap for one direction (per-file cap stays 8 MB). */
export const CESTA_NAHRANI_MAX_BAJTU = CESTA_SNIMKU_NA_SMER * FOTKA_MAX_BAJTU + 256 * 1024;

export type SmerCestySnimku = "tam" | "zpet";

/** `vypravy/<id>/cesta-tam|cesta-zpet/<uuid>.<ext>`. Null when the id is unsafe. */
export function klicCestaSnimku(
  expeditionId: string,
  smer: SmerCestySnimku,
  pripona: PriponaFotky,
  id: string = randomUUID(),
): string | null {
  if (smer !== "tam" && smer !== "zpet") return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(expeditionId)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return `vypravy/${expeditionId}/cesta-${smer}/${id}.${pripona}`;
}

/**
 * How many `soubor` parts one album upload accepts.
 * A weekend of photos fits. The page still sends one file per request.
 */
export const ALBUM_FOTEK_NAJEDNOU = 500;
/**
 * Whole multipart body kept in memory. Not 500 × 8 MB: that would pin
 * gigabytes per request. One full-size photo is 8 MB; a batch of smaller
 * files can share this cap. Larger picks go one file per request.
 */
export const ALBUM_NAHRANI_MAX_BAJTU = 32 * FOTKA_MAX_BAJTU + 256 * 1024;

export function verejnaUrlFotky(publicBaseUrl: string, klic: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/${klic}`;
}

const PRIPONA_NAHLEDU = ".nahled.webp";

/**
 * Sibling thumbnail for a stored full object: `…/<uuid>.nahled.webp`.
 * Null when the key is not `…/<uuid>.<ext>`, or when it already is a thumbnail.
 * Legacy `.jpg` / `.png` keys still derive a sibling; a missing object is not an error.
 */
export function klicNahledu(klic: string): string | null {
  if (klic.includes("..")) return null;
  if (klic.toLowerCase().endsWith(PRIPONA_NAHLEDU)) return null;
  const lomitko = klic.lastIndexOf("/");
  if (lomitko < 0) return null;
  const soubor = klic.slice(lomitko + 1);
  const tecka = soubor.lastIndexOf(".");
  if (tecka <= 0) return null;
  const id = soubor.slice(0, tecka);
  const pripona = soubor.slice(tecka + 1);
  if (!UUID_RE.test(id)) return null;
  if (!/^[A-Za-z0-9]+$/.test(pripona)) return null;
  return `${klic.slice(0, lomitko)}/${id}${PRIPONA_NAHLEDU}`;
}

/** Key for an object we stored, or null for a legacy pasted URL or a thumbnail sibling. */
export function klicZVerejneUrl(verejnaUrl: string, publicBaseUrl: string): string | null {
  const zaklad = publicBaseUrl.replace(/\/+$/, "");
  const prefix = `${zaklad}/`;
  if (!verejnaUrl.startsWith(prefix)) return null;
  const klic = verejnaUrl.slice(prefix.length);
  if (klic.toLowerCase().endsWith(PRIPONA_NAHLEDU)) return null;
  if (
    !/^(?:vypravy\/[A-Za-z0-9][A-Za-z0-9_-]{0,80}(?:\/cesta-(?:tam|zpet))?|alba\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|zpevnik\/navrhy)\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
      klic,
    )
  ) {
    return null;
  }
  if (klic.includes("..")) return null;
  return klic;
}

/** Avatar object key `avatary/<userId>/<uuid>.<ext>`. Null when ids are not uuids. */
export function klicAvataru(
  userId: string,
  pripona: PriponaFotky,
  id: string = randomUUID(),
): string | null {
  if (!UUID_RE.test(userId) || !UUID_RE.test(id)) return null;
  return `avatary/${userId}/${id}.${pripona}`;
}

/** Our avatar key for this user, or null for a foreign / legacy URL. */
export function klicAvataruZVerejneUrl(
  verejnaUrl: string,
  publicBaseUrl: string,
  userId: string,
): string | null {
  if (!UUID_RE.test(userId)) return null;
  const zaklad = publicBaseUrl.replace(/\/+$/, "");
  const prefix = `${zaklad}/`;
  if (!verejnaUrl.startsWith(prefix)) return null;
  const klic = verejnaUrl.slice(prefix.length);
  const ocekavany = `avatary/${userId}/`;
  if (!klic.startsWith(ocekavany)) return null;
  if (klic.toLowerCase().endsWith(PRIPONA_NAHLEDU)) return null;
  if (!/^avatary\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(klic)) return null;
  if (klic.includes("..")) return null;
  return klic;
}

export function contentTypeProPriponu(pripona: PriponaFotky): string {
  if (pripona === "jpg") return "image/jpeg";
  if (pripona === "png") return "image/png";
  return "image/webp";
}

export interface NahranaFotka {
  popis: string;
  bajty: Buffer;
}

export type ChybaSouboru = "velikost" | "chybi" | "popis" | "format";
export type ChybaSouboruAlba = ChybaSouboru | "pocet";

function hraniceZHlavicky(contentType: string): string | null {
  const shoda = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const hranice = (shoda?.[1] ?? shoda?.[2] ?? "").trim();
  if (hranice.length === 0) return null;
  return hranice;
}

function hodnotaDisposition(hlavicka: string, klic: string): string {
  const shoda = new RegExp(`${klic}="([^"]*)"`, "i").exec(hlavicka);
  return shoda?.[1] ?? "";
}

interface PoleMultipart {
  popis: string;
  smer: string;
  soubory: Buffer[];
}

/**
 * Splits `popis` and every `soubor` part. Does not sniff image bytes.
 * The last `soubor` wins for the single-file helper; the batch helper keeps all.
 */
function nactiPoleMultipart(
  telo: Buffer,
  contentType: string,
  maxBajtu: number,
): { ok: true; pole: PoleMultipart } | { ok: false; duvod: ChybaSouboru } {
  if (telo.length > maxBajtu) return { ok: false, duvod: "velikost" };
  const hranice = hraniceZHlavicky(contentType);
  if (hranice === null) return { ok: false, duvod: "chybi" };
  const znacka = Buffer.from(`--${hranice}`);
  let popis = "";
  let smer = "";
  const soubory: Buffer[] = [];
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
      const jmeno = hodnotaDisposition(hlavicka, "name");
      if (jmeno === "popis") popis = data.toString("utf8");
      if (jmeno === "smer") smer = data.toString("utf8");
      if (jmeno === "soubor") soubory.push(Buffer.from(data));
    }
    pozice = dalsi;
  }
  if (soubory.length === 0) return { ok: false, duvod: "chybi" };
  return { ok: true, pole: { popis, smer, soubory } };
}

export type ChybaCestySnimku = ChybaSouboruAlba | "smer";

/**
 * Direction field `smer` (`tam` | `zpet`) plus up to 8 `soubor` images.
 */
export function rozdelMultipartCesta(
  telo: Buffer,
  contentType: string,
): { ok: true; smer: SmerCestySnimku; fotky: NahranaFotka[] } | { ok: false; duvod: ChybaCestySnimku } {
  const nactene = nactiPoleMultipart(telo, contentType, CESTA_NAHRANI_MAX_BAJTU);
  if (!nactene.ok) return nactene;
  const smer = nactene.pole.smer.trim();
  if (smer !== "tam" && smer !== "zpet") return { ok: false, duvod: "smer" };
  if (nactene.pole.soubory.length > CESTA_SNIMKU_NA_SMER) return { ok: false, duvod: "pocet" };
  const fotky: NahranaFotka[] = [];
  for (const soubor of nactene.pole.soubory) {
    const duvod = chybaJednohoSouboru(soubor, "");
    if (duvod !== null) return { ok: false, duvod };
    fotky.push({ popis: "", bajty: soubor });
  }
  return { ok: true, smer, fotky };
}

function chybaJednohoSouboru(soubor: Buffer, popis: string): ChybaSouboru | null {
  if (soubor.length === 0) return "chybi";
  if (soubor.length > FOTKA_MAX_BAJTU) return "velikost";
  const cistyPopis = popis.trim();
  if (cistyPopis.length > FOTKA_POPIS_MAX_DELKA) return "popis";
  if (rozpoznajObrazek(soubor) === null) return "format";
  return null;
}

/**
 * One file field `soubor` and an optional text field `popis`.
 * Repeated `soubor` fields keep the last part (existing expedition upload).
 * Returns an error code, never the raw filename.
 */
export function rozdelMultipart(
  telo: Buffer,
  contentType: string,
): { ok: true; fotka: NahranaFotka } | { ok: false; duvod: ChybaSouboru } {
  const nactene = nactiPoleMultipart(telo, contentType, FOTKA_TELO_MAX_BAJTU);
  if (!nactene.ok) return nactene;
  const soubor = nactene.pole.soubory[nactene.pole.soubory.length - 1];
  if (soubor === undefined) return { ok: false, duvod: "chybi" };
  const duvod = chybaJednohoSouboru(soubor, nactene.pole.popis);
  if (duvod !== null) return { ok: false, duvod };
  return { ok: true, fotka: { popis: nactene.pole.popis.trim(), bajty: soubor } };
}

/**
 * Every repeated `soubor` field, same optional `popis` on each.
 * More than ALBUM_FOTEK_NAJEDNOU → `pocet`. One bad file fails the batch.
 */
export function rozdelMultipartSoubory(
  telo: Buffer,
  contentType: string,
): { ok: true; fotky: NahranaFotka[] } | { ok: false; duvod: ChybaSouboruAlba } {
  const nactene = nactiPoleMultipart(telo, contentType, ALBUM_NAHRANI_MAX_BAJTU);
  if (!nactene.ok) return nactene;
  if (nactene.pole.soubory.length > ALBUM_FOTEK_NAJEDNOU) return { ok: false, duvod: "pocet" };
  const popis = nactene.pole.popis.trim();
  const fotky: NahranaFotka[] = [];
  for (const soubor of nactene.pole.soubory) {
    const duvod = chybaJednohoSouboru(soubor, popis);
    if (duvod !== null) return { ok: false, duvod };
    fotky.push({ popis, bajty: soubor });
  }
  return { ok: true, fotky };
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function kodujCastCesty(cast: string): string {
  return encodeURIComponent(cast).replace(/[!'()*]/g, (znak) =>
    `%${znak.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Immutable UUID keys. Signed on every PUT (photos, avatars, songbook, chat).
 * Omitting it from SignedHeaders makes R2 reject the request.
 */
const R2_PUT_CACHE_CONTROL = "public, max-age=31536000, immutable";

class R2StavChyba extends Error {
  readonly status: number;
  constructor(metoda: string, status: number) {
    super(`R2 ${metoda} failed`);
    this.name = "R2StavChyba";
    this.status = status;
  }
}

/** Content-Type for a stored object key (`jpg` / `png` / `webp`). */
export function contentTypeZKlice(klic: string): string {
  const maly = klic.toLowerCase();
  if (maly.endsWith(".png")) return contentTypeProPriponu("png");
  if (maly.endsWith(".webp")) return contentTypeProPriponu("webp");
  return contentTypeProPriponu("jpg");
}

/**
 * Signed fetch to R2. GET and DELETE sign the empty-body SHA-256.
 * Throws on a non-2xx response and discards the body (never logged).
 */
async function r2Fetch(
  nastaveni: R2Nastaveni,
  metoda: "PUT" | "DELETE" | "GET",
  klic: string,
  telo: Buffer,
  contentType: string | null,
): Promise<Response> {
  const host = `${nastaveni.accountId}.r2.cloudflarestorage.com`;
  const cesta = `/${nastaveni.bucket}/${klic.split("/").map(kodujCastCesty).join("/")}`;
  const ted = new Date();
  const amzDate = ted.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const datum = amzDate.slice(0, 8);
  const hashTela = sha256Hex(metoda === "PUT" ? telo : Buffer.alloc(0));
  const hlavicky = new Map<string, string>();
  hlavicky.set("host", host);
  hlavicky.set("x-amz-content-sha256", hashTela);
  hlavicky.set("x-amz-date", amzDate);
  if (metoda === "PUT") hlavicky.set("cache-control", R2_PUT_CACHE_CONTROL);
  if (contentType !== null && metoda === "PUT") hlavicky.set("content-type", contentType);
  const serazene = [...hlavicky.keys()].sort();
  const kanonickeHlavicky = serazene
    .map((klicH) => `${klicH}:${hlavicky.get(klicH) ?? ""}\n`)
    .join("");
  const podepsane = serazene.join(";");
  const kanonicky = [metoda, cesta, "", kanonickeHlavicky, podepsane, hashTela].join("\n");
  const scope = `${datum}/auto/s3/aws4_request`;
  const kPodpisu = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(kanonicky)].join("\n");
  const kDatum = hmac(`AWS4${nastaveni.secretAccessKey}`, datum);
  const kRegion = hmac(kDatum, "auto");
  const kSluzba = hmac(kRegion, "s3");
  const kSign = hmac(kSluzba, "aws4_request");
  const podpis = createHmac("sha256", kSign).update(kPodpisu, "utf8").digest("hex");
  const autorizace = `AWS4-HMAC-SHA256 Credential=${nastaveni.accessKeyId}/${scope}, SignedHeaders=${podepsane}, Signature=${podpis}`;
  const odpoved = await fetch(`https://${host}${cesta}`, {
    method: metoda,
    headers: {
      Host: host,
      "x-amz-content-sha256": hashTela,
      "x-amz-date": amzDate,
      Authorization: autorizace,
      ...(metoda === "PUT" ? { "Cache-Control": R2_PUT_CACHE_CONTROL } : {}),
      ...(contentType !== null && metoda === "PUT" ? { "Content-Type": contentType } : {}),
    },
    body: metoda === "PUT" ? new Uint8Array(telo) : undefined,
  });
  if (!odpoved.ok) {
    await odpoved.arrayBuffer().catch(() => undefined);
    throw new R2StavChyba(metoda, odpoved.status);
  }
  return odpoved;
}

/** Signed fetch to R2. Throws on a non-2xx response without including the body. */
export async function r2Pozadavek(
  nastaveni: R2Nastaveni,
  metoda: "PUT" | "DELETE",
  klic: string,
  telo: Buffer,
  contentType: string | null,
): Promise<void> {
  const odpoved = await r2Fetch(nastaveni, metoda, klic, telo, contentType);
  await odpoved.arrayBuffer().catch(() => undefined);
}

/** Signed GET of one object. Empty-body hash. Bytes are not logged. */
export async function nactiObjektR2(
  nastaveni: R2Nastaveni,
  klic: string,
): Promise<{ bajty: Buffer; contentType: string }> {
  const odpoved = await r2Fetch(nastaveni, "GET", klic, Buffer.alloc(0), null);
  const bajty = Buffer.from(await odpoved.arrayBuffer());
  return { bajty, contentType: contentTypeZKlice(klic) };
}

/** Null only on 404. Any other R2 or network failure still throws. */
async function nactiObjektR2PokudJe(
  nastaveni: R2Nastaveni,
  klic: string,
): Promise<{ bajty: Buffer; contentType: string } | null> {
  try {
    return await nactiObjektR2(nastaveni, klic);
  } catch (chyba: unknown) {
    if (chyba instanceof R2StavChyba && chyba.status === 404) return null;
    throw chyba;
  }
}

export interface ObrazekKOdeslani {
  bajty: Buffer;
  contentType: string;
  /**
   * True when the stored sibling was missing and the caller should re-encode
   * in memory. A hit is already WebP and must not be shrunk again.
   */
  prekodovatNahled: boolean;
}

/**
 * `nahled` GETs `klicNahledu` first and returns those bytes without reading
 * the full object. A 404 (legacy JPEG/PNG, GIF, HEIC, avatar) falls through
 * to the full object. The result is never written back to R2.
 * Without `nahled`, only the stored object is read.
 * `contentTypePlny` overrides the type guessed from the key (chat GIF/HEIC).
 */
export async function nactiObrazekKOdeslani(
  nastaveni: R2Nastaveni,
  klic: string,
  nahled: boolean,
  contentTypePlny: string | null = null,
): Promise<ObrazekKOdeslani> {
  if (nahled) {
    const klicN = klicNahledu(klic);
    if (klicN !== null) {
      const ulozeny = await nactiObjektR2PokudJe(nastaveni, klicN);
      if (ulozeny !== null) {
        return {
          bajty: ulozeny.bajty,
          contentType: WEBP_CONTENT_TYPE,
          prekodovatNahled: false,
        };
      }
    }
  }
  const plny = await nactiObjektR2(nastaveni, klic);
  return {
    bajty: plny.bajty,
    contentType: contentTypePlny ?? plny.contentType,
    prekodovatNahled: nahled,
  };
}

/** Photo/avatar proxy. Re-encode stays in `posliObrazek` and is not stored. */
export async function posliObrazekZKlice(
  res: ExpressResponse,
  nastaveni: R2Nastaveni,
  klic: string,
  nahled: boolean,
): Promise<void> {
  const objekt = await nactiObrazekKOdeslani(nastaveni, klic, nahled);
  await posliObrazek(res, objekt.bajty, objekt.contentType, objekt.prekodovatNahled);
}

export async function ulozFotkuDoR2(
  nastaveni: R2Nastaveni,
  klic: string,
  bajty: Buffer,
  contentType: string,
): Promise<string> {
  await r2Pozadavek(nastaveni, "PUT", klic, bajty, contentType);
  return verejnaUrlFotky(nastaveni.publicBaseUrl, klic);
}

export async function smazObjektR2(nastaveni: R2Nastaveni, klic: string): Promise<void> {
  await r2Pozadavek(nastaveni, "DELETE", klic, Buffer.alloc(0), null);
}

export type DruhUlozeniObrazku = "plna" | "avatar" | "zpevnik";

export interface CastObrazkuR2 {
  klic: string;
  bajty: Buffer;
  contentType: string;
}

/** Full object plus an optional sibling thumbnail. The public URL is the full key only. */
export interface PripravenyObrazek extends CastObrazkuR2 {
  nahled: CastObrazkuR2 | null;
}

/**
 * Re-encodes JPEG/PNG/WebP before the PUT.
 * GIF, HEIC and anything the derivative helper refuses keep the original bytes and extension.
 * `plna` also builds `…/<uuid>.nahled.webp`. Avatar and songbook stay a single object.
 * `sestavKlic` is called once, with the extension that will actually be stored.
 */
export async function pripravObrazekKUlozeni(
  bajty: Buffer,
  contentType: string,
  puvodniPripona: string,
  druh: DruhUlozeniObrazku,
  sestavKlic: (pripona: string) => string | null,
): Promise<PripravenyObrazek | null> {
  const derivace =
    druh === "avatar"
      ? await bajtyAvataru(bajty, contentType)
      : druh === "zpevnik"
        ? await bajtyZpevniku(bajty, contentType)
        : await bajtyPlneFotky(bajty, contentType);
  const pripona = derivace === null ? puvodniPripona : "webp";
  const klic = sestavKlic(pripona);
  if (klic === null) return null;
  const telo = derivace === null ? bajty : derivace.bajty;
  const typ = derivace === null ? contentType : derivace.contentType;
  let nahled: CastObrazkuR2 | null = null;
  if (druh === "plna" && derivace !== null) {
    const zmensene = await bajtyNahledu(bajty, contentType);
    const klicN = klicNahledu(klic);
    if (zmensene !== null && klicN !== null) {
      nahled = { klic: klicN, bajty: zmensene.bajty, contentType: zmensene.contentType };
    }
  }
  return { klic, bajty: telo, contentType: typ, nahled };
}

/**
 * PUT the full object, then the sibling thumbnail.
 * A failed thumbnail PUT deletes the full object so the pair is not left half-written.
 */
export async function ulozPripravenyObrazek(
  nastaveni: R2Nastaveni,
  obrazek: PripravenyObrazek,
): Promise<string> {
  const url = await ulozFotkuDoR2(nastaveni, obrazek.klic, obrazek.bajty, obrazek.contentType);
  if (obrazek.nahled === null) return url;
  try {
    await ulozFotkuDoR2(
      nastaveni,
      obrazek.nahled.klic,
      obrazek.nahled.bajty,
      obrazek.nahled.contentType,
    );
  } catch (chyba) {
    await smazObjektR2(nastaveni, obrazek.klic).catch(() => undefined);
    throw chyba;
  }
  return url;
}

/** Deletes the sibling thumbnail (a miss does not fail), then the full object. */
export async function smazObrazekR2(nastaveni: R2Nastaveni, klic: string): Promise<void> {
  const nahled = klicNahledu(klic);
  if (nahled !== null) await smazObjektR2(nastaveni, nahled).catch(() => undefined);
  await smazObjektR2(nastaveni, klic);
}

/** Best-effort delete of the full object and its sibling. Neither failure throws. */
export async function smazObrazekR2Tise(nastaveni: R2Nastaveni, klic: string): Promise<void> {
  const nahled = klicNahledu(klic);
  if (nahled !== null) await smazObjektR2(nastaveni, nahled).catch(() => undefined);
  await smazObjektR2(nastaveni, klic).catch(() => undefined);
}
