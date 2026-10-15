import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { nactiFotky, urlSouboruFotky, type ApiFotka } from "../../lib/expedition-fotky";
import FotkyMazaciHlavicka from "../fotky/FotkyMazaciHlavicka";
import FotkyLightboxNav from "../fotky/FotkyLightboxNav";
import { fotkyHoverBgLinka, fotkyHoverOpacity, fotkyTlacitkoZaklad } from "../fotky/fotky-ui";

const FOCUSOVATELNE =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const TLACITKO_KRUH = `${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} ${fotkyHoverOpacity} rounded-full border-2 border-inkoust bg-papir text-inkoust`;

let otevreneLightboxy = 0;

/** True while a photo lightbox is mounted (Escape must not close the page under it). */
export function jeFotkyLightboxOtevreny(): boolean {
  return otevreneLightboxy > 0;
}

export interface FotkyLightboxProps {
  expeditionId: string;
  pocatecniId: string;
  /**
   * Photos of this expedition, oldest first. `null` loads them here
   * so a caller can open the lightbox before the gallery has fetched.
   */
  fotky: readonly ApiFotka[] | null;
  onZavrit: () => void;
  /** Highlight control is rendered only for an admin. */
  isAdmin: boolean;
  nastavujeNahled: boolean;
  nahledChyba: string | null;
  onHighlight: (fotkaId: string) => void;
  mazaciRezim?: boolean;
  mazeSe?: boolean;
  vybranyPocet?: number;
  onZacniMazani?: () => void;
  onZrusMazani?: () => void;
  onSmazatVybrane?: () => void;
  onSmazatVse?: () => void;
}

/**
 * Full-bleed photo of one expedition. Diary chrome (papír / inkoust),
 * previous and next stay on this expedition, Escape closes.
 */
