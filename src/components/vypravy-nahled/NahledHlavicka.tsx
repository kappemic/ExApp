import type { JSX, ReactNode } from "react";

type Zobrazeni = "seznam" | "kalendar";

const VOLBY: Array<{ id: Zobrazeni; popisek: string; ikona: ReactNode }> = [
  {
    id: "seznam",
    popisek: "Seznam",
    ikona: (
      <>
        <path d="M8 6h12M8 12h12M8 18h12" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </>
    ),
  },
  {
    id: "kalendar",
    popisek: "Kalendář",
    ikona: (
      <>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
];

/**
 * Hlavička stránky Výpravy (C2): nadpis, hledání, nová výprava a pod nimi
 * záložky Seznam / Kalendář s olivovou linkou. V kalendáři se hledání
 * schová, kalendář ho nefiltruje.
 */
export default function NahledHlavicka({
  zobrazeni,
  onZobrazeni,
  hledaniId,
  dotaz,
  onDotaz,
  hlaseni,
  novaVyprava,
}: {
  zobrazeni: Zobrazeni;
  onZobrazeni: (zobrazeni: Zobrazeni) => void;
  hledaniId: string;
  dotaz: string;
  onDotaz: (dotaz: string) => void;
  hlaseni: ReactNode;
  /** Shown only to people who may create a trip. */
  novaVyprava?: () => void;
}): JSX.Element {
  const maDotaz = dotaz.trim().length > 0;
  const vKalendari = zobrazeni === "kalendar";

  return (
    <header>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h1 className="min-w-0 text-4xl font-bold text-inkoust sm:text-5xl">Výpravy</h1>
          {novaVyprava !== undefined ? (
            <button
              type="button"
              onClick={novaVyprava}
              aria-label="Nová výprava"
              title="Nová výprava"
              className="nahled-press inline-flex h-11 min-h-[44px] w-11 min-w-[44px] touch-manipulation select-none items-center justify-center rounded-xl bg-okr text-inkoust hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk lg:hidden"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-3 lg:flex-1 lg:justify-end">
          <div
            role="search"
            className={`relative w-full min-w-0 lg:max-w-md ${vKalendari ? "hidden" : ""}`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-mech"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
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
              className={`min-h-[48px] w-full rounded-xl border border-pole bg-papir py-2 pl-11 text-base text-inkoust outline-none placeholder:text-mech ${
                maDotaz ? "pr-14" : "pr-4"
              }`}
            />
            {maDotaz ? (
              <button
                type="button"
                onClick={() => onDotaz("")}
                aria-label="Zrušit hledání"
                className="absolute right-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 touch-manipulation select-none items-center justify-center rounded-lg text-lg font-semibold leading-none text-mech hover:bg-mlha hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
              >
                ×
              </button>
            ) : null}
          </div>
          {novaVyprava !== undefined ? (
            <button
              type="button"
              onClick={novaVyprava}
              className="nahled-press hidden min-h-[48px] shrink-0 touch-manipulation select-none items-center justify-center rounded-xl bg-okr px-5 text-sm font-semibold text-inkoust hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk lg:inline-flex"
            >
              Nová výprava
            </button>
          ) : null}
        </div>
      </div>

      <div role="group" aria-label="Zobrazení výprav" className="mt-5 flex gap-6 border-b border-linka">
        {VOLBY.map((volba) => {
          const aktivni = volba.id === zobrazeni;
          return (
            <button
              key={volba.id}
              type="button"
              aria-pressed={aktivni}
              onClick={() => onZobrazeni(volba.id)}
              className={`bez-prejeti -mb-px inline-flex min-h-[48px] touch-manipulation select-none items-center gap-2 border-b-2 px-1 text-base transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk ${
                aktivni
                  ? "border-smrk font-semibold text-inkoust"
                  : "border-transparent font-medium text-mech hover:text-inkoust"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 ${aktivni ? "text-smrk" : ""}`}>
                {volba.ikona}
              </svg>
              <span className="max-sm:sr-only">{volba.popisek}</span>
            </button>
          );
        })}
      </div>

      {hlaseni !== null && hlaseni !== undefined && hlaseni !== false ? (
        <p aria-live="polite" className="mt-3 max-w-2xl text-base leading-relaxed text-mech">
          {hlaseni}
        </p>
      ) : null}
    </header>
  );
}
