/**
 * Naposledy ověřený účet v telefonu, aby aplikace šla otevřít bez sítě.
 *
 * - Ukládá se jen výčet polí potřebných k zobrazení. Žádný token, heslo ani
 *   telefonní číslo: session drží httpOnly cookie, na kterou skript nevidí.
 * - Role z kopie jen kreslí UI. O právech rozhoduje guard na serveru.
 * - Kopie má majitele. Přihlášení jiného účtu smaže data po předchozím.
 */
import type { ApiUser } from "../shared/api-types";
import { HISTORIE_PREFIX, zneplatniHistorii } from "./pwa-historie";
import { KLIC_KNIHY } from "./zpevnik-offline";

export const KLIC_UCTU = "exapp:ucet-v1";
export const KLIC_MAJITELE = "exapp:majitel-dat-v1";
/** Přihlášení bez „Zůstat přihlášený“: kopie účtu zmizí se zavřením aplikace. */
export const KLIC_JEN_RELACE = "exapp:ucet-jen-relace";
/** Odhlášení bez sítě: cookie zůstala, server se o něm dozví po připojení. */
export const KLIC_CEKA_ODHLASENI = "exapp:ceka-odhlaseni";

/** Bez ověření na serveru platí kopie účtu nejvýš 30 dní. */
export const PLATNOST_UCTU_MS = 30 * 24 * 60 * 60 * 1000;

/** Soukromá data v localStorage. Kniha písní se maže zvlášť, viz `smazSoukromaData`. */
const SOUKROME_PREDPONY: readonly string[] = [
  HISTORIE_PREFIX,
  "exapp:konverzace-v",
  "exapp:discussion-unread-v",
  "exapp:discussion-lastRead-v",
  "exapp-demo-kody",
];

