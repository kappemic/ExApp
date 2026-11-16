import type { JSX, ReactNode } from "react";
import KalendarPosun from "./KalendarPosun";
import { DenKalendare, HlavickaDnu } from "./DenKalendare";
import {
  mesicMrizkaSKontextem,
  nazevMesice,
  popisekDne,
  poziceVPasu,
  type KalendarniUdalost,
} from "../../lib/kalendar";

interface KalendarMesicProps {
  rok: number;
  mesic: number;
  /** Den → události (cílový měsíc + viditelné mimo-dny, viz `udalostiProMesic`). */
  udalosti: Map<string, KalendarniUdalost[]>;
  vybraneDatum: string | null;
  /** Dnešek YMD pro zvýraznění. */
  dnes: string;
  onDen: (datum: string) => void;
  onMesic: (smer: -1 | 1) => void;
  onDnes: () => void;
  /** Datum začátku výpravy pro barvu pásu (paleta podle ročního období). */
  datumVypravy?: (id: string) => string;
  /** Přepínač měsíc/týden do hlavičky mřížky. */
  prepinac?: ReactNode;
}

/**
 * KalendarMesic (C2) — měsíční mřížka Po–Ne, vždy celé týdny (35/42 buněk).
 * Dny mimo měsíc jsou tlumené a pořád otevřou den. Pás výpravy se počítá
 * z plné mřížky, takže navazuje přes hranu měsíce. Na telefonu nese
 * pás zkratku názvu, schůzka zůstává tečka. Názvy pro čtečky nese `aria-label`.
 */
export default function KalendarMesic(props: KalendarMesicProps): JSX.Element {
  const { rok, mesic, udalosti, vybraneDatum, dnes, onDen, onMesic, onDnes } = props;
  const bunky = mesicMrizkaSKontextem(rok, mesic);
  const mrizkaYmd = bunky.map((b) => b.ymd);
  const datumVypravy = props.datumVypravy ?? ((id: string) => {
    for (const seznam of udalosti.values()) {
      const nalez = seznam.find((u) => u.typ === "vyprava" && u.id === id);
      if (nalez !== undefined) return nalez.datum;
    }
    return `${rok}-${String(mesic).padStart(2, "0")}-01`;
  });

  return (
    <div aria-label={`Kalendář – ${nazevMesice(rok, mesic)}`} className="rounded-xl border border-linka bg-papir p-3 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="text-2xl font-bold tabular-nums text-inkoust first-letter:uppercase">
          {nazevMesice(rok, mesic)}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {props.prepinac}
          <div className="flex items-center gap-1">
          <KalendarPosun
            predchozi="Předchozí měsíc"
            dalsi="Další měsíc"
            onPredchozi={() => onMesic(-1)}
            onDalsi={() => onMesic(1)}
            onDnes={onDnes}
          />
          </div>
        </div>
      </div>

      <div role="group" aria-label="Dny měsíce" className="mt-5">
        <HlavickaDnu />
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-linka/70">
          {bunky.map(({ ymd: den, mimoMesic }, index) => {
            const denni = udalosti.get(den) ?? [];
            const zakladLabel = popisekDne(den, denni, { mrizka: mrizkaYmd, mapa: udalosti });
            return (
              <DenKalendare
                key={den}
                den={den}
                udalosti={denni}
                pozicePro={(id) => poziceVPasu(id, den, mrizkaYmd, udalosti) ?? "single"}
                vybrano={vybraneDatum === den}
                jeDnes={dnes === den}
                mimoMesic={mimoMesic}
                zacatekRadku={index % 7 === 0}
                label={mimoMesic ? `${zakladLabel}, mimo měsíc` : zakladLabel}
                onDen={onDen}
                datumVypravy={datumVypravy}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
