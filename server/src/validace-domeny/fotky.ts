/**
 * Expedition photo URL validation.
 */

import type { ChybyPoli, VysledekValidace } from "./spolecne";
import { ctiString, pridej, jeRecord } from "./spolecne";





/* Krok 6 — Fotka k proběhlé výpravě (URL režim, validace na hranici).  */
/* `url` musí být https:// (max 2048), `popis` max 500 ("" = bez popisu).*/
/* Příslušnost k proběhlé výpravě hlídá route nad DB (409               */
/* VYPRAVA_UZAVRENA), tady jen tvar.                                    */
/* ------------------------------------------------------------------ */

export const FOTKA_URL_MAX_DELKA = 2048;
export const FOTKA_POPIS_MAX_DELKA = 500;

export interface CistaFotka {
  url: string;
  popis: string;
}

/**
 * Validace POST /api/expeditions/:id/fotky — tvar URL + popisu.
 * Chyby ve tvaru pole → seznam českých hlášek (klíč `url` / `popis`).
 */
export function validujFotku(telo: unknown): VysledekValidace<CistaFotka> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const rawUrl: unknown = ctiString(telo, "url");
  let url: string | null = null;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    pridej(chyby, "url", "Vlož odkaz na fotku (https://).");
  } else {
    const cista: string = rawUrl.trim();
    if (cista.length > FOTKA_URL_MAX_DELKA) {
      pridej(chyby, "url", "Odkaz je moc dlouhý (nejvýš 2048 znaků).");
    } else {
      let parsed: URL | null = null;
      try {
        parsed = new URL(cista);
      } catch {
        parsed = null;
      }
      if (parsed === null || parsed.protocol !== "https:") {
        pridej(chyby, "url", "Odkaz musí začínat https://.");
      } else {
        url = parsed.toString();
      }
    }
  }
  const rawPopis: unknown = ctiString(telo, "popis");
  let popis = "";
  if (rawPopis !== undefined && rawPopis !== null) {
    if (typeof rawPopis !== "string") {
      pridej(chyby, "popis", "Popis může mít nejvýš 500 znaků.");
    } else {
      const cisty: string = rawPopis.trim();
      if (cisty.length > FOTKA_POPIS_MAX_DELKA) {
        pridej(chyby, "popis", "Popis může mít nejvýš 500 znaků.");
      } else {
        popis = cisty;
      }
    }
  }
  if (url === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { url, popis }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
