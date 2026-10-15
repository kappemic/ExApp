import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  albumProFotku,
  srcFotkyAlba,
  urlSouboruAlba,
  type ApiAlbum,
  type ApiFotkaAlba,
} from "../../lib/alba-api";
import { nazevSouboruAlba, nazevSouboruVypravy } from "../../lib/stahni-fotku";
import FotkyLightboxNav from "./FotkyLightboxNav";
import StahniFotkuTlacitko from "./StahniFotkuTlacitko";
import { fotkyHoverBgJantar, fotkyHoverBgLinka, fotkyHoverBgSmrk, fotkyTlacitkoZaklad } from "./fotky-ui";

const FOCUSOVATELNE =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const TLACITKO_KRUH = `${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} rounded-full border-2 border-inkoust bg-papir text-inkoust`;

interface FotkaDialogProps {
  album: Pick<ApiAlbum, "id" | "druh" | "expeditionId" | "nazev">;
  fotky: readonly ApiFotkaAlba[];
  index: number;
  onIndex: (index: number) => void;
  onZavrit: () => void;
  isAdmin?: boolean;
  mazeSe?: boolean;
  onSmazatAktualni?: () => void;
  /** Koš: restore / permanent delete for the open photo. */
  jeKos?: boolean;
  onObnovitAktualni?: () => void;
  onSmazatNatrvaloAktualni?: () => void;
  /** When a confirm dialog is open above the lightbox, ignore Escape/backdrop close. */
  drzOtevrene?: boolean;
}

/**
 * Large photo on the albums page. Separate from the expedition lightbox
 * so that view never grows a highlight control for these photos.
 */
