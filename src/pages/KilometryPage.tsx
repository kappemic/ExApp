import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import Ikona from "../components/Ikona";
import PrazdnyStav from "../components/PrazdnyStav";
import { GrafSloupce, TabulkaMesicu } from "../components/zebricky/KilometryGrafy";
import { formatCelyDatum } from "../lib/expedition-utils";
import { ceskyPocet, formatKmNaDesetinu, formatKmZaokrouhlene } from "../lib/format-cisla";
import { useNabeh } from "../lib/pohyb";
import { getTrasyZebricku } from "../lib/zebricky-api";
import { kmPodleLet, nazevMesice, soucetKm } from "../lib/zebricky-mesice";
import type { ZebrickyTrasa } from "../shared/api-types";

const KARTA = "rounded-2xl border border-linka bg-povrch p-4 min-[90rem]:p-5 min-[90rem]:shadow-denik";
const NADPIS_KARTY = "font-sans text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3";
const NEJSILNEJSICH = 5;

/**
 * Kilometry klubu po měsících (`/zebricky/kilometry`). Celkem ukazuje roky
 * a tabulku roky × měsíce, vybraný rok všech 12 měsíců a jeho výpravy.
 * Období drží adresa (`?rok=2026&mesic=10`), aby šlo sdílet a vrátit se k němu.
 */
