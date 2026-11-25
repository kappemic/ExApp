import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ctiExif, nazevZAdresy, radkyUdaju, sestavUdaje } from "../../lib/exif-fotky";
import { fotkyLightboxIkona, fotkyLightboxZoom } from "./fotky-ui";

const MIN_MERITKO = 1;
const MAX_MERITKO = 5;
const KROK = 1.25;

export interface FotkaProhlizeni {
  zoom: boolean;
  info: boolean;
  radky: readonly string[];
  infoStav: "prazdne" | "nacitani" | "hotovo" | "chyba";
  kopie: "klid" | "kopiruji" | "hotovo" | "chyba";
  prepnoutZoom: () => void;
  prepnoutInfo: () => void;
  kopiruj: () => void;
  stylObrazku: {
    transform: string;
    transformOrigin: "center center";
    transition: string;
  };
  naPointerDown: (udalost: ReactPointerEvent<HTMLImageElement>) => void;
  naPointerMove: (udalost: ReactPointerEvent<HTMLImageElement>) => void;
  naPointerUp: (udalost: ReactPointerEvent<HTMLImageElement>) => void;
}

export function useFotkaProhlizeni(
  src: string,
  zalozniCas: string | null,
  nacitatUdaje = true,
): FotkaProhlizeni {
  const [zoom, setZoom] = useState(false);
  const [meritko, setMeritko] = useState(MIN_MERITKO);
  const [posun, setPosun] = useState({ x: 0, y: 0 });
  const [info, setInfo] = useState(false);
  const [radky, setRadky] = useState<string[]>([]);
  const [infoStav, setInfoStav] = useState<FotkaProhlizeni["infoStav"]>("prazdne");
  const [kopie, setKopie] = useState<FotkaProhlizeni["kopie"]>("klid");
  const meritkoRef = useRef(meritko);
  const posunRef = useRef(posun);
  const zoomRef = useRef(zoom);
  const kurzorRef = useRef<{ x: number; y: number } | null>(null);
  const blobRef = useRef<Promise<Blob> | null>(null);
  const srcRef = useRef(src);
  const tahRef = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const prstyRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const stiskRef = useRef<{ vzdalenost: number; meritko: number } | null>(null);
  meritkoRef.current = meritko;
  posunRef.current = posun;
  zoomRef.current = zoom;

  useEffect(() => {
    srcRef.current = src;
    blobRef.current = null;
    setZoom(false);
    setMeritko(MIN_MERITKO);
    setPosun({ x: 0, y: 0 });
    setInfo(false);
    setRadky([]);
    setInfoStav("prazdne");
    setKopie("klid");
  }, [src]);

  const nastavMeritko = useCallback((dalsi: number, kurzor?: { x: number; y: number } | null): void => {
    const s0 = meritkoRef.current;
    const s2 = Math.min(MAX_MERITKO, Math.max(MIN_MERITKO, dalsi));
    const tx = posunRef.current.x;
    const ty = posunRef.current.y;
    if (s2 === MIN_MERITKO || s0 === s2) {
      meritkoRef.current = s2;
      setMeritko(s2);
      if (s2 === MIN_MERITKO) {
        posunRef.current = { x: 0, y: 0 };
        setPosun({ x: 0, y: 0 });
      }
      return;
    }
    const obrazek = document.querySelector("[data-lightbox-aktualni] img");
    const bod = kurzor ?? kurzorRef.current;
    if (!(obrazek instanceof HTMLElement) || bod === null) {
      meritkoRef.current = s2;
      setMeritko(s2);
      return;
    }
    const rect = obrazek.getBoundingClientRect();
    const stredX = rect.left + rect.width / 2 - tx;
    const stredY = rect.top + rect.height / 2 - ty;
    const pomer = s2 / s0;
    const dalsiPosun = {
      x: (bod.x - stredX) * (1 - pomer) + tx * pomer,
      y: (bod.y - stredY) * (1 - pomer) + ty * pomer,
    };
    meritkoRef.current = s2;
    posunRef.current = dalsiPosun;
    setMeritko(s2);
    setPosun(dalsiPosun);
  }, []);

  const prepnoutZoom = useCallback((): void => {
    setZoom((otevreno) => {
      if (otevreno) {
        setMeritko(MIN_MERITKO);
        setPosun({ x: 0, y: 0 });
      }
      return !otevreno;
    });
  }, []);

  const nactiBlob = useCallback((): Promise<Blob> => {
    if (blobRef.current === null || srcRef.current !== src) {
      const adresa = src;
      blobRef.current = fetch(adresa, { credentials: "include" }).then((odpoved) => {
        if (!odpoved.ok) throw new Error("fetch");
        return odpoved.blob();
      });
    }
    return blobRef.current;
  }, [src]);

  const nactiInfo = useCallback(async (): Promise<void> => {
    setInfoStav("nacitani");
    try {
      const blob = await nactiBlob();
      const bajty = new Uint8Array(await blob.arrayBuffer());
      const exif = ctiExif(bajty);
      let sirka: number | null = exif.sirka;
      let vyska: number | null = exif.vyska;
      if (sirka === null || vyska === null) {
        const bitmap = await createImageBitmap(blob);
        sirka = bitmap.width;
        vyska = bitmap.height;
        bitmap.close();
      }
      const udaje = sestavUdaje({
        exif,
        sirka,
        vyska,
        bajty: blob.size,
        nazevSouboru: nazevZAdresy(src),
        zalozniCas,
      });
      const vypis = radkyUdaju(udaje);
      setRadky(vypis);
      setInfoStav(vypis.length > 0 ? "hotovo" : "chyba");
    } catch {
      blobRef.current = null;
      setRadky([]);
      setInfoStav("chyba");
    }
  }, [nactiBlob, src, zalozniCas]);

  const prepnoutInfo = useCallback((): void => {
    setInfo((otevreno) => {
      if (!otevreno && nacitatUdaje) void nactiInfo();
      return !otevreno;
    });
  }, [nactiInfo, nacitatUdaje]);

  const kopiruj = useCallback((): void => {
    if (kopie === "kopiruji") return;
    setKopie("kopiruji");
    void (async () => {
      try {
        const blob = await nactiBlob();
        const bitmap = await createImageBitmap(blob);
        const platno = document.createElement("canvas");
        platno.width = bitmap.width;
        platno.height = bitmap.height;
        const kontext = platno.getContext("2d");
        if (kontext === null) throw new Error("canvas");
        kontext.drawImage(bitmap, 0, 0);
        bitmap.close();
        const png = await new Promise<Blob>((resolve, reject) => {
          platno.toBlob((vysledek) => {
            if (vysledek === null) reject(new Error("blob"));
            else resolve(vysledek);
          }, "image/png");
        });
        if (typeof ClipboardItem === "undefined" || navigator.clipboard?.write === undefined) {
          throw new Error("clipboard");
        }
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        setKopie("hotovo");
        window.setTimeout(() => setKopie("klid"), 1600);
      } catch {
        blobRef.current = null;
        setKopie("chyba");
        window.setTimeout(() => setKopie("klid"), 2000);
      }
    })();
  }, [kopie, nactiBlob]);

  const naPointerDown = useCallback((udalost: ReactPointerEvent<HTMLImageElement>): void => {
    if (!zoomRef.current) return;
    udalost.stopPropagation();
    udalost.currentTarget.setPointerCapture(udalost.pointerId);
    prstyRef.current.set(udalost.pointerId, { x: udalost.clientX, y: udalost.clientY });
    if (prstyRef.current.size === 2) {
      const body = [...prstyRef.current.values()];
      const a = body[0];
      const b = body[1];
      if (a !== undefined && b !== undefined) {
        stiskRef.current = {
          vzdalenost: Math.hypot(a.x - b.x, a.y - b.y),
          meritko: meritkoRef.current,
        };
      }
      tahRef.current = null;
      return;
    }
    tahRef.current = {
      id: udalost.pointerId,
      x: udalost.clientX,
      y: udalost.clientY,
      px: posunRef.current.x,
      py: posunRef.current.y,
    };
  }, []);

  const naPointerMove = useCallback((udalost: ReactPointerEvent<HTMLImageElement>): void => {
    kurzorRef.current = { x: udalost.clientX, y: udalost.clientY };
    if (!zoomRef.current) return;
    if (!prstyRef.current.has(udalost.pointerId)) return;
    prstyRef.current.set(udalost.pointerId, { x: udalost.clientX, y: udalost.clientY });
    if (prstyRef.current.size >= 2 && stiskRef.current !== null && stiskRef.current.vzdalenost > 0) {
      const body = [...prstyRef.current.values()];
      const a = body[0];
      const b = body[1];
      if (a === undefined || b === undefined) return;
      const vzdalenost = Math.hypot(a.x - b.x, a.y - b.y);
      const stred = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      kurzorRef.current = stred;
      nastavMeritko(
        stiskRef.current.meritko * (vzdalenost / stiskRef.current.vzdalenost),
        stred,
      );
      return;
    }
    const tah = tahRef.current;
    if (tah === null || tah.id !== udalost.pointerId || meritkoRef.current <= 1) return;
    setPosun({
      x: tah.px + (udalost.clientX - tah.x),
      y: tah.py + (udalost.clientY - tah.y),
    });
  }, [nastavMeritko]);

  const naPointerUp = useCallback((udalost: ReactPointerEvent<HTMLImageElement>): void => {
    prstyRef.current.delete(udalost.pointerId);
    if (tahRef.current?.id === udalost.pointerId) tahRef.current = null;
    if (prstyRef.current.size < 2) stiskRef.current = null;
  }, []);

  useEffect(() => {
    const naKolecko = (udalost: WheelEvent): void => {
      if (!zoomRef.current) return;
      const cil = udalost.target;
      if (!(cil instanceof Element)) return;
      if (cil.closest("[data-lightbox-info]") !== null) return;
      const jeviste = cil.closest("[data-lightbox-jeviste]");
      if (jeviste === null) return;
      udalost.preventDefault();
      kurzorRef.current = { x: udalost.clientX, y: udalost.clientY };
      const faktor = udalost.deltaY < 0 ? KROK : 1 / KROK;
      nastavMeritko(meritkoRef.current * faktor, kurzorRef.current);
    };
    window.addEventListener("wheel", naKolecko, { passive: false });
    return () => window.removeEventListener("wheel", naKolecko);
  }, [nastavMeritko]);

  return {
    zoom,
    info,
    radky,
    infoStav,
    kopie,
    prepnoutZoom,
    prepnoutInfo,
    kopiruj,
    stylObrazku: {
      transform: `translate(${posun.x}px, ${posun.y}px) scale(${meritko})`,
      transformOrigin: "center center",
      transition: "none",
    },
    naPointerDown,
    naPointerMove,
    naPointerUp,
  };
}

