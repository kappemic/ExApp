import type { Request, Response } from "express";
import sharp from "sharp";

/** Longest edge of a grid / lightbox preview. The full file stays on the bare URL. */
export const NAHLED_DLOUHA_HRANA = 960;
export const NAHLED_KVALITA = 78;
/** Re-encode only. Pixel size stays whatever `rotate()` left after EXIF orientation. */
export const FOTKA_PLNA_KVALITA = 82;
export const AVATAR_DLOUHA_HRANA = 256;
export const AVATAR_KVALITA = 82;
export const ZPEVNIK_DLOUHA_HRANA = 1600;
export const ZPEVNIK_KVALITA = 82;
export const WEBP_CONTENT_TYPE = "image/webp" as const;

/** 48 MP phone photos pass. A header that claims a huge bitmap does not. */
export const OBRAZEK_MAX_PIXELU = 80_000_000;
export const OBRAZEK_PRILIS_VELKY =
  "Tahle fotka má příliš velké rozměry. Vyber menší snímek." as const;

export type WebpDerivace = {
  bajty: Buffer;
  contentType: typeof WEBP_CONTENT_TYPE;
};

export type VolbyWebpDerivace = {
  /** Longest edge after orientation. `null` does not downscale. */
  dlouhaHrana: number | null;
  kvalita: number;
};

/**
 * False when the file is not a decodable image or its pixel count would
 * expand into a huge bitmap. Does not decode the full raster.
 */
export async function maBezpecneRozmery(bajty: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(bajty, {
      failOn: "none",
      animated: false,
      limitInputPixels: OBRAZEK_MAX_PIXELU,
    }).metadata();
    const sirka = meta.width ?? 0;
    const vyska = meta.height ?? 0;
    if (sirka < 1 || vyska < 1) return false;
    if (sirka > OBRAZEK_MAX_PIXELU || vyska > OBRAZEK_MAX_PIXELU) return false;
    return sirka * vyska <= OBRAZEK_MAX_PIXELU;
  } catch {
    return false;
  }
}

export type UlozeneRozmery = {
  sirka: number;
  vyska: number;
};

/**
 * Width and height of the bytes that were stored, after `rotate()` baked
 * orientation into the WebP. Missing or unreadable metadata becomes null
 * so the upload can still succeed.
 */
export async function rozmeryUlozenychBajtu(bajty: Buffer): Promise<UlozeneRozmery | null> {
  try {
    const meta = await sharp(bajty, {
      failOn: "none",
      animated: false,
      limitInputPixels: OBRAZEK_MAX_PIXELU,
    }).metadata();
    const sirka = meta.width;
    const vyska = meta.height;
    if (sirka === undefined || vyska === undefined) return null;
    if (!Number.isInteger(sirka) || !Number.isInteger(vyska)) return null;
    if (sirka < 1 || vyska < 1) return null;
    return { sirka, vyska };
  } catch {
    return null;
  }
}

/** Drops a missing or non-positive pair so older rows stay without the fields. */
export function rozmeryDoOdpovedi(
  sirka: number | null | undefined,
  vyska: number | null | undefined,
): { sirka?: number; vyska?: number } {
  if (sirka == null || vyska == null) return {};
  if (!Number.isInteger(sirka) || !Number.isInteger(vyska)) return {};
  if (sirka < 1 || vyska < 1) return {};
  return { sirka, vyska };
}

export function chceNahled(req: Request): boolean {
  return req.query["nahled"] === "1";
}

function mediaTyp(contentType: string): string {
  const zaklad = contentType.split(";", 1)[0];
  return zaklad === undefined ? "" : zaklad.trim().toLowerCase();
}

/** GIF and HEIC stay as stored bytes. Callers fall back when this is true. */
function jeGifNeboHeic(typ: string): boolean {
  return typ === "image/gif" || typ.startsWith("image/heic") || typ.startsWith("image/heif");
}

