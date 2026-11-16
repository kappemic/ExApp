/**
 * Shared field checks used by every validator.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  normalizujKod,
} from "../../../src/shared/api-types";

import { normalizujTelefon } from "../../../src/shared/telefon";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOD_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export type ChybyPoli = Record<string, string[]>;

export function pridej(chyby: ChybyPoli, pole: string, zprava: string): void {
  const seznam = chyby[pole];
  if (seznam === undefined) chyby[pole] = [zprava];
  else seznam.push(zprava);
}

export function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

export function ctiString(data: Record<string, unknown>, klic: string): unknown {
  return data[klic];
}

/** Prázdný nepovinný řetězec normalizuje na null (kontrakt api-types). */
export function normalizujNepovinny(hodnota: unknown): string | null {
  if (typeof hodnota !== "string") return null;
  const cista = hodnota.trim();
  return cista.length === 0 ? null : cista;
}

export function overJmeno(chyby: ChybyPoli, hodnota: unknown): string | null {
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

export function overPrijmeni(chyby: ChybyPoli, hodnota: unknown): string | undefined {
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

export function overEmail(chyby: ChybyPoli, hodnota: unknown): string | null {
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

export function overHeslo(chyby: ChybyPoli, hodnota: unknown): string | null {
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

export function telefonNaE164(chyby: ChybyPoli, cisty: string): string | null {
  if (cisty.length > VALIDACE.telefonMaxDelka) {
    pridej(chyby, "telefon", VALIDACNI_ZPRAVY.telefonDlouhy);
    return null;
  }
  const vysledek = normalizujTelefon(cisty);
  if (!vysledek.ok || vysledek.e164 === null) {
    pridej(chyby, "telefon", VALIDACNI_ZPRAVY.telefonNeplatny);
    return null;
  }
  return vysledek.e164;
}

export function overTelefon(chyby: ChybyPoli, hodnota: unknown): string | null {
  const cisty = normalizujNepovinny(hodnota);
  if (cisty === null) return null;
  return telefonNaE164(chyby, cisty);
}

export function overDiscordNick(chyby: ChybyPoli, hodnota: unknown): string | null {
  const cisty = normalizujNepovinny(hodnota);
  if (cisty === null) return null;
  if (cisty.length > VALIDACE.discordNickMaxDelka) {
    pridej(chyby, "discordNick", VALIDACNI_ZPRAVY.discordNickDlouhy);
    return null;
  }
  return cisty;
}

export function overTvarKodu(chyby: ChybyPoli, hodnota: unknown): string | null {
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
export function overSkolaTrida(
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

export interface VysledekValidace<T> {
  uspech: boolean;
  data: T | null;
  chybyPoli: ChybyPoli;
}
