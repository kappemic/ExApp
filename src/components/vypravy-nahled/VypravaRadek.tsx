import type { JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import {
  formatRozsahData,
  jeBezOmezeni,
  jeProbihajici,
  jeSkoroPlno,
  jeUplynula,
  volnaMista,
} from "../../lib/expedition-utils";
import { paletaVypravy } from "../../lib/krajina";
import ZastupnySnimek from "./ZastupnySnimek";

/** Signed-up count against the limit. The free-seat phrase is not shown. */
export function textKapacity(expedice: Expedition): string {
  const probehla = expedice.stav === "proběhlá";
  const nadchazejici = !probehla && !jeProbihajici(expedice) && !jeUplynula(expedice);
  const skoro = nadchazejici && jeSkoroPlno(expedice) ? ", skoro plno" : "";
  if (jeUplynula(expedice)) {
    if (jeBezOmezeni(expedice)) {
      return `${expedice.kapacita.prihlaseno} přihlášeno, neuzavřeno`;
    }
    return `${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}, neuzavřeno`;
  }
  if (jeBezOmezeni(expedice)) {
    return `${expedice.kapacita.prihlaseno} přihlášeno, bez omezení${skoro}`;
  }
  const volna = volnaMista(expedice);
  const stav = probehla ? "archiv" : volna === 0 ? "plno" : "";
  const zaStavem = stav.length > 0 ? `, ${stav}` : "";
  return `${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}${zaStavem}${skoro}`;
}

/** Řádek výpravy (C2): náhled krajiny, datum v barvě výpravy, název, sraz a místa. */
export default function VypravaRadek({
  expedice,
  neprecteno,
  onDetail,
}: {
  expedice: Expedition;
  neprecteno: boolean;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const paleta = paletaVypravy(expedice.id, expedice.datum);
  return (
    <button
      type="button"
      onClick={() => onDetail(expedice)}
      aria-label={`Detail výpravy ${expedice.nazev}`}
      className="nahled-press nahled-radek group flex min-h-[88px] w-full items-center gap-4 rounded-lg bg-papir px-2 py-3 text-left text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk sm:px-3"
    >
      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
        <ZastupnySnimek
          id={expedice.id}
          datum={expedice.datum}
          povolit={expedice.stav !== "proběhlá" && !jeUplynula(expedice)}
        />
      </span>
      <span className="min-w-0 flex-1">
        <time
          dateTime={expedice.datum}
          className="block text-[13px] font-semibold"
          style={{ color: paleta.akcent }}
        >
          {formatRozsahData(expedice.datum, expedice.datumDo)}
        </time>
        <span className="mt-0.5 flex min-w-0 items-start gap-2">
          <span className="font-display min-w-0 flex-1 text-lg font-bold leading-snug tracking-tight line-clamp-2 [overflow-wrap:anywhere]">
            {expedice.nazev}
          </span>
          {neprecteno ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 pt-1 text-[13px] font-semibold text-smrk"
              aria-label={`Nepřečtené zprávy v diskuzi výpravy ${expedice.nazev}`}
            >
              nové
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-okr" />
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block min-w-0 truncate text-sm text-mech">
          Sraz {expedice.sraz}
        </span>
        <span className="mt-0.5 block text-sm tabular-nums text-mech">
          {textKapacity(expedice)}
        </span>
      </span>
    </button>
  );
}
