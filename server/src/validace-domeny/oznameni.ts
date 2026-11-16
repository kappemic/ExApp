/**
 * Discord announcement validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
} from "../../../src/shared/api-types";
import type { VysledekValidace, ChybyPoli } from "./spolecne";
import { ctiString, jeRecord, pridej } from "./spolecne";





/* Fáze 5 — Důležitá oznámení na Discord (validace na hranici).          */
/* `POST /api/oznameni { nazev 3–120, text 1–2000 }` — vzor názvu       */
/* výpravy (povinný → krátký → dlouhý), text nesmí být prázdný           */
/* (min 1 po trimu). Odeslání na Discord řeší route fail-open,          */
/* tady jen tvar.                                                        */
/* ------------------------------------------------------------------ */

export interface CisteOznameni {
  nazev: string;
  text: string;
}

function overNazevOznameni(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.oznameniNazevPovinny);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length < VALIDACE.oznameniNazevMinDelka) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.oznameniNazevKratky);
    return null;
  }
  if (cisty.length > VALIDACE.oznameniNazevMaxDelka) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.oznameniNazevDlouhy);
    return null;
  }
  return cisty;
}

function overTextOznameni(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "text", VALIDACNI_ZPRAVY.oznameniTextPovinny);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length > VALIDACE.oznameniTextMaxDelka) {
    pridej(chyby, "text", VALIDACNI_ZPRAVY.oznameniTextDlouhy);
    return null;
  }
  return cisty;
}

/**
 * Validace POST /api/oznameni — název + text najednou.
 * Chyby ve tvaru pole → seznam českých hlášek (klíč `nazev` / `text`).
 */
export function validujOznameni(
  telo: unknown,
): VysledekValidace<CisteOznameni> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const nazev = overNazevOznameni(chyby, ctiString(telo, "nazev"));
  const text = overTextOznameni(chyby, ctiString(telo, "text"));
  if (nazev === null || text === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { nazev, text }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
