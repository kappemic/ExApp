/**
 * Meeting validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type OpakovaniSchuzky,
} from "../../../src/shared/api-types";
import type { VysledekValidace, ChybyPoli } from "./spolecne";
import { ctiString, jeRecord, pridej } from "./spolecne";
import { jeRealneDatum, DATUM_REGEX } from "./expedice";






/* Fáze 3 — Schůzky (validace na hranici).                               */
/* Pravidla kopírují kontrakt (VALIDACE + VALIDACNI_ZPRAVY §14):         */
/* nazev 3–120, datum YYYY-MM-DD (minulost POVOLENA i při vytvoření —    */
/* opakovaná schůzka mohla začít dřív; na rozdíl od výprav),             */
/* mistnost max 120 ("" → null = venku), popis max 2000 ("" = bez        */
/* popisu), opakovani `jednorazova` | `tydenni` (chybějící → default     */
/* v route). PATCH je parciální.                                         */
/* ------------------------------------------------------------------ */

const OPAKOVANI_HODNOTY: readonly OpakovaniSchuzky[] = [
  "jednorazova",
  "tydenni",
];

function overNazevSchuzky(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.schuzkaNazevPovinny);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length < VALIDACE.schuzkaNazevMinDelka) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.schuzkaNazevKratky);
    return null;
  }
  if (cisty.length > VALIDACE.schuzkaNazevMaxDelka) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.schuzkaNazevDlouhy);
    return null;
  }
  return cisty;
}

/** Minulost povolena (opakovaná schůzka mohla začít dřív). */
function overDatumSchuzky(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "datum", VALIDACNI_ZPRAVY.schuzkaDatumPovinne);
    return null;
  }
  const ciste = hodnota.trim().slice(0, 10);
  if (!DATUM_REGEX.test(ciste)) {
    pridej(chyby, "datum", VALIDACNI_ZPRAVY.schuzkaDatumNeplatne);
    return null;
  }
  const rok = Number(ciste.slice(0, 4));
  const mesic = Number(ciste.slice(5, 7));
  const den = Number(ciste.slice(8, 10));
  if (!jeRealneDatum(rok, mesic, den)) {
    pridej(chyby, "datum", VALIDACNI_ZPRAVY.schuzkaDatumNeplatne);
    return null;
  }
  return ciste;
}

/**
 * Nepovinná; prázdný řetězec / null / undefined → null (venku).
 * Vrací `{ poslan, hodnota }` — PATCH potřebuje rozlišit „neposláno".
 */
function overMistnostSchuzky(
  chyby: ChybyPoli,
  hodnota: unknown,
): { poslan: boolean; hodnota: string | null } {
  if (hodnota === undefined) return { poslan: false, hodnota: null };
  if (hodnota === null) return { poslan: true, hodnota: null };
  if (typeof hodnota !== "string") {
    pridej(chyby, "mistnost", VALIDACNI_ZPRAVY.schuzkaMistnostDlouha);
    return { poslan: true, hodnota: null };
  }
  const cisty = hodnota.trim();
  if (cisty.length === 0) return { poslan: true, hodnota: null };
  if (cisty.length > VALIDACE.schuzkaMistnostMaxDelka) {
    pridej(chyby, "mistnost", VALIDACNI_ZPRAVY.schuzkaMistnostDlouha);
    return { poslan: true, hodnota: null };
  }
  return { poslan: true, hodnota: cisty };
}

/** Nepovinný; prázdný řetězec hranice normalizuje na "". */
function overPopisSchuzky(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (hodnota === undefined || hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, "popis", VALIDACNI_ZPRAVY.schuzkaPopisDlouhy);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length > VALIDACE.schuzkaPopisMaxDelka) {
    pridej(chyby, "popis", VALIDACNI_ZPRAVY.schuzkaPopisDlouhy);
    return null;
  }
  return cisty;
}

