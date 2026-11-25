import { useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent } from "react";
import { snizenyPohyb } from "../../lib/pohyb";
import { krokKolecka } from "../../lib/lightbox-pas";
import FotkyLightboxNav from "./FotkyLightboxNav";
import type { FotkaProhlizeni } from "./LightboxProhlizeni";
import PostupnaFotka from "./PostupnaFotka";

/** Kolik sousedních fotek na každé straně je v DOM. */
const SOUSEDU = 2;
/** Po jaké pauze je posun dokončený. */
const KLID_POSUVU_MS = 160;
/** Totéž pro posun ze šipky: zadrhnutý snímek animaci nesmí ukončit. */
const KLID_SIPKY_MS = 600;

export interface SnimekPasu {
  id: string;
  src: string;
  alt: string;
}

/**
 * Pás fotek v lightboxu. Prst a touchpad ho posouvají nativně (`scroll-snap`),
 * kolečko myši a šipky po jedné fotce. Při zvětšení posun stojí a tah patří fotce.
 */
export default function LightboxPas({
  snimky,
  index,
  prohlizeni,
  onIndex,
  onPozadi,
}: {
  snimky: readonly SnimekPasu[];
  index: number;
  prohlizeni: FotkaProhlizeni;
  onIndex: (index: number) => void;
  /** Klepnutí mimo fotku. */
  onPozadi: () => void;
}): JSX.Element {
  const pasRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const onIndexRef = useRef(onIndex);
  const zoomRef = useRef(prohlizeni.zoom);
  const sirkaRef = useRef(0);
  /** Kam jede posun ze šipky. Dokud jede, poloha nepřepisuje index. */
  const cilRef = useRef<number | null>(null);
  const predchozi = useRef<{ index: number; pocet: number } | null>(null);
  const pocet = snimky.length;
  onIndexRef.current = onIndex;
  zoomRef.current = prohlizeni.zoom;

  useLayoutEffect(() => {
    const pas = pasRef.current;
    indexRef.current = index;
    if (pas === null) return;
    const minule = predchozi.current;
    predchozi.current = { index, pocet };
    const sirka = pas.clientWidth;
    sirkaRef.current = sirka;
    if (sirka === 0) return;
    const cil = index * sirka;
    if (minule === null || minule.pocet !== pocet) {
      cilRef.current = null;
      pas.scrollLeft = cil;
      return;
    }
    // Prst už na téhle fotce je, index jen dohnal polohu.
    if (cilRef.current === null && Math.round(pas.scrollLeft / sirka) === index) return;
    if (Math.abs(index - minule.index) > 1 || snizenyPohyb()) {
      cilRef.current = null;
      pas.scrollLeft = cil;
      return;
    }
    cilRef.current = cil;
    pas.scrollTo({ left: cil, behavior: "smooth" });
  }, [index, pocet]);

  useEffect(() => {
    const pas = pasRef.current;
    if (pas === null) return;
    let casovac = 0;
    let posledniKrok = 0;

    function dorovnejIndex(): void {
      const sirka = pas!.clientWidth;
      // Při změně šířky okna se poloha teprve srovná.
      if (sirka === 0 || sirka !== sirkaRef.current) return;
      const novy = Math.round(pas!.scrollLeft / sirka);
      if (novy === indexRef.current) return;
      indexRef.current = novy;
      onIndexRef.current(novy);
    }

    function naPosuv(): void {
      window.clearTimeout(casovac);
      if (cilRef.current !== null && Math.abs(pas!.scrollLeft - cilRef.current) < 2) cilRef.current = null;
      if (cilRef.current === null) {
        dorovnejIndex();
        casovac = window.setTimeout(dorovnejIndex, KLID_POSUVU_MS);
        return;
      }
      casovac = window.setTimeout(() => {
        if (cilRef.current === null) return;
        pas!.scrollLeft = cilRef.current;
        cilRef.current = null;
      }, KLID_SIPKY_MS);
    }

    function prevzit(): void {
      cilRef.current = null;
    }

    function naKolecko(udalost: WheelEvent): void {
      if (zoomRef.current || udalost.ctrlKey) return;
      if (Math.abs(udalost.deltaX) >= Math.abs(udalost.deltaY)) {
        prevzit();
        return;
      }
      udalost.preventDefault();
      const ted = performance.now();
      const smer = krokKolecka(udalost.deltaY, ted - posledniKrok);
      if (smer === 0) return;
      const posledni = pas!.querySelectorAll("[data-snimek]").length - 1;
      const novy = Math.min(posledni, Math.max(0, indexRef.current + smer));
      if (novy === indexRef.current) return;
      posledniKrok = ted;
      onIndexRef.current(novy);
    }

    const mereni = new ResizeObserver(() => {
      if (pas.clientWidth === sirkaRef.current) return;
      sirkaRef.current = pas.clientWidth;
      cilRef.current = null;
      pas.scrollLeft = indexRef.current * pas.clientWidth;
    });
    mereni.observe(pas);
    pas.addEventListener("scroll", naPosuv, { passive: true });
    pas.addEventListener("touchstart", prevzit, { passive: true });
    pas.addEventListener("wheel", naKolecko, { passive: false });
    return () => {
      window.clearTimeout(casovac);
      mereni.disconnect();
      pas.removeEventListener("scroll", naPosuv);
      pas.removeEventListener("touchstart", prevzit);
      pas.removeEventListener("wheel", naKolecko);
    };
  }, []);

  return (
    <div
      ref={pasRef}
      tabIndex={-1}
      className={`relative flex h-full w-full snap-x snap-mandatory overflow-y-hidden overscroll-contain outline-none [container-type:inline-size] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        prohlizeni.zoom ? "overflow-x-hidden" : "overflow-x-auto"
      }`}
    >
      {/* Šipky leží v pásu a drží se jeho kraje, aby přes ně šlo táhnout prstem. */}
      <div className="pointer-events-none sticky left-0 z-10 h-full w-0 shrink-0">
        <div className="absolute inset-y-0 left-0 w-[100cqw]">
          <FotkyLightboxNav
            maPredchozi={index > 0}
            maDalsi={index < pocet - 1}
            onMouseDownZastav={(udalost) => udalost.stopPropagation()}
            onPredchozi={() => onIndex(index - 1)}
            onDalsi={() => onIndex(index + 1)}
          />
        </div>
      </div>
      {snimky.map((snimek, poradi) => {
        const aktualni = poradi === index;
        return (
          <div
            key={snimek.id}
            data-snimek=""
            data-lightbox-aktualni={aktualni ? "" : undefined}
            aria-hidden={aktualni ? undefined : true}
            className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center overflow-hidden px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-16"
            onMouseDown={(udalost: MouseEvent<HTMLDivElement>) => {
              if (udalost.target !== udalost.currentTarget) return;
              udalost.stopPropagation();
              onPozadi();
            }}
          >
            {Math.abs(poradi - index) <= SOUSEDU ? (
              <Snimek snimek={snimek} aktualni={aktualni} prohlizeni={prohlizeni} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Snimek({
  snimek,
  aktualni,
  prohlizeni,
}: {
  snimek: SnimekPasu;
  aktualni: boolean;
  prohlizeni: FotkaProhlizeni;
}): JSX.Element {
  const [rozbita, setRozbita] = useState(false);

  useEffect(() => {
    setRozbita(false);
  }, [snimek.src]);

  if (rozbita || snimek.src.length === 0) {
    return (
      <p
        role={aktualni ? "status" : undefined}
        onMouseDown={(udalost) => udalost.stopPropagation()}
        className="rounded-md border border-linka bg-papir px-4 py-3 text-sm font-semibold text-inkoust"
      >
        Fotku se nepodařilo načíst.
      </p>
    );
  }
  return (
    <PostupnaFotka
      prednost={aktualni}
      zamlzeni={aktualni}
      src={snimek.src}
      alt={aktualni ? snimek.alt : ""}
      className={`max-h-full max-w-full object-contain ${
        aktualni && prohlizeni.zoom ? "touch-none cursor-grab active:cursor-grabbing" : ""
      }`}
      style={aktualni ? prohlizeni.stylObrazku : undefined}
      onMouseDown={(udalost) => udalost.stopPropagation()}
      {...(aktualni
        ? {
            onPointerDown: prohlizeni.naPointerDown,
            onPointerMove: prohlizeni.naPointerMove,
            onPointerUp: prohlizeni.naPointerUp,
            onPointerCancel: prohlizeni.naPointerUp,
          }
        : {})}
      onError={() => setRozbita(true)}
    />
  );
}