export default function FotkyLightbox({
  expeditionId,
  pocatecniId,
  fotky,
  onZavrit,
  isAdmin,
  nastavujeNahled,
  nahledChyba,
  onHighlight,
  mazaciRezim = false,
  mazeSe = false,
  vybranyPocet = 0,
  onZacniMazani,
  onZrusMazani,
  onSmazatVybrane,
  onSmazatVse,
}: FotkyLightboxProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const zavritRef = useRef<HTMLButtonElement>(null);
  const delkaRef = useRef<number>(1);
  const onZavritRef = useRef(onZavrit);
  const onZrusMazaniRef = useRef(onZrusMazani);
  const mazaciRezimRef = useRef(mazaciRezim);
  onZavritRef.current = onZavrit;
  onZrusMazaniRef.current = onZrusMazani;
  mazaciRezimRef.current = mazaciRezim;

  const [seznam, setSeznam] = useState<ApiFotka[]>(() =>
    fotky === null ? [prazdnaFotka(expeditionId, pocatecniId)] : [...fotky],
  );
  const [index, setIndex] = useState<number>(() =>
    indexFotky(fotky === null ? [pocatecniId] : fotky.map((fotka) => fotka.id), pocatecniId),
  );
  const [rozbita, setRozbita] = useState<boolean>(false);
  /** Photo kept in view when the parent refreshes the list (highlight, delete). */
  const drzenaIdRef = useRef<string>(pocatecniId);
  const viditelna = seznam[index];
  if (viditelna !== undefined) drzenaIdRef.current = viditelna.id;

  useEffect(() => {
    if (fotky !== null) {
      if (fotky.length === 0) {
        onZavritRef.current();
        return;
      }
      const cil =
        fotky.some((fotka) => fotka.id === drzenaIdRef.current)
          ? drzenaIdRef.current
          : pocatecniId;
      setSeznam([...fotky]);
      setIndex(indexFotky(fotky.map((fotka) => fotka.id), cil));
      return;
    }
    let zive = true;
    void nactiFotky(expeditionId).then((vysledek) => {
      if (!zive) return;
      if (!vysledek.ok || vysledek.data.fotky.length === 0) return;
      setSeznam(vysledek.data.fotky);
      setIndex(indexFotky(vysledek.data.fotky.map((fotka) => fotka.id), pocatecniId));
    });
    return () => {
      zive = false;
    };
  }, [expeditionId, fotky, pocatecniId]);

  delkaRef.current = seznam.length;

  const zavrit = useCallback((): void => {
    onZavritRef.current();
  }, []);

  useLayoutEffect(() => {
    otevreneLightboxy += 1;
    const predchoziFocus: Element | null = document.activeElement;
    const puvodniOverflow: string = document.body.style.overflow;
    if (puvodniOverflow !== "hidden") document.body.style.overflow = "hidden";
    if (mazaciRezimRef.current) {
      const koren: HTMLDivElement | null = dialogRef.current;
      const prvni: HTMLElement | null =
        koren?.querySelector<HTMLElement>(FOCUSOVATELNE) ?? null;
      prvni?.focus();
    } else {
      zavritRef.current?.focus();
    }

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        udalost.preventDefault();
        udalost.stopPropagation();
        if (mazaciRezimRef.current && onZrusMazaniRef.current !== undefined) {
          onZrusMazaniRef.current();
          return;
        }
        zavrit();
        return;
      }
      if (udalost.key === "ArrowLeft") {
        udalost.preventDefault();
        setIndex((aktualni) => (aktualni > 0 ? aktualni - 1 : aktualni));
        return;
      }
      if (udalost.key === "ArrowRight") {
        udalost.preventDefault();
        setIndex((aktualni) =>
          aktualni < delkaRef.current - 1 ? aktualni + 1 : aktualni,
        );
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

    window.addEventListener("keydown", naStiskKlavesy, true);
    return () => {
      otevreneLightboxy = Math.max(0, otevreneLightboxy - 1);
      window.removeEventListener("keydown", naStiskKlavesy, true);
      if (puvodniOverflow !== "hidden") document.body.style.overflow = puvodniOverflow;
      if (predchoziFocus instanceof HTMLElement) predchoziFocus.focus();
    };
  }, [zavrit]);

  useLayoutEffect(() => {
    if (mazaciRezimRef.current) {
      const koren: HTMLDivElement | null = dialogRef.current;
      const prvni: HTMLElement | null =
        koren?.querySelector<HTMLElement>(FOCUSOVATELNE) ?? null;
      prvni?.focus();
    } else {
      zavritRef.current?.focus();
    }
  }, [mazaciRezim]);

  useEffect(() => {
    setRozbita(false);
  }, [index]);

  if (typeof document === "undefined") return null;

  const aktualni: ApiFotka | undefined = seznam[index];
  if (aktualni === undefined) return null;
  const pocet: number = seznam.length;
  const maPredchozi: boolean = index > 0;
  const maDalsi: boolean = index < pocet - 1;

  function zastav(udalost: MouseEvent): void {
    udalost.stopPropagation();
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Fotka z výpravy"
      className="fixed inset-0 z-[100] flex flex-col overscroll-contain bg-inkoust/85"
      onMouseDown={zavrit}
    >
      <div
        className={`flex gap-3 border-b-2 border-inkoust bg-papir px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-inkoust ${
          mazaciRezim ? "flex-col items-stretch" : "items-center justify-between"
        }`}
        onMouseDown={zastav}
      >
        <p className="text-sm font-bold tabular-nums">
          {index + 1} / {pocet}
        </p>
        <div
          className={
            mazaciRezim
              ? "flex w-full min-w-0 flex-col gap-2"
              : "flex flex-wrap items-center justify-end gap-2"
          }
        >
          {aktualni.jeNahled ? (
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-smrk">
              Náhled
            </p>
          ) : null}
          {isAdmin && !aktualni.jeNahled && !mazaciRezim ? (
            <button
              type="button"
              onClick={() => onHighlight(aktualni.id)}
              disabled={nastavujeNahled}
              className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} ${fotkyHoverOpacity} rounded-full border-2 border-inkoust bg-papir px-4 text-sm font-bold text-inkoust disabled:opacity-60`}
            >
              {nastavujeNahled ? "Ukládám…" : "Nastavit náhled"}
            </button>
          ) : null}
          {onZacniMazani !== undefined &&
          onZrusMazani !== undefined &&
          onSmazatVybrane !== undefined &&
          onSmazatVse !== undefined ? (
            <FotkyMazaciHlavicka
              isAdmin={isAdmin}
              maFotky={seznam.length > 0}
              mazaciRezim={mazaciRezim}
              vybranyPocet={vybranyPocet}
              mazeSe={mazeSe}
              onZacniMazani={onZacniMazani}
              onZrusMazani={onZrusMazani}
              onSmazatVybrane={onSmazatVybrane}
              onSmazatVse={onSmazatVse}
            />
          ) : null}
          {!mazaciRezim ? (
            <button
              ref={zavritRef}
              type="button"
              onClick={zavrit}
              aria-label="Zavřít fotku"
              className={`${TLACITKO_KRUH} text-xl font-extrabold leading-none`}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      </div>
      {nahledChyba !== null ? (
        <p
          role="alert"
          onMouseDown={zastav}
          className="border-b-2 border-inkoust bg-papir px-3 py-2 text-sm font-semibold text-red-800"
        >
          {nahledChyba}
        </p>
      ) : null}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center pb-[env(safe-area-inset-bottom)]"
        onMouseDown={zavrit}
      >
        {rozbita ? (
          <p
            role="status"
            onMouseDown={zastav}
            className="rounded-md border-2 border-inkoust bg-papir px-4 py-3 text-sm font-semibold text-inkoust"
          >
            Fotku se nepodařilo načíst.
          </p>
        ) : (
          <img
            src={urlSouboruFotky(expeditionId, aktualni.id)}
            alt="Fotka z výpravy"
            className="max-h-full max-w-full object-contain"
            onMouseDown={zastav}
            onError={() => setRozbita(true)}
          />
        )}
        <FotkyLightboxNav
          maPredchozi={maPredchozi}
          maDalsi={maDalsi}
          onMouseDownZastav={zastav}
          onPredchozi={() => {
            setIndex((aktualniIndex) => aktualniIndex - 1);
          }}
          onDalsi={() => {
            setIndex((aktualniIndex) => aktualniIndex + 1);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

function prazdnaFotka(expeditionId: string, fotkaId: string): ApiFotka {
  return {
    id: fotkaId,
    expeditionId,
    url: "",
    popis: "",
    createdAt: "",
    jeNahled: false,
  };
}

function indexFotky(ids: readonly string[], pocatecniId: string): number {
  const nalezeno = ids.indexOf(pocatecniId);
  return nalezeno < 0 ? 0 : nalezeno;
}
