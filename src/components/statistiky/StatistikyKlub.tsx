import { Suspense, lazy, useEffect, useMemo, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { useStavStranky } from "../../hooks/useStavStranky";
import { formatKmNaDesetinu, formatKmZaokrouhlene } from "../../lib/format-cisla";
import { formatCelyDatum } from "../../lib/expedition-utils";
import { snizenyPohyb, useNabeh } from "../../lib/pohyb";
import { getTrasyZebricku, getZebricek } from "../../lib/zebricky-api";
import { kmPodleMesicu } from "../../lib/zebricky-mesice";
import type { ZebrickyTrasa } from "../../shared/api-types";
import Ikona from "../Ikona";
import PrazdnyStav from "../PrazdnyStav";
import { IkonaGraf } from "../SeznamIkony";
import { OdkazKilometry, SloupceKm } from "../zebricky/ZebrickyPostranni";

const Heatmapa = lazy(() => import("../profil/Heatmapa"));

type Stav = "nacitani" | "offline" | "hotovo";

function pocetVyprav(pocet: number): string {
  if (pocet === 1) return "1 výprava";
  return pocet >= 2 && pocet <= 4 ? `${pocet} výpravy` : `${pocet} výprav`;
}

/**
 * Klubové statistiky: teplotní mapa všech uskutečněných výprav, součty za
 * klub a seznam výprav. Klepnutí na výpravu ukáže její trasu na mapě.
 */
export default function StatistikyKlub(): JSX.Element {
  const rok = new Date().getFullYear();
  const volby = [
    { hodnota: "celkem", popisek: "Celkem" },
    { hodnota: String(rok), popisek: String(rok) },
    { hodnota: String(rok - 1), popisek: String(rok - 1) },
  ];
  const [obdobi, setObdobi] = useStavStranky("obdobi-klub", "celkem");
  const [stav, setStav] = useState<Stav>("nacitani");
  const [trasy, setTrasy] = useState<ZebrickyTrasa[]>([]);
  const [aktivnich, setAktivnich] = useState<number | null>(null);
  const [pokus, setPokus] = useState(0);
  const [vybranaId, setVybranaId] = useState<string | null>(null);
  const obsahRef = useNabeh<HTMLDivElement>(`${obdobi}-${stav}`, "zadna");

  useEffect(() => {
    let zive = true;
    setStav("nacitani");
    setVybranaId(null);
    void (async (): Promise<void> => {
      const [vysledek, zebricek] = await Promise.all([getTrasyZebricku(obdobi), getZebricek(obdobi)]);
      if (!zive) return;
      setTrasy([...vysledek.data.trasy].sort((a, b) => b.datum.localeCompare(a.datum)));
      setAktivnich(
        zebricek.source === "db" ? zebricek.data.zebricky.filter((radek) => radek.vypravy > 0).length : null,
      );
      setStav(vysledek.source === "fallback" ? "offline" : "hotovo");
    })();
    return () => {
      zive = false;
    };
  }, [obdobi, pokus]);

  // Po návratu sítě se klubová data načtou sama.
  useEffect(() => {
    const naOnline = (): void => setPokus((p) => p + 1);
    window.addEventListener("online", naOnline);
    return () => window.removeEventListener("online", naOnline);
  }, []);

  const mesice = useMemo(() => kmPodleMesicu(trasy), [trasy]);
  const km = trasy.reduce((soucet, trasa) => soucet + (trasa.km ?? 0), 0);
  const nejdelsi = trasy.reduce<ZebrickyTrasa | null>(
    (max, trasa) => (trasa.km !== null && (max === null || trasa.km > (max.km ?? 0)) ? trasa : max),
    null,
  );
  const prumer = trasy.length > 0 ? km / trasy.length : 0;

  function ukazTrasu(id: string): void {
    setVybranaId((predchozi) => (predchozi === id ? null : id));
    document
      .getElementById("statistiky-mapa")
      ?.scrollIntoView({ block: "nearest", behavior: snizenyPohyb() ? "auto" : "smooth" });
  }

  const cisla = [
    {
      popisek: "Výpravy",
      poznamka: nejdelsi !== null ? `nejdelší ${nejdelsi.nazev}` : "",
      hodnota: String(trasy.length),
    },
    {
      popisek: "Kilometry",
      poznamka: `průměr ${prumer.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} na výpravu`,
      hodnota: formatKmZaokrouhlene(km).replace(/\s*km$/, ""),
    },
    ...(nejdelsi !== null && nejdelsi.km !== null
      ? [{ popisek: "Nejdelší trasa", poznamka: formatCelyDatum(nejdelsi.datum), hodnota: formatKmNaDesetinu(nejdelsi.km) }]
      : []),
    ...(aktivnich !== null
      ? [{ popisek: "Členů na výpravách", poznamka: "aspoň jedna účast", hodnota: String(aktivnich) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5 min-[90rem]:gap-8">
      <div role="group" aria-label="Období" className="flex flex-wrap gap-2">
        {volby.map((volba) => (
          <button
            key={volba.hodnota}
            type="button"
            aria-pressed={obdobi === volba.hodnota}
            onClick={() => setObdobi(volba.hodnota)}
            className={`relative inline-flex h-8 touch-manipulation items-center rounded-full border px-3 text-[13px] transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] motion-reduce:transition-none min-[90rem]:h-auto min-[90rem]:px-3.5 min-[90rem]:py-2 ${
              obdobi === volba.hodnota
                ? "border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-inkoust"
                : "border-linka bg-povrch font-medium text-mech hover:bg-povrch-2 min-[90rem]:bg-transparent"
            }`}
          >
            {volba.popisek}
          </button>
        ))}
      </div>

      <div
        ref={obsahRef}
        className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:gap-7"
      >
        <div className="flex min-w-0 flex-col gap-5">
          {stav === "hotovo" && trasy.length === 0 ? null : (
          <section
            aria-labelledby="statistiky-mapa"
            className="flex flex-col gap-3 rounded-2xl border border-linka bg-povrch p-3.5 min-[90rem]:gap-3.5 min-[90rem]:p-5 min-[90rem]:shadow-denik"
          >
            <h2
              id="statistiky-mapa"
              className="scroll-mt-5 font-display text-lg font-bold text-inkoust min-[90rem]:scroll-mt-24 min-[90rem]:text-[17px] min-[90rem]:tracking-[-0.3px]"
            >
              Teplotní mapa tras
            </h2>
            <Suspense
              fallback={
                <div
                  aria-busy="true"
                  aria-label="Načítám mapu tras"
                  className="h-[220px] animate-pulse sm:h-[320px] rounded-xl bg-povrch-2 motion-reduce:animate-none min-[90rem]:h-[420px]"
                />
              }
            >
              <Heatmapa
                trasy={trasy}
                stav={stav}
                vybranaId={vybranaId}
                onVybrat={ukazTrasu}
                onZnovu={() => setPokus((p) => p + 1)}
              />
            </Suspense>
          </section>
          )}

          {stav === "hotovo" && trasy.length > 0 ? (
            <dl className="m-0 grid grid-cols-2 gap-4 rounded-2xl border border-linka bg-povrch p-4 sm:grid-cols-4 lg:hidden">
              {cisla.map((cislo) => (
                <div key={cislo.popisek} className="flex flex-col-reverse">
                  <dt className="text-[11.5px] text-mech">{cislo.popisek}</dt>
                  <dd className="m-0 font-display text-xl font-bold text-inkoust">{cislo.hodnota}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {stav === "hotovo" && trasy.length === 0 ? (
            <PrazdnyStav
              ikona={<IkonaGraf />}
              nadpis="V tomhle období klub nikde nebyl"
              text="Jakmile uzavřeme první výpravu, objeví se tu i s trasou."
            />
          ) : null}

          {trasy.length > 0 ? (
            <section
              aria-label="Výpravy klubu"
              className="overflow-hidden rounded-2xl border border-linka bg-povrch shadow-karta"
            >
              <div className="flex items-center justify-between border-b border-linka px-3.5 py-3.5 min-[90rem]:px-5 min-[90rem]:py-4">
                <h2 className="font-display text-base font-bold tracking-[-0.3px] text-inkoust min-[90rem]:text-[17px]">
                  Ušlé výpravy
                </h2>
                <span className="text-[11.5px] font-medium text-ink-3">{pocetVyprav(trasy.length)}</span>
              </div>
              <ul className="m-0 list-none divide-y divide-linka p-0">
                {trasy.map((trasa) => {
                  const maTrasu = (trasa.trasaPolyline ?? "").trim().length > 0;
                  const vybrana = vybranaId === trasa.id;
                  return (
                    <li
                      key={trasa.id}
                      className={`relative flex items-center gap-3 py-2 pl-3.5 pr-1.5 transition-colors motion-reduce:transition-none min-[90rem]:pl-5 min-[90rem]:pr-3 ${
                        vybrana ? "bg-mlha/60" : maTrasu ? "hover:bg-povrch-2/50" : ""
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {maTrasu ? (
                          <button
                            type="button"
                            aria-pressed={vybrana}
                            title={vybrana ? "Zrušit výběr trasy" : "Ukázat trasu na mapě"}
                            onClick={() => ukazTrasu(trasa.id)}
                            className="bez-prejeti w-fit max-w-full text-left text-[14.5px] font-semibold text-inkoust before:absolute before:inset-0 before:content-[''] focus-visible:outline-none focus-visible:before:outline-2 focus-visible:before:-outline-offset-2 focus-visible:before:outline-smrk min-[90rem]:text-[13.5px]"
                          >
                            {trasa.nazev}
                          </button>
                        ) : (
                          <p className="text-[14.5px] font-semibold text-inkoust min-[90rem]:text-[13.5px]">{trasa.nazev}</p>
                        )}
                        <p className="text-xs text-ink-3">{formatCelyDatum(trasa.datum)}</p>
                      </div>
                      <p className="shrink-0 font-display text-base font-bold text-inkoust min-[90rem]:text-[15px]">
                        {trasa.km !== null ? formatKmNaDesetinu(trasa.km) : "—"}
                      </p>
                      <Link
                        to={`/vypravy/${encodeURIComponent(trasa.id)}`}
                        aria-label={`Otevřít výpravu ${trasa.nazev}`}
                        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-3 hover:bg-povrch-2 hover:text-inkoust focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
                      >
                        <Ikona nazev="chevron-right" className="size-4" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        {stav === "hotovo" && trasy.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-5">
            <section
              aria-labelledby="statistiky-klub-celkem"
              className="hidden flex-col gap-4 rounded-2xl border border-linka bg-povrch p-5 shadow-denik lg:flex"
            >
              <h2 id="statistiky-klub-celkem" className="font-sans text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3">
                Celý klub
              </h2>
              {cisla.map((cislo) => (
                <div key={cislo.popisek} className="flex items-end justify-between gap-3 border-b border-linka pb-3">
                  <div className="flex min-w-0 flex-col gap-px">
                    <span className="text-[12.5px] font-medium text-mech">{cislo.popisek}</span>
                    {cislo.poznamka.length > 0 ? <span className="truncate text-[10.5px] text-ink-5">{cislo.poznamka}</span> : null}
                  </div>
                  <span className="shrink-0 font-display text-xl font-bold tracking-[-0.5px] text-inkoust">{cislo.hodnota}</span>
                </div>
              ))}
            </section>
            <section
              aria-labelledby="statistiky-klub-mesice"
              className="flex flex-col gap-3.5 rounded-2xl border border-linka bg-povrch p-4 min-[90rem]:p-5 min-[90rem]:shadow-denik"
            >
              <h2 id="statistiky-klub-mesice" className="font-sans text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3">
                Km podle měsíců
              </h2>
              <SloupceKm mesice={mesice} />
              <OdkazKilometry obdobi={obdobi} className="-mb-3" />
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
