import type { JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import SpodniSheet from "../shell/SpodniSheet";
import { NacistDalsi } from "../Strankovani";
import VypravaKarta from "./VypravaKarta";
import VypravaRadek from "./VypravaRadek";

function pocetVyprav(n: number): string {
  if (n === 1) return "1 výprava";
  if (n >= 2 && n <= 4) return `${n} výpravy`;
  return `${n} výprav`;
}

/**
 * Okno „Zobrazit vše“: celý seznam jedné kategorie. Na telefonu spodní panel,
 * od tabletu okno. Proběhlé výpravy jsou karty s fotkou, ostatní řádky.
 */
export default function VypravyOkno({
  titulek,
  polozky,
  celkem,
  karty = false,
  neprectene,
  onDetail,
  onDalsi,
  onZavrit,
}: {
  titulek: string;
  polozky: readonly Expedition[];
  /** Počet i s dosud nenačtenými. */
  celkem: number;
  karty?: boolean;
  neprectene: ReadonlyMap<string, boolean>;
  onDetail: (expedice: Expedition) => void;
  /** Dočte další stránku archivu. */
  onDalsi?: () => void;
  onZavrit: () => void;
}): JSX.Element {
  return (
    <SpodniSheet otevreno titulek={titulek} podtitul={pocetVyprav(celkem)} sirka={560} onZavrit={onZavrit}>
      {karty ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 pt-1 min-[26rem]:grid-cols-2 min-[90rem]:gap-x-4 min-[90rem]:gap-y-6">
          {polozky.map((polozka) => (
            <li key={polozka.id} className="min-w-0">
              <VypravaKarta
                expedice={polozka}
                neprecteno={neprectene.get(polozka.id) === true}
                onDetail={onDetail}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="m-0 list-none divide-y divide-linka overflow-hidden rounded-2xl border border-linka bg-povrch p-0">
          {polozky.map((polozka) => (
            <li key={polozka.id} className="min-w-0">
              <VypravaRadek
                expedice={polozka}
                neprecteno={neprectene.get(polozka.id) === true}
                onDetail={onDetail}
              />
            </li>
          ))}
        </ul>
      )}
      {onDalsi !== undefined ? (
        <NacistDalsi zbyva={celkem - polozky.length} onClick={onDalsi} className="mt-4" />
      ) : null}
    </SpodniSheet>
  );
}
