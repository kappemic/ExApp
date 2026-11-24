import type { JSX } from "react";
import Ikona from "../Ikona";
import type { PosunKalendare } from "./KalendarPosun";

const TLACITKO =
  "nahled-press inline-flex h-8 items-center justify-center rounded-[9px] border border-linka bg-povrch text-mech hover:bg-povrch-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/**
 * Ovládání kalendáře v liště stránky na počítači („Month Nav“ v ExApp.pen):
 * ‹ měsíc ›, oddělovač, Dnes, legenda barev.
 */
export default function KalendarOvladani({
  nadpis,
  posun,
}: {
  nadpis: string;
  posun: PosunKalendare;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" onClick={posun.onPredchozi} aria-label={posun.predchozi} title={posun.predchozi} className={`${TLACITKO} w-8`}>
        <Ikona nazev="chevron-left" className="size-[15px]" />
      </button>
      <h2 className="text-center font-display text-base font-bold tracking-[-0.2px] text-inkoust first-letter:uppercase">
        {nadpis}
      </h2>
      <button type="button" onClick={posun.onDalsi} aria-label={posun.dalsi} title={posun.dalsi} className={`${TLACITKO} w-8`}>
        <Ikona nazev="chevron-right" className="size-[15px]" />
      </button>
      <span aria-hidden="true" className="h-[22px] w-px bg-linka" />
      <button type="button" onClick={posun.onDnes} className={`${TLACITKO} px-3 text-[12.5px] font-semibold`}>
        Dnes
      </button>
      <div aria-hidden="true" className="flex items-center gap-3 pl-2.5">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
          <span className="block size-2 rounded-[3px] bg-akcent" />
          Výprava
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
          <span className="block size-2 rounded-[3px] bg-okr" />
          Schůzka
        </span>
      </div>
    </div>
  );
}
