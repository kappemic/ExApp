import type { JSX, ReactNode } from "react";
import { KalendarHlavicka, KalendarPlocha } from "./KalendarPosun";
import { DenKalendare, HlavickaDnu } from "./DenKalendare";
import {
  popisekDne,
  poradiVypravy,
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

/** Phone title: one line, so the card stays the same width as the month. */
function nazevTydneKratky(tyden: ReadonlyArray<string>): string {
  if (tyden.length !== 7) return "Týden";
  const prvni = tyden[0];
  const posledni = tyden[6];
  if (prvni === undefined || posledni === undefined) return "Týden";
  const od = new Date(`${prvni}T12:00:00`);
  const do_ = new Date(`${posledni}T12:00:00`);
  if (Number.isNaN(od.getTime()) || Number.isNaN(do_.getTime())) return "Týden";
  const stejnyMesic = od.getMonth() === do_.getMonth() && od.getFullYear() === do_.getFullYear();
  if (stejnyMesic) {
    const konec = FORMAT_DEN_MESIC_ROK.format(do_);
    return `${od.getDate()}.–${konec}`;
  }
  const odKratce = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short" }).format(od);
  const doKratce = new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(do_);
  return `${odKratce} – ${doKratce}`;
}

/** Nadpis týdne: „12. října – 18. října 2026". Nevalidní → „Týden". */
export function nazevTydne(tyden: ReadonlyArray<string>): string {
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
    <div aria-label={`Kalendář – týden ${nazev}`} className="w-full min-w-0 max-w-full min-[90rem]:overflow-hidden min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:shadow-denik">
      <KalendarHlavicka
        nadpis={
          <>
            <span className="lg:hidden">{nazevTydneKratky(tyden)}</span>
            <span className="hidden lg:inline">{nazev}</span>
          </>
        }
        prepinac={props.prepinac}
        posun={{
          predchozi: "Předchozí týden",
          dalsi: "Další týden",
          onPredchozi: () => onTyden(-1),
          onDalsi: () => onTyden(1),
          onDnes,
        }}
      />

      <KalendarPlocha ariaLabel="Dny týdne" onPosun={onTyden}>
        <HlavickaDnu />
        <div className="grid w-full min-w-0 grid-cols-7 gap-y-0.5 min-[90rem]:gap-px min-[90rem]:bg-linka">
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
                delkaVypravy={(id) => poradiVypravy(id, den, udalosti)?.celkem ?? 1}
              />
            );
          })}
        </div>
      </KalendarPlocha>
    </div>
  );
}
