import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes, type JSX, type SyntheticEvent } from "react";
import { zaradNacteniFotky } from "../../lib/fotka-fronta";
import { urlNahleduFotky } from "../../lib/fotka-nahled";

type PostupnaFotkaProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  /** Lightbox jumps the queue so the open photo does not wait on the grid. */
  prednost?: boolean;
  /** Full-screen view: veil the open photo instead of a hard blur. */
  zamlzeni?: boolean;
  /** Natural size of the preview, so a justified row can settle before the full file. */
  onRozmer?: (sirka: number, vyska: number) => void;
};

const JEMNY_BLUR = "blur(2px)";
const MLHA = "blur(5px) brightness(1.14) saturate(0.62) contrast(0.92)";
/** Addresses painted this session. A remount shows them at once. */
const hotoveAdresy = new Set<string>();

function pamatuj(adresa: string): void {
  if (adresa.length > 0) hotoveAdresy.add(adresa);
}

function bezPohybu(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when this session or the browser can paint the address without a new download. */
function uzKDispozici(adresa: string): boolean {
  if (adresa.length === 0) return false;
  if (hotoveAdresy.has(adresa)) return true;
  if (typeof window === "undefined") return false;
  const obrazek = new Image();
  obrazek.src = adresa;
  return obrazek.complete && obrazek.naturalWidth > 0;
}

function nactiObrazek(adresa: string): Promise<{ sirka: number; vyska: number } | null> {
  return new Promise((resolve) => {
    const obrazek = new Image();
    obrazek.onload = () => {
      resolve(
        obrazek.naturalWidth > 0 && obrazek.naturalHeight > 0
          ? { sirka: obrazek.naturalWidth, vyska: obrazek.naturalHeight }
          : null,
      );
    };
    obrazek.onerror = () => {
      resolve(null);
    };
    obrazek.src = adresa;
  });
}

/**
 * Paints the small `?nahled=1` JPEG first. Grid tiles stay on that preview
 * and start in reading order: top row, left to right, then downward.
 * A full-screen photo (`zamlzeni`) then loads the stored file and stays misted
 * until it arrives. `loading` from the caller is ignored so the queue,
 * not the browser, decides which image starts.
 */
export default function PostupnaFotka({
  src,
  prednost = false,
  zamlzeni = false,
  onLoad,
  onError,
  onRozmer,
  className,
  style,
  ...zbytek
}: PostupnaFotkaProps): JSX.Element {
  const [sledovane, setSledovane] = useState(src);
  const [faze, setFaze] = useState<"nahled" | "plna">(() =>
    urlNahleduFotky(src) === src || uzKDispozici(src) ? "plna" : "nahled",
  );
  const [nahledHotovy, setNahledHotovy] = useState(false);
  /** Náhled už byl vidět bez závoje (soused v lightboxu), teď se nezamlží. */
  const [bezZavoje, setBezZavoje] = useState(false);
  const [nahledPovolen, setNahledPovolen] = useState(
    () =>
      prednost ||
      zamlzeni ||
      urlNahleduFotky(src) === src ||
      uzKDispozici(src) ||
      uzKDispozici(urlNahleduFotky(src)),
  );
  const srcRef = useRef(src);
  srcRef.current = src;
  const onRozmerRef = useRef(onRozmer);
  onRozmerRef.current = onRozmer;
  const imgRef = useRef<HTMLImageElement>(null);
  const uvolniRef = useRef<(() => void) | null>(null);

  const nahled = urlNahleduFotky(src);
  const stejnySoubor = nahled === src;
  const chcePlnou = prednost || zamlzeni;

  if (sledovane !== src) {
    setSledovane(src);
    setNahledHotovy(false);
    setBezZavoje(false);
    setFaze(stejnySoubor || uzKDispozici(src) ? "plna" : "nahled");
    setNahledPovolen(chcePlnou || stejnySoubor || uzKDispozici(src) || uzKDispozici(nahled));
  }

  function uvolniSlot(): void {
    const uvolni = uvolniRef.current;
    uvolniRef.current = null;
    uvolni?.();
  }

  useLayoutEffect(() => {
    if (src.length === 0 || stejnySoubor) return;
    if (chcePlnou) {
      setNahledPovolen(true);
      return;
    }
    // The photo may have arrived between the render and this effect, e.g. for another copy of the list.
    if (uzKDispozici(src) || uzKDispozici(nahled)) {
      setNahledPovolen(true);
      return;
    }
    let zive = true;
    const cekani = new Promise<void>((resolve) => {
      uvolniRef.current = resolve;
    });
    const rect = imgRef.current?.getBoundingClientRect();
    const zrus = zaradNacteniFotky(
      () => {
        if (zive) setNahledPovolen(true);
        return cekani;
      },
      false,
      { y: rect?.top ?? 0, x: rect?.left ?? 0 },
    );
    return () => {
      zive = false;
      zrus();
      uvolniSlot();
    };
  }, [src, stejnySoubor, chcePlnou]);

  useEffect(() => {
    if (!nahledHotovy || faze !== "nahled" || !chcePlnou || stejnySoubor || src.length === 0) return;
    let zive = true;
    const cil = src;
    const zrus = zaradNacteniFotky(() => {
      if (!zive) return Promise.resolve();
      return nactiObrazek(cil).then((rozmer) => {
        if (!zive || srcRef.current !== cil) return;
        if (rozmer !== null) {
          pamatuj(cil);
          onRozmerRef.current?.(rozmer.sirka, rozmer.vyska);
        }
        setFaze("plna");
      });
    }, true);
    return zrus;
  }, [nahledHotovy, faze, src, stejnySoubor, chcePlnou]);

  const ukazovany =
    src.length === 0 || !nahledPovolen ? undefined : faze === "plna" || stejnySoubor ? src : nahled;
  const zakryt = chcePlnou && !bezZavoje && faze !== "plna" && !stejnySoubor && src.length > 0 && !bezPohybu();
  const styl: CSSProperties = {
    ...style,
    filter: zakryt ? (zamlzeni ? MLHA : JEMNY_BLUR) : style?.filter,
    transition: "filter 420ms ease",
  };
  // High only for the open photo. A grid must not stamp high on every tile, and "auto" is just the default.
  const priorita = chcePlnou ? { fetchPriority: "high" as const } : {};

  function poNacteni(udalost: SyntheticEvent<HTMLImageElement>): void {
    const obrazek = udalost.currentTarget;
    if (obrazek.naturalWidth > 0 && obrazek.naturalHeight > 0) {
      pamatuj(obrazek.currentSrc || ukazovany || "");
      onRozmerRef.current?.(obrazek.naturalWidth, obrazek.naturalHeight);
    }
    if (faze === "nahled" && !stejnySoubor) {
      setNahledHotovy(true);
      if (chcePlnou) {
        uvolniSlot();
        return;
      }
      setBezZavoje(true);
    }
    uvolniSlot();
    onLoad?.(udalost);
  }

  function poChybe(udalost: SyntheticEvent<HTMLImageElement>): void {
    uvolniSlot();
    if (faze === "nahled" && !stejnySoubor) {
      if (chcePlnou) {
        setNahledHotovy(true);
        return;
      }
      setFaze("plna");
      return;
    }
    onError?.(udalost);
  }

  return (
    <img
      {...zbytek}
      ref={imgRef}
      alt={zbytek.alt ?? ""}
      className={className}
      style={styl}
      {...(ukazovany === undefined ? {} : { src: ukazovany })}
      {...priorita}
      loading="eager"
      decoding="async"
      onLoad={poNacteni}
      onError={poChybe}
    />
  );
}
