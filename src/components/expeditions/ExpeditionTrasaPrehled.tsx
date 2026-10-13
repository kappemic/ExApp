import { useEffect, useState, type JSX } from "react";
import { dekodujPolyline } from "../../lib/polyline";
import { getMojeStatistiky } from "../../lib/statistiky-api";
import {
  expediceDetailPath,
  jeApiExpedice,
} from "../../shared/api-types";
import type { ApiAktivita, ApiExpedice } from "../../shared/api-types";

export interface ExpeditionTrasaPrehledProps {
  expeditionId: string;
  /** Jen proběhlá má smysl hledat kilometry; jinde jen počet. */
  probehla: boolean;
  /** Počet účastníků z kroniky (read-only, bez tlačítek). */
  pocetUcastniku: number;
}

function formatKm(km: number): string {
  return `${String(km.toFixed(1)).replace(".", ",")} km`;
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

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
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

  // Jen pro odznak „Navštívil jsem / Přihlášen" — km už máme shora.
  const moje = await getMojeStatistiky();
  if (moje.source === "db") {
    const zaznam = moje.data.aktivity.find(
      (a) => a.expeditionId === expeditionId,
    );
    if (zaznam !== undefined) vysledek.mujStav = zaznam.status ?? null;
  }
  return vysledek;
}

/** Převede body polyline na SVG points ve viewBoxu 100x60 s okrajem. */
function bodyNaSvgBody(polyline: string): string {
  const body = dekodujPolyline(polyline).filter(
    (b) => Number.isFinite(b.lat) && Number.isFinite(b.lng),
  );
  if (body.length === 0) return "";
  let minLat = body[0]?.lat ?? 0;
  let maxLat = body[0]?.lat ?? 0;
  let minLng = body[0]?.lng ?? 0;
  let maxLng = body[0]?.lng ?? 0;
  for (const b of body) {
    if (b.lat < minLat) minLat = b.lat;
    if (b.lat > maxLat) maxLat = b.lat;
    if (b.lng < minLng) minLng = b.lng;
    if (b.lng > maxLng) maxLng = b.lng;
  }
  const sirka = maxLng - minLng || 1e-9;
  const vyska = maxLat - minLat || 1e-9;
  const okraj = 6;
  return body
    .map((b) => {
      const x = okraj + ((b.lng - minLng) / sirka) * (100 - okraj * 2);
      // SVG y roste dolů → sever nahoru.
      const y = okraj + (1 - (b.lat - minLat) / vyska) * (60 - okraj * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
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
  pocetUcastniku,
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
  const svgBody: string =
    polyline !== null && polyline.length > 0 ? bodyNaSvgBody(polyline) : "";

  return (
    <section
      aria-label="Ušlé na výpravě"
      className="mt-5 rounded-2xl border border-inkoust/15 bg-papir/60 p-4"
    >
      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-inkoust/60">
        Ušlé na výpravě
      </h3>
      {!hotovo && (
        <p role="status" className="mt-2 text-sm text-inkoust/70">
          Načítám přehled…
        </p>
      )}
      {hotovo && (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-papir/70 px-2 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-inkoust/55">
              Km
            </dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums">
              {km !== null ? formatKm(km) : "–"}
            </dd>
          </div>
          <div className="rounded-xl bg-papir/70 px-2 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-inkoust/55">
              Převýšení
            </dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums">
              {prevyseni !== null ? `+${String(prevyseni)} m` : "–"}
            </dd>
          </div>
          <div className="rounded-xl bg-papir/70 px-2 py-2">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-inkoust/55">
              Šlo
            </dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums">
              {pocetUcastniku}
            </dd>
          </div>
        </dl>
      )}
      {hotovo && km === null && (
        <p role="status" className="mt-2 text-[13px] text-inkoust/70">
          Kilometry zatím nejsou zapsané.
        </p>
      )}
      {hotovo && data.mujStav !== null && (
        <p role="status" className="mt-1 text-[11px] font-bold uppercase tracking-wide text-inkoust/55">
          {data.mujStav === "ucastnil_se"
            ? "Navštívil jsem"
            : data.mujStav === "prihlasen"
              ? "Přihlášen"
              : data.mujStav === "omluven"
                ? "Omluven"
                : ""}
        </p>
      )}
      {hotovo && svgBody.length > 0 && (
        <svg
          viewBox="0 0 100 60"
          role="img"
          aria-label="Trasová čára ušlé trasy"
          className="mt-3 h-24 w-full rounded-xl border border-inkoust/15 bg-papir/70"
          preserveAspectRatio="xMidYMid meet"
        >
          <polyline
            points={svgBody}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-smrk"
          />
        </svg>
      )}
    </section>
  );
}
