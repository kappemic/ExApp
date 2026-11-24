import { useLayoutEffect, useRef, type JSX, type RefObject } from "react";
import { KROK_PRESKOKU_MS, preskokBubliny, type PolohaBubliny, type SnimekBubliny } from "../../lib/bublina-listy";
import { snizenyPohyb } from "../../lib/pohyb";

/** O kolik px smí bublina při dojezdu přesáhnout kraj seznamu. */
const PRESAH_PX = 2;
/** Základ roztahovaného středu; kreslí se přes `scaleX`. */
const STRED_PX = 100;

/**
 * Podklad vybrané záložky. Skládá se ze dvou konců a středu mezi nimi, takže
 * se při přeskoku natáhne a zaoblení konců zůstane. Hýbe se jen přes `transform`
 * ve Web Animations, proto neškubne ani ve chvíli, kdy se vykresluje nová stránka.
 *
 * `seznam` je prvek, jehož děti jsou záložky, `index` je vybraná záložka nebo -1.
 * `umisteni` položí vrstvu přesně přes seznam, `zaobleni` je zaoblení konců.
 */
export default function BublinaListy({
  seznam,
  index,
  umisteni,
  zaobleni,
}: {
  seznam: RefObject<HTMLElement | null>;
  index: number;
  umisteni: string;
  zaobleni: string;
}): JSX.Element {
  const vrstvaRef = useRef<HTMLSpanElement>(null);
  const levyRef = useRef<HTMLSpanElement>(null);
  const stredRef = useRef<HTMLSpanElement>(null);
  const pravyRef = useRef<HTMLSpanElement>(null);
  const beh = useRef<{ snimky: SnimekBubliny[]; zacatek: number; animace: Animation[] } | null>(null);
  const poloha = useRef<PolohaBubliny | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  useLayoutEffect(() => {
    const ul = seznam.current;
    const vrstva = vrstvaRef.current;
    const levy = levyRef.current;
    const stred = stredRef.current;
    const pravy = pravyRef.current;
    if (ul === null || vrstva === null || levy === null || stred === null || pravy === null) return;

    const vyska = (): number => ul.clientHeight;
    const transformy = (s: { l: number; r: number }): [string, string, string] => {
      const h = vyska();
      return [
        `translateX(${s.l}px)`,
        `translateX(${s.l + h / 2}px) scaleX(${Math.max(0, s.r - s.l - h) / STRED_PX})`,
        `translateX(${s.r - h}px)`,
      ];
    };

    function cil(): { l: number; r: number } | null {
      const zalozka = ul!.children[indexRef.current];
      if (!(zalozka instanceof HTMLElement) || zalozka.offsetWidth === 0) return null;
      return { l: zalozka.offsetLeft, r: zalozka.offsetLeft + zalozka.offsetWidth };
    }

    function usad(kam: { l: number; r: number }): void {
      beh.current?.animace.forEach((a) => a.cancel());
      beh.current = null;
      poloha.current = { ...kam, vl: 0, vr: 0 };
      const [a, b, c] = transformy(kam);
      levy!.style.transform = a;
      stred!.style.transform = b;
      pravy!.style.transform = c;
    }

    /** Kde bublina právě je, aby další přeskok navázal i uprostřed pohybu. */
    function ted(): PolohaBubliny | null {
      const b = beh.current;
      if (b === null) return poloha.current;
      const i = Math.floor((performance.now() - b.zacatek) / KROK_PRESKOKU_MS);
      return b.snimky[Math.min(Math.max(0, i), b.snimky.length - 1)] ?? poloha.current;
    }

    function preskoc(): void {
      const kam = cil();
      vrstva!.style.opacity = kam === null ? "0" : "1";
      if (kam === null) return;
      const od = ted();
      // První vykreslení a návrat ze stránky mimo lištu: bublina se jen objeví.
      if (od === null || snizenyPohyb() || (od.l === kam.l && od.r === kam.r)) {
        usad(kam);
        return;
      }
      const snimky = preskokBubliny(od, kam, { sirka: ul!.clientWidth, presah: PRESAH_PX });
      usad(kam);
      const volby = { duration: (snimky.length - 1) * KROK_PRESKOKU_MS, easing: "linear" };
      const kroky = snimky.map(transformy);
      const animace = [
        levy!.animate(kroky.map(([transform]) => ({ transform })), volby),
        stred!.animate(kroky.map(([, transform]) => ({ transform })), volby),
        pravy!.animate(kroky.map(([, , transform]) => ({ transform })), volby),
        vrstva!.animate(snimky.map((s) => ({ transform: `scaleY(${s.vyska})` })), volby),
      ];
      const tento = { snimky, zacatek: performance.now(), animace };
      beh.current = tento;
      animace[0]!.onfinish = () => {
        if (beh.current !== tento) return;
        beh.current = null;
        // Během letu se mohla změnit šířka záložek.
        const konec = cil();
        if (konec !== null) usad(konec);
      };
    }

    preskoc();

    const mereni = new ResizeObserver(() => {
      if (beh.current !== null) return;
      const kam = cil();
      if (kam !== null) {
        vrstva.style.opacity = "1";
        usad(kam);
      }
    });
    mereni.observe(ul);
    return () => mereni.disconnect();
  }, [seznam, index]);

  return (
    <span
      ref={vrstvaRef}
      aria-hidden="true"
      className={`pointer-events-none absolute ${umisteni} transition-opacity duration-150`}
      style={{ opacity: 0 }}
    >
      <span ref={levyRef} className={`absolute left-0 top-0 aspect-square h-full ${zaobleni} bg-mlha will-change-transform`} />
      <span
        ref={stredRef}
        className="absolute left-0 top-0 h-full origin-left bg-mlha will-change-transform"
        style={{ width: STRED_PX }}
      />
      <span ref={pravyRef} className={`absolute left-0 top-0 aspect-square h-full ${zaobleni} bg-mlha will-change-transform`} />
    </span>
  );
}
