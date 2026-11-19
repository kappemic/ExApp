import {
  useEffect,
  useId,
  useRef,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Ikona from "../Ikona";

const FOCUSOVATELNE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Patička panelu podle ExApp.pen. Telefon: dvojice tlačítek 48 px přes celou
 * šířku. Počítač: teplá lišta s linkou, tlačítka 40 px zarovnaná vpravo.
 * Patří jako poslední prvek obsahu panelu (lepí se ke spodnímu okraji).
 */
export const PATICKA_SHEETU =
  "sticky bottom-0 z-10 -mx-5 mt-1 flex gap-2.5 bg-povrch px-5 pb-1 pt-3 [&>button]:h-12 [&>button]:min-h-0 [&>button]:flex-1 [&>button]:rounded-xl [&>button]:text-sm [&>button]:font-semibold min-[90rem]:-mx-[22px] min-[90rem]:-mb-5 min-[90rem]:mt-2 min-[90rem]:justify-end min-[90rem]:border-t min-[90rem]:border-linka min-[90rem]:bg-[#fbf8ef] min-[90rem]:px-[22px] min-[90rem]:py-3.5 min-[90rem]:[&>button]:h-10 min-[90rem]:[&>button]:flex-none min-[90rem]:[&>button]:rounded-[10px] min-[90rem]:[&>button]:px-4 min-[90rem]:[&>button]:text-[13px]";

/** Sekundární tlačítko v patičce (Zrušit). */
export const TLACITKO_PATICKY_ZRUSIT =
  "nahled-press inline-flex items-center justify-center border border-linka bg-papir text-mech hover:bg-povrch-2 disabled:opacity-60 min-[90rem]:bg-transparent";

/** Hlavní tlačítko v patičce. */
export const TLACITKO_PATICKY_HLAVNI =
  "nahled-press inline-flex items-center justify-center whitespace-nowrap bg-smrk text-papir hover:opacity-90 disabled:opacity-60";

type SpodniSheetProps = {
  otevreno: boolean;
  titulek: string;
  onZavrit: () => void;
  children: ReactNode;
};

/** Bottom sheet. Reduced motion drops the slide class so DevTools can see it. */
export default function SpodniSheet({
  otevreno,
  titulek,
  onZavrit,
  children,
}: SpodniSheetProps): JSX.Element | null {
  const titulekId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onZavritRef = useRef(onZavrit);
  onZavritRef.current = onZavrit;

  useEffect(() => {
    if (!otevreno) return;
    const predchozi: Element | null = document.activeElement;
    const koren = dialogRef.current;
    koren?.querySelector<HTMLElement>("button")?.focus();
    const puvodniOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function naKlavesu(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onZavritRef.current();
        return;
      }
      if (event.key !== "Tab" || koren === null) return;
      const prvky = Array.from(koren.querySelectorAll<HTMLElement>(FOCUSOVATELNE));
      if (prvky.length === 0) return;
      const prvni = prvky[0];
      const posledni = prvky[prvky.length - 1];
      if (event.shiftKey && document.activeElement === prvni) {
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
      document.body.style.overflow = puvodniOverflow;
      if (predchozi instanceof HTMLElement && predchozi.isConnected) {
        predchozi.focus();
      }
    };
  }, [otevreno]);

  if (!otevreno || typeof document === "undefined") return null;

  const bezPohybu = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sirkaDesktop = window.matchMedia("(min-width: 1440px)").matches;

  return createPortal(
    <div className="nocturne fixed inset-0 z-50 flex items-end justify-center min-[90rem]:items-center">
      <button
        type="button"
        aria-label="Zavřít pozadí"
        className="exapp-zavoj absolute inset-0 bg-inkoust/55"
        onClick={onZavrit}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulekId}
        className={`relative z-10 flex max-h-[88dvh] w-full flex-col bg-povrch px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))] pt-2 text-inkoust shadow-panel max-[90rem]:max-w-lg max-[90rem]:rounded-t-[24px] min-[90rem]:max-h-[min(85dvh,760px)] min-[90rem]:w-full min-[90rem]:max-w-[540px] min-[90rem]:rounded-[20px] min-[90rem]:border min-[90rem]:border-linka min-[90rem]:px-[22px] min-[90rem]:pb-5 min-[90rem]:pt-0 min-[90rem]:shadow-modal ${
          sirkaDesktop || bezPohybu ? "exapp-sheet-bez-pohybu" : "exapp-sheet"
        }`}
      >
        <span aria-hidden="true" className="flex h-4 shrink-0 items-center justify-center min-[90rem]:hidden">
          <span className="block h-[5px] w-10 rounded-full bg-[#b8b39c]" />
        </span>
        <div className="mb-[18px] mt-1 flex items-center justify-between gap-3 min-[90rem]:-mr-0.5 min-[90rem]:mb-4 min-[90rem]:mt-0 min-[90rem]:pt-5">
          <h2
            id={titulekId}
            className="font-display text-2xl font-bold leading-tight tracking-[-0.4px] min-[90rem]:text-[19px] min-[90rem]:tracking-[-0.5px]"
          >
            {titulek}
          </h2>
          <button
            type="button"
            onClick={onZavrit}
            aria-label="Zavřít"
            className="nahled-press -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-[9px] text-mech min-[90rem]:mr-0 min-[90rem]:size-[30px] min-[90rem]:bg-povrch-2 min-[90rem]:hover:bg-linka"
          >
            <Ikona nazev="x" className="size-[18px] min-[90rem]:size-[15px]" />
          </button>
        </div>
        <div className="posuvnik -mx-5 min-h-0 overflow-y-auto px-5 min-[90rem]:-mx-[22px] min-[90rem]:px-[22px]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