function jeRastrovyObrazek(typ: string): boolean {
  return typ.startsWith("image/") && !typ.includes("svg");
}

/**
 * WebP derivative. `rotate()` bakes EXIF orientation into pixels.
 * Metadata is not copied (`withMetadata` is intentionally absent).
 * GIF, HEIC, SVG and non-images return null.
 */
export async function derivujWebp(
  bajty: Buffer,
  contentType: string,
  volby: VolbyWebpDerivace,
): Promise<WebpDerivace | null> {
  const typ = mediaTyp(contentType);
  if (jeGifNeboHeic(typ) || !jeRastrovyObrazek(typ)) return null;
  let obrazek = sharp(bajty, {
    failOn: "none",
    animated: false,
    limitInputPixels: OBRAZEK_MAX_PIXELU,
  }).rotate();
  if (volby.dlouhaHrana !== null) {
    obrazek = obrazek.resize({
      width: volby.dlouhaHrana,
      height: volby.dlouhaHrana,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const vystup = await obrazek.webp({ quality: volby.kvalita }).toBuffer();
  return { bajty: vystup, contentType: WEBP_CONTENT_TYPE };
}

/** Full photo: orientation baked in, EXIF stripped, original pixel size kept. */
export function bajtyPlneFotky(
  bajty: Buffer,
  contentType: string,
): Promise<WebpDerivace | null> {
  return derivujWebp(bajty, contentType, {
    dlouhaHrana: null,
    kvalita: FOTKA_PLNA_KVALITA,
  });
}

/**
 * WebP preview for the grid and the first lightbox paint.
 * Returns null when the bytes are not a raster we can shrink (including GIF and HEIC).
 */
export function bajtyNahledu(
  bajty: Buffer,
  contentType: string,
): Promise<WebpDerivace | null> {
  return derivujWebp(bajty, contentType, {
    dlouhaHrana: NAHLED_DLOUHA_HRANA,
    kvalita: NAHLED_KVALITA,
  });
}

/** Avatar derivative: one WebP, long edge at most 256. No sibling thumbnail. */
export function bajtyAvataru(
  bajty: Buffer,
  contentType: string,
): Promise<WebpDerivace | null> {
  return derivujWebp(bajty, contentType, {
    dlouhaHrana: AVATAR_DLOUHA_HRANA,
    kvalita: AVATAR_KVALITA,
  });
}

/** Songbook scan: one WebP, long edge at most 1600. No sibling thumbnail. */
export function bajtyZpevniku(
  bajty: Buffer,
  contentType: string,
): Promise<WebpDerivace | null> {
  return derivujWebp(bajty, contentType, {
    dlouhaHrana: ZPEVNIK_DLOUHA_HRANA,
    kvalita: ZPEVNIK_KVALITA,
  });
}

/**
 * Sends image bytes. `nahled` re-encodes a WebP preview in memory.
 * GIF, HEIC and other non-rasters stay as stored (`bajtyNahledu` returns null).
 * Nothing is written back to R2. A stored `*.nahled.webp` is passed with `nahled` false.
 */
export async function posliObrazek(
  res: Response,
  bajty: Buffer,
  contentType: string,
  nahled: boolean,
): Promise<void> {
  let telo = bajty;
  let typ = contentType;
  if (nahled) {
    try {
      const zmensene = await bajtyNahledu(bajty, contentType);
      if (zmensene !== null) {
        telo = zmensene.bajty;
        typ = zmensene.contentType;
      }
    } catch {
      telo = bajty;
      typ = contentType;
    }
  }
  res.status(200);
  res.setHeader("Content-Type", typ);
  // Photo URLs are stable (avatars add ?v=). The browser may reuse the bytes;
  // private keeps them out of shared caches.
  res.setHeader("Cache-Control", "private, max-age=2592000");
  res.setHeader("Content-Length", telo.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(telo);
}
