import type { JSX, ReactNode } from "react";
import { PRODLEVY, sousedniStupen, VELIKOSTI_PISMA, type NastaveniCteni } from "../../lib/zpevnik-cteni";
import Prepinac from "../Prepinac";
import { Krokovac } from "./Krokovac";

function Radek({ popisek, children }: { popisek: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 min-[90rem]:min-h-8">
      <span className="text-[15px] font-medium text-inkoust min-[90rem]:text-[12.5px] min-[90rem]:text-mech">{popisek}</span>
      {children}
    </div>
  );
}

/** Nastavení čtení společné pro celý zpěvník: písmo, akordy, prodleva před posouváním. */
export function ZpevnikZobrazeni({
  nastaveni,
  onZmena,
  sAkordy,
}: {
  nastaveni: NastaveniCteni;
  onZmena: (nastaveni: NastaveniCteni) => void;
  /** Píseň nějaké akordy má, takže je co skrývat. */
  sAkordy: boolean;
}): JSX.Element {
  const { pismo, akordy, prodleva } = nastaveni;
  return (
    <div className="flex flex-col gap-3 min-[90rem]:gap-2">
      <Radek popisek="Velikost písma">
        <Krokovac
          hodnota={`${Math.round(pismo * 100)} %`}
          dolu="Zmenšit písmo"
          nahoru="Zvětšit písmo"
          minimum={pismo === VELIKOSTI_PISMA[0]}
          maximum={pismo === VELIKOSTI_PISMA.at(-1)}
          onKrok={(smer) => onZmena({ ...nastaveni, pismo: sousedniStupen(VELIKOSTI_PISMA, pismo, smer) })}
        />
      </Radek>
      <Radek popisek="Prodleva na začátku">
        <Krokovac
          hodnota={`${prodleva} s`}
          dolu="Kratší prodleva"
          nahoru="Delší prodleva"
          minimum={prodleva === PRODLEVY[0]}
          maximum={prodleva === PRODLEVY.at(-1)}
          onKrok={(smer) => onZmena({ ...nastaveni, prodleva: sousedniStupen(PRODLEVY, prodleva, smer) })}
        />
      </Radek>
      {sAkordy ? (
        <Radek popisek="Zobrazit akordy">
          <Prepinac zapnuto={akordy} popisek="Zobrazit akordy" onZmena={(zapnuto) => onZmena({ ...nastaveni, akordy: zapnuto })} />
        </Radek>
      ) : null}
    </div>
  );
}
