/**
 * server/src/validace.ts — validace na hranici (API route).
 *
 * Pravidla i hlášky se berou z kontraktu (VALIDACE, VALIDACNI_ZPRAVY),
 * takže server a formuláře hlásí česky stejně. Vnitřní kód po této
 * validaci typům věří — nevaliduje znovu.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  normalizujKod,
  type DochazkovyStatus,
} from "../../src/shared/api-types";
import {
  chybaKombinaceRole,
  isKnownRole,
  type Role,
} from "../../src/config/roles";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOD_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export type ChybyPoli = Record<string, string[]>;

function pridej(chyby: ChybyPoli, pole: string, zprava: string): void {
  const seznam = chyby[pole];
  if (seznam === undefined) chyby[pole] = [zprava];
  else seznam.push(zprava);
}

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

function ctiString(data: Record<string, unknown>, klic: string): unknown {
  return data[klic];
}

/** Prázdný nepovinný řetězec normalizuje na null (kontrakt api-types). */
export function normalizujNepovinny(hodnota: unknown): string | null {
  if (typeof hodnota !== "string") return null;
  const cista = hodnota.trim();
  return cista.length === 0 ? null : cista;
}

function overJmeno(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "jmeno", VALIDACNI_ZPRAVY.jmenoPovinne);
    return null;
  }
  const ciste = hodnota.trim();
  if (ciste.length < VALIDACE.jmenoMinDelka) {
    pridej(chyby, "jmeno", VALIDACNI_ZPRAVY.jmenoKratke);
    return null;
  }
  if (ciste.length > VALIDACE.jmenoMaxDelka) {
    pridej(chyby, "jmeno", VALIDACNI_ZPRAVY.jmenoDlouhe);
    return null;
  }
  return ciste;
}

function overPrijmeni(chyby: ChybyPoli, hodnota: unknown): string | undefined {
  if (hodnota === undefined || hodnota === null) return undefined;
  if (typeof hodnota !== "string") {
    pridej(chyby, "prijmeni", VALIDACNI_ZPRAVY.prijmeniDlouhe);
    return undefined;
  }
  const ciste = hodnota.trim();
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

function overEmail(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) {
    pridej(chyby, "email", VALIDACNI_ZPRAVY.emailPovinny);
    return null;
  }
  const cisty = hodnota.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cisty)) {
    pridej(chyby, "email", VALIDACNI_ZPRAVY.emailNeplatny);
    return null;
  }
  return cisty;
}

function overHeslo(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string" || hodnota.length === 0) {
    pridej(chyby, "heslo", VALIDACNI_ZPRAVY.hesloPovinne);
    return null;
  }
  if (hodnota.length < VALIDACE.hesloMinDelka) {
    pridej(chyby, "heslo", VALIDACNI_ZPRAVY.hesloKratke);
    return null;
  }
  if (hodnota.length > VALIDACE.hesloMaxDelka) {
    pridej(chyby, "heslo", VALIDACNI_ZPRAVY.hesloDlouhe);
    return null;
  }
  return hodnota;
}

function overTelefon(chyby: ChybyPoli, hodnota: unknown): string | null {
  const cisty = normalizujNepovinny(hodnota);
  if (cisty === null) return null;
  if (cisty.length > VALIDACE.telefonMaxDelka) {
    pridej(chyby, "telefon", VALIDACNI_ZPRAVY.telefonDlouhy);
    return null;
  }
  if (cisty.length < 6 || !/^[+0-9][+0-9 /().-]*$/.test(cisty)) {
    pridej(chyby, "telefon", VALIDACNI_ZPRAVY.telefonNeplatny);
    return null;
  }
  return cisty;
}

function overDiscordNick(chyby: ChybyPoli, hodnota: unknown): string | null {
  const cisty = normalizujNepovinny(hodnota);
  if (cisty === null) return null;
  if (cisty.length > VALIDACE.discordNickMaxDelka) {
    pridej(chyby, "discordNick", VALIDACNI_ZPRAVY.discordNickDlouhy);
    return null;
  }
  return cisty;
}

