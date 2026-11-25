import { useEffect, useRef, type RefObject } from "react";
import { snizenyPohyb } from "../lib/pohyb";

/** O kolik pod okrajem displeje smí být konec alba, aby se ještě posouvalo za novými fotkami. */
const TOLERANCE_PX = 500;

/**
 * Nahrané fotky přibývají na konci alba. První z dávky album ukáže posunem,
 * další sleduje jen dokud člověk neodroluje jinam.
 */
export function useSledovaniNovych(
  konecRef: RefObject<HTMLElement | null>,
  pocet: number,
  aktivni: boolean,
): void {
  const predchozi = useRef(pocet);
  const ukazano = useRef(false);

  useEffect(() => {
    const pribylo = pocet > predchozi.current;
    predchozi.current = pocet;
    if (!aktivni) {
      ukazano.current = false;
      return;
    }
    const konec = konecRef.current;
    if (!pribylo || konec === null) return;
    const daleko = konec.getBoundingClientRect().top > window.innerHeight + TOLERANCE_PX;
    if (ukazano.current && daleko) return;
    ukazano.current = true;
    konec.scrollIntoView({ block: "end", behavior: snizenyPohyb() ? "auto" : "smooth" });
  }, [aktivni, konecRef, pocet]);
}