const CAS_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Empty, null, or omitted means no clock time. */
function overCasSchuzky(
  chyby: ChybyPoli,
  hodnota: unknown,
): { poslan: boolean; hodnota: string | null } {
  if (hodnota === undefined) return { poslan: false, hodnota: null };
  if (hodnota === null) return { poslan: true, hodnota: null };
  if (typeof hodnota !== "string") {
    pridej(chyby, "cas", VALIDACNI_ZPRAVY.schuzkaCasNeplatny);
    return { poslan: true, hodnota: null };
  }
  const cisty = hodnota.trim();
  if (cisty.length === 0) return { poslan: true, hodnota: null };
  if (!CAS_REGEX.test(cisty)) {
    pridej(chyby, "cas", VALIDACNI_ZPRAVY.schuzkaCasNeplatny);
    return { poslan: true, hodnota: null };
  }
  return { poslan: true, hodnota: cisty };
}

function overOpakovaniSchuzky(
  chyby: ChybyPoli,
  hodnota: unknown,
): OpakovaniSchuzky | null {
  if (hodnota === undefined || hodnota === null) return "jednorazova";
  if (
    typeof hodnota !== "string" ||
    !(OPAKOVANI_HODNOTY as readonly string[]).includes(hodnota)
  ) {
    pridej(chyby, "opakovani", VALIDACNI_ZPRAVY.schuzkaOpakovaniNeplatne);
    return null;
  }
  return hodnota as OpakovaniSchuzky;
}

export interface CistaNovaSchuzka {
  nazev: string;
  datum: string;
  cas: string | null;
  mistnost: string | null;
  popis: string;
  opakovani: OpakovaniSchuzky;
}

/** Validace POST /api/meetings — všechna povinná pole najednou. */
export function validujVytvoreniSchuzky(
  telo: unknown,
): VysledekValidace<CistaNovaSchuzka> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const nazev = overNazevSchuzky(chyby, ctiString(telo, "nazev"));
  const datum = overDatumSchuzky(chyby, ctiString(telo, "datum"));
  const cas = overCasSchuzky(chyby, ctiString(telo, "cas"));
  const mistnost = overMistnostSchuzky(chyby, ctiString(telo, "mistnost"));
  const popis = overPopisSchuzky(chyby, ctiString(telo, "popis"));
  const opakovani = overOpakovaniSchuzky(chyby, ctiString(telo, "opakovani"));
  if (
    nazev === null ||
    datum === null ||
    popis === null ||
    opakovani === null ||
    Object.keys(chyby).length > 0
  ) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return {
    uspech: true,
    data: { nazev, datum, cas: cas.hodnota, mistnost: mistnost.hodnota, popis, opakovani },
    chybyPoli: {},
  };
}

export interface CistaUpravaSchuzky {
  nazev?: string;
  datum?: string;
  cas?: string | null;
  mistnost?: string | null;
  popis?: string;
  opakovani?: OpakovaniSchuzky;
}

/** Validace PATCH /api/meetings/:id — parciální, jen poslaná pole. */
export function validujUpravuSchuzky(
  telo: unknown,
): VysledekValidace<CistaUpravaSchuzky> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const data: CistaUpravaSchuzky = {};
  if (Object.hasOwn(telo, "nazev")) {
    const nazev = overNazevSchuzky(chyby, ctiString(telo, "nazev"));
    if (nazev !== null) data.nazev = nazev;
  }
  if (Object.hasOwn(telo, "datum")) {
    const datum = overDatumSchuzky(chyby, ctiString(telo, "datum"));
    if (datum !== null) data.datum = datum;
  }
  if (Object.hasOwn(telo, "cas")) {
    const cas = overCasSchuzky(chyby, ctiString(telo, "cas"));
    if (Object.keys(chyby).length === 0 && cas.poslan) data.cas = cas.hodnota;
  }
  if (Object.hasOwn(telo, "mistnost")) {
    const mistnost = overMistnostSchuzky(chyby, ctiString(telo, "mistnost"));
    if (Object.keys(chyby).length === 0 && mistnost.poslan)
      data.mistnost = mistnost.hodnota;
  }
  if (Object.hasOwn(telo, "popis")) {
    const popis = overPopisSchuzky(chyby, ctiString(telo, "popis"));
    if (popis !== null) data.popis = popis;
  }
  if (Object.hasOwn(telo, "opakovani")) {
    const opakovani = overOpakovaniSchuzky(chyby, ctiString(telo, "opakovani"));
    if (opakovani !== null) data.opakovani = opakovani;
  }
  if (Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
