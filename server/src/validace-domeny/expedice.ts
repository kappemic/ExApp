/**
 * Expedition create, edit, attendance, and late signup validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type DochazkovyStatus,
} from "../../../src/shared/api-types";
import type { VysledekValidace, ChybyPoli } from "./spolecne";
import { ctiString, jeRecord, pridej } from "./spolecne";





/* Krok 3b — Expedice CRUD + uzavření (validace na hranici).            */
/* Pravidla kopírují kontrakt (VALIDACE + VALIDACNI_ZPRAVY):            */
/* nazev 3–120, datum YYYY-MM-DD (minulost → 422 jen při VYTVOŘENÍ,     */
/* historie vzniká uzavřením; PATCH minulost povoluje pro opravu historie), */
/* sraz 3–120, popis max 2000 ("" = nevyplněn), kapacita                 */
/* 0–100 (0 / chybějící = bez omezení). PATCH je parciální — `stav`     */
/* tudy nikdy nejde (jen /uzavrit).                                      */
/* ------------------------------------------------------------------ */

export const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DOCHAZKOVE_STAVY: readonly DochazkovyStatus[] = [
  "ucastnil_se",
  "omluven",
];

/** Dnešek v lokálním YYYY-MM-DD (DATE nemá pásmo — bez toISOString). */
function dnesYmd(): string {
  const ted = new Date();
  const rok = ted.getFullYear();
  const mesic = String(ted.getMonth() + 1).padStart(2, "0");
  const den = String(ted.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

/** Hlídá i neexistující dny (2026-02-30) přes roundtrip kontrolu. */
export function jeRealneDatum(rok: number, mesic: number, den: number): boolean {
  if (!Number.isInteger(rok) || !Number.isInteger(mesic) || !Number.isInteger(den))
    return false;
  if (mesic < 1 || mesic > 12 || den < 1 || den > 31) return false;
  const overeni = new Date(rok, mesic - 1, den);
  return (
    overeni.getFullYear() === rok &&
    overeni.getMonth() === mesic - 1 &&
    overeni.getDate() === den
  );
}

function overNazevExpedice(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.expediceNazevPovinny);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length < VALIDACE.expediceNazevMinDelka) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.expediceNazevKratky);
    return null;
  }
  if (cisty.length > VALIDACE.expediceNazevMaxDelka) {
    pridej(chyby, "nazev", VALIDACNI_ZPRAVY.expediceNazevDlouhy);
    return null;
  }
  return cisty;
}

function overDatumExpedice(
  chyby: ChybyPoli,
  hodnota: unknown,
  povolitMinulost = false,
): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "datum", VALIDACNI_ZPRAVY.expediceDatumPovinne);
    return null;
  }
  const ciste = hodnota.trim().slice(0, 10);
  if (!DATUM_REGEX.test(ciste)) {
    pridej(chyby, "datum", VALIDACNI_ZPRAVY.expediceDatumNeplatne);
    return null;
  }
  const rok = Number(ciste.slice(0, 4));
  const mesic = Number(ciste.slice(5, 7));
  const den = Number(ciste.slice(8, 10));
  if (!jeRealneDatum(rok, mesic, den)) {
    pridej(chyby, "datum", VALIDACNI_ZPRAVY.expediceDatumNeplatne);
    return null;
  }
  if (!povolitMinulost && ciste < dnesYmd()) {
    pridej(
      chyby,
      "datum",
      VALIDACNI_ZPRAVY.expediceDatumMinulost,
    );
    return null;
  }
  return ciste;
}

/**
 * Nepovinný konec vícedenní výpravy (od–do).
 * Nezadané (undefined/null/"") → "" (jednodenní, volající mapuje na NULL).
 * `null` je jen chyba. Rozsah proti `datumOd` (null = nekontrolovat —
 * dopočítá route nad DB).
 */
function overDatumDoExpedice(
  chyby: ChybyPoli,
  hodnota: unknown,
  datumOd: string | null,
): string | null {
  if (hodnota === undefined || hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, "datumDo", VALIDACNI_ZPRAVY.expediceDatumDoNeplatne);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length === 0) return "";
  const ciste = cisty.slice(0, 10);
  if (!DATUM_REGEX.test(ciste)) {
    pridej(chyby, "datumDo", VALIDACNI_ZPRAVY.expediceDatumDoNeplatne);
    return null;
  }
  const rok = Number(ciste.slice(0, 4));
  const mesic = Number(ciste.slice(5, 7));
  const den = Number(ciste.slice(8, 10));
  if (!jeRealneDatum(rok, mesic, den)) {
    pridej(chyby, "datumDo", VALIDACNI_ZPRAVY.expediceDatumDoNeplatne);
    return null;
  }
  if (datumOd !== null && ciste < datumOd) {
    pridej(chyby, "datumDo", VALIDACNI_ZPRAVY.expediceDatumDoPredZacatkem);
    return null;
  }
  return ciste;
}

