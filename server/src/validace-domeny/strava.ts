/**
 * Strava OAuth and activity pairing validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
} from "../../../src/shared/api-types";
import type { ChybyPoli, VysledekValidace } from "./spolecne";
import { ctiString, pridej, jeRecord } from "./spolecne";





/* Fáze 4, Krok 1 — Strava OAuth callback (validace na hranici).        */
/* `code` je jednorázový autorizační kód od Stravy (query). Chybný      */
/* tvar → 422 VALIDATION_ERROR s polem `code` (route nic nemění).       */
/* `state` je jen délka a tvar. Vazbu na session drží httpOnly cookie   */
/* (stejný nonce + id přihlášeného). Prázdný state na callbacku nesedí. */
/* ------------------------------------------------------------------ */

const STRAVA_CODE_REGEX = /^[A-Za-z0-9_-]+$/;
const STRAVA_CODE_MAX_DELKA = 512;
const STRAVA_STATE_REGEX = /^[A-Za-z0-9\-_:.]+$/;
const STRAVA_STATE_MAX_DELKA = 256;
const STRAVA_SCOPE_MAX_DELKA = 128;

/**
 * Guard `state` pro GET /api/strava/auth-url (Krok 9).
 * Prázdný = povolen (route ho pak do URL vůbec nedá); jinak stejná
 * pravidla jako callback (max 256, charset bez mezer / scriptů).
 */
export function jePlatnyStravaState(hodnota: string): boolean {
  const ciste = hodnota.trim();
  if (ciste.length === 0) return true;
  if (ciste.length > STRAVA_STATE_MAX_DELKA) return false;
  return STRAVA_STATE_REGEX.test(ciste);
}

export interface CistyStravaCallback {
  code: string;
  /** Opaque passthrough; null = Strava ho nevrátila. */
  state: string | null;
  /** Udělený scope (echo ze Stravy); null = bez scope. */
  scope: string | null;
}

/**
 * Validace GET /api/strava/callback — query `code/state/scope`.
 * Express query umí i pole (string[]) — to je vždy chyba tvaru.
 */
export function validujStravaCallback(
  dotaz: unknown,
): VysledekValidace<CistyStravaCallback> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(dotaz)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být objekt."] },
    };
  }
  const codeRaw: unknown = dotaz["code"];
  let code: string | null = null;
  if (typeof codeRaw !== "string" || codeRaw.trim().length === 0) {
    pridej(chyby, "code", "Chybí autorizační kód ze Stravy. Zkus propojení znovu.");
  } else {
    const cisty = codeRaw.trim();
    if (cisty.length > STRAVA_CODE_MAX_DELKA) {
      pridej(chyby, "code", "Kód ze Stravy je moc dlouhý. Zkus propojení znovu.");
    } else if (!STRAVA_CODE_REGEX.test(cisty)) {
      pridej(chyby, "code", "Kód ze Stravy nemá platný tvar. Zkus propojení znovu.");
    } else {
      code = cisty;
    }
  }

  let state: string | null = null;
  if (Object.hasOwn(dotaz, "state")) {
    const stateRaw: unknown = dotaz["state"];
    if (stateRaw !== undefined && stateRaw !== null) {
      if (typeof stateRaw !== "string" || stateRaw.trim().length === 0) {
        state = null;
      } else {
        const cisty = stateRaw.trim();
        if (
          cisty.length > STRAVA_STATE_MAX_DELKA ||
          !STRAVA_STATE_REGEX.test(cisty)
        ) {
          pridej(chyby, "state", "Stav propojení je neplatný. Zkus to znovu.");
        } else {
          state = cisty;
        }
      }
    }
  }

  let scope: string | null = null;
  if (Object.hasOwn(dotaz, "scope")) {
    const scopeRaw: unknown = dotaz["scope"];
    if (typeof scopeRaw === "string" && scopeRaw.trim().length > 0) {
      const cisty = scopeRaw.trim();
      if (cisty.length > STRAVA_SCOPE_MAX_DELKA) {
        pridej(chyby, "scope", "Rozsah propojení je neplatný. Zkus to znovu.");
      } else {
        scope = cisty;
      }
    }
  }

  if (code === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { code, state, scope }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
/* Krok 2 Fáze 4 — Párování aktivity (validace na hranici).              */
/* `POST /api/expeditions/:id/strava-parovani { activityId }`.           */
/* Příslušnost k proběhlé výpravě + duplicitu hlídá route nad DB         */
/* (409 VYPRAVA_UZAVRENA / UZ_PRIHLASEN), tady jen tvar.                 */
/* ------------------------------------------------------------------ */

const PAROVANI_ACTIVITY_ID_REGEX = /^[A-Za-z0-9_-]+$/;
const PAROVANI_ACTIVITY_ID_MAX_DELKA = 128;

export interface CisteNeparovaneQuery {
  page: number;
  per_page: number;
}

/**
 * Validace GET /api/strava/neparovane — query `?page&per_page` (Krok 13).
 * Default `page=1, per_page=30`, cap `per_page` 100. Chybné → 422 s polem
 * `page` / `per_page` (route nic nemění). Přijímá string (Express query)
 * i číslo (testy).
 */
export function validujNeparovaneQuery(
  dotaz: unknown,
): VysledekValidace<CisteNeparovaneQuery> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(dotaz)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být objekt."] },
    };
  }
  function ctiCele(
    pole: string,
    surova: unknown,
    vychozi: number,
  ): number | null {
    if (surova === undefined || surova === null) return vychozi;
    const cislo =
      typeof surova === "number"
        ? surova
        : typeof surova === "string" && surova.trim().length > 0
          ? Number(surova.trim())
          : NaN;
    if (!Number.isInteger(cislo) || cislo < 1) {
      pridej(
        chyby,
        pole,
        pole === "page"
          ? "Stránka musí být kladné celé číslo."
          : "Počet na stránku musí být kladné celé číslo (nejvýš 100).",
      );
      return null;
    }
    if (pole === "per_page" && cislo > 100) {
      pridej(chyby, pole, "Počet na stránku může být nejvýš 100.");
      return null;
    }
    return cislo;
  }
  const page = ctiCele("page", (dotaz as Record<string, unknown>)["page"], 1);
  const perPage = ctiCele(
    "per_page",
    (dotaz as Record<string, unknown>)["per_page"],
    30,
  );
  if (page === null || perPage === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { page, per_page: perPage }, chybyPoli: {} };
}

