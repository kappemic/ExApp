import type { JSX } from "react";
import Ikona from "../Ikona";

const TLACITKO =
  "nahled-press flex size-11 items-center justify-center rounded-[10px] text-mech hover:bg-povrch disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:size-6 min-[90rem]:rounded-[7px]";

/** Krokovač − hodnota +. Telefon 44 px, počítač 24 px. */
export function Krokovac({
  hodnota,
  popisHodnoty,
  dolu,
  nahoru,
  minimum = false,
  maximum = false,
  onKrok,
}: {
  hodnota: string;
  popisHodnoty?: string;
  dolu: string;
  nahoru: string;
  minimum?: boolean;
  maximum?: boolean;
  onKrok: (smer: -1 | 1) => void;
}): JSX.Element {
  return (
    <div className="inline-flex shrink-0 items-center rounded-xl bg-povrch-2 min-[90rem]:gap-0.5 min-[90rem]:rounded-[9px] min-[90rem]:p-[3px]">
      <button type="button" aria-label={dolu} disabled={minimum} className={TLACITKO} onClick={() => onKrok(-1)}>
        <Ikona nazev="minus" className="size-3.5 min-[90rem]:size-3" />
      </button>
      <span
        role="status"
        aria-label={popisHodnoty}
        className="min-w-12 text-center text-[13px] font-semibold text-inkoust tabular-nums min-[90rem]:min-w-9 min-[90rem]:text-xs"
      >
        {hodnota}
      </span>
      <button type="button" aria-label={nahoru} disabled={maximum} className={TLACITKO} onClick={() => onKrok(1)}>
        <Ikona nazev="plus" className="size-3.5 min-[90rem]:size-3" />
      </button>
    </div>
  );
}