function overSrazExpedice(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "sraz", VALIDACNI_ZPRAVY.expediceSrazPovinny);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length < VALIDACE.expediceSrazMinDelka) {
    pridej(chyby, "sraz", VALIDACNI_ZPRAVY.expediceSrazKratky);
    return null;
  }
  if (cisty.length > VALIDACE.expediceSrazMaxDelka) {
    pridej(chyby, "sraz", VALIDACNI_ZPRAVY.expediceSrazDlouhy);
    return null;
  }
  return cisty;
}

/** Nepovinný; prázdný řetězec hranice normalizuje na "". */
function overPopisExpedice(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (hodnota === undefined || hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, "popis", VALIDACNI_ZPRAVY.expedicePopisDlouhy);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length > VALIDACE.expedicePopisMaxDelka) {
    pridej(chyby, "popis", VALIDACNI_ZPRAVY.expedicePopisDlouhy);
    return null;
  }
  return cisty;
}

/** Nepovinný odkaz na trasu (mapy.com); prázdný řetězec → "". */
function overTrasaOdkazExpedice(
  chyby: ChybyPoli,
  hodnota: unknown,
): string | null {
  if (hodnota === undefined || hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, "trasaOdkaz", VALIDACNI_ZPRAVY.expediceTrasaOdkazNeplatny);
    return null;
  }
  const cisty = hodnota.trim();
  if (cisty.length === 0) return "";
  if (cisty.length > VALIDACE.expediceTrasaOdkazMaxDelka) {
    pridej(chyby, "trasaOdkaz", VALIDACNI_ZPRAVY.expediceTrasaOdkazDlouhy);
    return null;
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(cisty);
  } catch {
    parsed = null;
  }
  if (parsed === null || parsed.protocol !== "https:") {
    pridej(chyby, "trasaOdkaz", VALIDACNI_ZPRAVY.expediceTrasaOdkazNeplatny);
    return null;
  }
  return parsed.toString();
}

/** 0–100, 0 = bez omezení. Chybějící údaj se normalizuje na 0. */
function overKapacituExpedice(
  chyby: ChybyPoli,
  hodnota: unknown,
): number | null {
  if (hodnota === undefined || hodnota === null) return 0;
  if (
    typeof hodnota !== "number" ||
    !Number.isInteger(hodnota) ||
    hodnota < VALIDACE.expediceKapacitaMin ||
    hodnota > VALIDACE.expediceKapacitaMax
  ) {
    pridej(chyby, "kapacitaCelkem", VALIDACNI_ZPRAVY.expediceKapacitaNeplatna);
    return null;
  }
  return hodnota;
}

export interface CistaNovaExpedice {
  nazev: string;
  datum: string;
  /** Konec od–do; null = jednodenní. */
  datumDo: string | null;
  sraz: string;
  popis: string;
  trasaOdkaz: string;
  kapacitaCelkem: number;
}

/** Validace POST /api/expeditions — všechna povinná pole najednou. */
export function validujVytvoreniExpedice(
  telo: unknown,
): VysledekValidace<CistaNovaExpedice> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const nazev = overNazevExpedice(chyby, ctiString(telo, "nazev"));
  const datum = overDatumExpedice(chyby, ctiString(telo, "datum"));
  const datumDoRaw = overDatumDoExpedice(
    chyby,
    ctiString(telo, "datumDo"),
    datum,
  );
  const sraz = overSrazExpedice(chyby, ctiString(telo, "sraz"));
  const popis = overPopisExpedice(chyby, ctiString(telo, "popis"));
  const trasaOdkaz = overTrasaOdkazExpedice(chyby, ctiString(telo, "trasaOdkaz"));
  const kapacitaCelkem = overKapacituExpedice(
    chyby,
    ctiString(telo, "kapacitaCelkem"),
  );
  if (
    nazev === null ||
    datum === null ||
    datumDoRaw === null ||
    sraz === null ||
    popis === null ||
    trasaOdkaz === null ||
    kapacitaCelkem === null ||
    Object.keys(chyby).length > 0
  ) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return {
    uspech: true,
    data: {
      nazev,
      datum,
      datumDo: datumDoRaw === "" ? null : datumDoRaw,
      sraz,
      popis,
      trasaOdkaz,
      kapacitaCelkem,
    },
    chybyPoli: {},
  };
}

