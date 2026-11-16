import type { JSX } from "react";
import VypravaNahled from "../expeditions/VypravaNahled";
import { useNahledFotkaId } from "../../hooks/useNahledFotkaId";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData, jeBezOmezeni } from "../../lib/expedition-utils";
import KrajinaVypravy from "./KrajinaVypravy";

/**
 * Proběhlá výprava (C2): fotka z alba v zaobleném výřezu, pod ní text.
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
      className="nahled-press nahled-karta group flex h-full w-full flex-col gap-3 rounded-3xl text-left text-inkoust focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-smrk"
    >
      <span className="nahled-karta-foto relative block aspect-[4/3] overflow-hidden rounded-3xl bg-mlha">
        {fotkaId !== null ? (
          <VypravaNahled expeditionId={expedice.id} fotkaId={fotkaId} probehla />
        ) : (
          <KrajinaVypravy id={expedice.id} datum={expedice.datum} />
        )}
      </span>
      <span className="flex min-w-0 flex-col px-1">
        <span className="flex min-w-0 items-start gap-2">
          <span className="font-display min-w-0 flex-1 text-lg font-bold leading-snug tracking-tight">
            {expedice.nazev}
          </span>
          {neprecteno ? (
            <span className="shrink-0 pt-1 text-[13px] font-semibold text-smrk">nové</span>
          ) : null}
        </span>
        <time dateTime={expedice.datum} className="mt-0.5 block text-sm text-mech">
          {formatRozsahData(expedice.datum, expedice.datumDo)}, {ucast}
        </time>
      </span>
    </button>
  );
}

