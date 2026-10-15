import { useCallback, useState } from "react";
import {
  kratkyNazevSouboru,
  type PolozkaStavuFotek,
} from "../lib/fotky-operace-stav";
import {
  idsFotekKeStazeni,
  type RozsahStahovaniFotek,
} from "../lib/fotky-stahovani";
import { stahniFotkyJakoZip } from "../lib/stahni-fotku";

export interface PripravaStahovaniAlba {
  polozky: readonly { url: string; nazevSouboru: string; popisek: string }[];
  nazevZip: string;
}

export interface UseFotkyStahovaniVysledek {
  stahovaciRezim: boolean;
  vybrane: ReadonlySet<string>;
  stahujeSe: boolean;
  stahovatChyba: string | null;
  operacePolozky: readonly PolozkaStavuFotek[];
  zacniStahovani: () => void;
  zrusStahovani: () => void;
  prepniVyber: (fotkaId: string) => void;
  provedStahovani: (rozsah: RozsahStahovaniFotek) => Promise<void>;
  resetStahovani: () => void;
}

/**
 * Shared download-mode state for album photo grids (mirrors delete-mode UX).
 * Bulk actions pack photos into one browser ZIP download.
 */
export function useFotkyStahovani(
  fotky: readonly { id: string }[],
  pripravStahovani: (ids: readonly string[]) => PripravaStahovaniAlba,
): UseFotkyStahovaniVysledek {
  const [stahovaciRezim, setStahovaciRezim] = useState<boolean>(false);
  const [vybrane, setVybrane] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [stahujeSe, setStahujeSe] = useState<boolean>(false);
  const [stahovatChyba, setStahovatChyba] = useState<string | null>(null);
  const [operacePolozky, setOperacePolozky] = useState<readonly PolozkaStavuFotek[]>([]);

  const resetStahovani = useCallback((): void => {
    setStahovaciRezim(false);
    setVybrane(new Set<string>());
    setStahovatChyba(null);
    setOperacePolozky([]);
  }, []);

  const zacniStahovani = useCallback((): void => {
    setStahovatChyba(null);
    setOperacePolozky([]);
    setVybrane(new Set<string>());
    setStahovaciRezim(true);
  }, []);

  const zrusStahovani = useCallback((): void => {
    if (stahujeSe) return;
    resetStahovani();
  }, [resetStahovani, stahujeSe]);

  const prepniVyber = useCallback((fotkaId: string): void => {
    setVybrane((prev) => {
      const dalsi = new Set(prev);
      if (dalsi.has(fotkaId)) dalsi.delete(fotkaId);
      else dalsi.add(fotkaId);
      return dalsi;
    });
  }, []);

  const provedStahovani = useCallback(
    async (rozsah: RozsahStahovaniFotek): Promise<void> => {
      const ids = idsFotekKeStazeni(fotky, vybrane, rozsah);
      if (ids.length === 0) return;

      const { polozky, nazevZip } = pripravStahovani(ids);
      setStahovatChyba(null);
      setStahujeSe(true);
      setOperacePolozky(
        polozky.map((polozka, index) => ({
          id: ids[index] ?? String(index),
          popisek: polozka.popisek,
          stav: "ceka" as const,
        })),
      );

      const vysledek = await stahniFotkyJakoZip(
        polozky,
        nazevZip,
        (index, faze, chyba) => {
          setOperacePolozky((prev) =>
            prev.map((radek, i) => {
              if (i !== index) {
                if (faze === "probiha" && radek.stav === "probiha") {
                  return { ...radek, stav: "ceka" };
                }
                return radek;
              }
              if (faze === "probiha") return { ...radek, stav: "probiha" };
              if (faze === "hotovo") return { ...radek, stav: "hotovo" };
              return { ...radek, stav: "chyba", chyba: chyba ?? "Nepodařilo se stáhnout." };
            }),
          );
        },
      );

      setStahujeSe(false);

      if (!vysledek.ok) {
        setStahovatChyba(
          vysledek.uspech > 0
            ? `Staženo ${vysledek.uspech} z ${polozky.length}. ${vysledek.chyba}`
            : vysledek.chyba,
        );
        return;
      }

      setStahovaciRezim(false);
      setVybrane(new Set<string>());
      window.setTimeout(() => {
        setOperacePolozky([]);
      }, 2400);
    },
    [fotky, pripravStahovani, vybrane],
  );

  return {
    stahovaciRezim,
    vybrane,
    stahujeSe,
    stahovatChyba,
    operacePolozky,
    zacniStahovani,
    zrusStahovani,
    prepniVyber,
    provedStahovani,
    resetStahovani,
  };
}

/** Default row label when only ids are known. */
export function popisekStahovaneFotky(nazevSouboru: string): string {
  return kratkyNazevSouboru(nazevSouboru);
}
