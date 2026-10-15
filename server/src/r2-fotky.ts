/**
 * Cloudflare R2 photo upload (S3-compatible SigV4, no extra SDK).
 * Secrets stay in server env. This module never logs credentials or file bytes.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
import { FOTKA_POPIS_MAX_DELKA } from "./validace";

export const FOTKA_MAX_BAJTU = 8 * 1024 * 1024;
/** Room for multipart headers around the 8 MB file. */
export const FOTKA_TELO_MAX_BAJTU = FOTKA_MAX_BAJTU + 64 * 1024;

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

/** How many `soubor` parts one album upload accepts. */
export const ALBUM_FOTEK_NAJEDNOU = 12;
/** Whole multipart body cap for that batch (per-file cap stays 8 MB). */
export const ALBUM_NAHRANI_MAX_BAJTU = ALBUM_FOTEK_NAJEDNOU * FOTKA_MAX_BAJTU + 256 * 1024;

export function verejnaUrlFotky(publicBaseUrl: string, klic: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/${klic}`;
}

/** Key for an object we stored, or null for a legacy pasted URL. */
export function klicZVerejneUrl(verejnaUrl: string, publicBaseUrl: string): string | null {
  const zaklad = publicBaseUrl.replace(/\/+$/, "");
  const prefix = `${zaklad}/`;
  if (!verejnaUrl.startsWith(prefix)) return null;
  const klic = verejnaUrl.slice(prefix.length);
  if (
    !/^(?:vypravy\/[A-Za-z0-9][A-Za-z0-9_-]{0,80}|alba\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(
      klic,
    )
  ) {
    return null;
  }
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
      if (jmeno === "soubor") soubory.push(Buffer.from(data));
    }
    pozice = dalsi;
  }
  if (soubory.length === 0) return { ok: false, duvod: "chybi" };
  return { ok: true, pole: { popis, soubory } };
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
      ...(contentType !== null && metoda === "PUT" ? { "Content-Type": contentType } : {}),
    },
    body: metoda === "PUT" ? new Uint8Array(telo) : undefined,
  });
  if (!odpoved.ok) {
    await odpoved.arrayBuffer().catch(() => undefined);
    throw new Error(`R2 ${metoda} failed`);
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
