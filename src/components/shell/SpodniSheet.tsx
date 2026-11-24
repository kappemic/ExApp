import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { KRIVKA_PANELU, useOdchod } from "../../lib/pohyb";
import { zamkniPosuv } from "../../lib/zamek-posuvu";
import Ikona from "../Ikona";

const FOCUSOVATELNE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Patička panelu podle ExApp.pen. Telefon: dvojice tlačítek 48 px přes celou
 * šířku. Počítač: teplá lišta s linkou, tlačítka 40 px zarovnaná vpravo.
 * Patří jako poslední prvek obsahu panelu (lepí se ke spodnímu okraji).
 */
export const PATICKA_SHEETU =
  "paticka-sheetu sticky bottom-0 z-10 -mx-5 flex gap-2.5 bg-povrch px-5 pt-[18px] [&>button]:h-12 [&>button]:min-h-0 [&>button]:flex-1 [&>button]:rounded-xl [&>button]:px-3 [&>button]:text-sm [&>button]:font-semibold min-[90rem]:-mx-[22px] min-[90rem]:mt-5 min-[90rem]:justify-end min-[90rem]:border-t min-[90rem]:border-linka min-[90rem]:bg-zahlavi min-[90rem]:px-[22px] min-[90rem]:py-3.5 min-[90rem]:[&>button]:h-10 min-[90rem]:[&>button]:flex-none min-[90rem]:[&>button]:rounded-[10px] min-[90rem]:[&>button]:px-4 min-[90rem]:[&>button]:text-[13px]";

/** Sekundární tlačítko v patičce (Zrušit). */
export const TLACITKO_PATICKY_ZRUSIT =
  "nahled-press inline-flex items-center justify-center border border-linka bg-papir text-mech hover:bg-povrch-2 disabled:opacity-60 min-[90rem]:bg-transparent";

/** Mazání a rušení v patičce: telefon jako sekundární, počítač růžové s terakotou. */
export const TLACITKO_PATICKY_ODEBRAT =
  "nahled-press inline-flex items-center justify-center whitespace-nowrap border border-linka bg-papir text-mech hover:bg-povrch-2 disabled:opacity-60 min-[90rem]:border-transparent min-[90rem]:bg-[#fbede7] min-[90rem]:text-akcent";

/** Nevratná akce v patičce (Smazat). */
export const TLACITKO_PATICKY_SMAZAT =
  "nahled-press inline-flex items-center justify-center whitespace-nowrap bg-akcent text-papir hover:opacity-90 disabled:opacity-60";

/** Nadpis oddílu uvnitř panelu („DALŠÍ TERMÍNY“). */
export const NADPIS_ODDILU_PANELU =
  "text-[11px] font-bold uppercase tracking-[0.8px] text-ink-3 min-[90rem]:text-[10px] min-[90rem]:tracking-[1.1px]";

/** Obsah panelu: mezera 18 px na telefonu, 14 px na počítači. */
export const OBSAH_PANELU = "flex flex-col gap-[18px] min-[90rem]:gap-3.5";

/** Hlavní tlačítko v patičce. */
export const TLACITKO_PATICKY_HLAVNI =
  "nahled-press inline-flex items-center justify-center whitespace-nowrap bg-smrk text-papir hover:opacity-90 disabled:opacity-60";

type SpodniSheetProps = {
  otevreno: boolean;
  titulek: string;
  /** Řádek pod nadpisem, třeba název výpravy a datum. */
  podtitul?: ReactNode;
  /** Vlevo od nadpisu, třeba fotka člena. */
  vlevo?: ReactNode;
  /** Panel se otevírá nad jiným dialogem (karta člena v detailu výpravy). */
  nadDialogem?: boolean;
  /** Šířka okna na počítači v px. */
  sirka?: 420 | 440 | 480 | 520 | 540 | 560;
  onZavrit: () => void;
  children: ReactNode;
};

/** Od tabletu je panel okno uprostřed, spodní panel zůstává telefonu. */
const POCITAC = "(min-width: 48rem)";

