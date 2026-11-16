import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/** ISO country stored with phone numbers when the user does not pick one. */
export const VYCHOZI_KOD_ZEME = "CZ" satisfies CountryCode;

export type KodZeme = CountryCode;

export interface ZemeTelefonu {
  kod: KodZeme;
  /** Calling code with a leading plus, e.g. "+420". */
  predvolba: string;
  /** Czech display name from Intl.DisplayNames. */
  nazev: string;
}

export type VysledekTelefonu =
  | { ok: true; e164: string | null }
  | { ok: false };

export interface ZobrazeniTelefonu {
  text: string;
  /** `tel:` link with E.164 and no spaces. Null when the value cannot be dialed. */
  href: string | null;
}

const nazvyZemi = new Intl.DisplayNames(["cs"], { type: "region" });

function nazevZeme(kod: KodZeme): string {
  const nazev = nazvyZemi.of(kod);
  return nazev && nazev !== kod ? nazev : kod;
}

function seradZeme(a: ZemeTelefonu, b: ZemeTelefonu): number {
  if (a.kod === VYCHOZI_KOD_ZEME && b.kod !== VYCHOZI_KOD_ZEME) return -1;
  if (b.kod === VYCHOZI_KOD_ZEME && a.kod !== VYCHOZI_KOD_ZEME) return 1;
  return a.nazev.localeCompare(b.nazev, "cs");
}

const SEZNAM_ZEMI: readonly ZemeTelefonu[] = getCountries()
  .map((kod): ZemeTelefonu => ({
    kod,
    predvolba: `+${getCountryCallingCode(kod)}`,
    nazev: nazevZeme(kod),
  }))
  .sort(seradZeme);

/** All libphonenumber countries. Czechia first, then Czech name. */
export function seznamZemi(): readonly ZemeTelefonu[] {
  return SEZNAM_ZEMI;
}

function jePrazdny(vstup: string): boolean {
  return vstup.trim().length === 0;
}

/**
 * Store a user-typed number as E.164 without spaces.
 * Empty input is null. A non-empty value that is not a valid number for
 * `kodZeme` (or an explicit international prefix) fails.
 */
export function normalizujTelefon(
  vstup: string,
  kodZeme: KodZeme = VYCHOZI_KOD_ZEME,
): VysledekTelefonu {
  if (jePrazdny(vstup)) return { ok: true, e164: null };
  const cislo = parsePhoneNumberFromString(vstup, kodZeme);
  if (!cislo || !cislo.isValid()) return { ok: false };
  return { ok: true, e164: cislo.number };
}

/** National format for the input while the user types. */
export function formatujNarodniTelefon(vstup: string, kodZeme: KodZeme): string {
  const cislice = vstup.replace(/\D/g, "");
  if (cislice.length === 0) return "";
  return new AsYouType(kodZeme).input(cislice);
}

function parsujUlozene(hodnota: string): ReturnType<typeof parsePhoneNumberFromString> {
  return parsePhoneNumberFromString(hodnota, VYCHOZI_KOD_ZEME);
}

/**
 * International display and tel href for a stored value.
 * Numbers without a prefix are parsed as Czech. Unparseable legacy text is returned as-is.
 */
export function zobrazeniTelefonu(hodnota: string | null | undefined): ZobrazeniTelefonu {
  if (hodnota == null || jePrazdny(hodnota)) return { text: "", href: null };
  const cislo = parsujUlozene(hodnota);
  if (!cislo || !cislo.isValid()) return { text: hodnota, href: null };
  return {
    text: cislo.formatInternational(),
    href: `tel:${cislo.number}`,
  };
}

/** Country to preselect in the form. Unknown or local numbers fall back to Czechia. */
export function kodZemeZTelefonu(hodnota: string | null | undefined): KodZeme {
  if (hodnota == null || jePrazdny(hodnota)) return VYCHOZI_KOD_ZEME;
  const cislo = parsujUlozene(hodnota);
  return cislo?.country ?? VYCHOZI_KOD_ZEME;
}

/**
 * National digits for the phone field. Unparseable legacy text is returned trimmed.
 */
export function narodniCastTelefonu(hodnota: string | null | undefined): string {
  if (hodnota == null || jePrazdny(hodnota)) return "";
  const cislo = parsujUlozene(hodnota);
  if (!cislo || !cislo.isValid()) return hodnota.trim();
  return cislo.formatNational();
}
