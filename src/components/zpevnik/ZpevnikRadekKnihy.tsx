import type { JSX } from "react";
import { Link } from "react-router-dom";
import { nahledRadku, prvniAkord, type ApiZpevnikPisen } from "../../shared/zpevnik";
import Ikona from "../Ikona";

/**
 * Řádek písně podle ExApp.pen. Telefon: číslo v okénku, název, první verš,
 * tónina v okrovém štítku. Počítač (1440+): řádek 62 px, tlumené pořadí,
 * tónina v šedém štítku a šipka. Řádky skládá do karty `<ul>` stránky.
 */
export function ZpevnikRadekKnihy({
  poradi,
  pisen,
}: {
  poradi: number;
  pisen: ApiZpevnikPisen;
}): JSX.Element {
  const nahled = nahledRadku(pisen.telo);
  const tonina = prvniAkord(pisen.telo);

  return (
    <li>
      <Link
        to={`/zpevnik/${pisen.id}`}
        className="nahled-press flex items-center gap-3 px-3.5 py-3 transition-colors [touch-action:manipulation] hover:bg-povrch-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-[62px] min-[90rem]:gap-3.5 min-[90rem]:px-5 min-[90rem]:py-0"
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-povrch-2 text-xs font-semibold tabular-nums text-mech min-[90rem]:size-auto min-[90rem]:min-w-5 min-[90rem]:bg-transparent min-[90rem]:font-medium min-[90rem]:text-[#b3b8a4]"
          aria-hidden="true"
        >
          {poradi}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 min-[90rem]:gap-px">
          <span className="truncate text-[14.5px] font-semibold text-inkoust">{pisen.nazev}</span>
          {nahled.length > 0 && <span className="truncate text-xs text-ink-3">{nahled}</span>}
        </span>
        {tonina !== null && (
          <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-lg bg-okr-100 px-2 text-[11.5px] font-semibold text-okr min-[90rem]:h-auto min-[90rem]:rounded-[7px] min-[90rem]:bg-povrch-2 min-[90rem]:px-[9px] min-[90rem]:py-[3px] min-[90rem]:text-mech">
            {tonina}
          </span>
        )}
        <Ikona nazev="chevron-right" className="hidden size-[15px] text-[#b3b8a4] min-[90rem]:block" />
      </Link>
    </li>
  );
}
