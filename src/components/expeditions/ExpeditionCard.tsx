import type { JSX } from "react";
import type { Expedition, ExpeditionStatus } from "../../lib/mock-expeditions";
import {
  formatCelyDatum,
  formatDen,
  formatMesicZkratka,
  jeProbehla,
  obsazenostProcenta,
  volnaMista,
} from "../../lib/expedition-utils";
import Obraz, { variantaObrazu } from "../gallery/Obraz";

export interface ExpeditionCardProps {
  expedice: Expedition;
  katalogoveCislo?: number;
  /** Otevře modal detailu (Krok 5). Bez handleru je tlačítko skryté. */
  onDetail?: (expedice: Expedition) => void;
}

const badgeStyly: Record<ExpeditionStatus, string> = {
  volno: "border-inkoust/25 bg-papir/90",
  "skoro plno": "border-jantar/60 bg-papir/90",
  "proběhlá": "border-inkoust/20 bg-papir/80",
};

const teckaStyly: Record<ExpeditionStatus, string> = {
  volno: "bg-smrk",
  "skoro plno": "bg-jantar",
  "proběhlá": "bg-mech",
};

function StavBadge({ stav }: { stav: ExpeditionStatus }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide text-inkoust backdrop-blur ${badgeStyly[stav]}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${teckaStyly[stav]}`}
      />
      {stav}
    </span>
  );
}

export default function ExpeditionCard({
  expedice,
  katalogoveCislo,
  onDetail,
}: ExpeditionCardProps): JSX.Element {
  const probehla = jeProbehla(expedice);
  const procenta = obsazenostProcenta(expedice);
  const volna = volnaMista(expedice);
  const varianta = variantaObrazu(expedice.id);

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-3xl border-2 border-inkoust bg-karta shadow-denik transition-transform motion-safe:group-hover:-translate-y-1 ${
        probehla ? "opacity-95" : ""
      }`}
    >
      <div className="relative p-3 pb-0">
        <div className="oblouk relative overflow-hidden border-2 border-inkoust">
          <Obraz
            varianta={varianta}
            nazev={expedice.nazev}
            className={`aspect-[4/5] w-full ${probehla ? "saturate-50" : ""}`}
          />
          <div className="absolute left-3 top-3">
            <span className="inline-flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-2xl border-2 border-inkoust bg-papir px-2 py-1 shadow-razitko">
              <span className="font-galerie text-xl italic leading-none tabular-nums">
                {formatDen(expedice.datum)}
              </span>
              <span className="mt-0.5 text-[10px] font-bold lowercase tracking-[0.18em]">
                {formatMesicZkratka(expedice.datum)}
              </span>
            </span>
          </div>
          <div className="absolute right-3 top-3">
            <StavBadge stav={expedice.stav} />
          </div>
        </div>
        {katalogoveCislo !== undefined && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 left-6 rounded-full border-2 border-inkoust bg-jantar px-3 py-0.5 text-[11px] font-bold tabular-nums text-papir"
          >
            č. {String(katalogoveCislo).padStart(2, "0")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5 pt-4">
        <h2 className="font-galerie text-[1.55rem] leading-[1.05]">
          {expedice.nazev}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-inkoust/70">
          {expedice.popis}
        </p>

        <dl className="mt-4 space-y-1.5 border-t muzejni-linka pt-3 text-[13px]">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-inkoust/55">Datum</dt>
            <dd className="font-medium">
              <time dateTime={expedice.datum}>{formatCelyDatum(expedice.datum)}</time>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-inkoust/55">Sraz</dt>
            <dd className="min-w-0">{expedice.sraz}</dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-semibold tabular-nums">
              {expedice.kapacita.prihlaseno} / {expedice.kapacita.celkem}
              <span className="font-normal text-inkoust/60"> přihlášeno</span>
            </span>
            <span className="shrink-0 text-[12px] text-inkoust/60">
              {probehla ? "výprava proběhla" : volna === 0 ? "plně obsazeno" : `zbývá ${volna} ${volna === 1 ? "místo" : volna >= 2 && volna <= 4 ? "místa" : "míst"}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Obsazenost: ${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}`}
            aria-valuenow={expedice.kapacita.prihlaseno}
            aria-valuemin={0}
            aria-valuemax={expedice.kapacita.celkem}
            className="mt-2 h-1 overflow-hidden rounded-full bg-inkoust/15"
          >
            <div
              aria-hidden="true"
              className={`h-full rounded-full ${probehla ? "bg-mech" : "bg-jantar"}`}
              style={{ width: `${procenta}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex-1" />
        <div className="flex items-center justify-between gap-3 border-t muzejni-linka pt-4">
          <span className="font-galerie text-sm italic text-inkoust/55">
            {probehla ? "archiv galerie" : "otevřená galerie"}
          </span>
          {onDetail !== undefined && (
            <button
              type="button"
              onClick={() => onDetail(expedice)}
              aria-label={`Detail výpravy ${expedice.nazev}`}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border-2 border-inkoust bg-inkoust px-5 py-2 text-[13px] font-bold text-papir transition-colors hover:bg-smrk"
            >
              Detail
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
