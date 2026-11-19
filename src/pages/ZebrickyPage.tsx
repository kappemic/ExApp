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
    <main className="nocturne mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <header className="space-y-3">
        <h1 className="font-display text-[28px] font-extrabold tracking-tight text-inkoust sm:text-[32px]">
          Žebříčky
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-mech">
          Největší účastníci a ujeté kilometry v klubu.
        </p>
        <div role="group" aria-label="Období" className="-mx-1 flex flex-wrap gap-2 px-1">
          {volby.map((volba) => (
            <button
              key={volba.hodnota}
              type="button"
              aria-pressed={obdobi === volba.hodnota}
              onClick={() => setObdobi(volba.hodnota)}
              className={`inline-flex min-h-9 touch-manipulation items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors motion-reduce:transition-none ${
                obdobi === volba.hodnota
                  ? "border-transparent bg-smrk text-papir"
                  : "border-linka bg-povrch text-inkoust hover:bg-mlha/60"
              }`}
            >
              {volba.popisek}
            </button>
          ))}
        </div>
      </header>

      <div className="pt-5">

        <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:items-start lg:gap-x-10">
        <div className="lg:col-start-2 lg:row-start-1">
        <Suspense
          fallback={
            <div
              aria-busy="true"
              aria-label="Načítám mapu výprav"
              className="mt-6 h-[320px] animate-pulse rounded-lg border-2 border-inkoust/20 bg-linka/40 sm:h-[420px] lg:mt-0"
            />
          }
        >
          <ZebrickyHeatmapa obdobi={obdobi} />
        </Suspense>
        </div>

        <div className="lg:col-start-1 lg:row-start-1">

        {nacitani && (
          <KostraTabulka popisek="Načítám žebříček" />
        )}

        {!nacitani && chyba !== null && radky.length === 0 && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-linka bg-povrch p-5 text-center shadow-denik lg:mt-0"
          >
            <h2 className="text-base font-bold tracking-tight">
              Žebříček je teď nedostupný
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
              {chyba}
            </p>
          </div>
        )}

        {!nacitani && radky.length === 0 && chyba === null && (
          <PrazdnyStav
            className="mt-4 lg:mt-0"
            ikona={<IkonaPohar />}
            nadpis="Zatím tu není co hodnotit"
            text="Jakmile uzavřeme první výpravy, objeví se tu pořadí nejaktivnějších členů."
            akce={{ popisek: "Na výpravy", odkaz: "/vypravy", varianta: "vedlejsi" }}
          />
        )}

        {!nacitani && radky.length > 0 && (
          <>
          <SeznamKarta
            popisek="Žebříček členů podle účasti a kilometrů"
            className="mt-4 lg:mt-0"
          >
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