export function LightboxNastroje({
  stav,
  zobrazitInfo = true,
}: {
  stav: FotkaProhlizeni;
  /** Chat rooms reuse the tools without the photo-info panel. */
  zobrazitInfo?: boolean;
}): JSX.Element {
  const kopieTitle =
    stav.kopie === "hotovo"
      ? "Zkopírováno"
      : stav.kopie === "chyba"
        ? "Fotku se nepodařilo zkopírovat"
        : stav.kopie === "kopiruji"
          ? "Kopíruji…"
          : "Kopírovat fotku";
  return (
    <>
      <button
        type="button"
        aria-pressed={stav.zoom}
        aria-label={stav.zoom ? "Ukončit prohlížení" : "Prohlížet zvětšeně"}
        title={stav.zoom ? "Ukončit prohlížení" : "Prohlížet"}
        onClick={stav.prepnoutZoom}
        className={stav.zoom ? fotkyLightboxZoom : fotkyLightboxIkona}
      >
        <IkonaLupa />
      </button>
      <button
        type="button"
        aria-label="Kopírovat fotku"
        title={kopieTitle}
        onClick={stav.kopiruj}
        disabled={stav.kopie === "kopiruji"}
        className={fotkyLightboxIkona}
      >
        <IkonaKopie />
      </button>
      {zobrazitInfo ? (
        <button
          type="button"
          aria-pressed={stav.info}
          aria-label="Informace o fotce"
          title="Informace o fotce"
          onClick={stav.prepnoutInfo}
          className={fotkyLightboxIkona}
        >
          <IkonaInfo />
        </button>
      ) : null}
      <p className="sr-only" role="status">
        {stav.kopie === "hotovo" ? "Fotka je ve schránce." : ""}
        {stav.kopie === "chyba" ? "Fotku se nepodařilo zkopírovat." : ""}
      </p>
    </>
  );
}

