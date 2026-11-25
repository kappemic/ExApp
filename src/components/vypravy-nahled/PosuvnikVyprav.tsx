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
  "bez-prejeti group/sipka absolute top-[86px] flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation] disabled:invisible";
const KOLECKO =
  "flex size-8 items-center justify-center rounded-full border border-linka bg-povrch/90 text-inkoust shadow-[0_1px_2px_rgb(28_38_21/0.10),0_4px_12px_rgb(28_38_21/0.12)] transition-transform duration-150 ease-out group-active/sipka:scale-90 motion-reduce:transition-none";

/**
 * Proběhlé výpravy. Do 1440 px posuvník karet se šipkami: pohyb řeší
 * `usePosuvnikKaret`, karty mizí až v okraji stránky. Počítač: mřížka tří karet.
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
        className="group/posuvnik relative m-0 flex list-none select-none snap-x snap-mandatory scroll-pl-5 gap-3 overflow-x-auto overscroll-x-contain px-0 py-1.5 [scrollbar-width:none] data-[tazeno]:cursor-grabbing min-[90rem]:grid min-[90rem]:snap-none min-[90rem]:grid-cols-3 min-[90rem]:gap-5 min-[90rem]:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        <li role="none" className={`${MISTO_SIPKY} left-0 mr-2`}>
          <button
            type="button"
            data-sipka
            disabled={!vlevo}
            onClick={() => posun(-1)}
            aria-label="Předchozí proběhlé výpravy"
            className={`${SIPKA} left-0.5`}
          >
            <span className={KOLECKO}>
              <Ikona nazev="chevron-left" className="size-4 -translate-x-px" />
            </span>
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
            className={`${SIPKA} right-0.5`}
          >
            <span className={KOLECKO}>
              <Ikona nazev="chevron-right" className="size-4 translate-x-px" />
            </span>
          </button>
        </li>
      </ul>
    </div>
  );
}