export interface CisteParovaniAktivitu {
  activityId: string;
}

/**
 * Validace POST :id/strava-parovani — tvar `activityId`.
 * Chybějící / prázdné / moc dlouhé / špatný tvar → 422 s polem
 * `activityId` (route nic nemění).
 */
export function validujParovaniAktivitu(
  telo: unknown,
): VysledekValidace<CisteParovaniAktivitu> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const raw: unknown = ctiString(telo, "activityId");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    pridej(chyby, "activityId", "Vyber aktivitu ze Stravy k připárování.");
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  const ciste = raw.trim();
  if (
    ciste.length > PAROVANI_ACTIVITY_ID_MAX_DELKA ||
    !PAROVANI_ACTIVITY_ID_REGEX.test(ciste)
  ) {
    pridej(chyby, "activityId", "Aktivita nemá platný tvar. Vyber ji znovu.");
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { activityId: ciste }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
/* Krok 7c — Ruční zadání aktivity bez Stravy (validace na hranici).     */
/* `POST /api/expeditions/:id/aktivita-ruchne { km, prevyseni_m }`.       */
/* Příslušnost k proběhlé výpravě hlídá route nad DB (409               */
/* VYPRAVA_UZAVRENA), tady jen tvar: km číslo > 0 (max VALIDACE.         */
/* rucniKmMax, zaokrouhlí se na 1 desetinné jako Strava normalizace),     */
/* převýšení celé metry >= 0 (chybějící → 0). Datum se neposílá — bere    */
/* se z expedice (statistice stačí DB sloupce km / prevyseni_m). Tělo     */
/* přijímá `prevyseniM` i snake_case `prevyseni_m` (alias pro formulář).  */
/* ------------------------------------------------------------------ */

export interface CistaRucniAktivita {
  km: number;
  prevyseniM: number;
}

/**
 * Validace POST :id/aktivita-ruchne — tvar km / převýšení.
 * Chyby ve tvaru pole → seznam českých hlášek (klíč `km` /
 * `prevyseniM`).
 */
export function validujRucniAktivitu(
  telo: unknown,
): VysledekValidace<CistaRucniAktivita> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const kmRaw: unknown = ctiString(telo, "km");
  let km: number | null = null;
  if (
    typeof kmRaw !== "number" ||
    !Number.isFinite(kmRaw) ||
    kmRaw <= 0 ||
    kmRaw > VALIDACE.rucniKmMax
  ) {
    pridej(chyby, "km", VALIDACNI_ZPRAVY.rucniKmNeplatne);
  } else {
    km = Math.round(kmRaw * 10) / 10;
  }

  const prevyseniRaw: unknown =
    Object.hasOwn(telo, "prevyseniM")
      ? ctiString(telo, "prevyseniM")
      : ctiString(telo, "prevyseni_m");
  let prevyseniM = 0;
  if (prevyseniRaw === undefined || prevyseniRaw === null) {
    prevyseniM = 0;
  } else if (
    typeof prevyseniRaw !== "number" ||
    !Number.isInteger(prevyseniRaw) ||
    prevyseniRaw < 0 ||
    prevyseniRaw > VALIDACE.rucniPrevyseniMax
  ) {
    pridej(chyby, "prevyseniM", VALIDACNI_ZPRAVY.rucniPrevyseniNeplatne);
  } else {
    prevyseniM = prevyseniRaw;
  }

  if (km === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { km, prevyseniM }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