export default function FotkaDialog({
  album,
  fotky,
  index,
  onIndex,
  onZavrit,
  isAdmin = false,
  mazeSe = false,
  onSmazatAktualni,
  jeKos = false,
  onObnovitAktualni,
  onSmazatNatrvaloAktualni,
  drzOtevrene = false,
}: FotkaDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const zavritRef = useRef<HTMLButtonElement>(null);
  const onZavritRef = useRef(onZavrit);
  const onIndexRef = useRef(onIndex);
  const indexRef = useRef(index);
  const delkaRef = useRef(fotky.length);
  const drzOtevreneRef = useRef(drzOtevrene);
  const [rozbita, setRozbita] = useState<boolean>(false);
  const fotka = fotky[index];
  onZavritRef.current = onZavrit;
  onIndexRef.current = onIndex;
  indexRef.current = index;
  delkaRef.current = fotky.length;
  drzOtevreneRef.current = drzOtevrene;

  useEffect(() => {
    setRozbita(false);
  }, [index, fotka?.id]);

  useLayoutEffect(() => {
    zavritRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const predchozi = document.activeElement;
    const puvodni = document.body.style.overflow;
    if (puvodni !== "hidden") document.body.style.overflow = "hidden";
    zavritRef.current?.focus();

    function naKlavesu(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        if (drzOtevreneRef.current) return;
        udalost.preventDefault();
        udalost.stopPropagation();
        onZavritRef.current();
        return;
      }
      if (udalost.key === "ArrowLeft" && indexRef.current > 0) {
        udalost.preventDefault();
        onIndexRef.current(indexRef.current - 1);
        return;
      }
      if (udalost.key === "ArrowRight" && indexRef.current < delkaRef.current - 1) {
        udalost.preventDefault();
        onIndexRef.current(indexRef.current + 1);
        return;
      }
      if (udalost.key !== "Tab") return;
      const koren: HTMLDivElement | null = dialogRef.current;
      if (koren === null) return;
      const prvky: HTMLElement[] = Array.from(
        koren.querySelectorAll<HTMLElement>(FOCUSOVATELNE),
      );
      if (prvky.length === 0) return;
      const prvni: HTMLElement | undefined = prvky[0];
      const posledni: HTMLElement | undefined = prvky[prvky.length - 1];
      if (prvni === undefined || posledni === undefined) return;
      if (udalost.shiftKey && document.activeElement === prvni) {
        udalost.preventDefault();
        udalost.stopPropagation();
        posledni.focus();
      } else if (!udalost.shiftKey && document.activeElement === posledni) {
        udalost.preventDefault();
        udalost.stopPropagation();
        prvni.focus();
      }
    }

    window.addEventListener("keydown", naKlavesu, true);
    return () => {
      window.removeEventListener("keydown", naKlavesu, true);
      if (puvodni !== "hidden") document.body.style.overflow = puvodni;
      if (predchozi instanceof HTMLElement) predchozi.focus();
    };
  }, []);

  if (fotka === undefined || typeof document === "undefined") return null;

  const src = srcFotkyAlba(album, fotka);
  const streamAlbum = album.druh === "kos" ? albumProFotku(fotka) : album;
  const urlStahnuti = urlSouboruAlba(streamAlbum, fotka.id);
  const nazevStahnuti =
    streamAlbum.druh === "vyprava" && streamAlbum.expeditionId !== null
      ? nazevSouboruVypravy(streamAlbum.expeditionId, fotka.id)
      : nazevSouboruAlba(streamAlbum.id, fotka.id);
  const maPredchozi = index > 0;
  const maDalsi = index < fotky.length - 1;
  const tlacitkoAkce = `${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} rounded-full border-2 border-inkoust bg-papir px-3 text-sm font-bold text-inkoust disabled:opacity-60`;

  function zastav(udalost: MouseEvent): void {
    udalost.stopPropagation();
  }

  function naPozadi(udalost: MouseEvent<HTMLDivElement>): void {
    if (drzOtevrene) return;
    if (udalost.target === udalost.currentTarget) onZavrit();
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Fotka z alba ${album.nazev}`}
      className="fixed inset-0 z-[100] flex flex-col overscroll-contain bg-inkoust/85"
      onMouseDown={naPozadi}
    >
      <div
        className="flex items-center justify-between gap-3 border-b-2 border-inkoust bg-papir px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-inkoust"
        onMouseDown={zastav}
      >
        <p className="text-sm font-bold tabular-nums">
          {index + 1} / {fotky.length}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StahniFotkuTlacitko url={urlStahnuti} nazevSouboru={nazevStahnuti} />
          {isAdmin && jeKos && onObnovitAktualni !== undefined ? (
            <button
              type="button"
              onClick={onObnovitAktualni}
              disabled={mazeSe}
              className={`${tlacitkoAkce} ${fotkyHoverBgSmrk}`}
            >
              Obnovit
            </button>
          ) : null}
          {isAdmin && jeKos && onSmazatNatrvaloAktualni !== undefined ? (
            <button
              type="button"
              onClick={onSmazatNatrvaloAktualni}
              disabled={mazeSe}
              className={`${tlacitkoAkce} ${fotkyHoverBgJantar}`}
            >
              Smazat natrvalo
            </button>
          ) : null}
          {isAdmin && !jeKos && onSmazatAktualni !== undefined ? (
            <button
              type="button"
              onClick={onSmazatAktualni}
              disabled={mazeSe}
              className={`${tlacitkoAkce} ${fotkyHoverBgJantar}`}
            >
              Smazat
            </button>
          ) : null}
          <button
            ref={zavritRef}
            type="button"
            onClick={onZavrit}
            disabled={drzOtevrene}
            aria-label="Zavřít fotku"
            title={drzOtevrene ? "Nejdřív dokonči potvrzení" : undefined}
            className={`${TLACITKO_KRUH} px-3 text-sm font-bold disabled:opacity-60`}
          >
            Zavřít
          </button>
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center pb-[env(safe-area-inset-bottom)]"
        onMouseDown={naPozadi}
      >
        {rozbita || src.length === 0 ? (
          <p
            role="status"
            onMouseDown={zastav}
            className="rounded-md border-2 border-inkoust bg-papir px-4 py-3 text-sm font-semibold text-inkoust"
          >
            Fotku se nepodařilo načíst.
          </p>
        ) : (
          <img
            src={src}
            alt={`Fotka ${index + 1} z ${fotky.length}, album ${album.nazev}`}
            className="max-h-full max-w-full object-contain"
            onMouseDown={zastav}
            onError={() => {
              setRozbita(true);
            }}
          />
        )}
        <FotkyLightboxNav
          maPredchozi={maPredchozi}
          maDalsi={maDalsi}
          onMouseDownZastav={zastav}
          onPredchozi={() => {
            onIndex(index - 1);
          }}
          onDalsi={() => {
            onIndex(index + 1);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
