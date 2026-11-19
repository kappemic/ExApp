import type { JSX, ReactNode } from "react";
import { KalendarHlavicka, KalendarPlocha } from "./KalendarPosun";
import { DenKalendare, HlavickaDnu } from "./DenKalendare";
import {
  mesicMrizkaSKontextem,
  nazevMesice,
  popisekDne,
  poradiVypravy,
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
    <div aria-label={`Kalendář – ${nazevMesice(rok, mesic)}`} className="w-full min-w-0 max-w-full min-[90rem]:overflow-hidden min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:shadow-denik">
      <KalendarHlavicka
        nadpis={nazevMesice(rok, mesic)}
        prepinac={props.prepinac}
        velkePismeno
        posun={{
          predchozi: "Předchozí měsíc",
          dalsi: "Další měsíc",
          onPredchozi: () => onMesic(-1),
          onDalsi: () => onMesic(1),
          onDnes,
        }}
      />

      <KalendarPlocha ariaLabel="Dny měsíce" onPosun={onMesic}>
        <HlavickaDnu />
        <div className="grid w-full min-w-0 grid-cols-7 gap-y-0.5 min-[90rem]:gap-px min-[90rem]:bg-linka">
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
                delkaVypravy={(id) => poradiVypravy(id, den, udalosti)?.celkem ?? 1}
              />
            );
          })}
        </div>
      </KalendarPlocha>
    </div>
  );
}
