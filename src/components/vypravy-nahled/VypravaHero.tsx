import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatCelyDatum, jeBezOmezeni } from "../../lib/expedition-utils";
import { textOdpoctu } from "../../lib/krajina";
import Ikona from "../Ikona";
import ZastupnySnimek from "./ZastupnySnimek";

const denVTydnu = new Intl.DateTimeFormat("cs-CZ", { weekday: "long" });

const FOKUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/**
 * Nejbližší výprava podle ExApp.pen. Telefon: fotka 16 : 9 nahoře, pod ní text
 * a olivové CTA přes celou šířku. Počítač (1440+): fotka 4 : 3 vlevo, vpravo
 * text nahoře, obsazenost a terakotové CTA + „Kdo jede“ dole.
 */
export default function VypravaHero({
  expedice,
  dnes,
  neprecteno,
  onDetail,
}: {
  expedice: Expedition;
  dnes: string;
  neprecteno: boolean;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const nadpisId = `hero-${expedice.id}`;
  const bezOmezeni = jeBezOmezeni(expedice);
  const { prihlaseno, celkem } = expedice.kapacita;
  const kapacita = bezOmezeni ? `${prihlaseno} přihlášeno` : `${prihlaseno} z ${celkem} přihlášeno`;
  const podil = bezOmezeni || celkem <= 0 ? 0 : Math.min(1, prihlaseno / celkem);
  const popis = expedice.popis.trim();
  const surovyDen = denVTydnu.format(new Date(`${expedice.datum}T12:00:00`));
  const den = `${surovyDen.charAt(0).toUpperCase()}${surovyDen.slice(1)} ${formatCelyDatum(expedice.datum)}`;
  const odpocet = textOdpoctu(expedice.datum, dnes, false);

  return (
    <section
      aria-labelledby={nadpisId}
      className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-linka bg-povrch shadow-denik sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[90rem]:min-h-[340px] min-[90rem]:grid-cols-[432px_minmax(0,1fr)] min-[90rem]:border-transparent"
    >
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden sm:aspect-auto sm:h-full sm:min-h-[250px]">
        <ZastupnySnimek id={expedice.id} datum={expedice.datum} povolit />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 border border-black/10 min-[90rem]:border-y-0 min-[90rem]:border-l-0" />
        <p className="absolute left-3 top-3 flex h-6 items-center rounded-lg bg-akcent-100 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.4px] text-akcent min-[90rem]:hidden">
          {odpocet}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-3 p-4 sm:justify-between sm:p-5 min-[90rem]:justify-between min-[90rem]:gap-0 min-[90rem]:px-[30px] min-[90rem]:py-7">
        <div className="flex min-w-0 flex-col gap-3 min-[90rem]:gap-3.5">
          <div className="flex items-center gap-2.5">
            <span className="hidden rounded-full bg-akcent-100 px-2.5 py-[5px] text-[10.5px] font-bold uppercase tracking-[1px] text-akcent min-[90rem]:inline-flex">
              {odpocet}
            </span>
            <p className="text-xs text-ink-3 min-[90rem]:font-medium">
              Nejbližší výprava
            </p>
          </div>
          <h2
            id={nadpisId}
            className="font-display text-[22px] font-bold leading-[25px] tracking-[-0.4px] text-inkoust [overflow-wrap:anywhere] min-[90rem]:text-[36px] min-[90rem]:leading-[37px] min-[90rem]:tracking-[-1px]"
          >
            {expedice.nazev}
          </h2>
          <div className="flex flex-col gap-1.5 min-[90rem]:gap-[7px]">
            <p className="flex items-center gap-[7px] text-[13px] text-mech min-[90rem]:gap-2 min-[90rem]:text-sm">
              <Ikona nazev="calendar" className="size-3.5 text-salvej min-[90rem]:size-[15px]" />
              <span className="min-w-0">{den}</span>
            </p>
            <p className="flex items-center gap-[7px] text-[13px] text-mech min-[90rem]:gap-2 min-[90rem]:text-sm">
              <Ikona nazev="map-pin" className="size-3.5 text-salvej min-[90rem]:size-[15px]" />
              <span className="min-w-0">Sraz {expedice.sraz}</span>
            </p>
          </div>
          {popis.length > 0 ? (
            <p className="text-[13px] leading-[18px] text-ink-3 min-[90rem]:line-clamp-2 min-[90rem]:text-[13.5px] min-[90rem]:leading-5">
              {popis}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 min-[90rem]:gap-3.5">
          <div className="flex items-center gap-2">
            {!bezOmezeni ? (
              <span aria-hidden="true" className="hidden h-[5px] w-[88px] overflow-hidden rounded-full bg-linka min-[90rem]:block">
                <span className="block h-full rounded-full bg-smrk" style={{ width: `${Math.max(podil * 100, prihlaseno > 0 ? 7 : 0)}%` }} />
              </span>
            ) : null}
            <p className="text-[12.5px] text-mech min-[90rem]:font-semibold">
              {kapacita}
              {neprecteno ? <span className="ml-2 font-semibold text-smrk">nové zprávy</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onDetail(expedice)}
              className={`nahled-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-smrk px-4 text-sm font-semibold text-papir min-[90rem]:w-auto min-[90rem]:rounded-[11px] min-[90rem]:bg-akcent min-[90rem]:pl-4 min-[90rem]:pr-3.5 ${FOKUS}`}
            >
              Detail a přihlášení
              <Ikona nazev="arrow-right" className="size-4 min-[90rem]:size-[15px]" />
            </button>
            <Link
              to={`/vypravy/${encodeURIComponent(expedice.id)}/kdo-jede`}
              className={`nahled-press hidden h-11 items-center gap-[7px] rounded-[11px] border border-linka bg-povrch px-3.5 text-[13.5px] font-medium text-mech min-[90rem]:inline-flex ${FOKUS}`}
            >
              <Ikona nazev="users" className="size-[15px]" />
              Kdo jede
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
