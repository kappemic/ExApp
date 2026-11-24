/**
 * Registrace, login, codes, and member edit validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
} from "../../../src/shared/api-types";
import {
  chybaKombinaceRole,
  isKnownRole,
  type Role,
} from "../../../src/config/roles";
import type { ChybyPoli, VysledekValidace } from "./spolecne";
import { overDiscordNick, overPrijmeni, ctiString, telefonNaE164, EMAIL_REGEX, pridej, overSkolaTrida, overTvarKodu, overTelefon, overHeslo, overEmail, overJmeno, jeRecord } from "./spolecne";




export interface CistaRegistrace {
  jmeno: string;
  prijmeni?: string;
  email: string;
  heslo: string;
  telefon: string | null;
  discordNick: string | null;
  kod: string;
  /** Vyčištěná škola (trim; prázdná → ""). */
  skola: string;
  /** Vyčištěná třída (trim; prázdná → ""). */
  trida: string;
}

/** Validace POST /api/register — kód povinný, tvar dle kontraktu. */
export function validujRegistraci(telo: unknown): VysledekValidace<CistaRegistrace> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const jmeno = overJmeno(chyby, ctiString(telo, "jmeno"));
  const prijmeni = overPrijmeni(chyby, ctiString(telo, "prijmeni"));
  const email = overEmail(chyby, ctiString(telo, "email"));
  const heslo = overHeslo(chyby, ctiString(telo, "heslo"));
  const telefon = overTelefon(chyby, ctiString(telo, "telefon"));
  const discordNick = overDiscordNick(chyby, ctiString(telo, "discordNick"));
  const kod = overTvarKodu(chyby, ctiString(telo, "kod"));
  const skola = overSkolaTrida(
    chyby,
    "skola",
    ctiString(telo, "skola"),
    VALIDACE.skolaMaxDelka,
    VALIDACNI_ZPRAVY.skolaDlouha,
  );
  const trida = overSkolaTrida(
    chyby,
    "trida",
    ctiString(telo, "trida"),
    VALIDACE.tridaMaxDelka,
    VALIDACNI_ZPRAVY.tridaDlouha,
  );
  if (
    jmeno === null ||
    email === null ||
    heslo === null ||
    kod === null ||
    skola === null ||
    trida === null ||
    Object.keys(chyby).length > 0
  ) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  const data: CistaRegistrace = {
    jmeno,
    email,
    heslo,
    telefon,
    discordNick,
    kod,
    skola,
    trida,
  };
  if (prijmeni !== undefined) data.prijmeni = prijmeni;
  return { uspech: true, data, chybyPoli: {} };
}

export interface CistePrihlaseni {
  email: string;
  heslo: string;
  /** Chybějící pole v těle je false (session cookie, starý klient). */
  zustat: boolean;
}

/** Validace POST /api/login — heslo se tu jen čte, porovná ho hash na serveru. */
export function validujPrihlaseni(telo: unknown): VysledekValidace<CistePrihlaseni> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const email = overEmail(chyby, ctiString(telo, "email"));
  const hesloRaw = ctiString(telo, "heslo");
  let heslo: string | null = null;
  if (typeof hesloRaw !== "string" || hesloRaw.length === 0) {
    pridej(chyby, "heslo", VALIDACNI_ZPRAVY.hesloPovinne);
  } else {
    heslo = hesloRaw;
  }
  let zustat = false;
  if (Object.hasOwn(telo, "zustat")) {
    if (typeof telo["zustat"] !== "boolean") {
      pridej(chyby, "zustat", "Zůstat přihlášený musí být ano nebo ne.");
    } else {
      zustat = telo["zustat"];
    }
  }
  if (email === null || heslo === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { email, heslo, zustat }, chybyPoli: {} };
}

export function validujOvereniKodu(
  telo: unknown,
): VysledekValidace<{ kod: string }> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const kod = overTvarKodu(chyby, ctiString(telo, "kod"));
  if (kod === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { kod }, chybyPoli: {} };
}

/** Validace POST /api/admin/codes — vstup je záměrně jen nepovinná poznámka. */
export function validujPoznamkuKodu(
  telo: unknown,
): VysledekValidace<{ poznamka: string | null }> {
  if (telo === undefined || telo === null) return { uspech: true, data: { poznamka: null }, chybyPoli: {} };
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const raw = ctiString(telo, "poznamka");
  if (raw === undefined || raw === null) {
    return { uspech: true, data: { poznamka: null }, chybyPoli: {} };
  }
  if (typeof raw !== "string") {
    return {
      uspech: false,
      data: null,
      chybyPoli: { poznamka: ["Poznámka musí být text."] },
    };
  }
  const cista = raw.trim();
  if (cista.length === 0) return { uspech: true, data: { poznamka: null }, chybyPoli: {} };
  if (cista.length > VALIDACE.poznamkaMaxDelka) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { poznamka: ["Poznámka může mít nejvýš 120 znaků."] },
    };
  }
  return { uspech: true, data: { poznamka: cista }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
/* PATCH /api/clenove/:id — parciální update (jen poslaná pole).       */
/* Pravidla kopírují kontrakt + roles.ts (chybaKombinaceRole).          */
/* Neposlané pole = undefined (beze změny). Prázdný nepovinný kontakt  */
/* (telefon / discordNick) se normalizuje na null (smazání).           */
/* ------------------------------------------------------------------ */

export interface CistaUpravaClena {
  jmeno?: string;
  prijmeni?: string;
  email?: string;
  /** undefined = neposláno (beze změny), null = smazat. */
  telefon?: string | null;
  /** undefined = neposláno (beze změny), null = smazat. */
  discordNick?: string | null;
  /** Celé nové pole rolí (ne delta). */
  role?: Role[];
}

export function overJmenoPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): string | undefined {
  if (!Object.hasOwn(data, "jmeno")) return undefined;
  const hodnota: unknown = data["jmeno"];
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "jmeno", VALIDACNI_ZPRAVY.jmenoPovinne);
    return undefined;
  }
  const ciste = hodnota.trim();
  if (ciste.length < VALIDACE.jmenoMinDelka) {
    pridej(chyby, "jmeno", VALIDACNI_ZPRAVY.jmenoKratke);
    return undefined;
  }
  if (ciste.length > VALIDACE.jmenoMaxDelka) {
    pridej(chyby, "jmeno", VALIDACNI_ZPRAVY.jmenoDlouhe);
    return undefined;
  }
  return ciste;
}

