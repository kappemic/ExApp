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
import { LightboxInfo, LightboxNastroje, useFotkaProhlizeni } from "./LightboxProhlizeni";
import PostupnaFotka from "./PostupnaFotka";
import StahniFotkuTlacitko from "./StahniFotkuTlacitko";
import { fotkyLightboxIkona, fotkyLightboxPocet, fotkyLightboxRadek, fotkyTlacitkoZaklad } from "./fotky-ui";
import { zamkniPosuv } from "../../lib/zamek-posuvu";
import { useOdchod, zmizeniDialogu } from "../../lib/pohyb";

const FOCUSOVATELNE =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

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
  /** Journal chrome: tokens, square corners, 220 ms enter/exit. Escape still closes at once. */
  denik?: boolean;
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
  denik = false,
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
  const srcProhlizeni = fotka === undefined ? "" : srcFotkyAlba(album, fotka);
  const prohlizeni = useFotkaProhlizeni(srcProhlizeni, fotka?.createdAt ?? null);
  onZavritRef.current = onZavrit;
  onIndexRef.current = onIndex;
  indexRef.current = index;
  delkaRef.current = fotky.length;
  drzOtevreneRef.current = drzOtevrene;
  const zavriRef = useRef<() => void>(() => {});
  zavriRef.current = () => onZavritRef.current();
  useOdchod(dialogRef, fotka !== undefined, zmizeniDialogu);

  useEffect(() => {
    setRozbita(false);
  }, [index, fotka?.id]);

  useLayoutEffect(() => {
    zavritRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const predchozi = document.activeElement;
    const odemkniPosuv = zamkniPosuv();
    zavritRef.current?.focus();

    function naKlavesu(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        if (drzOtevreneRef.current) return;
        udalost.preventDefault();
        udalost.stopPropagation();
        zavriRef.current();
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
      odemkniPosuv();
      if (predchozi instanceof HTMLElement) predchozi.focus();
    };
  }, []);

  if (fotka === undefined || typeof document === "undefined") return null;

  const src = srcProhlizeni;
  const streamAlbum = album.druh === "kos" ? albumProFotku(fotka) : album;
  const urlStahnuti = urlSouboruAlba(streamAlbum, fotka.id);
  const nazevStahnuti =
    streamAlbum.druh === "vyprava" && streamAlbum.expeditionId !== null
      ? nazevSouboruVypravy(streamAlbum.expeditionId, fotka.id)
      : nazevSouboruAlba(streamAlbum.id, fotka.id);
  const maPredchozi = index > 0;
  const maDalsi = index < fotky.length - 1;
  const tlacitkoAkce = `${fotkyTlacitkoZaklad} bez-prejeti nahled-press border-0 bg-transparent px-2 text-sm font-bold text-papir shadow-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] disabled:opacity-40`;

  function zastav(udalost: MouseEvent): void {
    udalost.stopPropagation();
  }

  function naPozadi(udalost: MouseEvent<HTMLDivElement>): void {
    if (drzOtevrene) return;
    if (udalost.target === udalost.currentTarget) zavriRef.current();
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Fotka z alba ${album.nazev}`}
      className={`nocturne lightbox-pozadi lightbox-nabeh fixed inset-0 z-[100] flex flex-col overscroll-contain${
        denik ? ` nahled-modal nahled-ovladani` : ""
      }`}
      onMouseDown={naPozadi}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-1 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] text-inkoust sm:gap-2 sm:px-[max(0.75rem,env(safe-area-inset-left))] sm:pr-[max(0.75rem,env(safe-area-inset-right))]"
        onMouseDown={zastav}
      >
        <p className={`${fotkyLightboxPocet} shrink-0`}>
          {index + 1} / {fotky.length}
        </p>
        <div className="pointer-events-auto flex min-w-0 flex-col items-end gap-1">
          <div className={fotkyLightboxRadek}>
          <LightboxNastroje stav={prohlizeni} />
          <StahniFotkuTlacitko url={urlStahnuti} nazevSouboru={nazevStahnuti} />
          {isAdmin && jeKos && onSmazatNatrvaloAktualni !== undefined ? (
            <button
              type="button"
              onClick={onSmazatNatrvaloAktualni}
              disabled={mazeSe}
              aria-label="Smazat natrvalo"
              title="Smazat natrvalo"
              className={fotkyLightboxIkona}
            >
              <IkonaKos />
            </button>
          ) : null}
          {isAdmin && !jeKos && onSmazatAktualni !== undefined ? (
            <button
              type="button"
              onClick={onSmazatAktualni}
              disabled={mazeSe}
              aria-label="Smazat"
              title="Smazat"
              className={fotkyLightboxIkona}
            >
              <IkonaKos />
            </button>
          ) : null}
          <button
            ref={zavritRef}
            type="button"
            onClick={() => zavriRef.current()}
            disabled={drzOtevrene}
            aria-label="Zavřít fotku"
            title={drzOtevrene ? "Nejdřív dokonči potvrzení" : undefined}
            className={`${fotkyLightboxIkona} text-xl font-extrabold leading-none`}
          >
            <span aria-hidden="true">×</span>
          </button>
          </div>
          {isAdmin && jeKos && onObnovitAktualni !== undefined ? (
            <button
              type="button"
              onClick={onObnovitAktualni}
              disabled={mazeSe}
              className={tlacitkoAkce}
            >
              Obnovit
            </button>
          ) : null}
        </div>
        <LightboxInfo stav={prohlizeni} />
      </div>
      <div
        data-lightbox-jeviste
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-16"
        onMouseDown={naPozadi}
      >
        {rozbita || src.length === 0 ? (
          <p
            role="status"
            onMouseDown={zastav}
            className="rounded-md border border-linka bg-papir px-4 py-3 text-sm font-semibold text-inkoust"
          >
            Fotku se nepodařilo načíst.
          </p>
        ) : (
          <PostupnaFotka
            prednost
            zamlzeni
            src={src}
            alt={`Fotka ${index + 1} z ${fotky.length}, album ${album.nazev}`}
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

function IkonaKos(): JSX.Element {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4.5 7h15M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7M7 7l.8 12.2A1.2 1.2 0 0 0 9 20.2h6a1.2 1.2 0 0 0 1.2-1L17 7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
