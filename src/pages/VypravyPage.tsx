import { useMemo, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import ExpeditionList from "../components/expeditions/ExpeditionList";
import ExpeditionModal from "../components/expeditions/ExpeditionModal";
import { getExpeditionsSync } from "../lib/expeditions-api";
import type { Expedition } from "../lib/mock-expeditions";

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
      className="rounded-3xl border-2 border-inkoust bg-karta p-4 shadow-denik sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-galerie text-2xl italic">Říjen 2026 · ukázka</h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-inkoust/55">
          Kalendářní sál připravujeme
        </p>
      </div>
      <div
        aria-hidden="true"
        className="mt-4 grid grid-cols-7 gap-1.5 text-center"
      >
        {DNY_V_TYDNU.map((den) => (
          <span
            key={den}
            className="pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-inkoust/55"
          >
            {den}
          </span>
        ))}
        {bunky.map((den, index) => (
          <span
            key={index}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-2xl border text-sm tabular-nums ${
              den === null
                ? "border-transparent"
                : DNY_S_VYPRAVOU.has(den)
                  ? "border-inkoust bg-papir font-bold shadow-denik"
                  : "border-inkoust/15 bg-papir/50 text-inkoust/60"
            }`}
          >
            {den ?? ""}
            {den !== null && DNY_S_VYPRAVOU.has(den) && (
              <span className="h-1.5 w-1.5 rounded-full bg-jantar" />
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
  // Lokální stav, aby se účast / úprava / uzavření propsaly bez refetche.
  const [expedice, setExpedice] = useState<Expedition[]>(
    () => getExpeditionsSync().data,
  );
  const [vybrana, setVybrana] = useState<Expedition | null>(null);

  const nadchazejici: Expedition[] = useMemo(
    () => expedice.filter((e) => e.stav !== "proběhlá"),
    [expedice],
  );
  const probehle: Expedition[] = useMemo(
    () => expedice.filter((e) => e.stav === "proběhlá"),
    [expedice],
  );

  function zmenZobrazeni(nove: Zobrazeni): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("zobrazeni", nove);
      return next;
    });
  }

  function naAktualizaci(nova: Expedition): void {
    setExpedice((prev) => prev.map((e) => (e.id === nova.id ? nova : e)));
    setVybrana((prev) => (prev !== null && prev.id === nova.id ? nova : prev));
  }

  function naSmazana(id: string): void {
    setExpedice((prev) => prev.filter((e) => e.id !== id));
    setVybrana(null);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-inkoust/60">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="tabular-nums">01</span>
          <span>Sály galerie</span>
        </span>
        <span>ExApp · podzim 2026</span>
      </div>

      <header className="pt-4 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-inkoust/55">
          Velká sbírka tras oddílu
        </p>
        <h1 className="font-galerie mx-auto mt-2 max-w-3xl text-[clamp(2.4rem,7vw,4.6rem)] leading-[0.95]">
          Výpravy <span className="italic font-light">sbírky</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-inkoust/70">
          Přehled {expedice.length} plánovaných i proběhlých akcí.
          Každá výprava je obraz s vlastním číslem v katalogu.
        </p>

        <div
          role="group"
          aria-label="Zobrazení výprav"
          className="mt-5 inline-flex rounded-full border-2 border-inkoust bg-karta p-1 shadow-denik"
        >
          {VOLBY.map((volba) => {
            const aktivni = zobrazeni === volba.id;
            return (
              <button
                key={volba.id}
                type="button"
                aria-pressed={aktivni}
                onClick={() => zmenZobrazeni(volba.id)}
                className={`min-h-[44px] min-w-[44px] rounded-full px-6 py-2 text-sm font-bold transition-colors ${
                  aktivni
                    ? "bg-inkoust text-papir"
                    : "text-inkoust/70 hover:text-inkoust"
                }`}
              >
                {volba.popisek}
              </button>
            );
          })}
        </div>
      </header>

      <div className="pt-8">
        {zobrazeni === "seznam" ? (
          <div className="space-y-10">
            <section aria-labelledby="nadchazejici-nadpis">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="nadchazejici-nadpis" className="font-galerie text-3xl italic">
                  Nadcházející
                </h2>
                <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-inkoust/55 tabular-nums">
                  {nadchazejici.length} {nadchazejici.length === 1 ? "výprava" : nadchazejici.length >= 2 && nadchazejici.length <= 4 ? "výpravy" : "výprav"}
                </p>
              </div>
              <div className="pt-4">
                <ExpeditionList expedice={nadchazejici} onDetail={setVybrana} />
              </div>
            </section>

            <section aria-labelledby="historie-nadpis">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-inkoust pt-8">
                <h2 id="historie-nadpis" className="font-galerie text-3xl italic">
                  Proběhlé · historie
                </h2>
                <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-inkoust/55 tabular-nums">
                  {probehle.length} {probehle.length === 1 ? "záznam" : probehle.length >= 2 && probehle.length <= 4 ? "záznamy" : "záznamů"}
                </p>
              </div>
              <p className="mt-2 text-sm text-inkoust/70">
                Archiv galerie — přihlašování je uzavřené, detail ukazuje docházku.
              </p>
              <div className="pt-4">
                <ExpeditionList expedice={probehle} onDetail={setVybrana} />
              </div>
            </section>
          </div>
        ) : (
          <KalendarPlaceholder />
        )}
      </div>

      {vybrana !== null && (
        <ExpeditionModal
          key={vybrana.id}
          expedice={vybrana}
          onZavrit={() => setVybrana(null)}
          onAktualizace={naAktualizaci}
          onSmazana={naSmazana}
        />
      )}
    </main>
  );
}
