import { useCallback, useRef, useState } from "react";
import {
  kratkyNazevSouboru,
  type PolozkaStavuFotek,
} from "../lib/fotky-operace-stav";
import {
  idsFotekKeStazeni,
  prepniIdVeVyberu,
  prepniVyberVsech,
  type RozsahStahovaniFotek,
} from "../lib/fotky-stahovani";
import {
  jeDotykoveZarizeni,
  lzeSdiletSoubory,
  maStahnoutDoGalerie,
  sdilejSoubory,
  stahniFotkyDoGalerie,
  stahniFotkyDoSlozky,
  stahniFotkyJakoZip,
  stahniFotkuZeUrl,
  vyberSlozkuKUlozeni,
} from "../lib/stahni-fotku";

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
  /** Files are fetched; the next tap opens the gallery share sheet. */
  galeriePripravena: boolean;
  ulozDoGalerie: () => Promise<void>;
  zacniStahovani: () => void;
  zrusStahovani: () => void;
  prepniVyber: (fotkaId: string) => void;
  /** Marks every photo, or clears the marks when all are marked already. */
  prepniVyberVse: () => void;
  provedStahovani: (rozsah: RozsahStahovaniFotek) => Promise<void>;
  resetStahovani: () => void;
}

/**
 * Shared download-mode state for album photo grids (mirrors delete-mode UX).
 * On a phone, several photos open the system sheet and can land in the gallery.
 * Elsewhere they pack into one browser ZIP, or a folder the user picks.
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
  const [galeriePripravena, setGaleriePripravena] = useState<boolean>(false);
  const souboryGalerie = useRef<File[]>([]);

  const resetStahovani = useCallback((): void => {
    setStahovaciRezim(false);
    setVybrane(new Set<string>());
    setStahovatChyba(null);
    setOperacePolozky([]);
    setGaleriePripravena(false);
    souboryGalerie.current = [];
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

  /** Prepared files belong to the old selection. */
  const zahodPripravene = useCallback((): void => {
    setGaleriePripravena(false);
    setStahovatChyba(null);
    souboryGalerie.current = [];
  }, []);

  const prepniVyber = useCallback(
    (fotkaId: string): void => {
      if (stahujeSe) return;
      zahodPripravene();
      setVybrane((prev) => prepniIdVeVyberu(prev, fotkaId));
    },
    [stahujeSe, zahodPripravene],
  );

  const prepniVyberVse = useCallback((): void => {
    if (stahujeSe) return;
    zahodPripravene();
    setVybrane((prev) => prepniVyberVsech(fotky, prev));
  }, [fotky, stahujeSe, zahodPripravene]);

  const dokonciUspesne = useCallback((): void => {
    setGaleriePripravena(false);
    souboryGalerie.current = [];
    setStahujeSe(false);
    setStahovaciRezim(false);
    setVybrane(new Set<string>());
    window.setTimeout(() => {
      setOperacePolozky([]);
    }, 2400);
  }, []);

  const ulozDoGalerie = useCallback(async (): Promise<void> => {
    const soubory = souboryGalerie.current;
    if (soubory.length === 0) return;
    setStahujeSe(true);
    setStahovatChyba(null);
    const vysledek = await sdilejSoubory(navigator, soubory);
    if (vysledek === "ok") {
      dokonciUspesne();
      return;
    }
    setStahujeSe(false);
    if (vysledek === "zruseno") return;
    setStahovatChyba("Fotky se nepodařilo uložit do galerie. Zkus jich vybrat méně.");
  }, [dokonciUspesne]);

  const provedStahovani = useCallback(
    async (rozsah: RozsahStahovaniFotek): Promise<void> => {
      const ids = idsFotekKeStazeni(fotky, vybrane, rozsah);
      if (ids.length === 0) return;

      const { polozky, nazevZip } = pripravStahovani(ids);
      const doGalerie = maStahnoutDoGalerie(
        jeDotykoveZarizeni(),
        lzeSdiletSoubory(navigator),
        polozky.length,
      );
      const jedina = polozky.length === 1 ? polozky[0] : undefined;
      if (!doGalerie && jedina !== undefined) {
        // One photo is saved as a file. Without `canShare` a computer does not open its share sheet.
        setStahovatChyba(null);
        setStahujeSe(true);
        const vysledek = await stahniFotkuZeUrl(jedina.url, jedina.nazevSouboru, {
          onLine: navigator.onLine,
        } as Navigator);
        setStahujeSe(false);
        if (!vysledek.ok) setStahovatChyba(vysledek.chyba);
        else if (vysledek.metoda !== "zruseno") dokonciUspesne();
        return;
      }

      const slozka = doGalerie ? null : await vyberSlozkuKUlozeni();
      if (slozka === "zruseno") return;

      setStahovatChyba(null);
      setGaleriePripravena(false);
      souboryGalerie.current = [];
      setStahujeSe(true);
      setOperacePolozky(
        polozky.map((polozka, index) => ({
          id: ids[index] ?? String(index),
          popisek: polozka.popisek,
          stav: "ceka" as const,
        })),
      );

      const hlasPrubeh = (index: number, faze: "probiha" | "hotovo" | "chyba", chyba?: string): void => {
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
      };

      const ukazChybu = (uspech: number, chyba: string): void => {
        setStahujeSe(false);
        setStahovatChyba(
          uspech > 0 ? `Staženo ${uspech} z ${polozky.length}. ${chyba}` : chyba,
        );
      };

      if (doGalerie) {
        const vysledek = await stahniFotkyDoGalerie(polozky, hlasPrubeh);
        if (vysledek.ok && vysledek.zruseno === true) {
          setStahujeSe(false);
          setOperacePolozky([]);
          return;
        }
        if (!vysledek.ok && vysledek.soubory !== undefined && vysledek.soubory.length > 0) {
          souboryGalerie.current = vysledek.soubory;
          setGaleriePripravena(true);
          setStahovaciRezim(true);
          setOperacePolozky([]);
          setStahujeSe(false);
          setStahovatChyba(null);
          return;
        }
        if (!vysledek.ok) {
          ukazChybu(vysledek.uspech, vysledek.chyba);
          return;
        }
        dokonciUspesne();
        return;
      }

      let vysledek =
        slozka === null
          ? await stahniFotkyJakoZip(polozky, nazevZip, hlasPrubeh)
          : await stahniFotkyDoSlozky(polozky, slozka, hlasPrubeh);

      if (!vysledek.ok && slozka !== null && vysledek.uspech === 0) {
        vysledek = await stahniFotkyJakoZip(polozky, nazevZip, hlasPrubeh);
      }

      if (!vysledek.ok) {
        ukazChybu(vysledek.uspech, vysledek.chyba);
        return;
      }

      dokonciUspesne();
    },
    [dokonciUspesne, fotky, pripravStahovani, vybrane],
  );

  return {
    stahovaciRezim,
    vybrane,
    stahujeSe,
    stahovatChyba,
    operacePolozky,
    galeriePripravena,
    ulozDoGalerie,
    zacniStahovani,
    zrusStahovani,
    prepniVyber,
    prepniVyberVse,
    provedStahovani,
    resetStahovani,
  };
}

/** Default row label when only ids are known. */
export function popisekStahovaneFotky(nazevSouboru: string): string {
  return kratkyNazevSouboru(nazevSouboru);
}
