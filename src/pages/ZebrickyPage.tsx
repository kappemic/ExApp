import { lazy, Suspense, useEffect, useState, type JSX } from "react";
import AvatarKruh from "../components/AvatarKruh";
import { useClenProfil } from "../components/clen/ClenProfil";
import PrazdnyStav from "../components/PrazdnyStav";
import { SeznamKarta, SeznamRadek } from "../components/SeznamKarta";
import { IkonaPohar } from "../components/SeznamIkony";
import { KostraTabulka } from "../components/StrankaKostra";
import Strankovani from "../components/Strankovani";
import { useStrankovani } from "../hooks/useStrankovani";
import { RADKU_NA_STRANKU } from "../lib/strankovani";
import { useAuth } from "../hooks/useAuth";
import { ceskyPocet, formatKmZaokrouhlene } from "../lib/format-cisla";
import { getZebricek } from "../lib/zebricky-api";
import type { ZebrickyRadek } from "../shared/api-types";

const ZebrickyHeatmapa = lazy(() => import("../components/zebricky/ZebrickyHeatmapa"));

type ObdobiVolba = string;

function aktualniRok(): number {
  return new Date().getFullYear();
}

function volbyObdobi(): Array<{ hodnota: string; popisek: string }> {
  const rok = aktualniRok();
  return [
    { hodnota: "celkem", popisek: "Celkem" },
    { hodnota: String(rok), popisek: String(rok) },
    { hodnota: String(rok - 1), popisek: String(rok - 1) },
  ];
}

