import { useEffect, useState, type JSX } from "react";
import { HeatmapaMapa, polylajnaNaTrasu, type Trasa } from "../profil/Heatmapa";
import { getTrasyZebricku } from "../../lib/zebricky-api";

interface ZebrickyHeatmapaProps {
  obdobi: string;
}

/**
 * Club map on the leaderboard: every completed expedition in the selected
 * period, not only trips the signed-in member attended.
 */
export default function ZebrickyHeatmapa({ obdobi }: ZebrickyHeatmapaProps): JSX.Element {
  const [trasy, setTrasy] = useState<Trasa[] | null>(null);
  const [kmCelkem, setKmCelkem] = useState(0);
  const [chyba, setChyba] = useState(false);

  useEffect(() => {
    let zive = true;
    setTrasy(null);
    setChyba(false);
    void (async (): Promise<void> => {
      const vysledek = await getTrasyZebricku(obdobi);
      if (!zive) return;
      if (vysledek.source === "fallback") {
        setChyba(true);
        setTrasy([]);
        return;
      }
      const nakreslene: Trasa[] = [];
      let km = 0;
      for (const polozka of vysledek.data.trasy) {
        const trasa = polylajnaNaTrasu(polozka);
        if (trasa === null) continue;
        nakreslene.push(trasa);
        if (typeof trasa.km === "number") km += trasa.km;
      }
      setKmCelkem(Math.round(km * 10) / 10);
      setTrasy(nakreslene);
    })();
    return () => {
      zive = false;
    };
  }, [obdobi]);

  return (
    <section aria-labelledby="zebricky-heatmapa" className="mt-6 text-left lg:mt-0">
      <h2 id="zebricky-heatmapa" className="text-lg font-extrabold tracking-tight">
        Ušlé výpravy
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-inkoust/70">
        Trasy všech uskutečněných výprav v zvoleném období, ne jen těch, na kterých jsi byl.
      </p>
      <div className="mt-3">
        {trasy === null ? (
          <div
            aria-busy="true"
            aria-label="Načítám mapu výprav"
            className="h-[320px] animate-pulse rounded-lg border-2 border-inkoust/20 bg-linka/40 sm:h-[420px]"
          />
        ) : chyba ? (
          <p role="alert" className="rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-4 py-6 text-sm text-inkoust/75">
            Mapu uskutečněných výprav se nepodařilo načíst.
          </p>
        ) : trasy.length === 0 ? (
          <p role="status" className="rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-4 py-6 text-sm text-inkoust/75">
            V tomhle období zatím není žádná uskutečněná výprava se zakreslenou trasou.
          </p>
        ) : (
          <HeatmapaMapa
            trasy={trasy}
            kmCelkem={kmCelkem}
            nadpis="Ušlé výpravy"
            popisekMapy="Heatmapa uskutečněných výprav"
          />
        )}
      </div>
    </section>
  );
}
