import { useCallback, useState } from "react";
import {
  idAktualniFotkyProPotvrzeni,
  idsFotekKeSmazani,
  type PotvrzeniMazaniFotek,
} from "../lib/fotky-mazani";

export type { PotvrzeniMazaniFotek };

export interface UseFotkyMazaniVysledek {
  mazaciRezim: boolean;
  vybrane: ReadonlySet<string>;
  potvrzeni: PotvrzeniMazaniFotek | null;
  mazeSe: boolean;
  mazatChyba: string | null;
  zacniMazani: () => void;
  zrusMazani: () => void;
  prepniVyber: (fotkaId: string) => void;
  otevriPotvrzeni: (druh: PotvrzeniMazaniFotek, aktualniId?: string | null) => void;
  /** Id of the photo when `potvrzeni === "aktualni"` was opened (survives lightbox close). */
  potvrzeniAktualniId: string | null;
  zavriPotvrzeni: () => void;
  provedMazani: (aktualniId?: string | null) => Promise<void>;
  resetMazani: () => void;
}

/**
 * Shared delete-mode state for expedition gallery and album grids.
 * `smazJednu` is called once per id; stops on first failure.
 */
export function useFotkyMazani(
  fotky: readonly { id: string }[],
  smazJednu: (fotkaId: string) => Promise<{ ok: true } | { ok: false; chyba: string }>,
  poUspechu?: (
    smazaneIds: readonly string[],
    potvrzeni: PotvrzeniMazaniFotek | null,
  ) => void | Promise<void>,
): UseFotkyMazaniVysledek {
  const [mazaciRezim, setMazaciRezim] = useState<boolean>(false);
  const [vybrane, setVybrane] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [potvrzeni, setPotvrzeni] = useState<PotvrzeniMazaniFotek | null>(null);
  const [potvrzeniAktualniId, setPotvrzeniAktualniId] = useState<string | null>(null);
  const [mazeSe, setMazeSe] = useState<boolean>(false);
  const [mazatChyba, setMazatChyba] = useState<string | null>(null);

  const resetMazani = useCallback((): void => {
    setMazaciRezim(false);
    setVybrane(new Set<string>());
    setPotvrzeni(null);
    setPotvrzeniAktualniId(null);
    setMazatChyba(null);
  }, []);

  const zacniMazani = useCallback((): void => {
    setMazatChyba(null);
    setVybrane(new Set<string>());
    setPotvrzeni(null);
    setPotvrzeniAktualniId(null);
    setMazaciRezim(true);
  }, []);

  const zrusMazani = useCallback((): void => {
    if (mazeSe) return;
    resetMazani();
  }, [mazeSe, resetMazani]);

  const prepniVyber = useCallback((fotkaId: string): void => {
    setVybrane((prev) => {
      const dalsi = new Set(prev);
      if (dalsi.has(fotkaId)) dalsi.delete(fotkaId);
      else dalsi.add(fotkaId);
      return dalsi;
    });
  }, []);

  const otevriPotvrzeni = useCallback(
    (druh: PotvrzeniMazaniFotek, aktualniId?: string | null): void => {
      setMazatChyba(null);
      setPotvrzeni(druh);
      if (druh === "aktualni") {
        setPotvrzeniAktualniId(idAktualniFotkyProPotvrzeni(aktualniId, null));
      } else {
        setPotvrzeniAktualniId(null);
      }
    },
    [],
  );

  const zavriPotvrzeni = useCallback((): void => {
    if (mazeSe) return;
    setPotvrzeni(null);
    setPotvrzeniAktualniId(null);
  }, [mazeSe]);

  const provedMazani = useCallback(
    async (aktualniId?: string | null): Promise<void> => {
    if (potvrzeni === null) return;
    const efektivniAktualniId =
      potvrzeni === "aktualni"
        ? idAktualniFotkyProPotvrzeni(potvrzeniAktualniId, aktualniId)
        : aktualniId;
    const ids = idsFotekKeSmazani(fotky, vybrane, potvrzeni, efektivniAktualniId);
    if (ids.length === 0) {
      setPotvrzeni(null);
      return;
    }
    setMazatChyba(null);
    setMazeSe(true);
    const smazane = new Set<string>();
    let selhani: string | null = null;
    for (const fotkaId of ids) {
      const vysledek = await smazJednu(fotkaId);
      if (!vysledek.ok) {
        selhani = vysledek.chyba;
        break;
      }
      smazane.add(fotkaId);
    }
    setMazeSe(false);
    if (smazane.size > 0) {
      await poUspechu?.(Array.from(smazane), potvrzeni);
    }
    setVybrane((prev) => {
      const dalsi = new Set(prev);
      for (const id of smazane) dalsi.delete(id);
      return dalsi;
    });
    if (selhani !== null) {
      setMazatChyba(selhani);
      return;
    }
    setPotvrzeni(null);
    setPotvrzeniAktualniId(null);
    if (potvrzeni !== "aktualni") setMazaciRezim(false);
  },
    [fotky, poUspechu, potvrzeni, potvrzeniAktualniId, smazJednu, vybrane],
  );

  return {
    mazaciRezim,
    vybrane,
    potvrzeni,
    potvrzeniAktualniId,
    mazeSe,
    mazatChyba,
    zacniMazani,
    zrusMazani,
    prepniVyber,
    otevriPotvrzeni,
    zavriPotvrzeni,
    provedMazani,
    resetMazani,
  };
}
