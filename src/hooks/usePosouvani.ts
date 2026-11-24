import { useCallback, useEffect, useRef, useState } from "react";
import { ctiRychlost, dalsiRychlost, zapisRychlost } from "../lib/zpevnik-cteni";
import { useNezhasinat } from "./useNezhasinat";

const ZAKLAD_PX_ZA_SEKUNDU = 22;
/** Jak dlouho po puštění (a po posledním doznívání setrvačnosti) počkat, než se posun rozjede. */
const DOZNIVANI_MS = 250;
/** Delší prodleva mezi snímky znamená stránku na pozadí, nedohání se skokem. */
const MAX_SNIMEK_MS = 100;

export interface Posouvani {
  bezi: boolean;
  /** Sekundy do prvního pohybu, `null` mimo prodlevu na začátku. */
  odpocet: number | null;
  rychlost: number;
  prepni: () => void;
  zastav: () => void;
  zmenRychlost: (smer: -1 | 1) => void;
}

/**
 * Plynulé posouvání stránky při hraní. Dotyk a kolečko posun jen podrží: po puštění
 * prstu a doznění setrvačnosti jede dál. Klávesa a konec stránky ho ukončí.
 * Rychlost se pamatuje u písně, `prodleva` odloží rozjezd ze začátku písně.
 */
export function usePosouvani(idPisne: string | undefined, prodleva: number): Posouvani {
  const [bezi, setBezi] = useState(false);
  const [odpocet, setOdpocet] = useState<number | null>(null);
  const [rychlost, setRychlost] = useState(1);
  const rychlostRef = useRef(rychlost);
  rychlostRef.current = rychlost;
  const prodlevaRef = useRef(prodleva);
  prodlevaRef.current = prodleva;
  useNezhasinat(bezi);

  useEffect(() => {
    setBezi(false);
    setRychlost(idPisne === undefined ? 1 : ctiRychlost(localStorage, idPisne));
  }, [idPisne]);

  useEffect(() => {
    if (!bezi) return;
    let snimek = 0;
    let minule: number | null = null;
    let zbytek = 0;
    let drzi = false;
    let pokracovatOd = 0;
    const naZacatku = window.scrollY < window.innerHeight / 2;
    const startOd = naZacatku ? performance.now() + prodlevaRef.current * 1000 : 0;
    const krok = (ted: number): void => {
      setOdpocet(ted < startOd ? Math.ceil((startOd - ted) / 1000) : null);
      if (drzi || ted < pokracovatOd || ted < startOd) {
        minule = null;
        snimek = window.requestAnimationFrame(krok);
        return;
      }
      if (minule !== null) {
        zbytek += (Math.min(ted - minule, MAX_SNIMEK_MS) / 1000) * ZAKLAD_PX_ZA_SEKUNDU * rychlostRef.current;
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
    const naOvladani = (udalost: Event): boolean =>
      udalost.target instanceof Element && udalost.target.closest("[data-posouvani]") !== null;
    const odloz = (): void => {
      pokracovatOd = performance.now() + DOZNIVANI_MS;
    };
    const podrz = (udalost: Event): void => {
      if (!naOvladani(udalost)) drzi = true;
    };
    const pust = (udalost: TouchEvent): void => {
      if (!drzi || udalost.touches.length > 0) return;
      drzi = false;
      odloz();
    };
    // Setrvačnost po švihnutí: dokud stránka sama dojíždí, posun čeká.
    const dojezd = (): void => {
      if (!drzi && performance.now() < pokracovatOd) odloz();
    };
    const ukonci = (udalost: Event): void => {
      if (!naOvladani(udalost)) setBezi(false);
    };
    window.addEventListener("wheel", odloz, { passive: true });
    window.addEventListener("touchstart", podrz, { passive: true });
    window.addEventListener("touchend", pust, { passive: true });
    window.addEventListener("touchcancel", pust, { passive: true });
    window.addEventListener("scroll", dojezd, { passive: true });
    window.addEventListener("keydown", ukonci);
    return () => {
      window.cancelAnimationFrame(snimek);
      setOdpocet(null);
      window.removeEventListener("wheel", odloz);
      window.removeEventListener("touchstart", podrz);
      window.removeEventListener("touchend", pust);
      window.removeEventListener("touchcancel", pust);
      window.removeEventListener("scroll", dojezd);
      window.removeEventListener("keydown", ukonci);
    };
  }, [bezi]);

  const prepni = useCallback(() => setBezi((pred) => !pred), []);
  const zastav = useCallback(() => {
    setBezi(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const zmenRychlost = useCallback(
    (smer: -1 | 1) => {
      const dalsi = dalsiRychlost(rychlostRef.current, smer);
      setRychlost(dalsi);
      if (idPisne !== undefined) zapisRychlost(localStorage, idPisne, dalsi);
    },
    [idPisne],
  );

  return { bezi, odpocet, rychlost, prepni, zastav, zmenRychlost };
}
