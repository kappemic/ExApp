/** Per-file state shown in the diary-style operations panel. */
export type StavPolozkyFotek = "ceka" | "probiha" | "hotovo" | "chyba";

export type RezimOperaceFotek = "nahravani" | "stahovani";

export interface PolozkaStavuFotek {
  id: string;
  popisek: string;
  stav: StavPolozkyFotek;
  /** Shown when stav is chyba. */
  chyba?: string;
}

export function kratkyNazevSouboru(nazev: string, maxDelka = 28): string {
  const trimmed = nazev.trim();
  if (trimmed.length <= maxDelka) return trimmed;
  const bodka = trimmed.lastIndexOf(".");
  const pripona = bodka > 0 ? trimmed.slice(bodka) : "";
  const zakladMax = Math.max(4, maxDelka - pripona.length - 1);
  return `${trimmed.slice(0, zakladMax)}…${pripona}`;
}

export function popisekStavuPolozky(stav: StavPolozkyFotek): string {
  switch (stav) {
    case "ceka":
      return "Čeká";
    case "probiha":
      return "…";
    case "hotovo":
      return "Hotovo";
    case "chyba":
      return "Chyba";
  }
}

export function nadpisOperaceFotek(rezim: RezimOperaceFotek, probiha: boolean): string {
  if (rezim === "nahravani") return probiha ? "Nahrávám…" : "Nahrávání";
  return probiha ? "Stahuji…" : "Stahování";
}