/** Telefon: panel sjede dolů z místa, kde ho prst pustil. Počítač: okno se ztratí na místě. */
function zmizeniPanelu(uzel: HTMLElement): Animation[] {
  const zavoj = uzel.querySelector<HTMLElement>("[data-zavoj]");
  const panel = uzel.querySelector<HTMLElement>('[role="dialog"]');
  const pocitac = window.matchMedia(POCITAC).matches;
  const volby: KeyframeAnimationOptions = pocitac
    ? { duration: 150, easing: "ease-out", fill: "forwards" }
    : { duration: 240, easing: KRIVKA_PANELU, fill: "forwards" };
  const animace: Animation[] = [];
  if (zavoj !== null) animace.push(zavoj.animate([{ opacity: getComputedStyle(zavoj).opacity }, { opacity: 0 }], volby));
  if (panel !== null) {
    const od = getComputedStyle(panel).transform;
    animace.push(
      pocitac
        ? panel.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px) scale(0.98)" }], volby)
        : panel.animate([{ transform: od }, { transform: "translateY(100%)" }], volby),
    );
  }
  return animace;
}

/** Stažení panelu prstem za úchyt nebo nadpis (jen telefon). */
function useStazeni(
  korenRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  onZavrit: () => void,
): Pick<HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onClickCapture"> {
  const tah = useRef<{ id: number; od: number; y: number; cas: number; rychlost: number; hnul: boolean } | null>(null);
  const potlacKlik = useRef(false);

  function nastav(posun: number): void {
    const panel = panelRef.current;
    if (panel === null) return;
    // Nahoru jen pružně, panel výš nepatří.
    const y = posun > 0 ? posun : -Math.sqrt(-posun) * 1.5;
    panel.style.transition = "none";
    panel.style.transform = `translateY(${y}px)`;
    const zavoj = korenRef.current?.querySelector<HTMLElement>("[data-zavoj]");
    if (zavoj) zavoj.style.opacity = String(1 - Math.min(0.75, Math.max(0, y) / panel.offsetHeight));
  }

  function pust(event: ReactPointerEvent<HTMLDivElement>, zruseno: boolean): void {
    const stav = tah.current;
    if (stav === null || stav.id !== event.pointerId) return;
    tah.current = null;
    const panel = panelRef.current;
    if (!stav.hnul || panel === null) return;
    potlacKlik.current = true;
    window.setTimeout(() => {
      potlacKlik.current = false;
    }, 0);
    const posun = stav.y - stav.od;
    if (!zruseno && posun > 0 && (stav.rychlost > 0.5 || posun > panel.offsetHeight * 0.35)) {
      onZavrit();
      return;
    }
    panel.style.transition = `transform 260ms ${KRIVKA_PANELU}`;
    panel.style.transform = "";
    const zavoj = korenRef.current?.querySelector<HTMLElement>("[data-zavoj]");
    if (zavoj) zavoj.style.opacity = "";
  }

  return {
    onPointerDown: (event) => {
      if (event.button !== 0 || window.matchMedia(POCITAC).matches) return;
      tah.current = { id: event.pointerId, od: event.clientY, y: event.clientY, cas: event.timeStamp, rychlost: 0, hnul: false };
    },
    onPointerMove: (event) => {
      const stav = tah.current;
      if (stav === null || stav.id !== event.pointerId) return;
      const dt = event.timeStamp - stav.cas;
      if (dt > 0) stav.rychlost = (event.clientY - stav.y) / dt;
      stav.y = event.clientY;
      stav.cas = event.timeStamp;
      const posun = event.clientY - stav.od;
      if (!stav.hnul) {
        if (Math.abs(posun) < 6) return;
        stav.hnul = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      nastav(posun);
    },
    onPointerUp: (event) => pust(event, false),
    onPointerCancel: (event) => pust(event, true),
    onClickCapture: (event) => {
      if (!potlacKlik.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** Spodní panel: na telefonu vyjede zespodu a jde stáhnout, na počítači okno uprostřed. */
export default function SpodniSheet({
  otevreno,
  titulek,
  podtitul,
  vlevo,
  nadDialogem = false,
  sirka = 540,
  onZavrit,
  children,
}: SpodniSheetProps): JSX.Element | null {
  const titulekId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const korenRef = useRef<HTMLDivElement>(null);
  const onZavritRef = useRef(onZavrit);
  onZavritRef.current = onZavrit;
  useOdchod(korenRef, otevreno, zmizeniPanelu);
  const stazeni = useStazeni(korenRef, dialogRef, onZavrit);

  useEffect(() => {
    if (!otevreno) return;
    const predchozi: Element | null = document.activeElement;
    const koren = dialogRef.current;
    koren?.focus();
    const odemkniPosuv = zamkniPosuv();

    function naKlavesu(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onZavritRef.current();
        return;
      }
      if (event.key !== "Tab" || koren === null) return;
      const prvky = Array.from(koren.querySelectorAll<HTMLElement>(FOCUSOVATELNE)).filter(
        (prvek) => prvek.offsetParent !== null || prvek === document.activeElement,
      );
      if (prvky.length === 0) return;
      const prvni = prvky[0];
      const posledni = prvky[prvky.length - 1];
      if (event.shiftKey && (document.activeElement === prvni || document.activeElement === koren)) {
        event.preventDefault();
        posledni.focus();
      } else if (!event.shiftKey && document.activeElement === posledni) {
        event.preventDefault();
        prvni.focus();
      }
    }

    document.addEventListener("keydown", naKlavesu);
    return () => {
      document.removeEventListener("keydown", naKlavesu);
      odemkniPosuv();
      if (predchozi instanceof HTMLElement && predchozi.isConnected) {
        predchozi.focus();
      }
    };
  }, [otevreno]);

  if (!otevreno || typeof document === "undefined") return null;

  return createPortal(
    <div ref={korenRef} className={`nocturne fixed inset-0 flex items-end justify-center md:items-center md:p-6 ${nadDialogem ? "z-[80]" : "z-50"}`}>
      <button
        type="button"
        data-zavoj
        tabIndex={-1}
        aria-label="Zavřít pozadí"
        className="exapp-zavoj bez-prejeti absolute inset-0 bg-inkoust/85 md:bg-inkoust/55"
        onClick={onZavrit}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulekId}
        tabIndex={-1}
        style={{ "--sirka-panelu": `${sirka}px`, outline: "none" } as CSSProperties}
        className="exapp-sheet relative z-10 flex max-h-[88dvh] w-full flex-col bg-povrch px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))] pt-2 text-inkoust shadow-panel max-[90rem]:max-w-lg max-md:rounded-t-[24px] md:max-[90rem]:max-w-[34rem] md:max-[90rem]:rounded-[20px] md:max-[90rem]:pb-5 md:max-[90rem]:pt-5 md:max-[90rem]:shadow-modal min-[90rem]:max-h-[min(85dvh,760px)] min-[90rem]:w-full min-[90rem]:max-w-(--sirka-panelu) min-[90rem]:rounded-[20px] min-[90rem]:border min-[90rem]:border-linka min-[90rem]:overflow-hidden min-[90rem]:px-[22px] min-[90rem]:pb-0 min-[90rem]:pt-0 min-[90rem]:shadow-modal"
      >
        <div {...stazeni} className="-mx-5 shrink-0 select-none px-5 max-md:touch-none min-[90rem]:mx-0 min-[90rem]:select-text min-[90rem]:px-0">
        <button
          type="button"
          onClick={onZavrit}
          aria-label="Zavřít"
          className="bez-prejeti relative mx-auto flex h-4 w-24 shrink-0 items-center justify-center rounded-full before:absolute before:-inset-x-4 before:-inset-y-3.5 md:hidden"
        >
          <span aria-hidden="true" className="block h-[5px] w-10 rounded-full bg-[#b8b39c]" />
        </button>
        <div className="mb-[18px] mt-[18px] flex items-start md:mt-0 justify-between gap-3 min-[90rem]:-mr-0.5 min-[90rem]:mb-4 min-[90rem]:mt-0 min-[90rem]:pt-5">
          {vlevo}
          <div className={`flex min-w-0 flex-1 flex-col min-[90rem]:gap-[3px] ${vlevo === undefined ? "gap-[18px]" : "gap-1 self-center"}`}>
            <h2
              id={titulekId}
              className="font-display text-2xl font-bold tracking-[-0.4px] min-[90rem]:text-[19px] min-[90rem]:tracking-[-0.5px]"
            >
              {titulek}
            </h2>
            {podtitul !== undefined && podtitul !== null ? (
              <p className="text-[13.5px] leading-[19px] text-mech min-[90rem]:text-[12.5px] min-[90rem]:leading-[18px] min-[90rem]:text-ink-3">
                {podtitul}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onZavrit}
            aria-label="Zavřít"
            className="nahled-press relative hidden size-9 shrink-0 items-center justify-center rounded-[9px] bg-povrch-2 text-mech before:absolute before:-inset-1 before:content-[''] hover:bg-linka md:inline-flex min-[90rem]:size-[30px]"
          >
            <Ikona nazev="x" className="size-[15px]" />
          </button>
        </div>
        </div>
        <div className="posuvnik -mx-5 min-h-0 overflow-y-auto px-5 min-[90rem]:-mx-[22px] min-[90rem]:px-[22px] min-[90rem]:pb-5 min-[90rem]:has-[.paticka-sheetu]:pb-0">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
