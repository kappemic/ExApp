/**
 * Limity seznamů podle „Stavy a limity" v ExApp.pen.
 * Hlavní seznam: 10 řádků, pak stránkování. Mřížka karet: 6, pak „Načíst další".
 */
export const RADKU_NA_STRANKU = 10;
export const KARET_NA_DAVKU = 6;

export interface Stranka<T> {
  polozky: T[];
  /** Číslo stránky od 1, oříznuté do platného rozsahu. */
  cislo: number;
  /** Počet stránek, aspoň 1. */
  pocet: number;
}

/** Vrátí jednu stránku seznamu. Číslo mimo rozsah se ořízne. */
export function stranka<T>(polozky: readonly T[], cislo: number, velikost: number): Stranka<T> {
  const pocet = Math.max(1, Math.ceil(polozky.length / velikost));
  const platne = Math.min(Math.max(1, Math.floor(cislo)), pocet);
  const od = (platne - 1) * velikost;
  return { polozky: polozky.slice(od, od + velikost), cislo: platne, pocet };
}

/**
 * Čísla stránek k zobrazení. Do sedmi stránek všechna, jinak první,
 * poslední a okolí aktuální, mezery jako "…".
 */
export function cislaStranek(aktualni: number, pocet: number): Array<number | "…"> {
  if (pocet <= 7) return Array.from({ length: pocet }, (_, i) => i + 1);
  const okoli = new Set<number>([1, pocet, aktualni - 1, aktualni, aktualni + 1]);
  if (aktualni <= 3) [2, 3, 4].forEach((c) => okoli.add(c));
  if (aktualni >= pocet - 2) [pocet - 3, pocet - 2, pocet - 1].forEach((c) => okoli.add(c));
  const serazena = [...okoli].filter((c) => c >= 1 && c <= pocet).sort((a, b) => a - b);
  const vysledek: Array<number | "…"> = [];
  serazena.forEach((c, i) => {
    const predchozi = serazena[i - 1];
    if (predchozi !== undefined && c - predchozi > 1) vysledek.push("…");
    vysledek.push(c);
  });
  return vysledek;
}
