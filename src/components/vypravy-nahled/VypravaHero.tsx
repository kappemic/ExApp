import type { JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData } from "../../lib/expedition-utils";
import { textOdpoctu } from "../../lib/krajina";
import ZastupnySnimek from "./ZastupnySnimek";
import { textKapacity } from "./VypravaRadek";

/**
 * Nejbližší výprava (C2). Od `md` je snímek vedle textu, na velké
 * šířce text sedí na střed výšky snímku.
 */
export default function VypravaHero({
  expedice,
  dnes,
  probiha,
  neprecteno,
  onDetail,
}: {
  expedice: Expedition;
  dnes: string;
  probiha: boolean;
  neprecteno: boolean;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const nadpisId = `hero-${expedice.id}`;
  return (
    <section
      aria-labelledby={nadpisId}
      className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.9fr)] lg:items-center lg:gap-12"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => onDetail(expedice)}
        className="bez-prejeti relative block aspect-[16/10] w-full overflow-hidden rounded-3xl lg:aspect-[16/9]"
      >
        <ZastupnySnimek id={expedice.id} datum={expedice.datum} povolit />
      </button>
      <div className="min-w-0">
        <p className="text-base font-medium text-inkoust">
          {textOdpoctu(expedice.datum, dnes, probiha)}
        </p>
        <h2
          id={nadpisId}
          className="mt-1 text-3xl font-bold leading-[1.1] text-inkoust [overflow-wrap:anywhere] sm:text-4xl lg:text-5xl lg:leading-[1.05]"
        >
          {expedice.nazev}
        </h2>
        <p className="mt-3 text-base font-medium text-inkoust">
          {formatRozsahData(expedice.datum, expedice.datumDo)}
        </p>
        <p className="mt-0.5 text-base leading-relaxed text-mech">Sraz {expedice.sraz}</p>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            onClick={() => onDetail(expedice)}
            className="nahled-press inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-okr px-7 text-base font-semibold text-inkoust hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk sm:w-auto"
          >
            Detail a přihlášení
          </button>
          <p className="text-sm tabular-nums text-mech">
            {textKapacity(expedice)}
            {neprecteno ? (
              <span className="ml-2 font-semibold text-smrk">nové zprávy v diskuzi</span>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}
