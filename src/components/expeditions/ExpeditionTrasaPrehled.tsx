import { apiBase } from "../../lib/api-base";
import { formatKmNaDesetinu } from "../../lib/format-cisla";
import { useEffect, useRef, useState, type JSX } from "react";
import { sestavPodkladTrasy } from "../../lib/podklad-trasy";
import { dekodujPolyline, type Souradnice } from "../../lib/polyline";
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
  /** Zakódovaná trasa výpravy (veřejná, expedition-level). */
  polyline: string | null;
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
    polyline: null,
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
        vysledek.polyline =
          typeof detail.trasaPolyline === "string" &&
          detail.trasaPolyline.length > 0
            ? detail.trasaPolyline
            : null;
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
 * Quiet map under the walked line. Tiles and the stroke share Web Mercator,
 * so a north-south kilometre stays as long as an east-west one.
 */
function MapaTrasy({ body }: { body: readonly Souradnice[] }): JSX.Element {
  const ramRef = useRef<HTMLDivElement>(null);
  const [rozmer, setRozmer] = useState({ sirka: 0, vyska: 0 });

  useEffect(() => {
    const el = ramRef.current;
    if (el === null) return;
    const mer = (): void => {
      const ramec = el.getBoundingClientRect();
      setRozmer({ sirka: Math.round(ramec.width), vyska: Math.round(ramec.height) });
    };
    mer();
    const pozorovac = new ResizeObserver(mer);
    pozorovac.observe(el);
    return () => pozorovac.disconnect();
  }, []);

  const podklad =
    rozmer.sirka > 0 && rozmer.vyska > 0
      ? sestavPodkladTrasy(body, rozmer.sirka, rozmer.vyska)
      : null;

  return (
    <div
      ref={ramRef}
      role="img"
      aria-label="Trasová čára ušlé trasy"
      className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl border border-pole bg-mlha"
    >
      {podklad?.dlazdice.map((dlazdice) => (
        <img
          key={dlazdice.src}
          src={dlazdice.src}
          alt=""
          width={256}
          height={256}
          draggable={false}
          className="absolute max-w-none"
          style={{ left: dlazdice.left, top: dlazdice.top }}
        />
      ))}
      {podklad !== null && (
        <svg
          viewBox={`0 0 ${String(podklad.sirka)} ${String(podklad.vyska)}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <polyline
            points={podklad.body}
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={podklad.body}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-smrk"
          />
        </svg>
      )}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-1 bottom-1 rounded bg-papir/85 px-1 text-[10px] leading-4 text-mech"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}

/**
 * Read-only přehled o tom, co se ušlo (Krok 14, detail modal).
 * Krok 17: viditelný JEN pro proběhlou (stavová brána dle kontraktu
 * volno/skoro plno/proběhlá) — u neproběhlé vrací null (vůbec
 * nerenderuje, ani „nezapsány"). Žádné editační pairing — jen název
 * sekce, km, převýšení, počet účastníků a miniaturní trasová čára
 * (čisté SVG bez mapové knihovny a bez reloadu stránky).
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
    polyline: null,
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
  const polyline: string | null = data.polyline;
  const bodyTrasy: Souradnice[] =
    polyline !== null && polyline.length > 0 ? dekodujPolyline(polyline) : [];

  return (
    <section
      aria-label="Ušlé na výpravě"
      className="mt-5 flex h-full flex-col rounded-2xl border border-pole bg-papir p-4"
    >
      <h3 className="font-display text-xl font-bold text-inkoust">
        Ušlé na výpravě
      </h3>
      {!hotovo && (
        <p role="status" className="mt-2 text-sm text-inkoust/70">
          Načítám přehled…
        </p>
      )}
      {hotovo && (km !== null || prevyseni !== null) && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-mlha px-2 py-3">
            <dt className="text-sm font-semibold text-mech">
              Km
            </dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums">
              {km !== null ? formatKmNaDesetinu(km) : "–"}
            </dd>
          </div>
          <div className="rounded-xl bg-mlha px-2 py-3">
            <dt className="text-sm font-semibold text-mech">
              Převýšení
            </dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums">
              {prevyseni !== null ? `+${String(prevyseni)} m` : "–"}
            </dd>
          </div>
        </dl>
      )}
      {hotovo && km === null && (
        <p role="status" className="mt-3 text-base text-mech">
          Kilometry zatím nejsou zapsané.
        </p>
      )}
      {hotovo && data.mujStav !== null && (
        <p role="status" className="mt-3 text-base font-semibold text-inkoust">
          {data.mujStav === "ucastnil_se"
            ? "Trasa"
            : data.mujStav === "prihlasen"
              ? "Přihlášen"
              : data.mujStav === "omluven"
                ? "Omluven"
                : ""}
        </p>
      )}
      {hotovo && bodyTrasy.length > 1 && <MapaTrasy body={bodyTrasy} />}
    </section>
  );
}