export interface CistaUpravaExpedice {
  nazev?: string;
  datum?: string;
  /** Konec od–do; null = zrušit konec (jednodenní). */
  datumDo?: string | null;
  sraz?: string;
  popis?: string;
  trasaOdkaz?: string;
  kapacitaCelkem?: number;
}

/**
 * Validace PATCH /api/expeditions/:id — parciální, jen poslaná pole.
 * `stav` tudy nikdy nejde (proběhlá vzniká jen PATCH /uzavrit).
 * Minulost data je záměrně povolena — proběhlé záznamy musí zůstat
 * opravitelné (zákaz minulosti platí jen pro VYTVOŘENÍ). Tvar a reálnost
 * data se kontrolují stejně jako při vytvoření. Rozsah od–do proti
 * existujícímu řádku dopočítává route v server/src/index.ts.
 */
export function validujUpravuExpedice(
  telo: unknown,
): VysledekValidace<CistaUpravaExpedice> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  if (Object.hasOwn(telo, "stav")) {
    pridej(
      chyby,
      "stav",
      "Stav takhle změnit nejde — proběhlá vzniká jen uzavřením.",
    );
  }
  const data: CistaUpravaExpedice = {};
  if (Object.hasOwn(telo, "nazev")) {
    const nazev = overNazevExpedice(chyby, ctiString(telo, "nazev"));
    if (nazev !== null) data.nazev = nazev;
  }
  if (Object.hasOwn(telo, "datum")) {
    const datum = overDatumExpedice(chyby, ctiString(telo, "datum"), true);
    if (datum !== null) data.datum = datum;
  }
  if (Object.hasOwn(telo, "datumDo")) {
    // Rozsah proti novému začátku ze stejného patche; zbytek dopočítá
    // route nad existujícím řádkem.
    const datumDoRaw = overDatumDoExpedice(
      chyby,
      ctiString(telo, "datumDo"),
      data.datum ?? null,
    );
    if (datumDoRaw !== null) data.datumDo = datumDoRaw === "" ? null : datumDoRaw;
  }
  if (Object.hasOwn(telo, "sraz")) {
    const sraz = overSrazExpedice(chyby, ctiString(telo, "sraz"));
    if (sraz !== null) data.sraz = sraz;
  }
  if (Object.hasOwn(telo, "popis")) {
    const popis = overPopisExpedice(chyby, ctiString(telo, "popis"));
    if (popis !== null) data.popis = popis;
  }
  if (Object.hasOwn(telo, "trasaOdkaz")) {
    const trasaOdkaz = overTrasaOdkazExpedice(
      chyby,
      ctiString(telo, "trasaOdkaz"),
    );
    if (trasaOdkaz !== null) data.trasaOdkaz = trasaOdkaz;
  }
  if (Object.hasOwn(telo, "kapacitaCelkem")) {
    const kapacita = overKapacituExpedice(
      chyby,
      ctiString(telo, "kapacitaCelkem"),
    );
    if (kapacita !== null) data.kapacitaCelkem = kapacita;
  }
  if (Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data, chybyPoli: {} };
}

export interface CistaDochazka {
  ucastnikId: string;
  status: DochazkovyStatus;
}

/**
 * Validace PATCH /api/expeditions/:id/uzavrit — tvar docházky.
 * Příslušnost `ucastnikId` k výpravě hlídá route nad DB (422
 * dochazkaNeznamyUcastnik), tady jen tvar a neprázdnost.
 */
