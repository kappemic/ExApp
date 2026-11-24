/**
 * Access rules for custom chat groups.
 * A member matches if any of their roles may read or write.
 * Managing groups (create, edit, delete) is leadership only.
 */
import type { ClenskyProfil, Role } from "../config/roles";

export const SKUPINA_ROLE = [
  "clen",
  "aktivni-clen",
  "clen-rady",
  "vedeni",
  "admin",
] as const satisfies readonly Role[];

export type SkupinaRole = (typeof SKUPINA_ROLE)[number];

export interface PravoSkupiny {
  role: SkupinaRole;
  cist: boolean;
  psat: boolean;
}

const NAZVY: Record<SkupinaRole, string> = {
  clen: "Člen",
  "aktivni-clen": "Aktivní člen",
  "clen-rady": "Člen rady",
  vedeni: "Vedení",
  admin: "Admin",
};

export function nazevRoleSkupiny(role: SkupinaRole): string {
  return NAZVY[role];
}

export function jeSkupinaRole(hodnota: string): hodnota is SkupinaRole {
  return (SKUPINA_ROLE as readonly string[]).includes(hodnota);
}

/** Roles the signed-in profile holds. Any match grants the permission. */
export function roleZProfilu(profil: ClenskyProfil): SkupinaRole[] {
  const role: SkupinaRole[] = [];
  if (profil.isAdmin) role.push("admin");
  if (profil.funkce === "vedeni") role.push("vedeni");
  if (profil.funkce === "rada") role.push("clen-rady");
  if (profil.clenstvi === "aktivni_clen") role.push("aktivni-clen");
  else role.push("clen");
  return role;
}

/** Create and delete. Not implied by a write checkbox. */
export function muzeSpravovatSkupiny(profil: ClenskyProfil): boolean {
  return profil.isAdmin || profil.funkce === "vedeni" || profil.funkce === "rada";
}

/** Editing a group's name and role access is admin-only. */
export function muzeMenitPristupSkupiny(profil: ClenskyProfil): boolean {
  return profil.isAdmin;
}

export function muzeCistSkupinu(
  role: readonly SkupinaRole[],
  prava: readonly PravoSkupiny[],
): boolean {
  return prava.some((pravo) => pravo.cist && role.includes(pravo.role));
}

export function muzePsatDoSkupiny(
  role: readonly SkupinaRole[],
  prava: readonly PravoSkupiny[],
): boolean {
  return prava.some((pravo) => pravo.psat && role.includes(pravo.role));
}

/** Write implies read. At least one role must be able to read. */
export function normalizujPravaSkupiny(
  vstup: readonly { role: string; cist: boolean; psat: boolean }[],
): PravoSkupiny[] | null {
  const mapa = new Map<SkupinaRole, PravoSkupiny>();
  for (const polozka of vstup) {
    if (!jeSkupinaRole(polozka.role)) return null;
    const psat: boolean = polozka.psat === true;
    const cist: boolean = polozka.cist === true || psat;
    mapa.set(polozka.role, { role: polozka.role, cist, psat });
  }
  const prava: PravoSkupiny[] = SKUPINA_ROLE.map(
    (role) => mapa.get(role) ?? { role, cist: false, psat: false },
  );
  if (!prava.some((pravo) => pravo.cist)) return null;
  return prava;
}

export function vychoziPravaSkupiny(): PravoSkupiny[] {
  return SKUPINA_ROLE.map((role) => ({ role, cist: true, psat: true }));
}

/** Kdo do skupiny píše a kdo ji jen čte, slovy do přehledu oprávnění. */
export function souhrnPrav(prava: readonly PravoSkupiny[]): { pise: string; cte: string | null } {
  const pisou = prava.filter((pravo) => pravo.psat);
  const ctou = prava.filter((pravo) => pravo.cist && !pravo.psat);
  const jmena = (vybrane: readonly PravoSkupiny[]): string =>
    vybrane.length === SKUPINA_ROLE.length
      ? "všichni"
      : vybrane.map((pravo) => nazevRoleSkupiny(pravo.role)).join(", ");
  return {
    pise: pisou.length === 0 ? "nikdo" : jmena(pisou),
    cte: ctou.length === 0 ? null : jmena(ctou),
  };
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jeIdSkupiny(hodnota: string): boolean {
  return UUID.test(hodnota);
}

export function klicSkupiny(id: string): string {
  return `skupina:${id}`;
}

export function idZeKliceSkupiny(klic: string): string | null {
  if (!klic.startsWith("skupina:")) return null;
  const id: string = klic.slice("skupina:".length);
  return jeIdSkupiny(id) ? id : null;
}

export interface ApiChatSkupina {
  id: string;
  nazev: string;
  muzeCist: boolean;
  muzePsat: boolean;
  prava: PravoSkupiny[];
}

export interface SkupinyListResponse {
  skupiny: ApiChatSkupina[];
  muzeSpravovat: boolean;
}

export function validujNazevSkupiny(surovy: string): string | null {
  const nazev: string = surovy.trim().replace(/\s+/g, " ");
  if (nazev.length < 1 || nazev.length > 80) return null;
  return nazev;
}
