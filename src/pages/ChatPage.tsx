import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import {
  getExpeditions,
  getExpeditionsSync,
} from "../lib/expeditions-api";
import { getZpravy, type ApiZprava } from "../lib/diskuze-api";
import { formatCasKratce } from "../lib/format-cas";

/** Jedna položka živé nástěnky — zpráva + kontext výpravy pro proklik. */
export interface PolozkaNastenky {
  zprava: ApiZprava;
  idVypravy: string;
  nazevVypravy: string;
}

type StavNastenky = "nacitani" | "hotovo" | "chyba";

const MAX_POLOZEK = 20;
const ZPRAV_NA_VYPRAVU = 5;

/* ------------------------------------------------------------------ */
/* Pure pomocníci — export pro testy (bez jsdom, bez fetch).            */
/* ------------------------------------------------------------------ */

/** Nejnovější první (created_at DESC, tie-break id). */
export function seradNastenkuSestupne(polozky: PolozkaNastenky[]): PolozkaNastenky[] {
  return [...polozky].sort((a, b) => {
    const cas: number =
      Date.parse(b.zprava.createdAt) - Date.parse(a.zprava.createdAt);
    if (cas !== 0) return cas;
    return a.zprava.id.localeCompare(b.zprava.id);
  });
}

/** Z každé výpravy vezme jen poslední (nejnovější) zprávy — vlákno je ASC. */
export function vezmiNejnovesi(
  zpravy: ApiZprava[],
  pocet: number,
): ApiZprava[] {
  if (pocet <= 0) return [];
  return zpravy.slice(-pocet);
}

/** Česká pluralizace počtu zpráv: 1 zpráva / 2–4 zprávy / 5+ zpráv. */
export function tvarZpravy(pocet: number): string {
  if (pocet === 1) return "zpráva";
  if (pocet >= 2 && pocet <= 4) return "zprávy";
  return "zpráv";
}

/** Česká pluralizace počtu výprav: 1 výprava / 2–4 výpravy / 0 a 5+ výprav. */
export function tvarVypravy(pocet: number): string {
  if (pocet === 1) return "výprava";
  if (pocet >= 2 && pocet <= 4) return "výpravy";
  return "výprav";
}

/**
 * Krátký český formát času položky nástěnky.
 * Re-export z `src/lib/format-cas.ts` pro zpětnou kompatibilitu
 * test-importů; jediná implementace žije ve `formatCasKratce`.
 */
export function formatCasNastenky(iso: string): string {
  return formatCasKratce(iso);
}

/**
 * Živá nástěnka — nejnovější zprávy napříč výpravami s proklikem.
 * Deníkové tokeny (border-inkoust, bg-papir, shadow-denik), mobile-first
 * (360px bez horizontálního scrollu: min-w-0 + overflow-wrap:anywhere
 * + truncate jen s title). Bez composeru — psaní patří do DiskuzeBoxu
 * v detailu výpravy (klávesnice tu nemá co zakrývat).
 */
