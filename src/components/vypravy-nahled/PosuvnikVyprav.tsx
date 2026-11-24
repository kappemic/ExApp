import { useRef, type JSX } from "react";
import { usePosuvnikKaret } from "../../hooks/usePosuvnikKaret";
import type { Expedition } from "../../lib/mock-expeditions";
import VypravaKarta from "./VypravaKarta";

/** Kolik proběhlých výprav je v posuvníku. Zbytek je v okně „Zobrazit vše“. */
export const VYPRAV_V_POSUVNIKU = 10;
/** Na počítači je místo posuvníku jedna řada. */
export const VYPRAV_V_KATEGORII = 3;

const PRECHOD = { vlevo: 32, vpravo: 44 };

/**
 * Proběhlé výpravy. Do 1440 px posuvník karet: pohyb řeší `usePosuvnikKaret`,
 * karty za krajem mizí do ztracena. Počítač: mřížka tří karet.
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
  const obalRef = useRef<HTMLDivElement>(null);
  const posuvnikRef = useRef<HTMLUListElement>(null);
  const viditelne = polozky.slice(0, VYPRAV_V_POSUVNIKU);
  usePosuvnikKaret(obalRef, posuvnikRef, PRECHOD, viditelne.map((polozka) => polozka.id).join());

  return (
    <div
      ref={obalRef}
      className="posuvnik-karet -mx-5 -my-1.5 overflow-hidden min-[90rem]:mx-0 min-[90rem]:overflow-visible"
    >
      <ul
        ref={posuvnikRef}
        className="group/posuvnik relative m-0 flex list-none select-none snap-x snap-mandatory scroll-pl-8 gap-3 overflow-x-auto overscroll-x-contain px-5 py-1.5 [scrollbar-width:none] [touch-action:pan-y] data-[tazeno]:cursor-grabbing min-[90rem]:grid min-[90rem]:snap-none min-[90rem]:grid-cols-3 min-[90rem]:gap-5 min-[90rem]:overflow-visible min-[90rem]:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {viditelne.map((polozka, poradi) => (
          <li
            key={polozka.id}
            className={`w-[310px] max-w-[80vw] shrink-0 snap-start group-data-[tazeno]/posuvnik:[&_button]:transform-none! min-[90rem]:w-auto min-[90rem]:max-w-none ${
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
      </ul>
    </div>
  );
}
