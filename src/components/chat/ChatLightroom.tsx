import { useCallback, useEffect, useRef, useState, type JSX, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { ChatFotka } from "../../lib/chat-fotky";
import { formatCasKratce } from "../../lib/format-cas";
import { urlPrilohyZpravy } from "../../lib/prilohy-zpravy";
import FotkyLightboxNav from "../fotky/FotkyLightboxNav";
import { LightboxInfo, LightboxNastroje, useFotkaProhlizeni } from "../fotky/LightboxProhlizeni";
import PostupnaFotka from "../fotky/PostupnaFotka";
import StahniFotkuTlacitko from "../fotky/StahniFotkuTlacitko";
import { fotkyLightboxIkona, fotkyLightboxPocet, fotkyLightboxRadek } from "../fotky/fotky-ui";
import { zamkniPosuv } from "../../lib/zamek-posuvu";
import { useOdchod, zmizeniDialogu } from "../../lib/pohyb";

export interface ChatLightroomStav {
  otevreno: boolean;
  fotky: readonly ChatFotka[];
  nacitaSe: boolean;
  chyba: string | null;
  vybranaId: string | null;
  otevri: (prilohaId: string | null) => Promise<void>;
  zavri: () => void;
}

/** Loads the thread's photos each time the room opens. */
export function useChatLightroom(
  nacti: () => Promise<{ ok: true; fotky: ChatFotka[] } | { ok: false; chyba: string }>,
): ChatLightroomStav {
  const [otevreno, setOtevreno] = useState(false);
  const [vybranaId, setVybranaId] = useState<string | null>(null);
  const [fotky, setFotky] = useState<ChatFotka[]>([]);
  const [nacitaSe, setNacitaSe] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const otevri = useCallback(
    async (prilohaId: string | null): Promise<void> => {
      setOtevreno(true);
      setVybranaId(prilohaId);
      setNacitaSe(true);
      setChyba(null);
      const vysledek = await nacti();
      setNacitaSe(false);
      if (!vysledek.ok) {
        setChyba(vysledek.chyba);
        setFotky([]);
        return;
      }
      setFotky(vysledek.fotky);
    },
    [nacti],
  );

  const zavri = useCallback((): void => {
    setOtevreno(false);
    setVybranaId(null);
  }, []);

  return { otevreno, fotky, nacitaSe, chyba, vybranaId, otevri, zavri };
}

export interface ChatLightroomProps {
  nazev: string;
  fotky: readonly ChatFotka[];
  nacitaSe: boolean;
  chyba: string | null;
  /** Attachment id to open straight into the large view. */
  vybranaId: string | null;
  onZavrit: () => void;
}

/**
 * One chat's photos in the album lightbox. Closing returns to the thread.
 * There is no grid in between.
 */
export default function ChatLightroom({
  nazev,
  fotky,
  nacitaSe,
  chyba,
  vybranaId,
  onZavrit,
}: ChatLightroomProps): JSX.Element | null {
  const [index, setIndex] = useState<number | null>(null);
  const [rozbita, setRozbita] = useState(false);
  const fotka = index === null ? undefined : fotky[index];
  const src = fotka === undefined ? "" : urlPrilohyZpravy(fotka.id);
  const prohlizeni = useFotkaProhlizeni(src, fotka?.createdAt ?? null, false);

  useEffect(() => {
    setRozbita(false);
  }, [index, fotka?.id]);

  useEffect(() => {
    if (fotky.length === 0) {
      setIndex(null);
      return;
    }
    if (vybranaId !== null) {
      const nalezeny = fotky.findIndex((polozka) => polozka.id === vybranaId);
      if (nalezeny >= 0) {
        setIndex(nalezeny);
        return;
      }
    }
    setIndex((aktualni) => (aktualni !== null && aktualni < fotky.length ? aktualni : fotky.length - 1));
  }, [vybranaId, fotky]);

  useEffect(() => {
    function naKlavesu(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        udalost.preventDefault();
        udalost.stopPropagation();
        onZavrit();
        return;
      }
      if (index === null) return;
      if (udalost.key === "ArrowLeft" && index > 0) {
        udalost.preventDefault();
        udalost.stopPropagation();
        setIndex(index - 1);
      }
      if (udalost.key === "ArrowRight" && index < fotky.length - 1) {
        udalost.preventDefault();
        udalost.stopPropagation();
        setIndex(index + 1);
      }
    }
    window.addEventListener("keydown", naKlavesu, true);
    return () => window.removeEventListener("keydown", naKlavesu, true);
  }, [fotky.length, index, onZavrit]);

  useEffect(() => zamkniPosuv(), []);
  const korenRef = useRef<HTMLDivElement>(null);
  useOdchod(korenRef, true, zmizeniDialogu);

  if (typeof document === "undefined") return null;

  function zastav(udalost: MouseEvent): void {
    udalost.stopPropagation();
  }

  const maFotku = fotka !== undefined && index !== null;
  const casOdeslani = fotka === undefined ? "" : formatCasKratce(fotka.createdAt);
  const uvodInfo =
    fotka === undefined
      ? []
      : [`Poslal ${fotka.autor}`, casOdeslani.length > 0 ? `Odesláno ${casOdeslani}` : "", fotka.nazev].filter(
          (radek) => radek.length > 0,
        );
  const hlaska =
    chyba !== null
      ? chyba
      : nacitaSe || (fotky.length > 0 && index === null)
        ? "Načítám fotky z chatu…"
        : fotky.length === 0
          ? "V tomhle chatu zatím není žádná fotka."
          : rozbita || src.length === 0
            ? "Fotku se nepodařilo načíst."
            : null;

  return createPortal(
    <div
      ref={korenRef}
      role="dialog"
      aria-modal="true"
      aria-label={maFotku ? `Fotka z chatu ${nazev}` : `Fotky · ${nazev}`}
      className="nocturne lightbox-pozadi lightbox-nabeh fixed inset-0 z-[100] flex flex-col overscroll-contain"
      onMouseDown={(udalost) => {
        if (udalost.target === udalost.currentTarget) onZavrit();
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-1 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] text-inkoust sm:gap-2 sm:px-[max(0.75rem,env(safe-area-inset-left))] sm:pr-[max(0.75rem,env(safe-area-inset-right))]"
        onMouseDown={zastav}
      >
        <p className={`${fotkyLightboxPocet} shrink-0`}>
          {maFotku ? `${index + 1} / ${fotky.length}` : nazev}
        </p>
        <div className="pointer-events-auto flex min-w-0 flex-col items-end">
          <div className={fotkyLightboxRadek}>
            {maFotku ? <LightboxNastroje stav={prohlizeni} /> : null}
            {maFotku && fotka !== undefined ? (
              <StahniFotkuTlacitko url={src} nazevSouboru={fotka.nazev} />
            ) : null}
            <button
              type="button"
              onClick={onZavrit}
              aria-label="Zavřít fotku"
              className={`${fotkyLightboxIkona} text-xl font-extrabold leading-none`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {maFotku ? <LightboxInfo stav={prohlizeni} uvod={uvodInfo} jenUvod /> : null}
        </div>
      </div>
      <div
        data-lightbox-jeviste
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-16"
        onMouseDown={(udalost) => {
          if (udalost.target === udalost.currentTarget) onZavrit();
        }}
      >
        {hlaska !== null || !maFotku || fotka === undefined || index === null ? (
          <p
            role={chyba !== null ? "alert" : "status"}
            onMouseDown={zastav}
            className="rounded-md border border-linka bg-papir px-4 py-3 text-sm font-semibold text-inkoust"
          >
            {hlaska ?? "Načítám fotky z chatu…"}
          </p>
        ) : (
          <PostupnaFotka
            prednost
            zamlzeni
            src={src}
            alt={`Fotka ${index + 1} z ${fotky.length}, chat ${nazev}`}
            className={`max-h-full max-w-full object-contain ${prohlizeni.zoom ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
            style={prohlizeni.stylObrazku}
            onMouseDown={zastav}
            onPointerDown={prohlizeni.naPointerDown}
            onPointerMove={prohlizeni.naPointerMove}
            onPointerUp={prohlizeni.naPointerUp}
            onPointerCancel={prohlizeni.naPointerUp}
            onError={() => {
              setRozbita(true);
            }}
          />
        )}
        {maFotku && index !== null ? (
          <FotkyLightboxNav
            maPredchozi={index > 0}
            maDalsi={index < fotky.length - 1}
            onMouseDownZastav={zastav}
            onPredchozi={() => setIndex(index - 1)}
            onDalsi={() => setIndex(index + 1)}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
