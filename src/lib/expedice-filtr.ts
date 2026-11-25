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

export type VypravaKRozdeleni = {
  datum: string;
  datumDo?: string | null;
  stav: string;
};

export type RozdeleneVypravy<T> = {
  probihajici: T[];
  nadchazejici: T[];
  cekaNaUzavreni: T[];
  probehle: T[];
};

function konecYmd(polozka: VypravaKRozdeleni): string {
  const od = polozka.datum.slice(0, 10);
  const konec = polozka.datumDo;
  if (konec === undefined || konec === null || konec.length === 0) return od;
  return konec.slice(0, 10);
}

/** Probíhající = dnešek v rozsahu a není uzavřená. Po konci a před uzavřením = čeká. */
export function rozdelVypravy<T extends VypravaKRozdeleni>(
  seznam: readonly T[],
  dnes: string,
): RozdeleneVypravy<T> {
  const dnesYmd = dnes.slice(0, 10);
  const vysledek: RozdeleneVypravy<T> = {
    probihajici: [],
    nadchazejici: [],
    cekaNaUzavreni: [],
    probehle: [],
  };
  for (const polozka of seznam) {
    if (polozka.stav === "proběhlá") {
      vysledek.probehle.push(polozka);
      continue;
    }
    const od = polozka.datum.slice(0, 10);
    const konec = konecYmd(polozka);
    if (od <= dnesYmd && dnesYmd <= konec) vysledek.probihajici.push(polozka);
    else if (konec < dnesYmd) vysledek.cekaNaUzavreni.push(polozka);
    else vysledek.nadchazejici.push(polozka);
  }
  return vysledek;
}