export function validujUzavreni(
  telo: unknown,
): VysledekValidace<{ dochazka: CistaDochazka[] }> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const raw = ctiString(telo, "dochazka");
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { dochazka: [VALIDACNI_ZPRAVY.dochazkaPrazdna] },
    };
  }
  const dochazka: CistaDochazka[] = [];
  const videne = new Set<string>();
  for (const polozka of raw) {
    if (!jeRecord(polozka)) {
      pridej(chyby, "dochazka", VALIDACNI_ZPRAVY.dochazkaNeznamyUcastnik);
      continue;
    }
    const idRaw: unknown = polozka["ucastnikId"];
    const statusRaw: unknown = polozka["status"];
    const ucastnikId =
      typeof idRaw === "string" && idRaw.trim().length > 0 ? idRaw.trim() : null;
    const status =
      typeof statusRaw === "string" &&
      (DOCHAZKOVE_STAVY as readonly string[]).includes(statusRaw)
        ? (statusRaw as DochazkovyStatus)
        : null;
    if (ucastnikId === null || status === null) {
      pridej(chyby, "dochazka", VALIDACNI_ZPRAVY.dochazkaNeznamyUcastnik);
      continue;
    }
    if (videne.has(ucastnikId)) {
      pridej(chyby, "dochazka", VALIDACNI_ZPRAVY.dochazkaNeznamyUcastnik);
      continue;
    }
    videne.add(ucastnikId);
    dochazka.push({ ucastnikId, status });
  }
  if (Object.keys(chyby).length > 0 || dochazka.length === 0) {
    if (Object.keys(chyby).length === 0) {
      return {
        uspech: false,
        data: null,
        chybyPoli: { dochazka: [VALIDACNI_ZPRAVY.dochazkaPrazdna] },
      };
    }
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { dochazka }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
/* Dodatečná správa účastníků po uzavření — varianta A (validace hranice).*/
/* POST /api/expeditions/:id/ucastnici (jen ADMIN, i po proběhlá).      */
/* Právě jedna identita userId XOR clenId; status default ucastnil_se.  */
/* Existenci userId/clenId hlídá route nad DB (404), duplicitu UNIQUE   */
/* (409 UZ_PRIHLASEN) — tady jen tvar. Kapacita se nekontroluje.        */
/* ------------------------------------------------------------------ */

export interface CistyUcastnikPoUzavreni {
  userId: string | null;
  clenId: string | null;
  status: DochazkovyStatus;
}

function ctiIdentituUcastnika(hodnota: unknown): string | null {
  if (hodnota === undefined || hodnota === null) return null;
  if (typeof hodnota !== "string") return null;
  const cista = hodnota.trim();
  return cista.length === 0 ? null : cista;
}

/**
 * Validace POST /api/expeditions/:id/ucastnici — tvar dle kontraktu §10.
 * Bez identity → ucastnik: [ucastnikIdentitaChybi], obojí → ucastnik:
 * [ucastnikIdentitaOboji], špatný status → status: [ucastnikStatusNeplatny].
 */
export function validujPridaniUcastnikaPoUzavreni(
  telo: unknown,
): VysledekValidace<CistyUcastnikPoUzavreni> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const maUserId = Object.hasOwn(telo, "userId");
  const maClenId = Object.hasOwn(telo, "clenId");
  const userId =
    maUserId || ctiString(telo, "userId") !== undefined
      ? ctiIdentituUcastnika(ctiString(telo, "userId"))
      : null;
  const clenId =
    maClenId || ctiString(telo, "clenId") !== undefined
      ? ctiIdentituUcastnika(ctiString(telo, "clenId"))
      : null;
  if (maUserId && typeof ctiString(telo, "userId") !== "string") {
    pridej(chyby, "ucastnik", VALIDACNI_ZPRAVY.ucastnikIdentitaChybi);
  } else if (maClenId && typeof ctiString(telo, "clenId") !== "string") {
    pridej(chyby, "ucastnik", VALIDACNI_ZPRAVY.ucastnikIdentitaChybi);
  } else if (userId === null && clenId === null) {
    pridej(chyby, "ucastnik", VALIDACNI_ZPRAVY.ucastnikIdentitaChybi);
  } else if (userId !== null && clenId !== null) {
    pridej(chyby, "ucastnik", VALIDACNI_ZPRAVY.ucastnikIdentitaOboji);
  }

  let status: DochazkovyStatus = "ucastnil_se";
  if (Object.hasOwn(telo, "status")) {
    const raw: unknown = ctiString(telo, "status");
    if (
      typeof raw !== "string" ||
      !(DOCHAZKOVE_STAVY as readonly string[]).includes(raw)
    ) {
      pridej(chyby, "status", VALIDACNI_ZPRAVY.ucastnikStatusNeplatny);
    } else {
      status = raw as DochazkovyStatus;
    }
  }

  if (Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { userId, clenId, status }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
