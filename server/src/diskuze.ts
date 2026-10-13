/**
 * server/src/diskuze.ts — mapování vláken diskuze + rate-limit POST.
 *
 * `toApiZprava` je fail-safe jako u schůzek/fotek: nevalidní DB řádek
 * → null (volající ho přeskočí). Text se vrací RAW (trimnutý, bez
 * escapování) — escapuje se až při renderu v klientovi
 * (`escapujHtml` v src/lib/diskuze-api.ts), aby XSS payload zůstal
 * v DB čitelný, ale v DOM se vykreslil jako text.
 * Rate-limit POST je 10/min/ip (in-memory, jeden proces — pro více
 * instancí by musel do sdíleného store; viz security-and-hardening).
 */

import type { Request } from "express";
import type { Zprava } from "../../drizzle/schema/zpravy";
import type { ApiZprava } from "../../src/shared/api-types";

/** DB řádek `zpravy` → veřejná `ApiZprava`; nevalidní řádek → null. */
export function toApiZprava(radek: Zprava): ApiZprava | null {
  if (typeof radek.id !== "string" || radek.id.length === 0) return null;
  if (typeof radek.expediceId !== "string" || radek.expediceId.length === 0) {
    return null;
  }
  if (
    radek.autorId !== null &&
    radek.autorId !== undefined &&
    typeof radek.autorId !== "string"
  ) {
    return null;
  }
  if (typeof radek.text !== "string") return null;
  if (!(radek.createdAt instanceof Date) || Number.isNaN(radek.createdAt.getTime())) {
    return null;
  }
  return {
    id: radek.id,
    expeditionId: radek.expediceId,
    autorId: radek.autorId ?? null,
    text: radek.text,
    createdAt: radek.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Rate-limit POST /api/expeditions/:id/zpravy — 10/min/ip.              */
/* In-memory okno (jeden proces). Čisté funkce s injektovaným časem      */
/* kvůli jednotkovým testům bez čekání.                                  */
/* ------------------------------------------------------------------ */

export const DISKUZE_LIMIT_ZA_MINUTU = 10;
export const DISKUZE_OKNO_MS = 60_000;

const odeslaneZaIp = new Map<string, number[]>();

/** Vymaže in-memory čítače (testy + dlouhý běh bez leaků). */
export function resetDiskuzeLimitu(): void {
  odeslaneZaIp.clear();
}

/**
 * True = zpráva smí projít (a čas se zapíše); false = limit vyčerpán.
 * Starší záznamy než okno se při každém volání promažou.
 */
export function smiPoslatZpravu(ip: string, ted: number = Date.now()): boolean {
  const klic = ip.trim().length > 0 ? ip : "neznama";
  const minule = odeslaneZaIp.get(klic) ?? [];
  const cerstve = minule.filter((cas) => ted - cas <= DISKUZE_OKNO_MS);
  if (cerstve.length >= DISKUZE_LIMIT_ZA_MINUTU) {
    odeslaneZaIp.set(klic, cerstve);
    return false;
  }
  cerstve.push(ted);
  odeslaneZaIp.set(klic, cerstve);
  return true;
}

/** IP klienta pro rate-limit (X-Forwarded-For má přednost za proxy). */
export function ctiIpZRequestu(req: Request): string {
  const hlavicka: unknown = req.headers["x-forwarded-for"];
  if (typeof hlavicka === "string" && hlavicka.trim().length > 0) {
    const prvni = hlavicka.split(",")[0];
    if (prvni !== undefined && prvni.trim().length > 0) return prvni.trim();
  }
  if (typeof req.ip === "string" && req.ip.trim().length > 0) return req.ip.trim();
  return "neznama";
}
