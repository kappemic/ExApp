/**
 * Klientský filtr výprav podle jména (Krok 14).
 *
 * Čistá business logika bez Reactu — VypravyPage ji jen konzumuje.
 * - case-insensitive + diakritika-insensitive (Šumava = sumava)
 * - prázdný dotaz = celý seznam (žádný nový endpoint, jen filtr existujícího)
 * - nikdy nevyhazuje, strict TS, žádný `any`
 */

const DIAKRITIKA = /[\u0300-\u036f]/g;

/** Normalizace pro vyhledávání: trim → NFD → bez diakritiky → lowercase. */
export function normalizujProVyhledavani(hodnota: string): string {
  return hodnota
    .normalize("NFD")
    .replace(DIAKRITIKA, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtruje seznam podle `nazev` (podřetězec po normalizaci).
 * Prázdný / whitespace dotaz vrací celý seznam beze změny pořadí.
 */
export function filtrujExpedicePodleJmena<T extends { nazev: string }>(
  seznam: readonly T[],
  dotaz: string,
): T[] {
  const hledane: string = normalizujProVyhledavani(dotaz);
  if (hledane.length === 0) return [...seznam];
  return seznam.filter((polozka) =>
    normalizujProVyhledavani(polozka.nazev).includes(hledane),
  );
}
