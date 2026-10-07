import type { JSX } from "react";
import { useSearchParams } from "react-router-dom";
import ExpeditionList from "../components/expeditions/ExpeditionList";
import { getExpeditionsSync } from "../lib/expeditions-api";

type Zobrazeni = "seznam" | "kalendar";

const VOLBY: Array<{ id: Zobrazeni; popisek: string }> = [
  { id: "seznam", popisek: "Seznam" },
  { id: "kalendar", popisek: "Kalendář" },
];

const DNY_V_TYDNU = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

// Statická ukázka října 2026 — 1. 10. vychází na čtvrtek (offset 3).
const OFFSET_RIJEN_2026 = 3;
const DNU_V_RIJNU = 31;
const DNY_S_VYPRAVOU = new Set<number>([17, 24]);

function parseZobrazeni(hodnota: string | null): Zobrazeni {
  return hodnota === "kalendar" ? "kalendar" : "seznam";
}

function KalendarPlaceholder(): JSX.Element {
  const bunky: Array<number | null> = [
    ...Array<number | null>(OFFSET_RIJEN_2026).fill(null),
    ...Array.from({ length: DNU_V_RIJNU }, (_, i) => i + 1),
  ];

  return (
    <div
      role="status"
      aria-label="Ukázka kalendáře – říjen 2026"
      className="rounded-lg border-2 border-inkoust bg-white/60 p-4 shadow-denik sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Říjen 2026 · ukázka</h2>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mech">
          Kalendářní pohled připravujeme
        </p>
      </div>
      <div
        aria-hidden="true"
        className="mt-4 grid grid-cols-7 gap-1.5 text-center"
      >
        {DNY_V_TYDNU.map((den) => (
          <span
            key={den}
            className="pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-mech"
          >
            {den}
          </span>
        ))}
        {bunky.map((den, index) => (
          <span
            key={index}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-md border text-sm tabular-nums ${
              den === null
                ? "border-transparent"
                : DNY_S_VYPRAVOU.has(den)
                  ? "border-inkoust bg-papir font-bold shadow-denik"
                  : "border-linka bg-papir/60 text-inkoust/70"
            }`}
          >
            {den ?? ""}
            {den !== null && DNY_S_VYPRAVOU.has(den) && (
              <span className="h-1.5 w-1.5 rounded-full bg-smrk" />
            )}
          </span>
        ))}
      </div>
      <p className="mt-4 border-t border-dashed border-linka pt-3 text-center text-sm text-inkoust/70">
        Tečky značí dny s výpravou. Plný kalendář s proklikem na detail
        doplníme v dalším kroku.
      </p>
    </div>
  );
}

export default function VypravyPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const zobrazeni = parseZobrazeni(searchParams.get("zobrazeni"));
  // Tenká read vrstva (Krok 5): build-time snapshot, jinak mock fallback.
  // Vzhled beze změny – ExpeditionList / ExpeditionEmpty / skeleton flow untouched.
  const { data: expedice } = getExpeditionsSync();

  function zmenZobrazeni(nove: Zobrazeni): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("zobrazeni", nove);
      return next;
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">
          ExApp · podzim 2026
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Výpravy
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Přehled {expedice.length} plánovaných i proběhlých akcí.
          Detail a přihlašování přibude v dalším kroku.
        </p>

        <div
          role="group"
          aria-label="Zobrazení výprav"
          className="mt-4 inline-flex rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik"
        >
          {VOLBY.map((volba) => {
            const aktivni = zobrazeni === volba.id;
            return (
              <button
                key={volba.id}
                type="button"
                aria-pressed={aktivni}
                onClick={() => zmenZobrazeni(volba.id)}
                className={`min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm font-bold transition-colors ${
                  aktivni
                    ? "bg-inkoust text-papir"
                    : "text-inkoust hover:bg-linka/60"
                }`}
              >
                {volba.popisek}
              </button>
            );
          })}
        </div>
      </header>

      <div className="pt-6">
        {zobrazeni === "seznam" ? (
          <ExpeditionList expedice={expedice} />
        ) : (
          <KalendarPlaceholder />
        )}
      </div>
    </main>
  );
}
