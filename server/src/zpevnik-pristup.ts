/**
 * Songbook access decisions. Pure: no Express and no database.
 * Approver is vedení or admin. Superadmin is always an admin.
 * Člen rady is not an approver.
 */
import type { Funkce } from "../../src/config/roles";
import type { DuvodVstupu } from "../../src/shared/zpevnik";

export type UcetZpevniku = {
  id: string;
  isAdmin: boolean;
  isSuperadmin: boolean;
  funkce: Funkce;
};

export function jeSchvalovatel(ucet: UcetZpevniku): boolean {
  return ucet.isAdmin || ucet.isSuperadmin || ucet.funkce === "vedeni";
}

/** Pending rows are visible to the author and to approvers. */
export function vidiNavrh(ucet: UcetZpevniku, navrhovatelId: string | null): boolean {
  if (jeSchvalovatel(ucet)) return true;
  return navrhovatelId !== null && ucet.id === navrhovatelId;
}

export function smiUpravitNavrh(ucet: UcetZpevniku, navrhovatelId: string | null): boolean {
  return vidiNavrh(ucet, navrhovatelId);
}

export function smiSmazatNavrh(ucet: UcetZpevniku, navrhovatelId: string | null): boolean {
  return vidiNavrh(ucet, navrhovatelId);
}

/** Approver may publish their own proposal. */
export function smiSchvalit(ucet: UcetZpevniku): boolean {
  return jeSchvalovatel(ucet);
}

export function smiUpravitVydanou(ucet: UcetZpevniku): boolean {
  return jeSchvalovatel(ucet);
}

export function smiSmazatVydanou(ucet: UcetZpevniku): boolean {
  return jeSchvalovatel(ucet);
}

export function jeKolizeVydane(
  parKlic: string,
  vydane: readonly { id: string; parKlic: string }[],
  kromeId?: string,
): boolean {
  return vydane.some((radek) => radek.parKlic === parKlic && radek.id !== kromeId);
}

/** Czech field errors for a rejected manual body. */
export function hlaskyVstupu(duvod: DuvodVstupu): Record<string, string[]> {
  if (duvod === "chybi_nazev") return { nazev: ["Vyplň název písně."] };
  if (duvod === "chybi_autor") return { autor: ["Vyplň autora."] };
  if (duvod === "chybi_text") return { telo: ["Napiš aspoň jeden řádek textu."] };
  if (duvod === "prilis_dlouhe") return { telo: ["Text je moc dlouhý."] };
  return { telo: ["Některý akord se nepovedlo přečíst."] };
}
