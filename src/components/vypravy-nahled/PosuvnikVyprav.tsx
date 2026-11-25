import { useRef, type JSX } from "react";
import { usePosuvnikKaret } from "../../hooks/usePosuvnikKaret";
import type { Expedition } from "../../lib/mock-expeditions";
import Ikona from "../Ikona";
import VypravaKarta from "./VypravaKarta";

/** Kolik proběhlých výprav je v posuvníku. Zbytek je v okně „Zobrazit vše“. */
export const VYPRAV_V_POSUVNIKU = 10;
/** Na počítači je místo posuvníku jedna řada. */
export const VYPRAV_V_KATEGORII = 3;

/* Šipky leží uvnitř rolovaného seznamu a drží se u jeho krajů, aby přes ně šlo
   táhnout prstem. Nulová šířka, okraj 8 px s mezerou 12 px dá kraj stránky 20 px. */
const MISTO_SIPKY = "sticky z-[2] w-0 shrink-0 min-[90rem]:hidden";
const SIPKA =
  "bez-prejeti absolute top-1/2 flex h-16 w-11 -translate-y-1/2 items-center rounded-xl bg-transparent text-inkoust [touch-action:manipulation] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk disabled:invisible";
const IKONA_SIPKY = "size-6 [filter:drop-shadow(0_0_3px_var(--color-papir))]";

/**
 * Proběhlé výpravy. Do 1440 px posuvník karet se šipkami: pohyb řeší
 * `usePosuvnikKaret`, karty za krajem mizí do ztracena. Počítač: mřížka tří karet.
 */
export default function PosuvnikVyprav({
  polozky,
  neprectene,
  onDetail,
}: {
  polozky: readonly Expedition[];
  neprectene: ReadonlyMap<string, boolean>;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const posuvnikRef = useRef<HTMLUListElement>(null);
  const viditelne = polozky.slice(0, VYPRAV_V_POSUVNIKU);
  const { vlevo, vpravo, posun } = usePosuvnikKaret(
    posuvnikRef,
    viditelne.map((polozka) => polozka.id).join(),
  );

  return (
    <div
      data-vlevo={vlevo ? "" : undefined}
      data-vpravo={vpravo ? "" : undefined}
      className="posuvnik-karet -mx-5 -my-1.5 overflow-hidden min-[90rem]:mx-0 min-[90rem]:overflow-visible"
    >
      <ul
        ref={posuvnikRef}
        className="group/posuvnik relative m-0 flex list-none select-none snap-x snap-mandatory scroll-pl-8 gap-3 overflow-x-auto overscroll-x-contain px-0 py-1.5 [scrollbar-width:none] data-[tazeno]:cursor-grabbing min-[90rem]:grid min-[90rem]:snap-none min-[90rem]:grid-cols-3 min-[90rem]:gap-5 min-[90rem]:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        <li role="none" className={`${MISTO_SIPKY} left-0 mr-2`}>
          <button
            type="button"
            data-sipka
            disabled={!vlevo}
            onClick={() => posun(-1)}
            aria-label="Předchozí proběhlé výpravy"
            className={`${SIPKA} left-0 justify-start pl-1`}
          >
            <Ikona nazev="chevron-left" className={IKONA_SIPKY} />
          </button>
        </li>
        {viditelne.map((polozka, poradi) => (
          <li
            key={polozka.id}
            className={`w-[240px] max-w-[68vw] shrink-0 snap-start group-data-[tazeno]/posuvnik:[&_button]:transform-none! min-[90rem]:w-auto min-[90rem]:max-w-none ${
              poradi >= VYPRAV_V_KATEGORII ? "min-[90rem]:hidden" : ""
            }`}
          >
            <VypravaKarta
              expedice={polozka}
              neprecteno={neprectene.get(polozka.id) === true}
              onDetail={onDetail}
            />
          </li>
        ))}
        <li role="none" className={`${MISTO_SIPKY} right-0 ml-2`}>
          <button
            type="button"
            data-sipka
            disabled={!vpravo}
            onClick={() => posun(1)}
            aria-label="Další proběhlé výpravy"
            className={`${SIPKA} right-0 justify-end pr-1`}
          >
            <Ikona nazev="chevron-right" className={IKONA_SIPKY} />
          </button>
        </li>
      </ul>
    </div>
  );
}
