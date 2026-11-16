/**
 * Brotli (preferred) or gzip for text responses. Images, fonts and
 * already-encoded bodies pass through. Tiny bodies stay uncompressed.
 */

import {
  constants,
  createBrotliCompress,
  createGzip,
  type BrotliCompress,
  type Gzip,
} from "node:zlib";
import type { NextFunction, Request, Response } from "express";

const PRAH_BAJTU = 1024;

const KOMPRIMOVATELNE =
  /^(?:text\/|application\/(?:json|javascript|xml|manifest\+json|xhtml\+xml|wasm)|image\/svg\+xml)/i;

export type KodovaniKomprese = "br" | "gzip";

interface NabidkaKodovani {
  token: string;
  q: number;
}

function rozebereAcceptEncoding(hlavicka: string): NabidkaKodovani[] {
  return hlavicka.split(",").map((cast) => {
    const [token, ...parametry] = cast.trim().split(";");
    let q = 1;
    for (const parametr of parametry) {
      const [klic, hodnota] = parametr.trim().split("=");
      if (klic?.trim() !== "q" || hodnota === undefined) continue;
      const cislo = Number(hodnota);
      if (Number.isFinite(cislo)) q = cislo;
    }
    return { token: token?.trim().toLowerCase() ?? "", q };
  });
}

function kvalita(nabidky: readonly NabidkaKodovani[], token: string): number | null {
  const nalezena = nabidky.find((nabidka) => nabidka.token === token);
  return nalezena === undefined ? null : nalezena.q;
}

/** Brotli when the client allows it, otherwise gzip. `q=0` means refused. */
export function vyberKodovani(acceptEncoding: string | undefined): KodovaniKomprese | null {
  if (acceptEncoding === undefined || acceptEncoding.trim() === "") return null;
  const nabidky = rozebereAcceptEncoding(acceptEncoding);
  const br = kvalita(nabidky, "br");
  if (br !== null && br > 0) return "br";
  const gzip = kvalita(nabidky, "gzip");
  if (gzip !== null && gzip > 0) return "gzip";
  const hvezdicka = kvalita(nabidky, "*");
  if (hvezdicka !== null && hvezdicka > 0 && br === null) return "gzip";
  return null;
}

export function jdeKomprimovat(contentType: string, contentEncoding: string | undefined): boolean {
  if (contentEncoding !== undefined && contentEncoding !== "") return false;
  const typ = contentType.split(";")[0]?.trim() ?? "";
  return KOMPRIMOVATELNE.test(typ);
}

function jakoBuffer(chunk: unknown, encoding: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  const kodovani = typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8";
  return Buffer.from(String(chunk), kodovani);
}

function vytvorProud(kodovani: KodovaniKomprese): BrotliCompress | Gzip {
  if (kodovani === "br") {
    return createBrotliCompress({
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    });
  }
  return createGzip({ level: 6 });
}

export function kompreseOdpovedi(req: Request, res: Response, next: NextFunction): void {
  const vybrane = vyberKodovani(req.header("accept-encoding"));
  if (vybrane === null || req.method === "HEAD") {
    next();
    return;
  }
  const kodovani: KodovaniKomprese = vybrane;

  const puvodniWrite = res.write.bind(res);
  const puvodniEnd = res.end.bind(res);
  const fronta: Buffer[] = [];
  let velikost = 0;
  let rozhodnuto = false;
  let proud: BrotliCompress | Gzip | null = null;
  let cekaKonec: (() => void) | undefined;

  function lze(): boolean {
    if (res.statusCode === 204 || res.statusCode === 304) return false;
    const encoding = res.getHeader("Content-Encoding");
    const uz = encoding === undefined ? undefined : String(encoding);
    return jdeKomprimovat(String(res.getHeader("Content-Type") ?? ""), uz);
  }

  function doplnVary(): void {
    const dosavadni = res.getHeader("Vary");
    const text = dosavadni === undefined ? "" : String(dosavadni);
    if (text.toLowerCase().includes("accept-encoding")) return;
    res.setHeader("Vary", text === "" ? "Accept-Encoding" : `${text}, Accept-Encoding`);
  }

  function spust(data: Buffer): void {
    doplnVary();
    res.removeHeader("Content-Length");
    res.setHeader("Content-Encoding", kodovani);
    const kompresor = vytvorProud(kodovani);
    proud = kompresor;
    kompresor.on("data", (chunk: Buffer) => {
      puvodniWrite(chunk);
    });
    kompresor.on("end", () => {
      if (cekaKonec !== undefined) puvodniEnd(cekaKonec);
      else puvodniEnd();
    });
    if (data.length > 0) kompresor.write(data);
  }

  function rozhodni(data: Buffer): void {
    rozhodnuto = true;
    if (lze()) {
      spust(data);
      return;
    }
    if (data.length > 0) puvodniWrite(data);
  }

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
    const buf = jakoBuffer(chunk, encoding);
    const hotovo: (() => void) | undefined =
      typeof encoding === "function"
        ? (encoding as () => void)
        : typeof cb === "function"
          ? (cb as () => void)
          : undefined;
    if (!rozhodnuto) {
      fronta.push(buf);
      velikost += buf.length;
      if (velikost < PRAH_BAJTU) {
        hotovo?.();
        return true;
      }
      const vse = Buffer.concat(fronta);
      fronta.length = 0;
      rozhodni(vse);
      hotovo?.();
      return true;
    }
    if (proud !== null) {
      if (hotovo !== undefined) return proud.write(buf, hotovo);
      return proud.write(buf);
    }
    if (hotovo !== undefined) return puvodniWrite(buf, hotovo);
    return puvodniWrite(buf);
  }) as typeof res.write;

  res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown): Response => {
    let data: Buffer = Buffer.alloc(0);
    let konec: (() => void) | undefined;
    if (typeof chunk === "function") {
      konec = chunk as () => void;
    } else if (chunk !== undefined && chunk !== null) {
      data = jakoBuffer(chunk, encoding);
      konec = typeof encoding === "function" ? (encoding as () => void) : typeof cb === "function" ? (cb as () => void) : undefined;
    } else {
      konec = typeof encoding === "function" ? (encoding as () => void) : typeof cb === "function" ? (cb as () => void) : undefined;
    }

    if (!rozhodnuto) {
      if (data.length > 0) fronta.push(data);
      const vse = fronta.length > 0 ? Buffer.concat(fronta) : Buffer.alloc(0);
      fronta.length = 0;
      if (vse.length < PRAH_BAJTU || !lze()) {
        rozhodnuto = true;
        if (vse.length > 0) puvodniWrite(vse);
        puvodniEnd(konec);
        return res;
      }
      cekaKonec = konec;
      rozhodni(vse);
      proud?.end();
      return res;
    }

    if (data.length > 0) {
      if (proud !== null) proud.write(data);
      else puvodniWrite(data);
    }
    if (proud !== null) {
      cekaKonec = konec;
      proud.end();
      return res;
    }
    puvodniEnd(konec);
    return res;
  }) as typeof res.end;

  next();
}
