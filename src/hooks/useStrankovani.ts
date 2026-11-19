import { useEffect, useState } from "react";
import { stranka } from "../lib/strankovani";

/**
 * Stránkovaný výřez seznamu. Při změně `klicReset` (filtr, hledání)
 * skočí zpět na první stránku.
 */
export function useStrankovani<T>(
  polozky: readonly T[],
  velikost: number,
  klicReset: string = "",
): { viditelne: T[]; cislo: number; pocet: number; nastav: (cislo: number) => void } {
  const [cislo, setCislo] = useState(1);
  useEffect(() => {
    setCislo(1);
  }, [klicReset]);
  const s = stranka(polozky, cislo, velikost);
  return { viditelne: s.polozky, cislo: s.cislo, pocet: s.pocet, nastav: setCislo };
}

/**
 * Mřížka po dávkách: prvních `davka` položek, další přidá `nactiDalsi`.
 * Při změně `klicReset` začne znovu od první dávky.
 */
export function useNacistDalsi<T>(
  polozky: readonly T[],
  davka: number,
  klicReset: string = "",
): { viditelne: T[]; zbyva: number; nactiDalsi: () => void } {
  const [limit, setLimit] = useState(davka);
  useEffect(() => {
    setLimit(davka);
  }, [klicReset, davka]);
  return {
    viditelne: polozky.slice(0, limit),
    zbyva: Math.max(0, polozky.length - limit),
    nactiDalsi: () => setLimit((pred) => pred + davka),
  };
}
