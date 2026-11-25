import type { JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import {
  dnesniDatumYmd,
  formatDen,
  formatRozsahData,
  jeBezOmezeni,
  jeProbihajici,
  jeSkoroPlno,
  jeUplynula,
  volnaMista,
} from "../../lib/expedition-utils";
import Ikona from "../Ikona";
import ZastupnySnimek from "./ZastupnySnimek";

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
  return `Právě v terénu · návrat ${denSTeckou(konec)} ${mesicGenitiv.format(new Date(`${konec}T12:00:00`)).replace(/^\d+\.\s*/, "")}`;
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
 * Řádek výpravy, vlevo fotka 4 : 3. Úzký řádek (telefon, okno „Zobrazit vše“):
 * datum a „8 / 20“ nad názvem, pod ním sraz. Široký řádek: fotka přiléhá ke
 * kraji karty a výška je pevná, snímky pod sebou tvoří pás. Dál sloupec data,
 * linka a ukazatel obsazenosti. Rozhoduje šířka řádku, ne okna.
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
  const kapacita = kratkaKapacita(expedice);
  return (
    <div className="@container">
      <button
        type="button"
        onClick={() => onDetail(expedice)}
        aria-label={`Detail výpravy ${expedice.nazev}`}
        className="nahled-press nahled-radek nahled-karta group flex w-full items-center gap-3 p-2.5 text-left text-inkoust focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk @min-[30rem]:gap-4 @min-[48rem]:h-[108px] @min-[48rem]:gap-5 @min-[48rem]:py-0 @min-[48rem]:pl-0 @min-[48rem]:pr-5"
      >
        <span className="nahled-karta-foto relative block aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-[10px] bg-mlha @min-[30rem]:w-32 @min-[48rem]:h-full @min-[48rem]:w-auto @min-[48rem]:rounded-none">
          <ZastupnySnimek
            id={expedice.id}
            datum={expedice.datum}
            povolit={expedice.stav !== "proběhlá" && !jeUplynula(expedice)}
          />
        </span>
        <span className="hidden w-[88px] shrink-0 flex-col gap-[3px] @min-[48rem]:flex">
          <span className="font-display text-base font-bold leading-[1.1] tracking-[-0.2px] text-inkoust">
            {denSloupce(expedice)}
          </span>
          <span className="text-[11.5px] font-medium text-ink-3">
            {mesicARok.format(new Date(`${expedice.datum}T12:00:00`))}
          </span>
        </span>
        <span aria-hidden="true" className="hidden h-11 w-px shrink-0 bg-linka @min-[48rem]:block" />
        <span className="flex min-w-0 flex-1 flex-col gap-1 @min-[48rem]:gap-[5px]">
          <span className="flex min-w-0 items-baseline justify-between gap-2 text-[11.5px] @min-[30rem]:text-[12.5px] @min-[48rem]:hidden">
            <time dateTime={expedice.datum} className="min-w-0 text-ink-3">
              {formatRozsahData(expedice.datum, expedice.datumDo)}
            </time>
            <span className="shrink-0 font-semibold text-mech">{kapacita}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="line-clamp-2 min-w-0 flex-1 text-[14.5px] font-semibold leading-[1.25] text-inkoust @min-[30rem]:text-base @min-[48rem]:line-clamp-1 @min-[48rem]:text-[15.5px] @min-[48rem]:tracking-[-0.1px]">
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
          <span className="flex min-w-0 items-start gap-[5px] text-xs text-ink-3 @min-[30rem]:items-center @min-[48rem]:gap-1.5 @min-[48rem]:text-[12.5px]">
            <Ikona nazev="map-pin" className="mt-px size-3 @min-[30rem]:mt-0 @min-[48rem]:size-[13px]" />
            <span className="line-clamp-2 min-w-0 @min-[30rem]:line-clamp-1">{probiha ? textProbiha(expedice) : `Sraz ${expedice.sraz}`}</span>
          </span>
        </span>
        <span className="hidden w-28 shrink-0 flex-col items-end gap-[7px] @min-[48rem]:flex">
          <span className="flex items-center gap-[7px]">
            {!jeBezOmezeni(expedice) ? (
              <span aria-hidden="true" className="block h-1 w-[52px] overflow-hidden rounded-full bg-[#eae5d6]">
                <span className="block h-full rounded-full bg-salvej" style={{ width: `${podil * 100}%` }} />
              </span>
            ) : null}
            <span className="text-[12.5px] font-semibold text-mech">{kapacita}</span>
          </span>
          {probiha ? (
            <span className="inline-flex rounded-full bg-mlha px-2 py-[3px] text-[11px] font-bold text-smrk">
              Probíhá
            </span>
          ) : null}
        </span>
        <Ikona nazev="chevron-right" className="hidden size-4 text-ink-3 @min-[48rem]:block" />
      </button>
    </div>
  );
}
