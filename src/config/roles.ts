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

const PAPIR = "#FBF8F1";
const INKOUST = "#1A2E22";
const SMRK = "#2D6A4F";
const LINKA = "#DCE7DE";
const JANTAR = "#A05E0C";
const MECH = "#5C6B60";

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

/* ------------------------------------------------------------------ */
/* 3D model členství (aditivní nad starým `Role`, nic se nemění).       */
/* - `Clenstvi`: základní příslušnost (`clen` | `aktivni_clen`).        */
/* - `Funkce`: nadstavba (`vedeni` | `rada` | null = bez funkce).       */
/* - `isAdmin`: ortogonální technický příznak (ne hodnost).             */
/* Pravidlo 3D: funkci smí mít jen `aktivni_clen` (`chybaKombinace3D`).  */
/* Na výpravy smí jen `aktivni_clen` (`smiNaVypravy`, isAdmin se nečte). */
/* ------------------------------------------------------------------ */

/** Základní příslušnost člena (3D model). */
export type Clenstvi = "clen" | "aktivni_clen";

/** Nadstavbová funkce člena; `null` = bez funkce. */
export type Funkce = "vedeni" | "rada" | null;

/** 3D profil člena: členství + funkce + ortogonální admin příznak. */
export interface ClenskyProfil {
  clenstvi: Clenstvi;
  funkce: Funkce;
  isAdmin: boolean;
}

/**
 * Mapování staré role (včetně `USER`/`ADMIN`) na 3D profil.
 * Neznámý string → `(clen, null, false)` (bezpečný default).
 */
export function mapujRoliNaProfil(staraRole: string): ClenskyProfil {
  switch (staraRole) {
    case "clen":
      return { clenstvi: "clen", funkce: null, isAdmin: false };
    case "aktivni-clen":
      return { clenstvi: "aktivni_clen", funkce: null, isAdmin: false };
    case "clen-rady":
      return { clenstvi: "aktivni_clen", funkce: "rada", isAdmin: false };
    case "vedeni":
      return { clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: false };
    case "admin":
      return { clenstvi: "aktivni_clen", funkce: null, isAdmin: true };
    case "USER":
      return { clenstvi: "clen", funkce: null, isAdmin: false };
    case "ADMIN":
      return { clenstvi: "aktivni_clen", funkce: null, isAdmin: true };
    default:
      return { clenstvi: "clen", funkce: null, isAdmin: false };
  }
}

/**
 * Vrátí českou chybovou hlášku, nebo `null` když je 3D kombinace validní.
 * Chyba jen pro `clen` + funkce; `isAdmin` se ignoruje (ortogonální).
 */
export function chybaKombinace3D(profil: ClenskyProfil): string | null {
  if (profil.clenstvi === "clen" && profil.funkce !== null) {
    return "Funkci (vedení/rada) může mít jen aktivní člen.";
  }
  return null;
}

/**
 * Na výpravy smí jen `aktivni_clen`. `isAdmin` se záměrně nečte —
 * samotný admin příznak bez aktivního členství nestačí.
 */
export function smiNaVypravy(profil: ClenskyProfil): boolean {
  return profil.clenstvi === "aktivni_clen";
}
