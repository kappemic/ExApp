import { useCallback, useEffect, useRef, useState } from "react";

const ZAKLAD_PX_ZA_SEKUNDU = 22;
const MIN_RYCHLOST = 0.5;
const MAX_RYCHLOST = 2;
const KROK = 0.25;

export interface Posouvani {
  bezi: boolean;
  rychlost: number;
  prepni: () => void;
  zastav: () => void;
  zmenRychlost: (smer: -1 | 1) => void;
}

/**
 * Plynulé posouvání stránky při hraní. Dotyk, kolečko nebo klávesa posun pozastaví,
 * konec stránky ho ukončí.
 */
export function usePosouvani(): Posouvani {
  const [bezi, setBezi] = useState(false);
  const [rychlost, setRychlost] = useState(1);
  const rychlostRef = useRef(rychlost);
  rychlostRef.current = rychlost;

  useEffect(() => {
    if (!bezi) return;
    let snimek = 0;
    let minule: number | null = null;
    let zbytek = 0;
    const krok = (ted: number): void => {
      if (minule !== null) {
        zbytek += ((ted - minule) / 1000) * ZAKLAD_PX_ZA_SEKUNDU * rychlostRef.current;
        const cele = Math.floor(zbytek);
        if (cele > 0) {
          const pred = window.scrollY;
          window.scrollBy(0, cele);
          zbytek -= cele;
          if (window.scrollY === pred) {
            setBezi(false);
            return;
          }
        }
      }
      minule = ted;
      snimek = window.requestAnimationFrame(krok);
    };
    snimek = window.requestAnimationFrame(krok);
    const pozastav = (udalost: Event): void => {
      const cil = udalost.target;
      if (cil instanceof Element && cil.closest("[data-posouvani]") !== null) return;
      setBezi(false);
    };
    window.addEventListener("wheel", pozastav, { passive: true });
    window.addEventListener("touchstart", pozastav, { passive: true });
    window.addEventListener("keydown", pozastav);
    return () => {
      window.cancelAnimationFrame(snimek);
      window.removeEventListener("wheel", pozastav);
      window.removeEventListener("touchstart", pozastav);
      window.removeEventListener("keydown", pozastav);
    };
  }, [bezi]);

  const prepni = useCallback(() => setBezi((pred) => !pred), []);
  const zastav = useCallback(() => {
    setBezi(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const zmenRychlost = useCallback((smer: -1 | 1) => {
    setRychlost((pred) => Math.min(MAX_RYCHLOST, Math.max(MIN_RYCHLOST, Math.round((pred + smer * KROK) * 100) / 100)));
  }, []);

  return { bezi, rychlost, prepni, zastav, zmenRychlost };
}

/** „1,0×“, „1,25×“ */
export function popisRychlosti(rychlost: number): string {
  return `${rychlost.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;
}
