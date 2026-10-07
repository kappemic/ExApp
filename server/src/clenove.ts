/**
 * server/src/clenove.ts — read + PATCH model členů nad autoritativním Neonem.
 *
 * DB `clenove` je minimalistická (id TEXT c01–c14, jmeno TEXT s PLNÝM
 * jménem, role TEXT[], created_at). Nemá prijmeni / email / telefon /
 * discordNick ani updated_at. Proto:
 * - GET /api/clenove vrací `ClenPrehled` (plné jmeno + role[]),
 * - PATCH persistuje jen `jmeno` (složené z jmeno + prijmeni) a `role[]`,
 *   kontakty (email / telefon / discordNick) se validují na hranici
 *   (validujUpravuClena), ale nemají kam se uložit — vědomě se zahazují
 *   (precedent: `poznamka` u POST /api/admin/codes),
 * - `updatedAt` v odpovědích mapuje z `created_at`.
 */

import {
  ROLE_LIST,
  isKnownRole,
  type Role,
} from "../../src/config/roles";
import type {
  AdminClen,
  ClenPrehled,
  UserId,
} from "../../src/shared/api-types";
import type { ClenRow } from "../../drizzle/schema/clenove";

/** Kanonické pořadí rolí dle ROLE_LIST (stabilní výstup pro UI). */
export function seradRole(role: Role[]): Role[] {
  const poradi = new Map<Role, number>(
    ROLE_LIST.map((info, index) => [info.id, index]),
  );
  return [...role].sort(
    (a, b) => (poradi.get(a) ?? 99) - (poradi.get(b) ?? 99),
  );
}

/** „Anna Nováková" → { jmeno: „Anna", prijmeni: „Nováková" }. */
export function rozdelPlneJmeno(plne: string): {
  jmeno: string;
  prijmeni: string;
} {
  const ciste = plne.trim().replace(/\s+/g, " ");
  const mezera = ciste.indexOf(" ");
  if (mezera === -1) return { jmeno: ciste, prijmeni: "" };
  return {
    jmeno: ciste.slice(0, mezera),
    prijmeni: ciste.slice(mezera + 1),
  };
}

/** { jmeno: „Anna", prijmeni: „Nováková" } → „Anna Nováková". */
export function slozPlneJmeno(jmeno: string, prijmeni: string): string {
  const casti = `${jmeno.trim()} ${prijmeni.trim()}`.trim().replace(/\s+/g, " ");
  return casti;
}

/** Neznámé (budoucí) role z DB zahodí — API vrací jen `Role`. */
function cistiRole(hodnoty: string[]): Role[] {
  const ciste: Role[] = [];
  for (const hodnota of hodnoty) {
    if (isKnownRole(hodnota) && !ciste.includes(hodnota)) ciste.push(hodnota);
  }
  return seradRole(ciste);
}

/** DB řádek → `ClenPrehled` pro GET /api/clenove. */
export function toClenPrehled(radek: ClenRow): ClenPrehled {
  return {
    id: radek.id,
    jmeno: radek.jmeno,
    role: cistiRole(radek.role),
    updatedAt: radek.createdAt.toISOString(),
  };
}

export interface KontaktyClena {
  email?: string;
  telefon?: string | null;
  discordNick?: string | null;
}

/**
 * Aktualizovaný DB řádek → plný `AdminClen` pro PATCH odpověď.
 * Jméno se splituje z plného tvaru, kontakty pocházejí z požadavku
 * (jinak "" / null — DB je neukládá), `updatedAt` z `created_at`.
 */
export function toAdminClen(radek: ClenRow, kontakty: KontaktyClena): AdminClen {
  const { jmeno, prijmeni } = rozdelPlneJmeno(radek.jmeno);
  return {
    id: radek.id as UserId,
    jmeno,
    prijmeni,
    email: kontakty.email ?? "",
    telefon: kontakty.telefon ?? null,
    discordNick: kontakty.discordNick ?? null,
    role: cistiRole(radek.role),
    updatedAt: radek.createdAt.toISOString(),
  };
}
