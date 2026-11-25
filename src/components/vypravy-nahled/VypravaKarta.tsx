import type { JSX } from "react";
import VypravaNahled from "../expeditions/VypravaNahled";
import { useNahledFotkaId } from "../../hooks/useNahledFotkaId";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData, jeBezOmezeni } from "../../lib/expedition-utils";
import KrajinaVypravy from "./KrajinaVypravy";

/**
 * Proběhlá výprava (C2): fotka z alba v zaobleném výřezu 3 : 2, pod ní text.
 * Bez fotky ukáže krajinu výpravy.
 */
export default function VypravaKarta({
  expedice,
  neprecteno,
  onDetail,
}: {
  expedice: Expedition;
  neprecteno: boolean;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const fotkaId = useNahledFotkaId(expedice.id, expedice.nahledFotkaId);
  const ucast = jeBezOmezeni(expedice)
    ? `${expedice.kapacita.prihlaseno} přihlášeno`
    : `${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}`;

  return (
    <button
      type="button"
      onClick={() => onDetail(expedice)}
      aria-label={`Detail výpravy ${expedice.nazev}`}
      className="nahled-press nahled-karta group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-linka bg-povrch text-left text-inkoust focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-smrk min-[90rem]:gap-3 min-[90rem]:overflow-visible min-[90rem]:rounded-none min-[90rem]:border-0 min-[90rem]:bg-transparent"
    >
      <span className="nahled-karta-foto relative block aspect-[3/2] w-full shrink-0 overflow-hidden bg-mlha min-[90rem]:rounded-[14px]">
        {fotkaId !== null ? (
          <VypravaNahled expeditionId={expedice.id} fotkaId={fotkaId} probehla />
        ) : (
          <KrajinaVypravy id={expedice.id} datum={expedice.datum} />
        )}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 border border-black/[0.07] max-[90rem]:border-x-0 max-[90rem]:border-t-0 min-[90rem]:rounded-[14px] min-[90rem]:border-black/10" />
      </span>
      <span className="flex min-w-0 flex-col gap-1 p-3 min-[90rem]:gap-3 min-[90rem]:p-0">
        <span className="flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold min-[90rem]:whitespace-normal min-[90rem]:text-[14.5px] min-[90rem]:leading-[1.3]">
            {expedice.nazev}
          </span>
          {neprecteno ? (
            <span className="shrink-0 text-xs font-semibold text-smrk">nové</span>
          ) : null}
        </span>
        <time dateTime={expedice.datum} className="block text-[11.5px] text-ink-3 min-[90rem]:text-xs">
          {formatRozsahData(expedice.datum, expedice.datumDo)} · {ucast}
          <span className="hidden min-[90rem]:inline">{jeBezOmezeni(expedice) ? "" : " přihlášeno"}</span>
        </time>
      </span>
    </button>
  );
}
