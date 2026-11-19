import type { JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import { jeBezOmezeni } from "../../lib/expedition-utils";
import { RailKarta, RailRadek } from "./RailKarta";

const DNY = ["ne", "po", "út", "st", "čt", "pá", "so"];

/**
 * Pravý sloupec na počítači: proběhlé výpravy bez uzavření („Rail · Pending“).
 * Tři řádky a „Zobrazit všech N“, sloupec nikdy nescrolluje.
 */
export default function RailNeuzavrene({
  polozky,
  onDetail,
  onVse,
  limit = 3,
}: {
  polozky: readonly Expedition[];
  onDetail: (expedice: Expedition) => void;
  onVse: () => void;
  limit?: number;
}): JSX.Element {
  const viditelne = polozky.slice(0, limit);
  return (
    <RailKarta
      id="rail-neuzavrene"
      nadpis="Čeká na uzavření"
      odkaz={{ popisek: "Otevřít", onClick: onVse }}
      zbyva={polozky.length > limit ? polozky.length : undefined}
      onVse={onVse}
    >
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {viditelne.map((expedice) => {
          const d = new Date(`${expedice.datum}T12:00:00`);
          const pocet = jeBezOmezeni(expedice)
            ? `${expedice.kapacita.prihlaseno}`
            : `${expedice.kapacita.prihlaseno} / ${expedice.kapacita.celkem}`;
          return (
            <RailRadek
              key={expedice.id}
              den={String(d.getDate())}
              popisekDne={DNY[d.getDay()] ?? ""}
              nazev={expedice.nazev}
              podtitul={`${pocet} · k uzavření`}
              onClick={() => onDetail(expedice)}
            />
          );
        })}
      </ul>
    </RailKarta>
  );
}
