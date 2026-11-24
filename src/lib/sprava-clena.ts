/**
 * Formulář Správa člena: předvyplnění, kontrola polí a výběr změn pro
 * PATCH /api/users/:id. Bez Reactu, UI je v `components/Admin/SpravaClena.tsx`.
 */
import {
  chybaKombinace3D,
  type Clenstvi,
  type Funkce,
} from "../config/roles";
import { VALIDACE, VALIDACNI_ZPRAVY, type UserListItem } from "../shared/api-types";
import {
  kodZemeZTelefonu,
  narodniCastTelefonu,
  normalizujTelefon,
  type KodZeme,
} from "../shared/telefon";
import type { UlozitProfilVstup } from "./admin-clenove";
import { profilClena } from "./clen-popisek";

export interface FormularClena {
  clenstvi: Clenstvi;
  funkce: Funkce;
  isAdmin: boolean;
  isSuperadmin: boolean;
  jmeno: string;
  prijmeni: string;
  /** Národní část, předvolbu drží `kodZeme`. */
  telefon: string;
  kodZeme: KodZeme;
  discordNick: string;
  /** YYYY-MM-DD nebo "". */
  narozeniny: string;
  skola: string;
  trida: string;
}

export type PoleUdaju =
  | "jmeno"
  | "prijmeni"
  | "telefon"
  | "discordNick"
  | "narozeniny"
  | "skola"
  | "trida";

export type ChybyFormulare = Partial<Record<PoleUdaju | "hodnost", string>>;

/** Pořadí polí na obrazovce, podle něj se po chybě vybírá první pole. */
export const POLE_UDAJU: readonly PoleUdaju[] = [
  "jmeno",
  "prijmeni",
  "telefon",
  "discordNick",
  "narozeniny",
  "skola",
  "trida",
];

/** Starší server posílá jen složené jméno, příjmení je pak vše za první mezerou. */
function rozdelJmeno(clen: UserListItem): { jmeno: string; prijmeni: string } {
  if (clen.krestniJmeno !== undefined) {
    return { jmeno: clen.krestniJmeno, prijmeni: clen.prijmeni ?? "" };
  }
  const [jmeno = "", ...zbytek] = clen.jmeno.trim().split(/\s+/);
  return { jmeno, prijmeni: zbytek.join(" ") };
}

export function formularZClena(clen: UserListItem): FormularClena {
  const profil = profilClena(clen);
  return {
    clenstvi: profil.clenstvi,
    funkce: profil.funkce,
    isAdmin: profil.isAdmin || clen.isSuperadmin,
    isSuperadmin: clen.isSuperadmin,
    ...rozdelJmeno(clen),
    telefon: narodniCastTelefonu(clen.telefon),
    kodZeme: kodZemeZTelefonu(clen.telefon),
    discordNick: clen.discordNick ?? "",
    narozeniny: clen.narozeniny ?? "",
    skola: clen.skola,
    trida: clen.trida,
  };
}

/** E.164, nebo oříznutý text, když číslo platné není. */
function kanonickyTelefon(text: string, kod: KodZeme): string {
  const vysledek = normalizujTelefon(text, kod);
  return vysledek.ok ? (vysledek.e164 ?? "") : text.trim();
}

/** Jen pole, která se proti uloženému členovi opravdu liší. */
export function zmenyFormulare(clen: UserListItem, form: FormularClena): UlozitProfilVstup {
  const puvodni = formularZClena(clen);
  const zmeny: UlozitProfilVstup = {};
  // Členství a funkce spolu, server je kontroluje jako dvojici.
  if (form.clenstvi !== puvodni.clenstvi || form.funkce !== puvodni.funkce) {
    zmeny.clenstvi = form.clenstvi;
    zmeny.funkce = form.funkce;
  }
  const admin = form.isAdmin || form.isSuperadmin;
  if (admin !== puvodni.isAdmin) zmeny.isAdmin = admin;
  if (form.isSuperadmin !== puvodni.isSuperadmin) zmeny.isSuperadmin = form.isSuperadmin;

  for (const pole of ["jmeno", "prijmeni", "skola", "trida"] as const) {
    const hodnota = form[pole].trim();
    if (hodnota !== puvodni[pole].trim()) zmeny[pole] = hodnota;
  }
  for (const pole of ["discordNick", "narozeniny"] as const) {
    const hodnota = form[pole].trim();
    if (hodnota !== puvodni[pole].trim()) zmeny[pole] = hodnota.length === 0 ? null : hodnota;
  }
  const telefon = kanonickyTelefon(form.telefon, form.kodZeme);
  if (telefon !== kanonickyTelefon(puvodni.telefon, puvodni.kodZeme)) {
    zmeny.telefon = telefon.length === 0 ? null : telefon;
  }
  return zmeny;
}

