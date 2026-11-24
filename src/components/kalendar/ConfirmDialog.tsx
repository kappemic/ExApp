import {
  useEffect,
  useId,
  useRef,
  type JSX,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { zamkniPosuv } from "../../lib/zamek-posuvu";
import { useOdchod, zmizeniDialogu } from "../../lib/pohyb";

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
  /** Extra class on the portaled layer. Preview uses it for press easing. */
  trida?: string;
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
    const odemkniPosuv = zamkniPosuv();

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
      odemkniPosuv();
      const navrat: HTMLElement | null = navratRef.current;
      if (navrat !== null && navrat.isConnected) {
        navrat.focus();
      } else if (predchozi instanceof HTMLElement && predchozi.isConnected) {
        predchozi.focus();
      }
    };
  }, [otevreno]);

  const korenRef = useRef<HTMLDivElement>(null);
  useOdchod(korenRef, otevreno, zmizeniDialogu);

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
      ref={korenRef}
      data-confirm-dialog-portal=""
      className={`nocturne nahled-modal fixed inset-0 ${vrstvaTrida} flex items-end justify-center p-4 sm:items-center${
        props.trida !== undefined && props.trida.length > 0 ? ` ${props.trida}` : ""
      }`}
      onMouseDown={naKlikBackdropu}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={nadpisId}
        aria-describedby={popisId}
        className="max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-[20px] border border-linka bg-povrch text-inkoust shadow-modal"
      >
        <div className="flex flex-col gap-3 px-5 pb-5 pt-5 min-[90rem]:px-[22px]">
        <h2
          id={nadpisId}
          className="break-words font-display text-xl font-bold tracking-[-0.4px] min-[90rem]:text-[19px] min-[90rem]:tracking-[-0.5px]"
        >
          {nadpis}
        </h2>

        <p
          id={popisId}
          className="break-words text-[13.5px] leading-5 text-mech min-[90rem]:text-[12.5px] min-[90rem]:leading-[18px]"
        >
          {popis}
        </p>

        {nabidnoutRozsah && props.onZmenaRozsahu !== undefined && (
          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-3">Co odebrat?</legend>
            <div className="mt-2 flex flex-col gap-2">
              <label
                className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors motion-reduce:transition-none ${
                  zvolenyRozsah === "vyskyt"
                    ? "border-smrk bg-mlha"
                    : "border-transparent bg-papir"
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
                <span className="min-w-0 flex-1 break-words text-[13.5px] font-semibold">
                  {vyskytPopisek}
                </span>
              </label>
              <label
                className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors motion-reduce:transition-none ${
                  zvolenyRozsah === "rada"
                    ? "border-smrk bg-mlha"
                    : "border-transparent bg-papir"
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
                <span className="min-w-0 flex-1 break-words text-[13.5px] font-semibold">
                  {radaPopisek}
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {chyba !== null && chyba.trim().length > 0 && (
          <p
            role="alert"
            className="break-words rounded-[10px] bg-[#fbede7] p-3 text-[13px] leading-[18px] text-[#7a3a1b]"
          >
            {chyba}
          </p>
        )}

        </div>
        <div className="flex gap-2.5 px-5 pb-5 min-[90rem]:justify-end min-[90rem]:rounded-b-[20px] min-[90rem]:border-t min-[90rem]:border-linka min-[90rem]:bg-zahlavi min-[90rem]:px-[22px] min-[90rem]:py-3.5">
          <button
            ref={zrusitRef}
            type="button"
            onClick={onZrusit}
            disabled={probiha}
            title={probiha ? "Mazání probíhá…" : zrusitPopisek}
            className="nahled-press inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-linka bg-papir px-4 py-2 text-center text-sm font-semibold text-mech hover:bg-povrch-2 min-[90rem]:min-h-10 min-[90rem]:rounded-[10px] min-[90rem]:bg-transparent min-[90rem]:text-[13px] focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 min-[90rem]:flex-none [touch-action:manipulation]"
          >
            {zrusitPopisek}
          </button>
          <button
            type="button"
            onClick={onPotvrdit}
            disabled={probiha}
            title={probiha ? "Mazání probíhá…" : potvrditPopisek}
            className="nahled-press inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-akcent px-4 py-2 text-center text-sm font-semibold text-papir hover:opacity-90 min-[90rem]:min-h-10 min-[90rem]:rounded-[10px] min-[90rem]:text-[13px] focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-wait disabled:opacity-60 min-[90rem]:flex-none [touch-action:manipulation]"
          >
            {probiha ? probihaPopisek : potvrditPopisek}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
