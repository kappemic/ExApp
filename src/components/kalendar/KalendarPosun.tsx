import type { JSX, ReactNode } from "react";
import { useVodorovnyPosun } from "../../hooks/useVodorovnyPosun";

const SIPKA =
  "bez-prejeti flex min-h-[44px] min-w-[36px] items-center justify-center rounded-full text-mech transition-colors motion-reduce:transition-none hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]";

const DNES =
  "bez-prejeti group inline-flex min-h-[44px] items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]";

function Sipka({ smer }: { smer: "vlevo" | "vpravo" }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
      <path d={smer === "vlevo" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

export interface PosunKalendare {
  predchozi: string;
  dalsi: string;
  onPredchozi: () => void;
  onDalsi: () => void;
  onDnes: () => void;
}

/**
 * Hlavička mřížky podle ExApp.pen: „‹ Listopad 2026 ›“ vlevo, „Dnes“ vpravo,
 * jeden řádek i na telefonu. Přepínač měsíc/týden je pod ní (od `lg` vedle).
 */
export function KalendarHlavicka({
  nadpis,
  prepinac,
  posun,
  velkePismeno = false,
}: {
  nadpis: ReactNode;
  prepinac?: ReactNode;
  posun: PosunKalendare;
  velkePismeno?: boolean;
}): JSX.Element {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 min-[90rem]:hidden">
      <div className="flex min-w-0 items-center gap-1">
        <button type="button" title={posun.predchozi} aria-label={posun.predchozi} onClick={posun.onPredchozi} className={`${SIPKA} -ml-2.5 shrink-0`}>
          <Sipka smer="vlevo" />
        </button>
        <h2
          className={`min-w-0 truncate text-center text-base font-bold tabular-nums text-inkoust ${
            velkePismeno ? "first-letter:uppercase" : ""
          }`}
        >
          {nadpis}
        </h2>
        <button type="button" title={posun.dalsi} aria-label={posun.dalsi} onClick={posun.onDalsi} className={`${SIPKA} shrink-0`}>
          <Sipka smer="vpravo" />
        </button>
        <button type="button" onClick={posun.onDnes} className={`${DNES} ml-auto shrink-0`}>
          <span className="inline-flex h-8 items-center rounded-full bg-mlha px-3 text-[12.5px] font-semibold text-smrk group-hover:bg-linka">
            Dnes
          </span>
        </button>
      </div>
      {prepinac !== undefined ? <div className="min-w-0">{prepinac}</div> : null}
    </div>
  );
}

/** Month or week grid. A horizontal touch drag changes the period; vertical pan scrolls the page. */
export function KalendarPlocha({
  ariaLabel,
  onPosun,
  children,
}: {
  ariaLabel: string;
  onPosun: (smer: -1 | 1) => void;
  children: ReactNode;
}): JSX.Element {
  const posun = useVodorovnyPosun(onPosun);
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="kalendar-plocha mt-3 [touch-action:pan-y] min-[90rem]:mt-0"
      onPointerDown={posun.onPointerDown}
      onClickCapture={posun.onClickCapture}
    >
      {children}
    </div>
  );
}
