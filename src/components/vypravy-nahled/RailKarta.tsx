import type { JSX, ReactNode } from "react";
import Ikona from "../Ikona";

const FOKUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/** Karta pravého sloupce podle ExApp.pen („Rail · Agenda“, „Rail · Pending“). */
export function RailKarta({
  id,
  nadpis,
  odkaz,
  children,
  zbyva,
  onVse,
}: {
  id: string;
  nadpis: string;
  odkaz: { popisek: string; onClick: () => void };
  children: ReactNode;
  /** Celkový počet. Když je větší než počet řádků, dole je „Zobrazit všech N“. */
  zbyva?: number;
  onVse?: () => void;
}): JSX.Element {
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-linka bg-povrch p-5 shadow-denik"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">
          {nadpis}
        </h2>
        <button
          type="button"
          onClick={odkaz.onClick}
          className={`bez-prejeti -mr-1 inline-flex min-h-11 items-center gap-[5px] px-1 text-[12.5px] font-semibold text-mech ${FOKUS}`}
        >
          {odkaz.popisek}
          <Ikona nazev="arrow-right" className="size-[13px] text-ink-3" />
        </button>
      </div>
      {children}
      {zbyva !== undefined && onVse !== undefined ? (
        <button
          type="button"
          onClick={onVse}
          className={`bez-prejeti -mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-[13px] font-semibold text-mech hover:bg-mlha/60 ${FOKUS}`}
        >
          Zobrazit všech {zbyva}
        </button>
      ) : null}
    </section>
  );
}

/** Jeden řádek: okénko s datem, název, podtitul, volitelně ikona vpravo. */
export function RailRadek({
  den,
  popisekDne,
  nazev,
  podtitul,
  zvyraznit = false,
  ikona,
  onClick,
}: {
  den: string;
  popisekDne: string;
  nazev: string;
  podtitul: string;
  /** Výprava má okénko v olivové mlze, schůzka v šedé. */
  zvyraznit?: boolean;
  ikona?: ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <li className="border-b border-linka pb-3.5 last:border-b-0 last:pb-0">
      <button
        type="button"
        onClick={onClick}
        className={`bez-prejeti flex w-full items-center gap-3 rounded-xl text-left hover:bg-povrch-2/60 ${FOKUS}`}
      >
        <span
          className={`flex h-[46px] w-[42px] shrink-0 flex-col items-center justify-center rounded-[11px] ${
            zvyraznit ? "bg-mlha text-smrk" : "bg-povrch-2 text-inkoust"
          }`}
        >
          <span className="font-display text-[17px] font-bold leading-[1.05]">{den}</span>
          <span
            className={`text-[9.5px] font-semibold uppercase tracking-[0.6px] ${zvyraznit ? "text-smrk" : "text-ink-3"}`}
          >
            {popisekDne}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-semibold leading-[1.3] text-inkoust">{nazev}</span>
          <span className="truncate text-xs text-ink-3">{podtitul}</span>
        </span>
        {ikona}
      </button>
    </li>
  );
}
