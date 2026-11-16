/**
 * Discussion message validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
} from "../../../src/shared/api-types";
import type { ChybyPoli, VysledekValidace } from "./spolecne";
import { ctiString, pridej, jeRecord } from "./spolecne";





/* Fáze 5, Krok 4 — Diskuze k výpravě (validace na hranici).             */
/* `POST /api/expeditions/:id/zpravy { text 1–1000 }` — text se trimuje, */
/* XSS payload validací PROJDE (ukládá se raw, escapuje až render        */
/* v klientovi `escapujHtml`). Příslušnost k výpravě + rate-limit hlídá  */
/* route (429 MOC_POZADAVKU), tady jen tvar.                             */
/* ------------------------------------------------------------------ */

export interface CistaZprava {
  text: string;
}

/**
 * Validace POST :id/zpravy — tvar textu zprávy.
 * Chyby ve tvaru pole → seznam českých hlášek (klíč `text` / `telo`).
 */
export function validujZpravu(telo: unknown): VysledekValidace<CistaZprava> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const raw: unknown = ctiString(telo, "text");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    pridej(chyby, "text", VALIDACNI_ZPRAVY.zpravaTextPovinny);
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  const cisty: string = raw.trim();
  if (cisty.length > VALIDACE.zpravaTextMaxDelka) {
    pridej(chyby, "text", VALIDACNI_ZPRAVY.zpravaTextDlouhy);
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { text: cisty }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