function dnes(): string {
  const ted = new Date();
  return `${ted.getFullYear()}-${String(ted.getMonth() + 1).padStart(2, "0")}-${String(ted.getDate()).padStart(2, "0")}`;
}

/** Kontroluje jen změněná pole, aby stará uložená hodnota neblokovala změnu role. */
export function zkontrolujFormular(clen: UserListItem, form: FormularClena): ChybyFormulare {
  const zmeny = zmenyFormulare(clen, form);
  const chyby: ChybyFormulare = {};

  const kombinace = chybaKombinace3D({
    clenstvi: form.clenstvi,
    funkce: form.funkce,
    isAdmin: form.isAdmin || form.isSuperadmin,
  });
  if (kombinace !== null) chyby.hodnost = kombinace;

  if (zmeny.jmeno !== undefined) {
    if (zmeny.jmeno.length === 0) chyby.jmeno = VALIDACNI_ZPRAVY.jmenoPovinne;
    else if (zmeny.jmeno.length < VALIDACE.jmenoMinDelka) chyby.jmeno = VALIDACNI_ZPRAVY.jmenoKratke;
    else if (zmeny.jmeno.length > VALIDACE.jmenoMaxDelka) chyby.jmeno = VALIDACNI_ZPRAVY.jmenoDlouhe;
  }
  if (zmeny.prijmeni !== undefined) {
    // Server prázdné příjmení ignoruje, tichý neúspěch by mátl.
    if (zmeny.prijmeni.length === 0) chyby.prijmeni = "Příjmení smazat nejde.";
    else if (zmeny.prijmeni.length < VALIDACE.prijmeniMinDelka) chyby.prijmeni = VALIDACNI_ZPRAVY.prijmeniKratke;
    else if (zmeny.prijmeni.length > VALIDACE.prijmeniMaxDelka) chyby.prijmeni = VALIDACNI_ZPRAVY.prijmeniDlouhe;
  }
  if (typeof zmeny.telefon === "string" && !normalizujTelefon(form.telefon, form.kodZeme).ok) {
    chyby.telefon = VALIDACNI_ZPRAVY.telefonNeplatny;
  }
  if (typeof zmeny.discordNick === "string" && zmeny.discordNick.length > VALIDACE.discordNickMaxDelka) {
    chyby.discordNick = VALIDACNI_ZPRAVY.discordNickDlouhy;
  }
  if (typeof zmeny.narozeniny === "string" && (zmeny.narozeniny < "1900-01-01" || zmeny.narozeniny > dnes())) {
    chyby.narozeniny = VALIDACNI_ZPRAVY.narozeninyMimoRozsah;
  }
  if (zmeny.skola !== undefined && zmeny.skola.length > VALIDACE.skolaMaxDelka) {
    chyby.skola = VALIDACNI_ZPRAVY.skolaDlouha;
  }
  if (zmeny.trida !== undefined && zmeny.trida.length > VALIDACE.tridaMaxDelka) {
    chyby.trida = VALIDACNI_ZPRAVY.tridaDlouha;
  }
  return chyby;
}

/** Chyby polí ze serveru do polí formuláře, neznámá pole se zahodí. */
export function chybyZeServeru(chybyPoli: Record<string, string> | undefined): ChybyFormulare {
  const chyby: ChybyFormulare = {};
  for (const [pole, hlaska] of Object.entries(chybyPoli ?? {})) {
    if (pole === "funkce" || pole === "clenstvi") chyby.hodnost = hlaska;
    else if ((POLE_UDAJU as readonly string[]).includes(pole)) chyby[pole as PoleUdaju] = hlaska;
  }
  return chyby;
}