export default function ChatPage(): JSX.Element {
  const [stav, setStav] = useState<StavNastenky>("nacitani");
  const [polozky, setPolozky] = useState<PolozkaNastenky[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pocetVyprav, setPocetVyprav] = useState<number>(0);

  useEffect(() => {
    let zive = true;
    void (async (): Promise<void> => {
      setStav("nacitani");
      setChyba(null);
      /* Seznam výprav: synchronní snapshot hned, živý BFF jako upgrade. */
      let vypravy = getExpeditionsSync().data;
      try {
        const cerstve = await getExpeditions();
        if (cerstve.source === "db" && cerstve.data.length > 0) {
          vypravy = cerstve.data;
        }
      } catch {
        /* Offline — zůstanou snapshot/mocky, vlákna pak hlásí offline. */
      }
      if (!zive) return;
      setPocetVyprav(vypravy.length);
      if (vypravy.length === 0) {
        setPolozky([]);
        setStav("hotovo");
        return;
      }
      /* Nejnovější výpravy první — omezí počet vláken v jednom renderu. */
      const serazene = [...vypravy].sort((a, b) =>
        b.datum.localeCompare(a.datum),
      );
      const vybrane = serazene.slice(0, 12);
      const vysledky = await Promise.all(
        vybrane.map(async (vyprava) => {
          const vlakno = await getZpravy(vyprava.id, {
            limit: ZPRAV_NA_VYPRAVU,
          });
          if (!vlakno.ok) return null;
          return vezmiNejnovesi(vlakno.data.zpravy, ZPRAV_NA_VYPRAVU).map(
            (zprava): PolozkaNastenky => ({
              zprava,
              idVypravy: vyprava.id,
              nazevVypravy: vyprava.nazev,
            }),
          );
        }),
      );
      if (!zive) return;
      const neuspesne: number = vysledky.filter((r) => r === null).length;
      const vse: PolozkaNastenky[] = vysledky
        .filter((r): r is PolozkaNastenky[] => r !== null)
        .flat();
      setPolozky(seradNastenkuSestupne(vse).slice(0, MAX_POLOZEK));
      if (vse.length === 0 && neuspesne > 0) {
        setStav("chyba");
        setChyba("Nástěnku se nepodařilo načíst. Zkus to prosím později.");
      } else {
        setStav("hotovo");
      }
    })();
    return () => {
      zive = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Školní expediční klub</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
            Nástěnka
          </h1>
          <span className="inline-flex shrink-0 -rotate-3 items-center whitespace-nowrap rounded border-2 border-inkoust bg-smrk px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-papir shadow-razitko tabular-nums">
            {stav === "hotovo"
              ? `${polozky.length} ${tvarZpravy(polozky.length)}`
              : "Živě"}
          </span>
        </div>
        <p className="mt-2 max-w-2xl min-w-0 break-words text-base text-inkoust/75">
          Nejnovější vzkazy z diskuzí napříč výpravami. Psát se dá v detailu
          každé výpravy — tady se jen čte a proklikává.
        </p>
      </header>

      <div className="mx-auto w-full max-w-2xl min-w-0 pt-6">
        {stav === "nacitani" && (
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Načítám nástěnku"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl bg-inkoust/10 motion-reduce:animate-none"
              />
            ))}
            <p role="status" className="text-sm text-inkoust/70">
              Načítám nejnovější vzkazy…
            </p>
          </div>
        )}

        {stav === "chyba" && (
          <div className="rounded-lg border-2 border-inkoust bg-papir p-6 text-center shadow-denik">
            <p role="alert" className="text-sm font-semibold">
              {chyba ?? "Nástěnku se nepodařilo načíst."}
            </p>
            <Link
              to="/vypravy"
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-6 text-sm font-bold text-papir [touch-action:manipulation]"
            >
              Přejít na výpravy
            </Link>
          </div>
        )}

        {stav === "hotovo" && polozky.length === 0 && (
          <div
            role="status"
            className="flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-white/60 px-6 py-14 text-center shadow-denik"
          >
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-inkoust bg-papir shadow-razitko"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7 text-smrk"
              >
                <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z" />
                <path d="M8.5 9.5h7" />
                <path d="M8.5 12.5h4" />
              </svg>
            </div>
            <h2 className="mt-5 min-w-0 break-words text-lg font-bold tracking-tight">
              Zatím tu je ticho
            </h2>
            <p className="mt-1.5 max-w-sm min-w-0 break-words text-sm leading-relaxed text-inkoust/70">
              {pocetVyprav === 0
                ? "Zatím nejsou žádné výpravy — domluva se tu objeví s první diskuzí."
                : "Žádná výprava zatím nemá vzkaz. Otevři výpravu a začni domluvu první zprávou."}
            </p>
            <Link
              to="/vypravy"
              className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-6 text-sm font-bold text-papir [touch-action:manipulation] motion-safe:transition-colors motion-safe:hover:bg-inkoust"
            >
              Přejít na výpravy
            </Link>
            <p
              aria-hidden="true"
              className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
            >
              exapp · ticho před poradou
            </p>
          </div>
        )}

        {stav === "hotovo" && polozky.length > 0 && (
          <>
            <p
              role="status"
              className="text-[13px] font-semibold text-inkoust/60 tabular-nums"
            >
              Nejnovějších {polozky.length} {tvarZpravy(polozky.length)} z{" "}
              {pocetVyprav} {tvarVypravy(pocetVyprav)}.
            </p>
            <ul role="list" className="mt-3 min-w-0 space-y-3">
              {polozky.map((polozka) => {
                const cas: string = formatCasNastenky(
                  polozka.zprava.createdAt,
                );
                return (
                  <li
                    key={`${polozka.idVypravy}-${polozka.zprava.id}`}
                    className="min-w-0 rounded-2xl border-2 border-inkoust bg-papir p-4 shadow-denik"
                  >
                    <div className="flex min-w-0 items-baseline justify-between gap-2">
                      <span
                        title={polozka.nazevVypravy}
                        className="min-w-0 flex-1 truncate text-[12px] font-extrabold uppercase tracking-[0.12em] text-smrk"
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {polozka.nazevVypravy}
                      </span>
                      {cas.length > 0 && (
                        <time
                          dateTime={polozka.zprava.createdAt}
                          className="shrink-0 whitespace-nowrap text-[11px] text-inkoust/55 tabular-nums"
                        >
                          {cas}
                        </time>
                      )}
                    </div>
                    <p
                      title={polozka.zprava.text}
                      className="mt-1.5 min-w-0 break-words text-[15px] leading-relaxed [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {polozka.zprava.text}
                    </p>
                    <div className="mt-2.5 flex justify-end border-t border-dashed border-linka pt-2.5">
                      <Link
                        to="/vypravy"
                        aria-label={`Otevřít výpravu ${polozka.nazevVypravy}`}
                        title={`Otevřít výpravu ${polozka.nazevVypravy}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold [touch-action:manipulation] motion-safe:transition-colors motion-safe:hover:bg-linka/50"
                      >
                        Otevřít výpravu →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