export function LightboxInfo({
  stav,
  uvod = [],
  jenUvod = false,
}: {
  stav: FotkaProhlizeni;
  /** Lines shown above the file details, such as who sent a chat photo. */
  uvod?: readonly string[];
  /** Chat photos only list these lines. Album details stay hidden. */
  jenUvod?: boolean;
}): JSX.Element | null {
  if (!stav.info) return null;
  return (
    <div
      data-lightbox-info
      className="pointer-events-auto absolute top-full right-[max(0.75rem,env(safe-area-inset-right))] z-20 mt-2 max-h-[min(70vh,32rem)] overflow-y-auto text-right text-sm font-semibold leading-6 text-papir drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
      onMouseDown={(udalost) => udalost.stopPropagation()}
    >
      {uvod.map((radek) => (
        <p key={radek}>{radek}</p>
      ))}
      {jenUvod ? null : (
        <>
          {stav.infoStav === "nacitani" ? <p>Načítám údaje…</p> : null}
          {stav.infoStav === "chyba" && uvod.length === 0 ? <p>Údaje u fotky se nepodařilo načíst.</p> : null}
          {stav.radky.map((radek, poradi) => (
            <p key={`${poradi}-${radek}`}>{radek}</p>
          ))}
        </>
      )}
    </div>
  );
}

function IkonaLupa(): JSX.Element {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" strokeWidth={2} />
      <path d="M15 15.5 19 19.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function IkonaKopie(): JSX.Element {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="8" y="8" width="10" height="12" rx="1.2" stroke="currentColor" strokeWidth={2} />
      <path d="M6 16H5.2A1.2 1.2 0 0 1 4 14.8V5.2A1.2 1.2 0 0 1 5.2 4H14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function IkonaInfo(): JSX.Element {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={2} />
      <path d="M12 11v5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}
