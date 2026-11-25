import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { TlacitkoZpet, ZpetPocitac } from "../HlavickaZpet";
import Ikona, { type NazevIkony } from "../Ikona";

type Zobrazeni = "seznam" | "kalendar";
export type FiltrVypravHlavicky = "vse" | "nejblizsi" | "neuzavrene";

const VOLBY: Array<{ id: Zobrazeni; popisek: string; ikona: NazevIkony }> = [
  { id: "seznam", popisek: "Seznam", ikona: "list" },
  { id: "kalendar", popisek: "Kalendář", ikona: "calendar-days" },
];

/** Každý filtr je odkaz na vlastní stránku s tím druhem výprav. */
const FILTRY: Array<{ id: FiltrVypravHlavicky; popisek: string; cesta: string }> = [
  { id: "vse", popisek: "Vše", cesta: "/vypravy" },
  { id: "nejblizsi", popisek: "Nejbližší", cesta: "/vypravy/nejblizsi" },
  { id: "neuzavrene", popisek: "Neuzavřené", cesta: "/vypravy/neuzavrene" },
];

const FOKUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/**
 * Hlavička stránky Výpravy podle ExApp.pen („Telefon · Výpravy“ a „ExApp · Výpravy“).
 * Telefon: nadpis + podtitul, vpravo lupa a „Nová“; pod tím přepínač
 * Seznam / Kalendář a řádek čipů. Počítač (1440+): nadpis 46 px, vpravo pole
 * hledání a „Nová výprava“; přepínač vlevo, čipy vpravo v jednom řádku.
 */
