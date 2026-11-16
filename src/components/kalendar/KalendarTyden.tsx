import type { JSX, ReactNode } from "react";
import KalendarPosun from "./KalendarPosun";
import { DenKalendare, HlavickaDnu } from "./DenKalendare";
import {
  popisekDne,
  poziceVPasu,
  tydenMrizka,
  type KalendarniUdalost,
} from "../../lib/kalendar";

interface KalendarTydenProps {
  /** Libovolné datum uvnitř zobrazovaného týdne (YMD). */
  kotva: string;
  /** Den → události (jen dny týdne, viz `udalostiProTyden`). */
  udalosti: Map<string, KalendarniUdalost[]>;
  vybraneDatum: string | null;
  /** Dnešek YMD pro zvýraznění. */
  dnes: string;
  onDen: (datum: string) => void;
  onTyden: (smer: -1 | 1) => void;
  onDnes: () => void;
  /** Datum začátku výpravy pro barvu pásu (paleta podle ročního období). */
  datumVypravy?: (id: string) => string;
  /** Přepínač měsíc/týden do hlavičky mřížky. */
  prepinac?: ReactNode;
}

const FORMAT_DEN_MESIC = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
});
const FORMAT_DEN_MESIC_ROK = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Nadpis týdne: „12. října – 18. října 2026". Nevalidní → „Týden". */
function nazevTydne(tyden: ReadonlyArray<string>): string {
  if (tyden.length !== 7) return "Týden";
  const prvni = tyden[0];
  const posledni = tyden[6];
  if (prvni === undefined || posledni === undefined) return "Týden";
  const od = new Date(`${prvni}T12:00:00`);
  const do_ = new Date(`${posledni}T12:00:00`);
  if (Number.isNaN(od.getTime()) || Number.isNaN(do_.getTime())) return "Týden";
  return `${FORMAT_DEN_MESIC.format(od)} – ${FORMAT_DEN_MESIC_ROK.format(do_)}`;
}

/**
 * KalendarTyden (C2) — jeden řádek Po–Ne se stejnou buňkou jako měsíc
 * (`DenKalendare`): pás výpravy v barvě její palety, okrové tečky schůzek,
 * od `lg` názvy. Názvy pro čtečky nese `aria-label`.
 */
export default function KalendarTyden(props: KalendarTydenProps): JSX.Element {
  const { kotva, udalosti, vybraneDatum, dnes, onDen, onTyden, onDnes } = props;
  const tyden = tydenMrizka(kotva);
  const nazev = nazevTydne(tyden);
  const datumVypravy = props.datumVypravy ?? ((id: string) => {
    for (const seznam of udalosti.values()) {
      const nalez = seznam.find((u) => u.typ === "vyprava" && u.id === id);
      if (nalez !== undefined) return nalez.datum;
    }
    return kotva;
  });

  return (
    <div aria-label={`Kalendář – týden ${nazev}`} className="rounded-xl border border-linka bg-papir p-3 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="text-2xl font-bold tabular-nums text-inkoust">{nazev}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {props.prepinac}
          <div className="flex items-center gap-1">
          <KalendarPosun
            predchozi="Předchozí týden"
            dalsi="Další týden"
            onPredchozi={() => onTyden(-1)}
            onDalsi={() => onTyden(1)}
            onDnes={onDnes}
          />
          </div>
        </div>
      </div>

      <div role="group" aria-label="Dny týdne" className="mt-5">
        <HlavickaDnu />
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-linka/70">
          {tyden.map((den, index) => {
            const denni = udalosti.get(den) ?? [];
            return (
              <DenKalendare
                key={den}
                den={den}
                udalosti={denni}
                pozicePro={(id) => poziceVPasu(id, den, tyden, udalosti) ?? "single"}
                vybrano={vybraneDatum === den}
                jeDnes={dnes === den}
                zacatekRadku={index === 0}
                label={popisekDne(den, denni, { mrizka: tyden, mapa: udalosti })}
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
