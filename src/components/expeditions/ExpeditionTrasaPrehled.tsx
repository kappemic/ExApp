import { apiBase } from "../../lib/api-base";
import { formatKmNaDesetinu } from "../../lib/format-cisla";
import { useEffect, useState, type JSX } from "react";
import { getMojeStatistiky } from "../../lib/statistiky-api";
import {
  expediceDetailPath,
  jeApiExpedice,
} from "../../shared/api-types";
import type { ApiAktivita, ApiExpedice } from "../../shared/api-types";

export interface ExpeditionTrasaPrehledProps {
  expeditionId: string;
  /** Kilometry a převýšení patří jen k výpravě po termínu. */
  probehla: boolean;
}

/** Přehled jedné výpravy pro všechny — i kdo na ní nebyl (Krok 20). */
interface UsleData {
  km: number | null;
  prevyseniM: number | null;
  /** Stav mojí docházky; null = na výpravě nejsem. */
  mujStav: ApiAktivita["status"] | null;
}



/**
 * Čte veřejný detail výpravy (`GET /api/expeditions/:id`) + vlastní stav
 * ze statistik. Nikdy nevyhazuje — při chybě vrací prázdná data.
 */
async function nactiUsle(expeditionId: string): Promise<UsleData> {
  const vysledek: UsleData = {
    km: null,
    prevyseniM: null,
    mujStav: null,
  };
  const zaklad = apiBase();
  if (zaklad.length === 0) return vysledek;

  try {
    const odpoved = await fetch(
      `${zaklad}${expediceDetailPath(expeditionId)}`,
      { headers: { Accept: "application/json" } },
    );
    if (odpoved.ok) {
      const telo: unknown = await odpoved.json();
      const expedice: unknown =
        typeof telo === "object" && telo !== null
          ? (telo as Record<string, unknown>)["expedice"]
          : null;
      if (jeApiExpedice(expedice)) {
        const detail: ApiExpedice = expedice;
        vysledek.km = typeof detail.km === "number" ? detail.km : null;
        vysledek.prevyseniM =
          typeof detail.prevyseniM === "number" ? detail.prevyseniM : null;
      }
    }
  } catch {
    // tiché — přehled pak ukáže „nezapsáno", nikdy prázdnou obrazovku.
  }

  // Jen pro odznak „Trasa / Přihlášen" — km už máme shora.
  const moje = await getMojeStatistiky();
  if (moje.source === "db") {
    const zaznam = moje.data.aktivity.find(
      (a) => a.expeditionId === expeditionId,
    );
    if (zaznam !== undefined) vysledek.mujStav = zaznam.status ?? null;
  }
  return vysledek;
}

/**
 * Read-only přehled o tom, co se ušlo (Krok 14, detail modal).
 * Krok 17: viditelný JEN pro proběhlou (stavová brána dle kontraktu
 * volno/skoro plno/proběhlá) — u neproběhlé vrací null (vůbec
 * nerenderuje, ani „nezapsány"). Žádné editační pairing — jen název
 * sekce, km a převýšení v jedné kartě podle ExApp.pen (mapu návrh nemá).
 * Krok 20: kilometry jsou expedition-level, takže je vidí i ten, kdo na
 * výpravě nebyl — proto se berou z veřejného `GET /api/expeditions/:id`
 * (nikoli z osobních statistik). Vlastní stav docházky se doplňuje ze
 * `GET /api/statistiky/moje` jen pro odznak „Navštívil jsme / Přihlášen".
 * Bez zápisu ukazuje „nezapsány".
 */
export default function ExpeditionTrasaPrehled({
  expeditionId,
  probehla,
}: ExpeditionTrasaPrehledProps): JSX.Element | null {
  const [data, setData] = useState<UsleData>({
    km: null,
    prevyseniM: null,
    mujStav: null,
  });
  const [hotovo, setHotovo] = useState<boolean>(false);

  useEffect(() => {
    let zije = true;
    if (!probehla) {
      setHotovo(true);
      return () => {
        zije = false;
      };
    }
    void (async (): Promise<void> => {
      const data = await nactiUsle(expeditionId);
      if (!zije) return;
      setData(data);
      setHotovo(true);
    })();
    return () => {
      zije = false;
    };
  }, [expeditionId, probehla]);

  /* Krok 17: stavová brána — neproběhlá vůbec nerenderuje (po hocích). */
  if (!probehla) return null;

  const km: number | null = data.km;
  const prevyseni: number | null = data.prevyseniM;

  if (!hotovo) {
    return (
      <p role="status" className="sr-only">
        Načítám kilometry…
      </p>
    );
  }
  if (km === null && prevyseni === null) return null;

  return (
    <section
      aria-label="Ušlé na výpravě"
      className="flex flex-col gap-1 rounded-[14px] border border-linka bg-povrch p-3 min-[90rem]:gap-1.5 min-[90rem]:rounded-2xl min-[90rem]:p-5 min-[90rem]:shadow-denik"
    >
      <p className="font-display text-[22px] font-bold text-inkoust">
        {km !== null ? formatKmNaDesetinu(km) : "–"}
        <span className="sr-only"> ušlé kilometry</span>
      </p>
      {prevyseni !== null ? (
        <p className="text-[12.5px] text-mech">
          <span className="sr-only">Převýšení: </span>
          <span aria-hidden="true">převýšení </span>
          {String(prevyseni)} m
        </p>
      ) : null}
    </section>
  );
}