export default function NahledHlavicka({
  zobrazeni,
  onZobrazeni,
  hledaniId,
  dotaz,
  onDotaz,
  hlaseni,
  novaVyprava,
  filtr,
  bezNeuzavrenych = false,
  podstranka,
  kalendarOvladani,
  mesicKalendare,
}: {
  zobrazeni: Zobrazeni;
  onZobrazeni: (zobrazeni: Zobrazeni) => void;
  hledaniId: string;
  dotaz: string;
  onDotaz: (dotaz: string) => void;
  hlaseni: ReactNode;
  /** Shown only to people who may create a trip. */
  novaVyprava?: () => void;
  filtr: FiltrVypravHlavicky;
  /** Neuzavřené výpravy vidí jen ten, kdo je smí uzavřít. */
  bezNeuzavrenych?: boolean;
  /** Stránka jednoho druhu výprav: vlastní nadpis a návrat, bez přepínače a „Nová“. */
  podstranka?: { nadpis: string; podtitul: string; onZpet: () => void };
  /** Navigace měsíce a legenda, v kalendáři na počítači vpravo v liště. */
  kalendarOvladani?: ReactNode;
  /** „Prosinec 2026“ pod nadpisem kalendáře na telefonu. */
  mesicKalendare?: string;
}): JSX.Element {
  const maDotaz = dotaz.trim().length > 0;
  const vKalendari = zobrazeni === "kalendar";
  const [hledaniMobil, setHledaniMobil] = useState<boolean>(maDotaz);
  const poleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hledaniMobil) poleRef.current?.focus();
  }, [hledaniMobil]);

  const pole = (
    <div role="search" className="relative w-full min-w-0">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
        <Ikona nazev="search" className="size-[17px]" />
      </span>
      <input
        ref={poleRef}
        id={hledaniId}
        type="search"
        name="nazev"
        value={dotaz}
        onChange={(e) => onDotaz(e.target.value)}
        aria-label="Hledat podle jména"
        placeholder="Hledat výpravu"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className={`h-[46px] w-full rounded-xl border border-linka bg-povrch py-2 pl-[40px] text-base text-inkoust outline-none placeholder:text-ink-3 focus:border-pole min-[90rem]:text-sm ${
          maDotaz ? "pr-12" : "pr-3.5"
        }`}
      />
      {maDotaz ? (
        <button
          type="button"
          onClick={() => onDotaz("")}
          aria-label="Zrušit hledání"
          className={`absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-lg text-ink-3 hover:text-inkoust ${FOKUS}`}
        >
          <Ikona nazev="x" className="size-4" />
        </button>
      ) : null}
    </div>
  );

  return (
    <header className={`flex flex-col ${vKalendari ? "gap-5 min-[90rem]:gap-8 min-[90rem]:pt-1" : "gap-[22px] min-[90rem]:gap-[18px]"}`}>
      {podstranka !== undefined ? <ZpetPocitac zpet="/vypravy" popisek="Všechny výpravy" className="!mb-0" /> : null}
      <div className="flex min-w-0 items-center justify-between gap-3 min-[90rem]:items-end">
        <div className="flex min-w-0 items-center gap-3">
        {podstranka !== undefined ? (
          <span className="flex min-[90rem]:hidden">
            <TlacitkoZpet popisek="Zpět na všechny výpravy" onClick={podstranka.onZpet} />
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
            {podstranka?.nadpis ?? "Výpravy"}
          </h1>
          <p className="text-xs text-ink-3 first-letter:uppercase min-[90rem]:hidden">
            {podstranka?.podtitul ?? (vKalendari && mesicKalendare !== undefined ? mesicKalendare : "Školní expediční klub")}
          </p>
        </div>
        </div>
        <div className={`flex shrink-0 items-center gap-3 ${vKalendari ? "max-[90rem]:hidden min-[90rem]:gap-2.5" : ""}`}>
              <button
                type="button"
                onClick={() => setHledaniMobil((pred) => !pred)}
                aria-label="Hledat výpravu"
                aria-expanded={hledaniMobil}
                aria-controls={hledaniId}
                className={`nahled-press flex size-11 touch-manipulation items-center justify-center rounded-xl border border-linka bg-povrch text-mech min-[90rem]:hidden ${FOKUS}`}
              >
                <Ikona nazev="search" className="size-[18px]" />
              </button>
              <div className="hidden w-[252px] min-[90rem]:block">{pole}</div>
          {novaVyprava !== undefined ? (
            <button
              type="button"
              onClick={novaVyprava}
              aria-label="Nová výprava"
              className={`nahled-press inline-flex h-11 touch-manipulation select-none items-center justify-center gap-1.5 rounded-xl bg-smrk px-3.5 text-[13.5px] font-semibold text-papir hover:opacity-90 min-[90rem]:h-[46px] min-[90rem]:gap-2 min-[90rem]:pl-4 min-[90rem]:pr-[18px] min-[90rem]:text-sm ${FOKUS}`}
            >
              <Ikona nazev="plus" className="size-4" />
              <span className="min-[90rem]:hidden">Nová</span>
              <span className="hidden min-[90rem]:inline">Nová výprava</span>
            </button>
          ) : null}
        </div>
      </div>

      {hledaniMobil && !vKalendari ? <div className="min-[90rem]:hidden">{pole}</div> : null}

      <div className={`flex min-w-0 flex-col gap-[22px] min-[90rem]:flex-row min-[90rem]:items-center min-[90rem]:justify-between ${vKalendari ? "min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4" : ""}`}>
        {podstranka === undefined ? (
        <div
          role="group"
          aria-label="Zobrazení výprav"
          className={`inline-flex w-fit items-center min-[90rem]:h-auto min-[90rem]:gap-0.5 min-[90rem]:bg-povrch-2 min-[90rem]:p-1 ${
            vKalendari ? "gap-2 min-[90rem]:rounded-xl" : "h-9 gap-0.5 rounded-[18px] bg-povrch-2 p-[3px] min-[90rem]:rounded-[13px]"
          }`}
        >
          {VOLBY.map((volba) => {
            const aktivni = volba.id === zobrazeni;
            return (
              <button
                key={volba.id}
                type="button"
                aria-pressed={aktivni}
                onClick={() => onZobrazeni(volba.id)}
                className={`bez-prejeti inline-flex touch-manipulation select-none items-center transition-colors motion-reduce:transition-none ${
                  vKalendari ? "h-8 rounded-full px-3 text-[13px] max-[90rem]:border" : "h-[30px] gap-1.5 rounded-[15px] px-3 text-[12.5px]"
                } min-[90rem]:h-auto min-[90rem]:gap-[7px] min-[90rem]:rounded-[9px] min-[90rem]:px-3.5 min-[90rem]:py-[7px] min-[90rem]:text-[13.5px] ${FOKUS} ${
                  vKalendari
                    ? aktivni
                      ? "font-semibold text-povrch max-[90rem]:border-transparent max-[90rem]:bg-smrk min-[90rem]:bg-povrch min-[90rem]:text-inkoust"
                      : "font-medium text-mech max-[90rem]:border-linka max-[90rem]:bg-povrch hover:text-inkoust"
                    : aktivni
                      ? "bg-povrch font-semibold text-inkoust shadow-[0_1px_2px_#1c261514] min-[90rem]:shadow-none"
                      : "font-medium text-mech hover:text-inkoust"
                }`}
              >
                <Ikona
                  nazev={volba.ikona}
                  className={`size-[13px] min-[90rem]:size-[15px] ${vKalendari ? "max-[90rem]:hidden" : ""} ${aktivni ? "text-inkoust" : "text-ink-3"}`}
                />
                <span>{volba.popisek}</span>
              </button>
            );
          })}
        </div>
        ) : null}

        {!vKalendari ? (
          <nav aria-label="Druh výprav" className="flex min-w-0 items-center gap-2 min-[90rem]:gap-3">
            {FILTRY.filter((volba) => volba.id !== "neuzavrene" || !bezNeuzavrenych).map((volba) => {
              const vybrano = filtr === volba.id;
              return (
                <Link
                  key={volba.id}
                  to={volba.cesta}
                  aria-current={vybrano ? "page" : undefined}
                  className={`nahled-press relative inline-flex h-8 shrink-0 touch-manipulation items-center rounded-full border px-3 text-[13px] before:absolute before:-inset-x-1 before:-inset-y-1.5 min-[90rem]:h-auto min-[90rem]:px-[13px] min-[90rem]:py-[7px] ${FOKUS} ${
                    vybrano
                      ? "border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-inkoust"
                      : "border-linka bg-povrch font-medium text-mech min-[90rem]:bg-transparent"
                  }`}
                >
                  {volba.popisek}
                </Link>
              );
            })}
          </nav>
        ) : kalendarOvladani !== undefined ? (
          <div className="hidden min-[90rem]:block">{kalendarOvladani}</div>
        ) : null}
      </div>

      {hlaseni !== null && hlaseni !== undefined && hlaseni !== false ? (
        <p aria-live="polite" className="-mt-2 max-w-2xl text-sm leading-relaxed text-mech">
          {hlaseni}
        </p>
      ) : null}
    </header>
  );
}