export default function KilometryPage(): JSX.Element {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [trasy, setTrasy] = useState<ZebrickyTrasa[] | null>(null);
  const [chyba, setChyba] = useState(false);
  const [pokus, setPokus] = useState(0);

  useEffect(() => {
    let zive = true;
    setTrasy(null);
    setChyba(false);
    void (async (): Promise<void> => {
      const vysledek = await getTrasyZebricku("celkem");
      if (!zive) return;
      setChyba(vysledek.source === "fallback");
      setTrasy([...vysledek.data.trasy].sort((a, b) => b.datum.localeCompare(a.datum)));
    })();
    return () => {
      zive = false;
    };
  }, [pokus]);

  const roky = useMemo(() => kmPodleLet(trasy ?? []), [trasy]);
  const odNejnovejsiho = useMemo(() => [...roky].reverse(), [roky]);
  const nejsilnejsi = useMemo(
    () =>
      roky
        .flatMap((r) => r.mesice)
        .filter((m) => m.km > 0)
        .sort((a, b) => b.km - a.km || b.klic.localeCompare(a.klic))
        .slice(0, NEJSILNEJSICH),
    [roky],
  );

  // Rok nebo měsíc z adresy, ke kterému nejsou data, se ignoruje.
  // S jediným rokem není co srovnávat, ukážou se rovnou jeho měsíce.
  const jedinyRok = roky.length === 1 ? (roky[0] ?? null) : null;
  const vybranyRok = jedinyRok ?? roky.find((r) => String(r.rok) === params.get("rok")) ?? null;
  const vybranyMesic = vybranyRok?.mesice.find((m) => m.klic.slice(5) === params.get("mesic") && m.km > 0)?.klic ?? null;
  const obsahRef = useNabeh<HTMLDivElement>(vybranyRok === null ? "celkem" : String(vybranyRok.rok), "zadna");

  // Rok vybraný z tabulky může mít štítek mimo obraz.
  const stitkyRef = useRef<HTMLDivElement | null>(null);
  const klicRoku = vybranyRok?.rok ?? null;
  useEffect(() => {
    const stitky = stitkyRef.current;
    const aktivni = stitky?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (stitky === null || aktivni == null) return;
    stitky.scrollLeft += aktivni.getBoundingClientRect().left - stitky.getBoundingClientRect().left - 20;
  }, [klicRoku, trasy]);

  function nastav(rok: number | null, mesic: string | null = null): void {
    const dalsi = new URLSearchParams();
    if (rok !== null) dalsi.set("rok", String(rok));
    if (mesic !== null) dalsi.set("mesic", mesic);
    // Jiný rok vymění celý obsah, čte se odshora.
    if (rok !== klicRoku) window.scrollTo(0, 0);
    // Stav se předává dál, jinak by šipka zpět zapomněla, odkud člověk přišel.
    setParams(dalsi, { replace: true, state: location.state as unknown });
  }

  const vObdobi = (trasy ?? []).filter((t) => vybranyRok === null || t.datum.startsWith(`${vybranyRok.rok}-`));
  const vSeznamu = vybranyMesic === null ? vObdobi : vObdobi.filter((t) => t.datum.startsWith(vybranyMesic));
  const souhrn = `${formatKmZaokrouhlene(soucetKm(vObdobi))} · ${vObdobi.length} ${ceskyPocet(vObdobi.length, "výprava", "výpravy", "výprav")}`;
  const volby = [
    ...(jedinyRok === null ? [{ rok: null, popisek: "Celkem" }] : []),
    ...odNejnovejsiho.map((r) => ({ rok: r.rok, popisek: String(r.rok) })),
  ];
  const odkud = `${location.pathname}${location.search}`;

  return (
    <main className="nocturne mx-auto w-full max-w-[46rem] px-5 pb-6 pt-4 sm:px-6 sm:pt-8 lg:max-w-[70rem] min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet zpet="/zebricky" zpetPopisek="Zpět na žebříčky" titulek="Kilometry" varianta="nadpis" className="min-[90rem]:hidden" />
      <ZpetPocitac zpet="/zebricky" popisek="Zpět" />
      <h1 className="hidden font-display text-[46px] font-bold leading-[45px] tracking-[-1.4px] text-inkoust min-[90rem]:block">
        Kilometry
      </h1>

      {trasy === null ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Načítám kilometry"
          className="mt-5 h-80 animate-pulse rounded-2xl bg-[#ede8d9] motion-reduce:animate-none min-[90rem]:mt-8"
        />
      ) : chyba ? (
        <div role="alert" className="mt-5 flex flex-col items-center gap-1 rounded-2xl border border-linka bg-povrch p-5 text-center shadow-karta min-[90rem]:mt-8">
          <h2 className="text-base font-bold tracking-tight">Kilometry se nepodařilo načíst</h2>
          <p className="text-sm text-mech">Zkontroluj připojení a zkus to znovu.</p>
          <button
            type="button"
            onClick={() => setPokus((p) => p + 1)}
            className="nahled-press mt-2 min-h-11 rounded-xl border border-linka bg-povrch px-4 text-sm font-semibold text-mech focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          >
            Zkusit znovu
          </button>
        </div>
      ) : roky.length === 0 ? (
        <PrazdnyStav
          ikona={<Ikona nazev="chart-column" className="size-[18px]" />}
          nadpis="Zatím žádné kilometry"
          text="Jakmile proběhne první výprava, objeví se tu její měsíc."
          akce={{ popisek: "Na výpravy", odkaz: "/vypravy", varianta: "vedlejsi" }}
          className="mt-5 min-[90rem]:mt-8"
        />
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-3 min-[90rem]:mt-8 min-[90rem]:flex-row min-[90rem]:items-center min-[90rem]:justify-between min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4">
            <div ref={stitkyRef} role="group" aria-label="Období" className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
              {volby.map((volba) => {
                const aktivni = (vybranyRok?.rok ?? null) === volba.rok;
                return (
                  <button
                    key={volba.popisek}
                    type="button"
                    aria-pressed={aktivni}
                    onClick={() => nastav(volba.rok)}
                    className="group flex min-h-11 shrink-0 touch-manipulation items-center focus-visible:outline-none"
                  >
                    <span
                      className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-okr motion-reduce:transition-none min-[90rem]:h-auto min-[90rem]:px-3.5 min-[90rem]:py-2 ${
                        aktivni
                          ? "border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-inkoust"
                          : "border-linka bg-povrch font-medium text-mech group-hover:bg-povrch-2 min-[90rem]:bg-transparent"
                      }`}
                    >
                      {volba.popisek}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="shrink-0 text-[13px] font-medium text-ink-3">{souhrn}</p>
          </div>

          <div
            ref={obsahRef}
            className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start min-[90rem]:mt-8 min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:gap-9"
          >
            {vybranyRok === null ? (
              <>
                <div className="flex min-w-0 flex-col gap-5">
                  <section aria-labelledby="km-roky" className={`flex flex-col gap-3.5 ${KARTA}`}>
                    <h2 id="km-roky" className={NADPIS_KARTY}>Km podle let</h2>
                    <GrafSloupce
                      posuvny
                      popisek="Kilometry podle let"
                      sloupce={roky.map((r) => ({ klic: String(r.rok), popisek: String(r.rok), nazev: `Rok ${r.rok}`, km: r.km }))}
                      vybrany={null}
                      onVyber={(klic) => nastav(Number(klic))}
                    />
                  </section>
                  <section aria-labelledby="km-srovnani" className={`flex flex-col gap-3 ${KARTA}`}>
                    <h2 id="km-srovnani" className={NADPIS_KARTY}>Srovnání měsíců</h2>
                    <TabulkaMesicu roky={odNejnovejsiho} onRok={(rok) => nastav(rok)} />
                  </section>
                </div>
                <section aria-labelledby="km-nejsilnejsi" className={`flex flex-col gap-1 ${KARTA}`}>
                  <h2 id="km-nejsilnejsi" className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">Nejsilnější měsíce</h2>
                  <ol className="m-0 list-none divide-y divide-linka p-0">
                    {nejsilnejsi.map((m, index) => (
                      <li key={m.klic}>
                        <button
                          type="button"
                          onClick={() => nastav(Number(m.klic.slice(0, 4)), m.klic.slice(5))}
                          className="bez-prejeti flex min-h-12 w-full touch-manipulation items-center gap-2.5 rounded-lg text-left hover:bg-povrch-2/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                        >
                          <span className="w-4 shrink-0 font-display text-sm font-bold text-ink-3">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-inkoust first-letter:uppercase">{nazevMesice(m.klic)}</span>
                          <span className="shrink-0 text-[13px] font-semibold text-mech">{formatKmZaokrouhlene(m.km)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            ) : (
              <>
                <section aria-labelledby="km-mesice" className={`flex min-w-0 flex-col gap-3.5 ${KARTA}`}>
                  <h2 id="km-mesice" className={NADPIS_KARTY}>Km podle měsíců {vybranyRok.rok}</h2>
                  <GrafSloupce
                    popisek={`Kilometry podle měsíců ${vybranyRok.rok}`}
                    sloupce={vybranyRok.mesice.map((m) => ({ ...m, nazev: nazevMesice(m.klic) }))}
                    vybrany={vybranyMesic}
                    onVyber={(klic) => nastav(vybranyRok.rok, klic === vybranyMesic ? null : klic.slice(5))}
                  />
                </section>
                <section aria-labelledby="km-vypravy" className={`flex min-w-0 flex-col gap-1 ${KARTA}`}>
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <h2 id="km-vypravy" aria-live="polite" className="min-w-0 truncate font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust first-letter:uppercase">
                      {vybranyMesic === null ? `Výpravy ${vybranyRok.rok}` : nazevMesice(vybranyMesic)}
                    </h2>
                    {vybranyMesic === null ? (
                      <span className="text-[11.5px] font-semibold text-ink-3">{vSeznamu.length}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => nastav(vybranyRok.rok)}
                        className="min-h-11 shrink-0 touch-manipulation rounded-lg text-[12.5px] font-semibold text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                      >
                        Celý rok
                      </button>
                    )}
                  </div>
                  {vSeznamu.length === 0 ? (
                    <p className="pb-1 text-[13px] text-ink-3">V tomhle roce žádná výprava neproběhla.</p>
                  ) : (
                    <ul className="posuvnik m-0 list-none divide-y divide-linka p-0 lg:max-h-[560px] lg:overflow-y-auto">
                      {vSeznamu.map((trasa) => (
                        <li key={trasa.id}>
                          <Link
                            to={`/vypravy/${encodeURIComponent(trasa.id)}`}
                            state={{ odkud }}
                            className="bez-prejeti flex min-h-12 items-center gap-2.5 rounded-lg py-2 hover:bg-povrch-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-px">
                              <span className="text-[13px] font-semibold leading-[17px] text-inkoust">{trasa.nazev}</span>
                              <span className="text-[11.5px] text-ink-3">{formatCelyDatum(trasa.datum)}</span>
                            </span>
                            <span className="shrink-0 text-[13px] font-semibold text-mech">
                              {trasa.km !== null ? formatKmNaDesetinu(trasa.km) : "bez km"}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
