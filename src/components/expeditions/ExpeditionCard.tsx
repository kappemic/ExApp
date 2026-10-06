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

export interface ExpeditionCardProps {
  expedice: Expedition;
}

const badgeStyly: Record<ExpeditionStatus, string> = {
  volno: "border-smrk/30 bg-papir",
  "skoro plno": "border-jantar/40 bg-papir",
  "proběhlá": "border-mech/30 bg-papir",
};

const teckaStyly: Record<ExpeditionStatus, string> = {
  volno: "bg-smrk",
  "skoro plno": "bg-jantar",
  "proběhlá": "bg-mech",
};

function StavBadge({ stav }: { stav: ExpeditionStatus }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide text-inkoust ${badgeStyly[stav]}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${teckaStyly[stav]}`}
      />
      {stav}
    </span>
  );
}

function RazitkoData({ isoDatum }: { isoDatum: string }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="flex w-14 shrink-0 -rotate-3 flex-col items-center rounded-[4px] border-2 border-inkoust/80 bg-papir px-1 py-1.5 shadow-razitko"
    >
      <span className="text-xl font-extrabold leading-none tabular-nums">
        {formatDen(isoDatum)}
      </span>
      <span className="mt-1 text-[11px] font-bold lowercase leading-none tracking-widest">
        {formatMesicZkratka(isoDatum)}
      </span>
    </div>
  );
}

function PlaceholderFoto({ probehla }: { probehla: boolean }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-[16/9] w-full overflow-hidden border-b-2 border-inkoust ${
        probehla ? "bg-linka/60" : "bg-linka/70"
      }`}
    >
      {/* linkovaný deníkový podklad */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 23px, rgba(26,46,34,0.08) 23px 24px)",
        }}
      />
      {/* stylizované hory */}
      <svg
        viewBox="0 0 400 180"
        preserveAspectRatio="xMidYMax slice"
        className={`absolute inset-x-0 bottom-0 h-full w-full text-inkoust ${probehla ? "opacity-50 grayscale" : ""}`}
      >
        <path
          d="M0 150 L90 70 L150 130 L220 45 L300 130 L350 85 L400 130 L400 180 L0 180 Z"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M0 165 L110 100 L190 155 L270 90 L340 155 L400 120 L400 180 L0 180 Z"
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          className="text-smrk"
          strokeOpacity="0.45"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="322" cy="38" r="14" fill="none" stroke="currentColor" className="text-jantar" strokeOpacity="0.55" strokeWidth="2.5" />
      </svg>
      <span className="absolute bottom-2 right-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70">
        {probehla ? "archiv · deník" : "oddílový deník"}
      </span>
    </div>
  );
}

export default function ExpeditionCard({ expedice }: ExpeditionCardProps): JSX.Element {
  const probehla = jeProbehla(expedice);
  const procenta = obsazenostProcenta(expedice);
  const volna = volnaMista(expedice);

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-lg border-2 border-inkoust bg-white/60 shadow-denik transition-transform motion-safe:group-hover:-translate-y-0.5 ${
        probehla ? "opacity-90" : ""
      }`}
    >
      <div className="relative">
        <PlaceholderFoto probehla={probehla} />
        <div className="absolute left-3 top-3">
          <RazitkoData isoDatum={expedice.datum} />
        </div>
        <div className="absolute right-3 top-3">
          <StavBadge stav={expedice.stav} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h2 className="text-[1.05rem] font-bold leading-snug tracking-tight">
          {expedice.nazev}
        </h2>
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-inkoust/80">
          {expedice.popis}
        </p>

        <dl className="mt-3 space-y-1 border-t border-dashed border-linka pt-3 text-sm">
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold">Datum:</dt>
            <dd>
              <time dateTime={expedice.datum}>{formatCelyDatum(expedice.datum)}</time>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold">Sraz:</dt>
            <dd className="min-w-0">{expedice.sraz}</dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold tabular-nums">
              {expedice.kapacita.prihlaseno} / {expedice.kapacita.celkem}
              <span className="font-normal text-inkoust/65"> přihlášeno</span>
            </span>
            <span className="shrink-0 text-[13px] text-inkoust/65">
              {probehla ? "výprava proběhla" : volna === 0 ? "plně obsazeno" : `zbývá ${volna} ${volna === 1 ? "místo" : volna >= 2 && volna <= 4 ? "místa" : "míst"}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Obsazenost: ${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}`}
            aria-valuenow={expedice.kapacita.prihlaseno}
            aria-valuemin={0}
            aria-valuemax={expedice.kapacita.celkem}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-linka"
          >
            <div
              aria-hidden="true"
              className={`h-full rounded-full ${probehla ? "bg-mech" : "bg-smrk"}`}
              style={{ width: `${procenta}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex-1" />
        <div className="flex items-center justify-between gap-3 border-t border-linka pt-3">
          <span className="text-[13px] text-inkoust/60">
            {probehla ? "Fotky v archivu" : "Přihlašování v dalším kroku"}
          </span>
          {/* Pouze vizuální — funkční modal je mimo scope tohoto kroku. */}
          <button
            type="button"
            aria-label={`Detail výpravy ${expedice.nazev} (připravuje se)`}
            title="Detail přibude v dalším kroku"
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border-2 border-inkoust bg-smrk px-4 py-1.5 text-sm font-bold text-papir transition-colors hover:bg-inkoust"
          >
            Detail
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </article>
  );
}
