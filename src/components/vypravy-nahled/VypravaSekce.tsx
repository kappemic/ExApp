import type { JSX, ReactNode } from "react";
import Ikona from "../Ikona";

/**
 * Sekce seznamu výprav podle ExApp.pen: nadpis (telefon 18 px, počítač 21 px
 * s odznakem počtu) a vpravo „Zobrazit vše“ se šipkou.
 */
export default function VypravaSekce({
  nadpis,
  nadpisId,
  akce,
  pocet,
  children,
}: {
  nadpis: string;
  nadpisId: string;
  akce?: { popisek: string; onClick: () => void };
  /** Počet v odznaku vedle nadpisu (jen od 1440 px). */
  pocet?: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <section aria-labelledby={nadpisId} className="scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2
            id={nadpisId}
            className="font-display text-lg font-bold text-inkoust min-[90rem]:text-[21px] min-[90rem]:tracking-[-0.4px]"
          >
            {nadpis}
          </h2>
          {pocet !== undefined && pocet > 0 ? (
            <span className="hidden rounded-full bg-povrch-2 px-[9px] py-[3px] text-[11.5px] font-semibold text-mech min-[90rem]:inline-flex">
              {pocet}
            </span>
          ) : null}
        </div>
        {akce !== undefined ? (
          <button
            type="button"
            onClick={akce.onClick}
            className="nahled-press -my-2.5 -mr-1 inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-[13px] text-mech focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:gap-1.5 min-[90rem]:font-medium"
          >
            {akce.popisek}
            <Ikona nazev="arrow-right" className="size-3.5 text-ink-3" />
          </button>
        ) : null}
      </div>
      <div className="mt-[22px] min-[90rem]:mt-4">{children}</div>
    </section>
  );
}