export function overPrijmeniPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): string | undefined {
  if (!Object.hasOwn(data, "prijmeni")) return undefined;
  const hodnota: unknown = data["prijmeni"];
  if (hodnota === null || hodnota === undefined) return undefined;
  if (typeof hodnota !== "string") {
    pridej(chyby, "prijmeni", VALIDACNI_ZPRAVY.prijmeniDlouhe);
    return undefined;
  }
  const ciste = hodnota.trim();
  // Prázdné = beze změny (prijmeni je povinné, vymazat nejde).
  if (ciste.length === 0) return undefined;
  if (ciste.length < VALIDACE.prijmeniMinDelka) {
    pridej(chyby, "prijmeni", VALIDACNI_ZPRAVY.prijmeniKratke);
    return undefined;
  }
  if (ciste.length > VALIDACE.prijmeniMaxDelka) {
    pridej(chyby, "prijmeni", VALIDACNI_ZPRAVY.prijmeniDlouhe);
    return undefined;
  }
  return ciste;
}

export function overEmailPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): string | undefined {
  if (!Object.hasOwn(data, "email")) return undefined;
  const hodnota: unknown = data["email"];
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "email", VALIDACNI_ZPRAVY.emailPovinny);
    return undefined;
  }
  const cisty = hodnota.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cisty)) {
    pridej(chyby, "email", VALIDACNI_ZPRAVY.emailNeplatny);
    return undefined;
  }
  return cisty;
}

export function overTelefonPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): { poslan: boolean; hodnota: string | null } {
  if (!Object.hasOwn(data, "telefon")) return { poslan: false, hodnota: null };
  const hodnota: unknown = data["telefon"];
  if (hodnota === null) return { poslan: true, hodnota: null };
  if (typeof hodnota !== "string") {
    pridej(chyby, "telefon", VALIDACNI_ZPRAVY.telefonNeplatny);
    return { poslan: true, hodnota: null };
  }
  const cisty = hodnota.trim();
  if (cisty.length === 0) return { poslan: true, hodnota: null };
  return { poslan: true, hodnota: telefonNaE164(chyby, cisty) };
}

export function overDiscordNickPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): { poslan: boolean; hodnota: string | null } {
  if (!Object.hasOwn(data, "discordNick"))
    return { poslan: false, hodnota: null };
  const hodnota: unknown = data["discordNick"];
  if (hodnota === null) return { poslan: true, hodnota: null };
  if (typeof hodnota !== "string") {
    pridej(chyby, "discordNick", VALIDACNI_ZPRAVY.discordNickDlouhy);
    return { poslan: true, hodnota: null };
  }
  const cisty = hodnota.trim();
  if (cisty.length === 0) return { poslan: true, hodnota: null };
  if (cisty.length > VALIDACE.discordNickMaxDelka) {
    pridej(chyby, "discordNick", VALIDACNI_ZPRAVY.discordNickDlouhy);
    return { poslan: true, hodnota: null };
  }
  return { poslan: true, hodnota: cisty };
}

function overRolePatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): Role[] | undefined {
  if (!Object.hasOwn(data, "role")) return undefined;
  const hodnota: unknown = data["role"];
  if (!Array.isArray(hodnota)) {
    pridej(chyby, "role", "Vyber aspoň jednu roli.");
    return undefined;
  }
  const role: Role[] = [];
  for (const polozka of hodnota) {
    if (typeof polozka !== "string" || !isKnownRole(polozka)) {
      pridej(chyby, "role", `Neznámá role: ${String(polozka)}.`);
      return undefined;
    }
    if (!role.includes(polozka)) role.push(polozka);
  }
  const chyba: string | null = chybaKombinaceRole(role);
  if (chyba !== null) {
    pridej(chyby, "role", chyba);
    return undefined;
  }
  return role;
}

/**
 * Validace PATCH /api/clenove/:id — parciální, jen poslaná pole.
 * Neplatná kombinace rolí → chyby.role = [chybaKombinaceRole(...)].
 */
export function validujUpravuClena(
  telo: unknown,
): VysledekValidace<CistaUpravaClena> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const jmeno = overJmenoPatch(chyby, telo);
  const prijmeni = overPrijmeniPatch(chyby, telo);
  const email = overEmailPatch(chyby, telo);
  const telefon = overTelefonPatch(chyby, telo);
  const discordNick = overDiscordNickPatch(chyby, telo);
  const role = overRolePatch(chyby, telo);
  if (Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  const data: CistaUpravaClena = {};
  if (jmeno !== undefined) data.jmeno = jmeno;
  if (prijmeni !== undefined) data.prijmeni = prijmeni;
  if (email !== undefined) data.email = email;
  if (telefon.poslan) data.telefon = telefon.hodnota;
  if (discordNick.poslan) data.discordNick = discordNick.hodnota;
  if (role !== undefined) data.role = role;
  return { uspech: true, data, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
