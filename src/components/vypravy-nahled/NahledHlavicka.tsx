import type { JSX, ReactNode } from "react";
import NahledPrepinac from "./NahledPrepinac";

type Zobrazeni = "seznam" | "kalendar";

const VOLBY: Array<{ id: Zobrazeni; popisek: string }> = [
  { id: "seznam", popisek: "Seznam" },
  { id: "kalendar", popisek: "Kalendář" },
];

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
  return (
    <header>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <h1 className="text-balance text-3xl font-light leading-tight md:text-5xl">
          Výpravy
        </h1>
        {novaVyprava !== undefined ? (
          <button
            type="button"
            onClick={novaVyprava}
            className="nahled-press nahled-prejeti inline-flex min-h-[44px] items-center border border-[hsl(var(--foreground))] px-4 font-condensed text-sm"
          >
            Nová výprava
          </button>
        ) : null}
      </div>
      <div className="mt-10 flex items-center justify-between gap-4 md:gap-8">
        <div role="search" className="min-w-0 max-w-xl flex-1">
          <div className="nahled-hledani flex items-end gap-3 border-b border-[hsl(var(--hairline))]">
          <input
            id={hledaniId}
            type="search"
            name="nazev"
            value={dotaz}
            onChange={(e) => onDotaz(e.target.value)}
            aria-label="Hledat podle jména"
            placeholder="název výpravy…"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 border-0 bg-transparent py-3 text-xl font-light text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
          />
          {dotaz.trim().length > 0 ? (
            <button
              type="button"
              onClick={() => onDotaz("")}
              aria-label="Zrušit hledání"
              className="mb-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center font-condensed text-lg leading-none"
            >
              ×
            </button>
          ) : null}
          </div>
        </div>
        <NahledPrepinac
          ariaLabel="Zobrazení výprav"
          volby={VOLBY}
          aktivni={zobrazeni}
          onZmena={onZobrazeni}
          roztahnout={false}
        />
      </div>
      {hlaseni !== null && hlaseni !== undefined && hlaseni !== false ? (
        <p
          aria-live="polite"
          className="mt-3 max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]"
        >
          {hlaseni}
        </p>
      ) : null}
    </header>
  );
}
