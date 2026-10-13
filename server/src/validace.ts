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
  type OpakovaniSchuzky,
} from "../../src/shared/api-types";
import {
  chybaKombinace3D,
  chybaKombinaceRole,
  isKnownRole,
  type ClenskyProfil,
  type Clenstvi,
  type Funkce,
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

/**
 * Nepovinná škola / třída: chybějící → "", prázdná/whitespace → "",
 * jinak trim; delší než limit → chyba pole.
 */
function overSkolaTrida(
  chyby: ChybyPoli,
  pole: "skola" | "trida",
  hodnota: unknown,
  maxDelka: number,
  hlaska: string,
): string | null {
  if (hodnota === undefined || hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, pole, hlaska);
    return null;
  }
  const cista = hodnota.trim();
  if (cista.length === 0) return "";
  if (cista.length > maxDelka) {
    pridej(chyby, pole, hlaska);
    return null;
  }
  return cista;
}

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
/* PATCH /api/users/:id — úprava primární role (jen ADMIN).              */
/* `role` je jedna hodnota z roles.ts (DB users.role CHECK kopíruje     */
/* stejných 5 hodnot). Kombinace se neřeší — jedna hodnota je vždy      */
/* validní, stačí isKnownRole.                                          */
/* ------------------------------------------------------------------ */

export interface CistaUpravaRoleUzivatele {
  role: Role;
}

/**
 * Validace PATCH /api/users/:id — tělo musí nést právě `role`.
 * Neznámá / chybějící role → chyby.role = [česká hláška] (422).
 */
export function validujUpravuRoleUzivatele(
  telo: unknown,
): VysledekValidace<CistaUpravaRoleUzivatele> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const raw: unknown = ctiString(telo, "role");
  if (typeof raw !== "string" || !isKnownRole(raw)) {
    pridej(
      chyby,
      "role",
      "Vyber platnou roli: admin, člen, aktivní člen, člen rady, nebo vedení.",
    );
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { role: raw }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
/* PATCH /api/users/:id — nové parciální 3D trio (aditivní).             */
/* Přijímá `clenstvi?/funkce?/isAdmin?/skola?/trida?` (parciální)        */
/* NEBO samotné staré `{ role }` (přes `validujUpravuRoleUzivatele`).    */
/* Kombinace obojího → uspech:false (route složí 422).                  */
/* Pravidlo 3D: `clen` + funkce → chyba (`chybaKombinace3D`).            */
/* ------------------------------------------------------------------ */

const CLENSTVI_HODNOTY: readonly Clenstvi[] = ["clen", "aktivni_clen"];
const FUNKCE_HODNOTY: readonly Exclude<Funkce, null>[] = ["vedeni", "rada"];

export interface CistaUpravaUzivatele {
  clenstvi?: Clenstvi;
  funkce?: Funkce;
  isAdmin?: boolean;
  skola?: string;
  trida?: string;
  role?: Role;
}

/**
 * Validace PATCH /api/users/:id — nové trio, nebo staré `{ role }`.
 * Staré `{ role }` prochází přes `validujUpravuRoleUzivatele`
 * (kontrakt se neláme); obojí najednou → 422 tvar chyb.
 */
export function validujUpravuUzivatele(
  telo: unknown,
): VysledekValidace<CistaUpravaUzivatele> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const maRoli = Object.hasOwn(telo, "role");
  const maNove =
    Object.hasOwn(telo, "clenstvi") ||
    Object.hasOwn(telo, "funkce") ||
    Object.hasOwn(telo, "isAdmin") ||
    Object.hasOwn(telo, "skola") ||
    Object.hasOwn(telo, "trida");

  if (maRoli && maNove) {
    pridej(
      chyby,
      "role",
      "Zadej buď starou roli, nebo nové pole (členství / funkce / admin / škola / třída) — ne obojí.",
    );
    return { uspech: false, data: null, chybyPoli: chyby };
  }

  if (maRoli && !maNove) {
    const stare = validujUpravuRoleUzivatele(telo);
    if (!stare.uspech || stare.data === null) {
      return { uspech: false, data: null, chybyPoli: stare.chybyPoli };
    }
    return { uspech: true, data: { role: stare.data.role }, chybyPoli: {} };
  }

  const data: CistaUpravaUzivatele = {};

  if (Object.hasOwn(telo, "clenstvi")) {
    const raw: unknown = ctiString(telo, "clenstvi");
    if (
      typeof raw !== "string" ||
      !(CLENSTVI_HODNOTY as readonly string[]).includes(raw)
    ) {
      pridej(chyby, "clenstvi", "Vyber platné členství: člen, nebo aktivní člen.");
    } else {
      data.clenstvi = raw as Clenstvi;
    }
  }

  if (Object.hasOwn(telo, "funkce")) {
    const raw: unknown = ctiString(telo, "funkce");
    if (raw === null) {
      data.funkce = null;
    } else if (
      typeof raw !== "string" ||
      !(FUNKCE_HODNOTY as readonly string[]).includes(raw)
    ) {
      pridej(chyby, "funkce", "Vyber platnou funkci: vedení, rada, nebo bez funkce.");
    } else {
      data.funkce = raw as Exclude<Funkce, null>;
    }
  }

  if (Object.hasOwn(telo, "isAdmin")) {
    const raw: unknown = ctiString(telo, "isAdmin");
    if (typeof raw !== "boolean") {
      pridej(chyby, "isAdmin", "Příznak admin musí být true, nebo false.");
    } else {
      data.isAdmin = raw;
    }
  }

  if (Object.hasOwn(telo, "skola")) {
    const cista = overSkolaTrida(
      chyby,
      "skola",
      ctiString(telo, "skola"),
      VALIDACE.skolaMaxDelka,
      VALIDACNI_ZPRAVY.skolaDlouha,
    );
    if (cista !== null) data.skola = cista;
  }

  if (Object.hasOwn(telo, "trida")) {
    const cista = overSkolaTrida(
      chyby,
      "trida",
      ctiString(telo, "trida"),
      VALIDACE.tridaMaxDelka,
      VALIDACNI_ZPRAVY.tridaDlouha,
    );
    if (cista !== null) data.trida = cista;
  }

  if (Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }

  if (data.clenstvi !== undefined && data.funkce !== undefined) {
    const profil: ClenskyProfil = {
      clenstvi: data.clenstvi,
      funkce: data.funkce,
      isAdmin: data.isAdmin ?? false,
    };
    const chyba3D: string | null = chybaKombinace3D(profil);
    if (chyba3D !== null) {
      pridej(chyby, "funkce", chyba3D);
      return { uspech: false, data: null, chybyPoli: chyby };
    }
  }

  return { uspech: true, data, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
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
    data: { nazev, datum, mistnost: mistnost.hodnota, popis, opakovani },
    chybyPoli: {},
  };
}

export interface CistaUpravaSchuzky {
  nazev?: string;
  datum?: string;
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
/* Fáze 4, Krok 1 — Strava OAuth callback (validace na hranici).        */
/* `code` je jednorázový autorizační kód od Stravy (query). Chybný      */
/* tvar → 422 VALIDATION_ERROR s polem `code` (route nic nemění).       */
/* `state` je opaque passthrough (typicky userId) — jen délka a tvar,   */
/* vazbu na session hlídá route (USER guard; tokeny se ukládají vždy    */
/* právě přihlášenému).                                                */
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
