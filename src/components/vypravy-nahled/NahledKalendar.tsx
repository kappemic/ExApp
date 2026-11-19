import type { JSX } from "react";
import KalendarMesic from "../kalendar/KalendarMesic";
import KalendarTyden from "../kalendar/KalendarTyden";
import type { KalendarniUdalost } from "../../lib/kalendar";
import NahledPrepinac from "./NahledPrepinac";

type Rezim = "mesic" | "tyden";

interface MesicProps {
  rok: number;
  mesic: number;
  udalosti: Map<string, KalendarniUdalost[]>;
  vybraneDatum: string | null;
  dnes: string;
  onDen: (datum: string) => void;
  onMesic: (smer: -1 | 1) => void;
  onDnes: () => void;
}

interface TydenProps {
  kotva: string;
  udalosti: Map<string, KalendarniUdalost[]>;
  vybraneDatum: string | null;
  dnes: string;
  onDen: (datum: string) => void;
  onTyden: (smer: -1 | 1) => void;
  onDnes: () => void;
}

/** Přepínač měsíc/týden a mřížka kalendáře (C2). */
export default function NahledKalendar({
  rezim,
  onRezim,
  mesic,
  tyden,
  datumVypravy,
}: {
  rezim: Rezim;
  onRezim: (rezim: Rezim) => void;
  mesic: MesicProps;
  tyden: TydenProps;
  /** Datum začátku výpravy, aby pás v kalendáři měl stejnou barvu jako její náhled. */
  datumVypravy?: (id: string) => string;
}): JSX.Element {
  const prepinac = (
    <NahledPrepinac
      ariaLabel="Režim kalendáře"
      volby={[
        { id: "mesic", popisek: "Měsíc" },
        { id: "tyden", popisek: "Týden" },
      ]}
      aktivni={rezim}
      onZmena={onRezim}
    />
  );
  return rezim === "mesic" ? (
    <KalendarMesic
      rok={mesic.rok}
      mesic={mesic.mesic}
      udalosti={mesic.udalosti}
      vybraneDatum={mesic.vybraneDatum}
      dnes={mesic.dnes}
      onDen={mesic.onDen}
      onMesic={mesic.onMesic}
      onDnes={mesic.onDnes}
      datumVypravy={datumVypravy}
      prepinac={prepinac}
    />
  ) : (
    <KalendarTyden
      kotva={tyden.kotva}
      udalosti={tyden.udalosti}
      vybraneDatum={tyden.vybraneDatum}
      dnes={tyden.dnes}
      onDen={tyden.onDen}
      onTyden={tyden.onTyden}
      onDnes={tyden.onDnes}
      datumVypravy={datumVypravy}
      prepinac={prepinac}
    />
  );
}
