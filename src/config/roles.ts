/**
 * Jediný zdroj pravdy pro uživatelské role (UI vrstva, bez backendu).
 *
 * Model P1-6 (finální): báze právě jedna z `clen` XOR `aktivni-clen`,
 * nadstavba `clen-rady` / `vedeni` pouze s `aktivni-clen`,
 * `admin` mimo exkluzivitu (do báze ani nadstavby se nepočítá).
 * Hodnost se pozná jen z `role[]` + `getRoleStyle` (badge), žádné booleany.
 * Taby Všichni / Aktivní / Rada / Vedení / Členové filtrují helpery je*().
 *
 * Vlastní roli přidej jako nadstavbu: `Role` union + `ROLE_LIST` + větev
 * v `getRoleStyle` + helper `role.includes(...)` + rozšíření
 * `chybaKombinaceRole`. Aditivně, nemazat existující id.
 * Validace patří na hranici (formulář / API), vnitřní kód typům věří.
 */

// Seznam rolí P1-6: 5 rolí. Rozšíření aditivně; správa v admin UI je výhled.
export type Role =
  | "admin"
  | "clen"
  | "aktivni-clen"
  | "clen-rady"
  | "vedeni";

export interface RoleInfo {
  id: Role;
  nazev: string;
  popis: string;
}

/**
 * Konfigurovatelné pole rolí — jediný zdroj pravdy pro UI.
 * Rozšíření = přidat položku sem (aditivně, nemazat existující id).
 */
export const ROLE_LIST: readonly RoleInfo[] = [
  { id: "admin", nazev: "Admin", popis: "Správce aplikace (nerozšiřitelné)." },
  { id: "clen", nazev: "Člen", popis: "Základní člen oddílu." },
  {
    id: "aktivni-clen",
    nazev: "Aktivní člen",
    popis: "Pravidelně se účastní výprav a schůzek.",
  },
  {
    id: "clen-rady",
    nazev: "Člen rady",
    popis: "Podílí se na rozhodování oddílu.",
  },
  {
    id: "vedeni",
    nazev: "Vedení",
    popis: "Vedoucí oddílu, nejvyšší hodnost.",
  },
] as const;

export interface RoleStyle {
  background: string;
  color: string;
  border: string;
}

const PAPIR = "#F1EBDD";
const INKOUST = "#211D14";
const SMRK = "#2E4438";
const LINKA = "#D9D1BE";
const JANTAR = "#E4571D";
const MECH = "#7A7668";

/**
 * Vrátí barvy badge pro danou roli z exapp tokenů.
 * Neznámou (budoucí vlastní) roli neshazuje — vrací neutrální styl.
 */
export function getRoleStyle(role: Role): RoleStyle {
  switch (role) {
    case "admin":
      return { background: INKOUST, color: PAPIR, border: INKOUST };
    case "vedeni":
      return { background: SMRK, color: PAPIR, border: SMRK };
    case "clen-rady":
      return { background: JANTAR, color: PAPIR, border: JANTAR };
    case "aktivni-clen":
      return { background: LINKA, color: INKOUST, border: SMRK };
    case "clen":
      return { background: PAPIR, color: MECH, border: LINKA };
    default: {
      const _exhaustive: never = role;
      void _exhaustive;
      return { background: PAPIR, color: MECH, border: LINKA };
    }
  }
}

/** Hlídka hranice: ověří, že externí string je známá role. */
export function isKnownRole(value: string): value is Role {
  return ROLE_LIST.some((r) => r.id === value);
}

/**
 * Pravidlo kombinací rolí (kontrakt, single-source):
 * - Báze: právě jedna z `clen` XOR `aktivni-clen`.
 * - Nadstavba: `clen-rady` / `vedeni` pouze společně s `aktivni-clen`.
 * - `admin` je mimo exkluzivitu: do báze ani nadstavby se nepočítá,
 *   samotný `admin` je validní kombinace.
 *
 * Validace patří na hranici (formulář / API), vnitřní kód typům věří.
 */
export type RoleSet = readonly Role[];

export function jeClen(role: RoleSet): boolean {
  return role.includes("clen");
}

export function jeAktivniClen(role: RoleSet): boolean {
  return role.includes("aktivni-clen");
}

export function jeVRade(role: RoleSet): boolean {
  return role.includes("clen-rady");
}

export function jeVeVedeni(role: RoleSet): boolean {
  return role.includes("vedeni");
}

export function jeAdmin(role: RoleSet): boolean {
  return role.includes("admin");
}

/** Vrátí českou chybovou hlášku, nebo `null` když je kombinace validní. */
export function chybaKombinaceRole(role: RoleSet): string | null {
  const bezAdmina: RoleSet = role.filter((r) => r !== "admin");
  const maClena: boolean = bezAdmina.includes("clen");
  const maAktivniho: boolean = bezAdmina.includes("aktivni-clen");
  const maNadstavbu: boolean =
    bezAdmina.includes("clen-rady") || bezAdmina.includes("vedeni");

  if (bezAdmina.length === 0) {
    if (role.includes("admin")) return null;
    return "Vyber základní roli: člen, nebo aktivní člen.";
  }
  if (maClena && maAktivniho) {
    return "Role člen a aktivní člen se vylučují – vyber právě jednu.";
  }
  if (!maClena && !maAktivniho) {
    return "Chybí základní role: vyber člen, nebo aktivní člen.";
  }
  if (maNadstavbu && !maAktivniho) {
    return "Nadstavbové role (člen rady, vedení) vyžadují roli aktivní člen.";
  }
  return null;
}

/** Aditivní validace kontraktu: `true` právě když `chybaKombinaceRole` vrátí `null`. */
export function jeValidniKombinaceRole(role: RoleSet): boolean {
  return chybaKombinaceRole(role) === null;
}
