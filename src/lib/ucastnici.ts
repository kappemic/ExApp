import type { ApiUcastnik } from "../shared/api-types";

export type KlicSkupinyUcasti = "prihlaseni" | "dorazili" | "bezDochazky" | "omluveni";

export interface SkupinaUcasti {
  klic: KlicSkupinyUcasti;
  nadpis: string;
  /** Tlumené zobrazení (omluvení). */
  tlumene: boolean;
  ucastnici: ApiUcastnik[];
}

/**
 * One list for the trip detail. Before the term, everyone is signed up.
 * After the term, people who attended and people still only signed up
 * stay in that same list. Excused participants stay in their own group.
 * Empty groups are dropped. Order inside a group follows the input.
 */
export function seskupUcastniky(
  seznam: readonly ApiUcastnik[],
  poTerminu: boolean,
): SkupinaUcasti[] {
  if (!poTerminu) {
    return seznam.length === 0
      ? []
      : [{ klic: "prihlaseni", nadpis: "Přihlášení", tlumene: false, ucastnici: [...seznam] }];
  }
  const hlavni: ApiUcastnik[] = [];
  const omluveni: ApiUcastnik[] = [];
  for (const u of seznam) {
    if (u.status === "omluven") omluveni.push(u);
    else hlavni.push(u);
  }
  const skupiny: SkupinaUcasti[] = [];
  if (hlavni.length > 0) {
    skupiny.push({ klic: "prihlaseni", nadpis: "", tlumene: false, ucastnici: hlavni });
  }
  if (omluveni.length > 0) {
    skupiny.push({ klic: "omluveni", nadpis: "Omluveni", tlumene: true, ucastnici: omluveni });
  }
  return skupiny;
}
