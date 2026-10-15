import type { JSX } from "react";
import type { Expedition, ExpeditionStatus } from "../../lib/mock-expeditions";
import { useNahledFotkaId } from "../../hooks/useNahledFotkaId";
import NeprectenaTecka from "../chat/NeprectenaTecka";
import VypravaNahled from "./VypravaNahled";
import {
  formatDen,
  formatMesicZkratka,
  formatRozsahData,
  jeBezOmezeni,
  jeProbihajici,
  jeProbehla,
  obsazenostProcenta,
  volnaMista,
} from "../../lib/expedition-utils";

export interface ExpeditionCardProps {
  expedice: Expedition;
  /** Otevře modal detailu (Fáze 2). Bez handleru je tlačítko skryté. */
  onDetail?: (expedice: Expedition) => void;
  /** Tečka nepřečtené diskuze (Krok 3) — vedle názvu, mimo tap-target. */
  neprecteno?: boolean;
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

function StavBadge({
  stav,
  probiha,
}: {
  stav: ExpeditionStatus;
  probiha: boolean;
}): JSX.Element {
  const styl: ExpeditionStatus = probiha ? "volno" : stav;
  const popisek: string = probiha ? "probíhá" : stav;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide text-inkoust ${badgeStyly[styl]}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${teckaStyly[styl]}`}
      />
      {popisek}
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

export default function ExpeditionCard({
  expedice,
  onDetail,
  neprecteno = false,
}: ExpeditionCardProps): JSX.Element {
  const probehla = jeProbehla(expedice);
  const probiha = !probehla && jeProbihajici(expedice);
  const fotkaId = useNahledFotkaId(expedice.id, expedice.nahledFotkaId);
  const bezOmezeni = jeBezOmezeni(expedice);
  const procenta = obsazenostProcenta(expedice);
  const volna = volnaMista(expedice);

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-lg border-2 border-inkoust bg-white/60 shadow-denik transition-transform motion-safe:group-hover:-translate-y-0.5 ${
        probehla ? "opacity-90" : ""
      }`}
    >
      <div className="relative">
        <div
          className={`relative aspect-[16/9] w-full overflow-hidden border-b-2 border-inkoust ${
            probehla ? "bg-linka/60" : "bg-linka/70"
          }`}
        >
          <VypravaNahled
            expeditionId={expedice.id}
            fotkaId={fotkaId}
            probehla={probehla}
            ukazSlunce
          />
        </div>
        <div className="absolute left-3 top-3 z-10">
          <RazitkoData isoDatum={expedice.datum} />
        </div>
        <div className="absolute right-3 top-3 z-10">
          <StavBadge stav={expedice.stav} probiha={probiha} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex min-w-0 items-start gap-2">
          <h2 className="min-w-0 flex-1 break-words text-[1.05rem] font-bold leading-snug tracking-tight">
            {expedice.nazev}
          </h2>
          <span className="flex shrink-0 pt-1.5">
            <NeprectenaTecka
              viditelna={neprecteno}
              velikost="karta"
              nazevVypravy={expedice.nazev}
            />
          </span>
        </div>
        <p className="mt-1.5 line-clamp-3 break-words text-sm leading-relaxed text-inkoust/80">
          {expedice.popis}
        </p>

        <dl className="mt-3 space-y-1 border-t border-dashed border-linka pt-3 text-sm">
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold">Datum:</dt>
            <dd>
              <time dateTime={expedice.datum}>{formatRozsahData(expedice.datum, expedice.datumDo)}</time>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold">Sraz:</dt>
            <dd className="min-w-0 break-words">{expedice.sraz}</dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold tabular-nums">
              {bezOmezeni ? (
                <>
                  {expedice.kapacita.prihlaseno}
                  <span className="font-normal text-inkoust/65"> přihlášeno · bez omezení</span>
                </>
              ) : (
                <>
                  {expedice.kapacita.prihlaseno} / {expedice.kapacita.celkem}
                  <span className="font-normal text-inkoust/65"> přihlášeno</span>
                </>
              )}
            </span>
            <span className="shrink-0 text-[13px] text-inkoust/65">
              {probehla
                ? "výprava proběhla"
                : bezOmezeni
                  ? "místa dost"
                  : volna === 0
                    ? "plně obsazeno"
                    : `zbývá ${volna} ${volna === 1 ? "místo" : volna >= 2 && volna <= 4 ? "místa" : "míst"}`}
            </span>
          </div>
          {!bezOmezeni ? (
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
          ) : (
            <div
              role="status"
              aria-label={`Počet přihlášených: ${expedice.kapacita.prihlaseno} (bez omezení)`}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-linka"
            >
              <span className="sr-only">
                {`Počet přihlášených: ${expedice.kapacita.prihlaseno} (bez omezení)`}
              </span>
              <div
                aria-hidden="true"
                className="h-full w-full rounded-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(26,46,34,0.28) 0 6px, transparent 6px 12px)",
                }}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex-1" />
        <div className="flex items-center justify-between gap-3 border-t border-linka pt-3">
          <span className="text-[13px] text-inkoust/60">
            {probehla ? "Fotky v archivu" : "Detail a přihlášení"}
          </span>
          {onDetail !== undefined && (
            <button
              type="button"
              onClick={() => onDetail(expedice)}
              aria-label={`Detail výpravy ${expedice.nazev}`}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border-2 border-inkoust bg-smrk px-4 py-1.5 text-sm font-bold text-papir transition-colors hover:bg-inkoust"
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
