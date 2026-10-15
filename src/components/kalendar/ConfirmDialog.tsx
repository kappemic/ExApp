import {
  useEffect,
  useId,
  useRef,
  type JSX,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

/**
 * Rozsah smazání opakované schůzky — KROK 3 (výjimka pro jeden výskyt).
 * Dnes dialog volbu nezobrazuje (`rozsah` se nepředává = smazání celé schůzky),
 * KROK 3 předá `rozsah` + `onZmenaRozsahu` a backendu pošle zvolenou hodnotu.
 */
export type RozsahSmazaniSchuzky = "vyskyt" | "rada";

export interface ConfirmDialogProps {
  /** `false` = nic se nevykreslí (pojistka; rodič typicky podmíněně renderuje). */
  otevreno: boolean;
  nadpis: string;
  popis: string;
  potvrditPopisek?: string;
  zrusitPopisek?: string;
  /** Mazání právě běží — obě tlačítka disabled, Esc i backdrop ignorovány. */
  probiha?: boolean;
  probihaPopisek?: string;
  chyba?: string | null;
  /**
   * KROK 3: předaný `rozsah` (+ `onZmenaRozsahu`) zobrazí radiogroup
   * „Jen tento výskyt / Celá opakovaná řada". Dnes `undefined` = bez volby.
   */
  rozsah?: RozsahSmazaniSchuzky | null;
  onZmenaRozsahu?: (novy: RozsahSmazaniSchuzky) => void;
  vyskytPopisek?: string;
  radaPopisek?: string;
  /** Prvek, kam se po zavření vrátí fokus (typicky tlačítko, které dialog otevřelo). */
  navratElement?: HTMLElement | null;
  /**
   * Photo lightboxes portal to body at z-[100]; default confirm stays at z-[60].
   * Use `nad-lightboxem` when confirm opens while a lightbox is still mounted (portaled at z-[200]).
   */
  vrstva?: "normal" | "nad-lightboxem";
  onPotvrdit: () => void;
  onZrusit: () => void;
}

const FOCUSOVATELNE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ConfirmDialog — česky přístupný potvrzovací dialog v deníkových tokenech
 * (papír, inkoust, smrk, linka, jantar).
 * role="alertdialog" + aria-modal, focus-trap, Esc, zamknutí scrollu,
 * návrat fokusu na `navratElement` (fallback: prvek aktivní před otevřením),
 * obě tlačítka 44px+, texty se zalamují (`break-words`, žádná fixní šířka).
 * Destruktivní akce zůstává na „Ano" — výchozí fokus drží bezpečné „Ponechat".
 */
export default function ConfirmDialog(
  props: ConfirmDialogProps,
): JSX.Element | null {
  const {
    otevreno,
    nadpis,
    popis,
    onPotvrdit,
    onZrusit,
  } = props;
  const potvrditPopisek = props.potvrditPopisek ?? "Ano, odebrat";
  const zrusitPopisek = props.zrusitPopisek ?? "Ponechat";
  const probiha = props.probiha ?? false;
  const probihaPopisek = props.probihaPopisek ?? "Mažu…";
  const chyba = props.chyba ?? null;
  const vyskytPopisek = props.vyskytPopisek ?? "Jen tento výskyt";
  const radaPopisek = props.radaPopisek ?? "Celá opakovaná řada";

  const nadpisId = useId();
  const popisId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const zrusitRef = useRef<HTMLButtonElement>(null);

  const onZrusitRef = useRef(onZrusit);
  onZrusitRef.current = onZrusit;
  const probihaRef = useRef(probiha);
  probihaRef.current = probiha;
  const navratRef = useRef<HTMLElement | null>(props.navratElement ?? null);
  navratRef.current = props.navratElement ?? null;

  /* Focus-trap + Esc + zámek scrollu + návrat fokusu. Běží jen za otevřena. */
  useEffect(() => {
    if (!otevreno) return;
    const predchozi: Element | null = document.activeElement;
    zrusitRef.current?.focus();
    const puvodniOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        udalost.stopPropagation();
        if (!probihaRef.current) onZrusitRef.current();
        return;
      }
      if (udalost.key !== "Tab") return;
      const koren: HTMLDivElement | null = dialogRef.current;
      if (koren === null) return;
      const prvky: HTMLElement[] = Array.from(
        koren.querySelectorAll<HTMLElement>(FOCUSOVATELNE),
      );
      if (prvky.length === 0) return;
      const prvni: HTMLElement = prvky[0];
      const posledni: HTMLElement = prvky[prvky.length - 1];
      if (udalost.shiftKey && document.activeElement === prvni) {
        udalost.preventDefault();
        posledni.focus();
      } else if (!udalost.shiftKey && document.activeElement === posledni) {
        udalost.preventDefault();
        prvni.focus();
      }
    }

    document.addEventListener("keydown", naStiskKlavesy, true);
    return () => {
      document.removeEventListener("keydown", naStiskKlavesy, true);
      document.body.style.overflow = puvodniOverflow;
      const navrat: HTMLElement | null = navratRef.current;
      if (navrat !== null && navrat.isConnected) {
        navrat.focus();
      } else if (predchozi instanceof HTMLElement && predchozi.isConnected) {
        predchozi.focus();
      }
    };
  }, [otevreno]);

  if (!otevreno || typeof document === "undefined") return null;

  const nabidnoutRozsah: boolean =
    props.rozsah !== null &&
    props.rozsah !== undefined &&
    props.onZmenaRozsahu !== undefined;
  const zvolenyRozsah: RozsahSmazaniSchuzky = props.rozsah ?? "rada";

  function naKlikBackdropu(udalost: MouseEvent<HTMLDivElement>): void {
    if (udalost.target === udalost.currentTarget && !probiha) onZrusit();
  }

  const vrstvaTrida =
    props.vrstva === "nad-lightboxem"
      ? "z-[200]"
      : "z-[60]";

  return createPortal(
    <div
      data-confirm-dialog-portal=""
      className={`fixed inset-0 ${vrstvaTrida} flex items-end justify-center bg-inkoust/60 p-4 sm:items-center`}
      onMouseDown={naKlikBackdropu}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={nadpisId}
        aria-describedby={popisId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border-2 border-inkoust bg-papir p-5 shadow-denik sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-inkoust bg-jantar text-lg font-extrabold leading-none text-papir"
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mech">
              Potvrzení
            </p>
            <h2
              id={nadpisId}
              className="mt-0.5 break-words text-lg font-extrabold tracking-tight"
            >
              {nadpis}
            </h2>
          </div>
        </div>

        <p
          id={popisId}
          className="mt-3 break-words text-sm leading-relaxed text-inkoust/80"
        >
          {popis}
        </p>

        {nabidnoutRozsah && props.onZmenaRozsahu !== undefined && (
          <fieldset className="mt-4">
            <legend className="text-sm font-bold">Co odebrat?</legend>
            <div className="mt-2 space-y-2">
              <label
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border-2 px-3 py-2 transition-colors motion-reduce:transition-none ${
                  zvolenyRozsah === "vyskyt"
                    ? "border-inkoust bg-white/80"
                    : "border-linka bg-white/50"
                }`}
              >
                <input
                  type="radio"
                  name={`rozsah-${nadpisId}`}
                  checked={zvolenyRozsah === "vyskyt"}
                  onChange={() => {
                    if (props.onZmenaRozsahu !== undefined)
                      props.onZmenaRozsahu("vyskyt");
                  }}
                  disabled={probiha}
                  className="h-5 w-5 shrink-0 accent-smrk"
                />
                <span className="min-w-0 flex-1 break-words text-sm font-bold">
                  {vyskytPopisek}
                </span>
              </label>
              <label
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border-2 px-3 py-2 transition-colors motion-reduce:transition-none ${
                  zvolenyRozsah === "rada"
                    ? "border-inkoust bg-white/80"
                    : "border-linka bg-white/50"
                }`}
              >
                <input
                  type="radio"
                  name={`rozsah-${nadpisId}`}
                  checked={zvolenyRozsah === "rada"}
                  onChange={() => {
                    if (props.onZmenaRozsahu !== undefined)
                      props.onZmenaRozsahu("rada");
                  }}
                  disabled={probiha}
                  className="h-5 w-5 shrink-0 accent-smrk"
                />
                <span className="min-w-0 flex-1 break-words text-sm font-bold">
                  {radaPopisek}
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {chyba !== null && chyba.trim().length > 0 && (
          <p
            role="alert"
            className="mt-3 break-words rounded-md border-2 border-red-800 bg-red-50 px-3 py-2 text-sm font-bold text-red-900"
          >
            {chyba}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={zrusitRef}
            type="button"
            onClick={onZrusit}
            disabled={probiha}
            title={probiha ? "Mazání probíhá…" : zrusitPopisek}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md border-2 border-inkoust bg-papir px-5 py-2 text-center text-sm font-bold shadow-denik transition-colors hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 motion-reduce:transition-none sm:flex-none [touch-action:manipulation]"
          >
            {zrusitPopisek}
          </button>
          <button
            type="button"
            onClick={onPotvrdit}
            disabled={probiha}
            title={probiha ? "Mazání probíhá…" : potvrditPopisek}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md border-2 border-red-800 bg-red-800 px-5 py-2 text-center text-sm font-bold text-papir shadow-denik transition-colors hover:bg-red-900 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none sm:flex-none [touch-action:manipulation]"
          >
            {probiha ? probihaPopisek : potvrditPopisek}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