/** Žebříčky podle ExApp.pen: telefon seznam, počítač tabulka s kilometry. */
export default function ZebrickyPage(): JSX.Element {
  const { user } = useAuth();
  const { otevri: otevriProfil } = useClenProfil();
  const [obdobi, setObdobi] = useState<ObdobiVolba>("celkem");
  const [radky, setRadky] = useState<ZebrickyRadek[]>([]);
  const [nacitani, setNacitani] = useState<boolean>(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const volby = volbyObdobi();
  const strankovani = useStrankovani(radky, RADKU_NA_STRANKU, obdobi);
  const posun = (strankovani.cislo - 1) * RADKU_NA_STRANKU;
  const maxKm = radky.reduce((max, radek) => Math.max(max, radek.km), 0);

  useEffect(() => {
    let zive = true;
    setNacitani(true);
    setChyba(null);
    void (async (): Promise<void> => {
      const vysledek = await getZebricek(obdobi);
      if (!zive) return;
      setRadky(vysledek.data.zebricky);
      if (vysledek.source === "fallback") {
        setChyba("Žebříček se nepodařilo načíst. Zkus to prosím později.");
      }
      setNacitani(false);
    })();
    return () => {
      zive = false;
    };
  }, [obdobi]);

  return (
    <main className="nocturne mx-auto w-full max-w-5xl px-5 pb-16 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <header className="flex flex-col gap-5 min-[90rem]:gap-8">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[0.98] min-[90rem]:tracking-[-1.4px]">
            Žebříčky
          </h1>
          <p className="text-xs text-ink-3 min-[90rem]:hidden">Největší účastníci a ujeté kilometry v klubu.</p>
        </div>
        <div className="flex items-center justify-between gap-3 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4">
          <div role="group" aria-label="Období" className="flex flex-wrap gap-2">
            {volby.map((volba) => (
              <button
                key={volba.hodnota}
                type="button"
                aria-pressed={obdobi === volba.hodnota}
                onClick={() => setObdobi(volba.hodnota)}
                className={`inline-flex h-8 touch-manipulation items-center rounded-full border px-3 text-[13px] transition-colors motion-reduce:transition-none min-[90rem]:h-auto min-[90rem]:px-3.5 min-[90rem]:py-2 ${
                  obdobi === volba.hodnota
                    ? "border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-inkoust"
                    : "border-linka bg-povrch font-medium text-mech hover:bg-povrch-2 min-[90rem]:bg-transparent"
                }`}
              >
                {volba.popisek}
              </button>
            ))}
          </div>
          {!nacitani && radky.length > 0 ? (
            <p className="hidden text-[13px] font-medium text-ink-3 min-[90rem]:block">
              {radky.length} {ceskyPocet(radky.length, "člen", "členové", "členů")}
            </p>
          ) : null}
        </div>
      </header>

      <div className="pt-5 min-[90rem]:pt-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:items-start lg:gap-x-10 min-[90rem]:grid-cols-[minmax(0,1fr)_380px] min-[90rem]:gap-x-9">
          <div className="lg:col-start-2 lg:row-start-1">
            <Suspense
              fallback={
                <div
                  aria-busy="true"
                  aria-label="Načítám mapu výprav"
                  className="mt-6 h-[320px] animate-pulse rounded-2xl border border-linka bg-linka/40 sm:h-[420px] lg:mt-0"
                />
              }
            >
              <ZebrickyHeatmapa obdobi={obdobi} />
            </Suspense>
          </div>

          <div className="lg:col-start-1 lg:row-start-1">
            {nacitani && <KostraTabulka popisek="Načítám žebříček" />}

            {!nacitani && chyba !== null && radky.length === 0 && (
              <div role="alert" className="rounded-2xl border border-linka bg-povrch p-5 text-center shadow-jemny">
                <h2 className="text-base font-bold tracking-tight">Žebříček je teď nedostupný</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-mech">{chyba}</p>
              </div>
            )}

            {!nacitani && radky.length === 0 && chyba === null && (
              <PrazdnyStav
                ikona={<IkonaPohar />}
                nadpis="Zatím tu není co hodnotit"
                text="Jakmile uzavřeme první výpravy, objeví se tu pořadí nejaktivnějších členů."
                akce={{ popisek: "Na výpravy", odkaz: "/vypravy", varianta: "vedlejsi" }}
              />
            )}

            {!nacitani && radky.length > 0 && (
              <>
                {/* Telefon: seznam */}
                <SeznamKarta popisek="Žebříček členů podle účasti a kilometrů" className="min-[90rem]:hidden">
                  {strankovani.viditelne.map((radek, index) => {
                    const jsemJa = user !== null && user.id === radek.userId;
                    return (
                      <SeznamRadek
                        key={radek.userId}
                        aktivni={jsemJa}
                        ariaCurrent={jsemJa ? "true" : undefined}
                        onClick={() => otevriProfil({ id: radek.userId, jmeno: radek.jmeno })}
                        sipka={false}
                        otviraDialog
                        vlevo={
                          <>
                            <span className="w-6 shrink-0 text-center font-display text-[17px] font-bold tabular-nums text-inkoust">
                              {posun + index + 1}
                            </span>
                            <AvatarKruh jmeno={radek.jmeno} />
                          </>
                        }
                        nazev={
                          <>
                            {radek.jmeno}
                            {jsemJa && (
                              <span className="ml-2 rounded-full bg-smrk px-2 py-0.5 align-middle text-xs font-bold text-papir">
                                ty
                              </span>
                            )}
                          </>
                        }
                        podtitul={`${radek.vypravy} ${ceskyPocet(radek.vypravy, "výprava", "výpravy", "výprav")} · ${formatKmZaokrouhlene(radek.km)}`}
                      />
                    );
                  })}
                </SeznamKarta>

                {/* Počítač: tabulka */}
                <div className="hidden overflow-hidden rounded-2xl border border-linka bg-povrch shadow-jemny min-[90rem]:block">
                  <div
                    aria-hidden="true"
                    className="flex h-11 items-center gap-3.5 border-b border-linka bg-[#fbf8ef] px-5 text-[10.5px] font-bold uppercase tracking-[0.8px] text-ink-3"
                  >
                    <span className="w-[34px]">#</span>
                    <span className="flex-1">Člen</span>
                    <span className="w-16 text-right">Výpravy</span>
                    <span className="w-[110px]">Km</span>
                  </div>
                  <ul aria-label="Žebříček členů podle účasti a kilometrů" className="m-0 list-none divide-y divide-linka p-0">
                    {strankovani.viditelne.map((radek, index) => {
                      const poradi = posun + index + 1;
                      const jsemJa = user !== null && user.id === radek.userId;
                      return (
                        <li key={radek.userId} aria-current={jsemJa ? "true" : undefined}>
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => otevriProfil({ id: radek.userId, jmeno: radek.jmeno })}
                            className={`bez-prejeti flex h-16 w-full items-center gap-3.5 px-5 text-left transition-colors hover:bg-povrch-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk ${jsemJa ? "bg-[#fbf8ef]" : ""}`}
                          >
                            <span className="flex w-[34px] items-center">
                              <span
                                className={`flex size-[22px] items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                                  poradi === 1 ? "bg-okr-100 text-okr" : "bg-povrch-2 text-mech"
                                }`}
                              >
                                {poradi}
                              </span>
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-[11px]">
                              <AvatarKruh jmeno={radek.jmeno} ton={poradi === 1 ? "barevny" : "cizi"} velikost={34} />
                              <span className="truncate text-sm font-semibold text-inkoust">
                                {radek.jmeno}
                                {jsemJa ? <span className="ml-2 rounded-full bg-mlha px-2 py-0.5 text-[10.5px] font-semibold text-smrk">ty</span> : null}
                              </span>
                            </span>
                            <span className="w-16 text-right font-display text-base font-bold tabular-nums text-inkoust">{radek.vypravy}</span>
                            <span className="flex w-[110px] flex-col gap-[5px]">
                              <span className="text-[13px] font-semibold tabular-nums text-mech">{formatKmZaokrouhlene(radek.km)}</span>
                              <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-[#ede8d9]">
                                <span
                                  className={`block h-full rounded-full ${poradi === 1 ? "bg-okr" : "bg-smrk"}`}
                                  style={{ width: `${maxKm > 0 ? (radek.km / maxKm) * 100 : 0}%` }}
                                />
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <Strankovani
                  cislo={strankovani.cislo}
                  pocet={strankovani.pocet}
                  onZmena={strankovani.nastav}
                  popisek="Stránky žebříčku"
                  className="mt-4"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
