import { useEffect, useRef, type RefObject } from "react";
import { snizenyPohyb } from "../lib/pohyb";

/**
 * Nahrané fotky přibývají na konci alba. Album k nim doroluje jen jednou, u první
 * z dávky, a jen když člověk mezitím nezačal posouvat sám. Dál už stránkou nehýbe.
 */
export function useSledovaniNovych(
  konecRef: RefObject<HTMLElement | null>,
  pocet: number,
  aktivni: boolean,
): void {
  const predchozi = useRef(pocet);
  const hotovo = useRef(false);

  useEffect(() => {
    if (!aktivni) return;
    hotovo.current = false;
    const prevzalPosun = (): void => {
      hotovo.current = true;
    };
    window.addEventListener("wheel", prevzalPosun, { passive: true });
    window.addEventListener("touchmove", prevzalPosun, { passive: true });
    return () => {
      window.removeEventListener("wheel", prevzalPosun);
      window.removeEventListener("touchmove", prevzalPosun);
    };
  }, [aktivni]);

  useEffect(() => {
    const pribylo = pocet > predchozi.current;
    predchozi.current = pocet;
    if (!aktivni || !pribylo || hotovo.current) return;
    hotovo.current = true;
    konecRef.current?.scrollIntoView({ block: "end", behavior: snizenyPohyb() ? "auto" : "smooth" });
  }, [aktivni, konecRef, pocet]);
}
