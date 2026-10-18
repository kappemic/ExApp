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

/** Pass-through shell. Calendar components keep their own production styles. */
export default function NahledKalendar({
  rezim,
  onRezim,
  mesic,
  tyden,
}: {
  rezim: Rezim;
  onRezim: (rezim: Rezim) => void;
  mesic: MesicProps;
  tyden: TydenProps;
}): JSX.Element {
  return (
    <div>
      <NahledPrepinac
        ariaLabel="Režim kalendáře"
        volby={[
          { id: "mesic", popisek: "Měsíc" },
          { id: "tyden", popisek: "Týden" },
        ]}
        aktivni={rezim}
        onZmena={onRezim}
      />
      <div className="nahled-kalendar-plocha mt-6 border border-[hsl(var(--foreground))] p-3 md:p-4">
        {rezim === "mesic" ? (
          <KalendarMesic
            rok={mesic.rok}
            mesic={mesic.mesic}
            udalosti={mesic.udalosti}
            vybraneDatum={mesic.vybraneDatum}
            dnes={mesic.dnes}
            onDen={mesic.onDen}
            onMesic={mesic.onMesic}
            onDnes={mesic.onDnes}
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
          />
        )}
      </div>
    </div>
  );
}
