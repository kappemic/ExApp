import type { JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import {
  dnesniDatumYmd,
  formatDen,
  jeBezOmezeni,
  jeProbihajici,
  jeSkoroPlno,
  jeUplynula,
  volnaMista,
} from "../../lib/expedition-utils";
import Ikona from "../Ikona";

const mesicGenitiv = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long" });
const mesicARok = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
});

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

function denSTeckou(iso: string): string {
  const den = formatDen(iso);
  return den.endsWith(".") ? den : `${den}.`;
}

function denSloupce(expedice: Expedition): string {
  const konec = expedice.datumDo;
  if (konec === null || konec.length === 0 || konec === expedice.datum) {
    return denSTeckou(expedice.datum);
  }
  return `${denSTeckou(expedice.datum)}–${denSTeckou(konec)}`;
}

/** „Právě v terénu · návrat zítra večer“, u jednodenní jen první část. */
function textProbiha(expedice: Expedition): string {
  const konec = expedice.datumDo ?? expedice.datum;
  const dnes = dnesniDatumYmd();
  const zbyva = Math.round((Date.parse(`${konec}T12:00:00`) - Date.parse(`${dnes}T12:00:00`)) / 86_400_000);
  if (konec === expedice.datum) return "Právě v terénu";
  if (zbyva <= 0) return "Právě v terénu · návrat dnes večer";
  if (zbyva === 1) return "Právě v terénu · návrat zítra večer";
  return `Právě v terénu · návrat ${denSTeckou(konec)} ${mesicGenitiv.format(new Date(`${konec}T12:00:00`)).replace(/^d+.s*/, "")}`;
}

function kratkaKapacita(expedice: Expedition): string {
  if (jeBezOmezeni(expedice)) return `${expedice.kapacita.prihlaseno}`;
  return `${expedice.kapacita.prihlaseno} / ${expedice.kapacita.celkem}`;
}

function podilObsazeni(expedice: Expedition): number {
  if (jeBezOmezeni(expedice) || expedice.kapacita.celkem <= 0) return 0;
  return Math.min(1, expedice.kapacita.prihlaseno / expedice.kapacita.celkem);
}

/**
 * Řádek výpravy podle ExApp.pen. Telefon: datum, název se srazem, „8 / 20“
 * a šipka. Počítač (1440+): řádek 100 px, sloupec data 82 px, svislá linka,
 * vpravo ukazatel obsazenosti. Řádky skládá do karty `SeznamRadku`.
 */
export default function VypravaRadek({
  expedice,
  neprecteno,
  onDetail,
}: {
  expedice: Expedition;
  neprecteno: boolean;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const probiha = jeProbihajici(expedice);
  const podil = podilObsazeni(expedice);
  return (
    <button
      type="button"
      onClick={() => onDetail(expedice)}
      aria-label={`Detail výpravy ${expedice.nazev}`}
      className="nahled-press nahled-radek group flex w-full items-center gap-3 p-3.5 text-left text-inkoust focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-[100px] min-[90rem]:gap-[18px] min-[90rem]:px-5 min-[90rem]:py-0"
    >
      <time dateTime={expedice.datum} className="flex shrink-0 flex-col gap-0.5 min-[90rem]:w-[88px] min-[90rem]:gap-[3px]">
        <span className="font-display text-[15px] font-bold text-inkoust min-[90rem]:text-base min-[90rem]:leading-[1.1] min-[90rem]:tracking-[-0.2px]">
          {denSloupce(expedice)}
        </span>
        <span className="text-[10.5px] text-ink-3 min-[90rem]:text-[11.5px] min-[90rem]:font-medium">
          {mesicARok.format(new Date(`${expedice.datum}T12:00:00`))}
        </span>
      </time>
      <span aria-hidden="true" className="hidden h-11 w-px shrink-0 bg-linka min-[90rem]:block" />
      <span className="flex min-w-0 flex-1 flex-col gap-1 min-[90rem]:gap-[5px]">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 text-sm font-semibold text-inkoust min-[90rem]:truncate min-[90rem]:text-[15.5px] min-[90rem]:tracking-[-0.1px]">
            {expedice.nazev}
          </span>
          {neprecteno ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-smrk"
              aria-label={`Nepřečtené zprávy v diskuzi výpravy ${expedice.nazev}`}
            >
              nové
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-akcent" />
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-[5px] text-xs text-ink-3 min-[90rem]:gap-1.5 min-[90rem]:text-[12.5px]">
          <Ikona nazev="map-pin" className="size-3 min-[90rem]:size-[13px]" />
          <span className="min-w-0 min-[90rem]:truncate">{probiha ? textProbiha(expedice) : `Sraz ${expedice.sraz}`}</span>
        </span>
      </span>
      <span className="flex min-w-11 shrink-0 flex-col items-end gap-[5px] min-[90rem]:w-28 min-[90rem]:gap-[7px]">
        <span className="flex items-center gap-[7px]">
          {!jeBezOmezeni(expedice) ? (
            <span aria-hidden="true" className="hidden h-1 w-[52px] overflow-hidden rounded-full bg-[#eae5d6] min-[90rem]:block">
              <span className={`block h-full rounded-full bg-salvej`} style={{ width: `${podil * 100}%` }} />
            </span>
          ) : null}
          <span className={`text-[11.5px] min-[90rem]:text-[12.5px] min-[90rem]:font-semibold ${probiha ? "text-salvej min-[90rem]:text-mech" : "text-mech"}`}>
            {kratkaKapacita(expedice)}
          </span>
        </span>
        {probiha ? (
          <span className="hidden rounded-full bg-mlha px-2 py-[3px] text-[11px] font-bold text-smrk min-[90rem]:inline-flex">
            Probíhá
          </span>
        ) : null}
      </span>
      <Ikona nazev="chevron-right" className="size-4 text-ink-3" />
    </button>
  );
}
