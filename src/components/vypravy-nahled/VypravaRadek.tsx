import { useEffect, useState, type JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import {
  formatDen,
  formatMesicZkratka,
  formatRozsahData,
  jeBezOmezeni,
  jeProbihajici,
  jeUplynula,
  volnaMista,
} from "../../lib/expedition-utils";

function ceskyPocet(
  n: number,
  jedna: string,
  dvaAzCtyri: string,
  jinak: string,
): string {
  if (n === 1) return jedna;
  if (n >= 2 && n <= 4) return dvaAzCtyri;
  return jinak;
}

/** Remaining seats, full, archive, or unlimited. Inferred from the row itself. */
function textKapacity(expedice: Expedition): string {
  const probehla = expedice.stav === "proběhlá";
  const nadchazejici = !probehla && !jeProbihajici(expedice) && !jeUplynula(expedice);
  const skoro =
    nadchazejici && expedice.stav === "skoro plno" ? " · skoro plno" : "";
  if (jeUplynula(expedice)) {
    if (jeBezOmezeni(expedice)) {
      return `${expedice.kapacita.prihlaseno} přihlášeno · neuzavřeno`;
    }
    return `${expedice.kapacita.prihlaseno}/${expedice.kapacita.celkem} · neuzavřeno`;
  }
  if (jeBezOmezeni(expedice)) {
    return `${expedice.kapacita.prihlaseno} přihlášeno · bez omezení${skoro}`;
  }
  const volna = volnaMista(expedice);
  const stav = probehla
    ? "archiv"
    : volna === 0
      ? "plno"
      : `zbývá ${volna} ${ceskyPocet(volna, "místo", "místa", "míst")}`;
  return `${expedice.kapacita.prihlaseno}/${expedice.kapacita.celkem} · ${stav}${skoro}`;
}

function useJeMd(): boolean {
  const [jeMd, setJeMd] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const dotaz = window.matchMedia("(min-width: 768px)");
    const synchronizuj = (): void => {
      setJeMd(dotaz.matches);
    };
    synchronizuj();
    dotaz.addEventListener("change", synchronizuj);
    return () => {
      dotaz.removeEventListener("change", synchronizuj);
    };
  }, []);
  return jeMd;
}

export default function VypravaRadek({
  expedice,
  neprecteno,
  onDetail,
}: {
  expedice: Expedition;
  neprecteno: boolean;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const jeMd = useJeMd();
  const popis = expedice.popis.trim();
  return (
    <button
      type="button"
      onClick={() => onDetail(expedice)}
      aria-label={`Detail výpravy ${expedice.nazev}`}
      className="nahled-press nahled-radek grid min-h-[72px] w-full grid-cols-[4.25rem_minmax(0,1fr)] items-stretch rounded-none border border-[hsl(var(--hairline))] bg-transparent text-left text-[hsl(var(--foreground))]"
    >
      <span className="flex h-full flex-col items-center justify-center border-r border-[hsl(var(--hairline))] bg-[hsl(var(--card))] px-1">
        <span className="font-expanded text-2xl font-black tabular-nums leading-none">
          {formatDen(expedice.datum)}
        </span>
        <span className="mt-1 font-condensed text-[11px] font-semibold uppercase tracking-[0.2em]">
          {formatMesicZkratka(expedice.datum)}
        </span>
      </span>
      <span className="min-w-0 px-3 py-3 md:px-4">
        <span className="flex min-w-0 items-start gap-2">
          <span className="font-expanded min-w-0 flex-1 break-words text-base font-extrabold leading-tight tracking-tight line-clamp-2 [overflow-wrap:anywhere] md:text-lg">
            {expedice.nazev}
          </span>
          {neprecteno ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 pt-1 font-condensed text-[11px]"
              aria-label={`Nepřečtené zprávy v diskuzi výpravy ${expedice.nazev}`}
            >
              nové
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-none bg-[hsl(var(--foreground))]"
              />
            </span>
          ) : null}
        </span>
        <time
          dateTime={expedice.datum}
          className="mt-1 block font-condensed text-xs text-[hsl(var(--muted-foreground))]"
        >
          {formatRozsahData(expedice.datum, expedice.datumDo)}
        </time>
        <span className="mt-1 flex min-w-0 items-baseline gap-2 text-xs">
          <span className="shrink-0 font-condensed font-semibold uppercase tracking-[0.2em]">
            Sraz
          </span>
          <span className="truncate">{expedice.sraz}</span>
        </span>
        {jeMd && popis.length > 0 ? (
          <span className="mt-2 line-clamp-2 block text-sm leading-relaxed">
            {popis}
          </span>
        ) : null}
        <span className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 text-sm tabular-nums leading-snug">
            {textKapacity(expedice)}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-condensed text-[11px] tracking-[0.18em]">
            Detail
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="nahled-sipka"
            >
              <path
                d="M2.5 8h11M9.5 4 13.5 8l-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </span>
        </span>
      </span>
    </button>
  );
}