function overTvarKodu(chyby: ChybyPoli, hodnota: unknown): string | null {
  if (typeof hodnota !== "string") {
    pridej(chyby, "kod", VALIDACNI_ZPRAVY.kodPovinny);
    return null;
  }
  const cisty = normalizujKod(hodnota);
  if (cisty.length === 0) {
    pridej(chyby, "kod", VALIDACNI_ZPRAVY.kodPovinny);
    return null;
  }
  if (cisty.length !== VALIDACE.kodDelka || !KOD_REGEX.test(cisty)) {
    pridej(chyby, "kod", VALIDACNI_ZPRAVY.kodNeplatnyTvar);
    return null;
  }
  return cisty;
}

export interface CistaRegistrace {
  jmeno: string;
  prijmeni?: string;
  email: string;
  heslo: string;
  telefon: string | null;
  discordNick: string | null;
  kod: string;
}

export interface VysledekValidace<T> {
  uspech: boolean;
  data: T | null;
  chybyPoli: ChybyPoli;
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
  if (
    jmeno === null ||
    email === null ||
    heslo === null ||
    kod === null ||
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
  };
  if (prijmeni !== undefined) data.prijmeni = prijmeni;
  return { uspech: true, data, chybyPoli: {} };
}

export interface CistePrihlaseni {
  email: string;
  heslo: string;
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
  if (email === null || heslo === null || Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { email, heslo }, chybyPoli: {} };
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

function overJmenoPatch(
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

function overPrijmeniPatch(
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

function overEmailPatch(
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

function overTelefonPatch(
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
  if (cisty.length > VALIDACE.telefonMaxDelka) {
    pridej(chyby, "telefon", VALIDACNI_ZPRAVY.telefonDlouhy);
    return { poslan: true, hodnota: null };
  }
  if (cisty.length < 6 || !/^[+0-9][+0-9 /().-]*$/.test(cisty)) {
    pridej(chyby, "telefon", VALIDACNI_ZPRAVY.telefonNeplatny);
    return { poslan: true, hodnota: null };
  }
  return { poslan: true, hodnota: cisty };
}

function overDiscordNickPatch(
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
/* Krok 3b — Expedice CRUD + uzavření (validace na hranici).            */
/* Pravidla kopírují kontrakt (VALIDACE + VALIDACNI_ZPRAVY):            */
/* nazev 3–120, datum YYYY-MM-DD (minulost → 422, historie vzniká jen   */
/* uzavřením), sraz 3–120, popis max 2000 ("" = nevyplněn), kapacita    */
/* 1–100. PATCH je parciální — `stav` tudy nikdy nejde (jen /uzavrit).  */
/* ------------------------------------------------------------------ */

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;
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
function jeRealneDatum(rok: number, mesic: number, den: number): boolean {
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

function overDatumExpedice(chyby: ChybyPoli, hodnota: unknown): string | null {
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
  if (ciste < dnesYmd()) {
    pridej(
      chyby,
      "datum",
      "Datum nesmí být v minulosti — historie vzniká jen uzavřením.",
    );
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

function overKapacituExpedice(
  chyby: ChybyPoli,
  hodnota: unknown,
): number | null {
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
  sraz: string;
  popis: string;
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
  const sraz = overSrazExpedice(chyby, ctiString(telo, "sraz"));
  const popis = overPopisExpedice(chyby, ctiString(telo, "popis"));
  const kapacitaCelkem = overKapacituExpedice(
    chyby,
    ctiString(telo, "kapacitaCelkem"),
  );
  if (
    nazev === null ||
    datum === null ||
    sraz === null ||
    popis === null ||
    kapacitaCelkem === null ||
    Object.keys(chyby).length > 0
  ) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return {
    uspech: true,
    data: { nazev, datum, sraz, popis, kapacitaCelkem },
    chybyPoli: {},
  };
}

export interface CistaUpravaExpedice {
  nazev?: string;
  datum?: string;
  sraz?: string;
  popis?: string;
  kapacitaCelkem?: number;
}

/**
 * Validace PATCH /api/expeditions/:id — parciální, jen poslaná pole.
 * `stav` tudy nikdy nejde (proběhlá vzniká jen PATCH /uzavrit).
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
    const datum = overDatumExpedice(chyby, ctiString(telo, "datum"));
    if (datum !== null) data.datum = datum;
  }
  if (Object.hasOwn(telo, "sraz")) {
    const sraz = overSrazExpedice(chyby, ctiString(telo, "sraz"));
    if (sraz !== null) data.sraz = sraz;
  }
  if (Object.hasOwn(telo, "popis")) {
    const popis = overPopisExpedice(chyby, ctiString(telo, "popis"));
    if (popis !== null) data.popis = popis;
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