export interface Uloziste {
  getItem(klic: string): string | null;
  setItem(klic: string, hodnota: string): void;
  removeItem(klic: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface DvojiUloziste {
  trvale: Uloziste | null;
  relace: Uloziste | null;
}

function bezpecne(vezmi: () => Uloziste): Uloziste | null {
  try {
    return vezmi();
  } catch {
    // Soukromý režim nebo prostředí bez úložiště.
    return null;
  }
}

export function ulozisteProhlizece(): DvojiUloziste {
  return {
    trvale: bezpecne(() => localStorage),
    relace: bezpecne(() => sessionStorage),
  };
}

function cti(u: Uloziste | null, klic: string): string | null {
  try {
    return u?.getItem(klic) ?? null;
  } catch {
    return null;
  }
}

function pis(u: Uloziste | null, klic: string, hodnota: string): void {
  try {
    u?.setItem(klic, hodnota);
  } catch {
    // Plné nebo zakázané úložiště: aplikace jen nepůjde otevřít bez sítě.
  }
}

function smaz(u: Uloziste | null, klic: string): void {
  try {
    u?.removeItem(klic);
  } catch {
    // Není co mazat.
  }
}

/** Validace veřejného profilu na hranici (odpověď serveru i uložená kopie). */
export function jeApiUser(hodnota: unknown): hodnota is ApiUser {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const kandidat = hodnota as Record<string, unknown>;
  return (
    typeof kandidat["id"] === "string" &&
    typeof kandidat["email"] === "string" &&
    typeof kandidat["jmeno"] === "string" &&
    typeof kandidat["role"] === "string" &&
    (kandidat["authRole"] === "USER" ||
      kandidat["authRole"] === "ADMIN" ||
      kandidat["authRole"] === "SUPERADMIN") &&
    (kandidat["isSuperadmin"] === undefined ||
      typeof kandidat["isSuperadmin"] === "boolean")
  );
}

/** Jen pole, která UI potřebuje. Co tu není, do telefonu se nezapíše. */
function kopieUctu(user: ApiUser): ApiUser {
  return {
    id: user.id,
    email: user.email,
    jmeno: user.jmeno,
    prijmeni: user.prijmeni,
    role: user.role,
    authRole: user.authRole,
    clenstvi: user.clenstvi,
    funkce: user.funkce,
    isAdmin: user.isAdmin,
    isSuperadmin: user.isSuperadmin,
    avatarUrl: user.avatarUrl,
    stravaId: null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function nastavTrvalost(zustat: boolean, u: DvojiUloziste = ulozisteProhlizece()): void {
  if (zustat) smaz(u.trvale, KLIC_JEN_RELACE);
  else pis(u.trvale, KLIC_JEN_RELACE, "1");
}

export function ulozUcet(
  user: ApiUser,
  ted: number = Date.now(),
  u: DvojiUloziste = ulozisteProhlizece(),
): void {
  const jenRelace = cti(u.trvale, KLIC_JEN_RELACE) !== null;
  const zapis = JSON.stringify({ user: kopieUctu(user), overeno: ted });
  pis(jenRelace ? u.relace : u.trvale, KLIC_UCTU, zapis);
  smaz(jenRelace ? u.trvale : u.relace, KLIC_UCTU);
}

/** Naposledy ověřený účet, nebo null (chybí, je poškozený, starý, po odhlášení). */
export function nactiUcet(
  ted: number = Date.now(),
  u: DvojiUloziste = ulozisteProhlizece(),
): ApiUser | null {
  if (cekaOdhlaseni(u)) return null;
  const surovy = cti(u.relace, KLIC_UCTU) ?? cti(u.trvale, KLIC_UCTU);
  if (surovy === null) return null;
  try {
    const zaznam: unknown = JSON.parse(surovy);
    if (typeof zaznam === "object" && zaznam !== null) {
      const { user, overeno } = zaznam as { user?: unknown; overeno?: unknown };
      if (
        jeApiUser(user) &&
        typeof overeno === "number" &&
        ted - overeno <= PLATNOST_UCTU_MS
      ) {
        return user;
      }
    }
  } catch {
    // Poškozený záznam padne níž.
  }
  smazUcet(u);
  return null;
}

export function smazUcet(u: DvojiUloziste = ulozisteProhlizece()): void {
  smaz(u.trvale, KLIC_UCTU);
  smaz(u.relace, KLIC_UCTU);
}

function klice(u: Uloziste): string[] {
  const vystup: string[] = [];
  try {
    for (let i = 0; i < u.length; i += 1) {
      const klic = u.key(i);
      if (klic !== null) vystup.push(klic);
    }
  } catch {
    // Nedostupné úložiště nic nenese.
  }
  return vystup;
}

/**
 * Smaže data po přihlášeném. Odhlášení a změna účtu berou i stažený zpěvník.
 * Vypršení session ho nechává: je pro celý klub a bez sítě by nešel stáhnout.
 */
export function smazSoukromaData(
  volby: { iZpevnik: boolean },
  u: DvojiUloziste = ulozisteProhlizece(),
): void {
  zneplatniHistorii();
  if (u.trvale !== null) {
    for (const klic of klice(u.trvale)) {
      if (SOUKROME_PREDPONY.some((predpona) => klic.startsWith(predpona))) smaz(u.trvale, klic);
    }
    if (volby.iZpevnik) {
      smaz(u.trvale, KLIC_KNIHY);
      smaz(u.trvale, KLIC_MAJITELE);
    }
  }
}

/**
 * Před zobrazením ověřeného účtu: data jiného majitele pryč. Data bez majitele
 * (z verze před touhle kontrolou) můžou patřit komukoli, takže taky.
 */
export function prevezmiData(idUctu: string, u: DvojiUloziste = ulozisteProhlizece()): void {
  const majitel = cti(u.trvale, KLIC_MAJITELE);
  if (majitel === idUctu) return;
  // Zpěvník bez majitele zůstává, patří celému klubu.
  smazSoukromaData({ iZpevnik: majitel !== null }, u);
  pis(u.trvale, KLIC_MAJITELE, idUctu);
}

export function cekaOdhlaseni(u: DvojiUloziste = ulozisteProhlizece()): boolean {
  return cti(u.trvale, KLIC_CEKA_ODHLASENI) !== null;
}

export function nastavCekaOdhlaseni(
  ceka: boolean,
  u: DvojiUloziste = ulozisteProhlizece(),
): void {
  if (ceka) pis(u.trvale, KLIC_CEKA_ODHLASENI, "1");
  else smaz(u.trvale, KLIC_CEKA_ODHLASENI);
}
