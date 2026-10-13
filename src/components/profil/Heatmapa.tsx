/**
 * Heatmapa tras (Fáze 4, Krok 4) — tab `heatmapa` v ProfilPage.
 *
 * Design kontrakt (frontend-ui-engineering + mobile-native + break-ui):
 * - Deníkové tokeny: papír #FBF8F1, inkoust #1A2E22, smrk #2D6A4F (trasa),
 *   jantar #A05E0C (nejnovější trasa + ikona prázdného stavu), linka #DCE7DE.
 * - Mobile-first: mapa 320px vysoká na mobilu, 420px na sm+; všechna
 *   tlačítka min 44×44px, `touch-action: manipulation`; samotná mapa
 *   `pan-x pan-y` (gesta Leafletu), hover jen `(hover:hover)`.
 * - Leaflet je lazy `import("leaflet")` — PWA první paint bez mapového
 *   bundlu; dlaždice OSM bez API klíče + povinná atribuce.
 * - Stavy: načítání → skeleton; offline/chyba → fallback hláška + retry;
 *   0 tras → prázdný stav „Mapa je zatím čistá" (stejná kopie jako placeholder);
 *   data → mapa + legenda + souhrn. Nikdy nevyhazuje, nikdy prázdná obrazovka.
 */

import {
  useEffect,
  useRef,
  useState,
  type JSX,
} from "react";
import { getMojeStatistiky } from "../../lib/statistiky-api";
import {
  dekodujPolyline,
  slucHranice,
  spocitejHranice,
  type Hranice,
  type Souradnice,
} from "../../lib/polyline";
import type { ApiAktivita } from "../../shared/api-types";

interface Trasa {
  id: string;
  nazev: string;
  datum: string;
  body: Souradnice[];
  hranice: Hranice;
  km: number | null;
}

type Faze =
  | { stav: "nacitani" }
  | { stav: "offline" }
  | { stav: "prazdno" }
  | { stav: "seznam"; aktivity: ApiAktivita[]; kmCelkem: number }
  | { stav: "mapa"; trasy: Trasa[]; kmCelkem: number };

const PRAZDNO_NADPIS = "Mapa je zatím čistá";
const PRAZDNO_TEXT =
  "Prošlé trasy a heatmapa výprav se vykreslí, jakmile spárujeme první aktivity.";
const PRAZDNO_PATICKA = "exapp · mapa se chystá";

const SEZNAM_NADPIS = "Tvoje výpravy";
const SEZNAM_TEXT =
  "Na těchto výpravách jsi zapsaný. Mapa trasy se vykreslí, jakmile k výpravě přidáme trasu (např. aktivita ze Stravy nebo GPS trasu) — kilometry platí hned.";

function formatKm(km: number): string {
  const zaokrouhleno = Math.round(km * 10) / 10;
  return `${String(zaokrouhleno).replace(".", ",")} km`;
}

/** Česká popis stavu docházky pro seznam pod mapou. */
function popisStavu(status: ApiAktivita["status"]): string | null {
  if (status === "ucastnil_se") return "navštívil jsem";
  if (status === "prihlasen") return "přihlášen";
  if (status === "omluven") return "omluven";
  return null;
}

// Výchozí pohled na ČR, když není co obkreslit (Praha, z≈7).
const VYCHOZI_STRED: [number, number] = [49.8175, 15.472962];
const VYCHOZI_ZOOM = 7;

// Deníkové tokeny pro Leaflet canvas — Leaflet neumí číst CSS `var()`,
// proto hex kopie jediného zdroje pravdy z `src/index.css` (`@theme`).
// Nesmí se objevit žádný jiný inline hex: smrk = běžná trasa,
// jantar = vybraná trasa.
const BARVA_SMRK = "#2d6a4f"; // = --color-smrk
const BARVA_JANTAR = "#a05e0c"; // = --color-jantar

interface StylCary {
  color: string;
  weight: number;
  opacity: number;
}

interface CaryVrstva {
  setStyle: (styl: StylCary) => unknown;
}

function stylCary(jeAktivni: boolean): StylCary {
  return jeAktivni
    ? { color: BARVA_JANTAR, weight: 5, opacity: 0.95 }
    : { color: BARVA_SMRK, weight: 4, opacity: 0.8 };
}

function aktivitaNaTrasu(aktivita: ApiAktivita): Trasa | null {
  if (typeof aktivita.trasaPolyline !== "string") return null;
  if (aktivita.trasaPolyline.trim().length === 0) return null;
  const body = dekodujPolyline(aktivita.trasaPolyline);
  if (body.length < 2) return null;
  const hranice = spocitejHranice(body);
  if (hranice === null) return null;
  const nazev =
    typeof aktivita.nazev === "string" && aktivita.nazev.length > 0
      ? aktivita.nazev
      : aktivita.expeditionId;
  const datum =
    typeof aktivita.datum === "string" ? aktivita.datum : "";
  return {
    id: aktivita.id,
    nazev,
    datum,
    body,
    hranice,
    km: aktivita.km,
  };
}

function jeOfflineProhlizec(): boolean {
  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return navigator.onLine === false;
  }
  return false;
}

/**
 * Kontejner: fetch statistik → filtr tras s polyline → stavový stroj.
 * Prezentace mapy je níže (`HeatmapaMapa`) nad stejnými daty.
 */
export default function Heatmapa(): JSX.Element {
  const [faze, setFaze] = useState<Faze>({ stav: "nacitani" });
  const [pokus, setPokus] = useState<number>(0);

  useEffect(() => {
    let zije = true;

    function naOffline(): void {
      if (zije) setFaze({ stav: "offline" });
    }
    function naOnline(): void {
      if (zije) setPokus((p) => p + 1);
    }
    window.addEventListener("offline", naOffline);
    window.addEventListener("online", naOnline);

    if (jeOfflineProhlizec()) {
      setFaze({ stav: "offline" });
      return () => {
        zije = false;
        window.removeEventListener("offline", naOffline);
        window.removeEventListener("online", naOnline);
      };
    }

    void (async (): Promise<void> => {
      const vysledek = await getMojeStatistiky();
      if (!zije) return;
      if (vysledek.source === "fallback") {
        // Backend mimo / 401 / nevalidní tvar → stejný fallback jako statistiky:
        // offline hláška s retry, nikdy výjimka.
        setFaze({ stav: "offline" });
        return;
      }
      const trasy: Trasa[] = [];
      let kmCelkem = 0;
      let kmSoucet = 0;
      for (const aktivita of vysledek.data.aktivity) {
        if (typeof aktivita.km === "number") kmSoucet += aktivita.km;
        const trasa = aktivitaNaTrasu(aktivita);
        if (trasa === null) continue;
        trasy.push(trasa);
        if (typeof trasa.km === "number") kmCelkem += trasa.km;
      }
      kmCelkem = Math.round(kmCelkem * 10) / 10;
      kmSoucet = Math.round(kmSoucet * 10) / 10;
      if (vysledek.data.aktivity.length === 0) {
        setFaze({ stav: "prazdno" });
        return;
      }
      if (trasy.length === 0) {
        // Výpravy máme, ale žádná trasu k vykreslení — ať to nejsou
        // jen nuly: seznam výprav funkcí i bez polyline (Krok 20).
        setFaze({ stav: "seznam", aktivity: vysledek.data.aktivity, kmCelkem: kmSoucet });
        return;
      }
      setFaze({ stav: "mapa", trasy, kmCelkem });
    })();

    return () => {
      zije = false;
      window.removeEventListener("offline", naOffline);
      window.removeEventListener("online", naOnline);
    };
  }, [pokus]);

  if (faze.stav === "nacitani") {
    return (
      <div
        aria-busy="true"
        aria-label="Načítám mapu tras"
        className="overflow-hidden rounded-lg border-2 border-inkoust bg-white/70 text-left shadow-denik"
      >
        <div className="h-[320px] animate-pulse bg-linka/50 sm:h-[420px]" />
        <div className="flex items-center justify-between gap-3 border-t-2 border-inkoust/15 px-4 py-3">
          <div className="h-4 w-32 animate-pulse rounded bg-linka/70" />
          <div className="h-4 w-20 animate-pulse rounded bg-linka/70" />
        </div>
      </div>
    );
  }

  if (faze.stav === "offline") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-6 py-10 text-center"
      >
        <p
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-inkoust bg-linka/60 text-xl"
        >
          🧭
        </p>
        <h2 className="mt-3 text-lg font-bold tracking-tight">
          Mapa je offline
        </h2>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
          Jsi offline nebo backend teď neodpovídá — dlaždice a trasy potřebují
          připojení. Tvoje spárované výpravy zůstávají uložené.
        </p>
        <button
          type="button"
          onClick={() => setPokus((p) => p + 1)}
          className="mt-4 min-h-[44px] min-w-[44px] rounded bg-inkoust px-5 py-2.5 text-sm font-bold text-papir transition-opacity hover:opacity-90"
        >
          Zkusit znovu
        </button>
        <p className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70">
          exapp · offline fallback
        </p>
      </div>
    );
  }

  if (faze.stav === "prazdno") {
    return (
      <div
        role="status"
        className="flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-6 py-10 text-center"
      >
        <p
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-jantar bg-jantar/10 text-xl text-jantar"
        >
          🗺️
        </p>
        <h2 className="mt-3 text-lg font-bold tracking-tight">
          {PRAZDNO_NADPIS}
        </h2>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
          {PRAZDNO_TEXT}
        </p>
        <p className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70">
          {PRAZDNO_PATICKA}
        </p>
      </div>
    );
  }

  if (faze.stav === "seznam") {
    return (
      <div className="rounded-lg border-2 border-inkoust bg-papir/40 p-4 text-left shadow-denik">
        <h2 className="text-lg font-bold tracking-tight">{SEZNAM_NADPIS}</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-inkoust/70">
          {SEZNAM_TEXT}
        </p>
        <p className="mt-3 text-sm font-bold tabular-nums">
          Celkem: {formatKm(faze.kmCelkem)} · {faze.aktivity.length}{" "}
          {faze.aktivity.length === 1 ? "výprava" : "výpravy"}
        </p>
        <ul role="list" className="mt-3 space-y-1.5">
          {faze.aktivity.map((aktivita) => {
            const popis = popisStavu(aktivita.status);
            return (
              <li
                key={aktivita.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-inkoust/15 bg-white/50 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-inkoust">
                  {aktivita.nazev ?? "Výprava"}
                  {popis !== null && (
                    <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-inkoust/55">
                      {popis}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-inkoust/70">
                  {aktivita.datum ?? ""}{" "}
                  {aktivita.km !== null ? formatKm(aktivita.km) : "km nezapsány"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return <HeatmapaMapa trasy={faze.trasy} kmCelkem={faze.kmCelkem} />;
}

/**
 * Prezentace: Leaflet mapa líně přes `import("leaflet")`.
 * Dlaždice OSM (bez klíče), polylines smrk, nejnovější jantar, fitBounds.
 */
function HeatmapaMapa({
  trasy,
  kmCelkem,
}: {
  trasy: Trasa[];
  kmCelkem: number;
}): JSX.Element {
  const kontejnerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<{ remove: () => void } | null>(null);
  const caryRef = useRef<Map<string, CaryVrstva>>(new Map());
  const [chybaMapy, setChybaMapy] = useState<boolean>(false);
  const [aktivniId, setAktivniId] = useState<string | null>(
    trasy.length > 0 ? (trasy[trasy.length - 1]?.id ?? null) : null,
  );

  const celkovaHranice = slucHranice(trasy.map((t) => t.hranice));

  // Aktuální výběr pro async tvorbu mapy — čtení `ref.current` v efektu
  // nevyžaduje dep, takže výběr mapu nikdy nepřestavuje.
  const aktivniIdRef = useRef<string | null>(aktivniId);
  aktivniIdRef.current = aktivniId;

  // Tvorba mapy: běží jen při změně obsahu `trasy`, nikdy při výběru.
  useEffect(() => {
    const el = kontejnerRef.current;
    if (el === null || trasy.length === 0) return;
    let zruseno = false;
    let mapa: { remove: () => void } | null = null;
    caryRef.current.clear();

    void (async (): Promise<void> => {
      try {
        const L = await import("leaflet");
        if (zruseno || kontejnerRef.current === null) return;

        const snizenyPohyb =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const instance = L.map(kontejnerRef.current, {
          center: VYCHOZI_STRED,
          zoom: VYCHOZI_ZOOM,
          zoomControl: false,
          attributionControl: true,
          keyboard: true,
          scrollWheelZoom: true,
          fadeAnimation: !snizenyPohyb,
          zoomAnimation: !snizenyPohyb,
        });
        mapa = instance;
        mapaRef.current = instance;

        L.control
          .zoom({ position: "topright" })
          .addTo(instance);

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(instance);

        for (const trasa of trasy) {
          const cara = L.polyline(
            trasa.body.map((b) => [b.lat, b.lng] as [number, number]),
            {
              ...stylCary(trasa.id === aktivniIdRef.current),
              lineJoin: "round",
              lineCap: "round",
            },
          );
          // XSS obrana: název trasy je uživatelský vstup — přes
          // `textContent` se nikdy nepropíše jako HTML.
          const popisek = document.createElement("div");
          popisek.textContent = `${trasa.nazev}${trasa.datum.length > 0 ? ` · ${trasa.datum}` : ""}`;
          cara.bindTooltip(popisek, { sticky: true });
          cara.addTo(instance);
          caryRef.current.set(trasa.id, cara);
        }

        const hranice = slucHranice(trasy.map((t) => t.hranice));
        if (hranice !== null) {
          instance.fitBounds(
            [
              [hranice.jih, hranice.zapad],
              [hranice.sever, hranice.vychod],
            ],
            { padding: [24, 24] },
          );
        }
      } catch {
        if (!zruseno) setChybaMapy(true);
      }
    })();

    return () => {
      zruseno = true;
      mapa?.remove();
      mapaRef.current = null;
      caryRef.current.clear();
    };
  }, [trasy]);

  // Zvýraznění výběru bez remountu: jen `setStyle` nad živými křivkami.
  useEffect(() => {
    for (const [id, cara] of caryRef.current) {
      cara.setStyle(stylCary(id === aktivniId));
    }
  }, [aktivniId]);

  function centrovat(): void {
    const mapa = mapaRef.current as unknown as {
      fitBounds?: (
        hranice: [[number, number], [number, number]],
        volby?: { padding?: [number, number] },
      ) => void;
    } | null;
    if (mapa?.fitBounds !== undefined && celkovaHranice !== null) {
      mapa.fitBounds(
        [
          [celkovaHranice.jih, celkovaHranice.zapad],
          [celkovaHranice.sever, celkovaHranice.vychod],
        ],
        { padding: [24, 24] },
      );
    }
  }

  if (chybaMapy) {
    return (
      <div
        role="alert"
        className="rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-6 py-10 text-center"
      >
        <h2 className="text-lg font-bold tracking-tight">
          Mapu se nepovedlo načíst
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
          Mapový balíček se nestáhl (typicky offline PWA). Zkontroluj připojení
          a zkus to znovu.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-[44px] min-w-[44px] rounded bg-inkoust px-5 py-2.5 text-sm font-bold text-papir"
        >
          Načíst znovu
        </button>
      </div>
    );
  }

  const pocet = trasy.length;
  const popisPoctu =
    pocet === 1 ? "1 trasa" : pocet >= 2 && pocet <= 4 ? `${pocet} trasy` : `${pocet} tras`;

  return (
    <section aria-label="Heatmapa spárovaných tras" className="text-left">
      <div className="overflow-hidden rounded-lg border-2 border-inkoust bg-white/70 shadow-denik">
        <div
          ref={kontejnerRef}
          role="application"
          aria-label={`Interaktivní mapa: ${popisPoctu}, celkem ${formatKm(kmCelkem)}`}
          className="heatmapa-plocha h-[320px] w-full bg-papir sm:h-[420px]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-inkoust/15 bg-papir px-4 py-3">
          <p role="status" className="text-sm font-bold tabular-nums">
            {popisPoctu} · {formatKm(kmCelkem)}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-inkoust/75">
            <span className="inline-flex min-h-[44px] items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-1 w-6 rounded-full bg-smrk"
              />
              trasa
            </span>
            <span className="inline-flex min-h-[44px] items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-1 w-6 rounded-full bg-jantar"
              />
              vybraná
            </span>
            <button
              type="button"
              onClick={centrovat}
              className="min-h-[44px] min-w-[44px] rounded border-2 border-inkoust bg-white px-3 py-2 text-xs font-bold text-inkoust transition-colors hover:bg-linka/60"
            >
              Centrovat trasy
            </button>
          </div>
        </div>
      </div>

      <h3 className="mt-5 text-base font-extrabold tracking-tight">
        Spárované trasy ({pocet})
      </h3>
      <ul
        role="list"
        className="mt-2 divide-y divide-inkoust/15 rounded-lg border-2 border-inkoust/20 bg-white/70"
      >
        {trasy.map((trasa) => {
          const jeAktivni = trasa.id === aktivniId;
          return (
            <li key={trasa.id} className="px-2 py-1.5">
              <button
                type="button"
                onClick={() =>
                  setAktivniId((pred) => (pred === trasa.id ? null : trasa.id))
                }
                aria-pressed={jeAktivni}
                className={`flex min-h-[44px] w-full flex-col gap-0.5 rounded px-2 py-2 text-left transition-colors sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 ${
                  jeAktivni ? "bg-jantar/10" : "hover:bg-linka/50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border border-inkoust ${
                      jeAktivni ? "bg-jantar" : "bg-smrk"
                    }`}
                  />
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {trasa.nazev}
                  </span>
                </span>
                <span className="pl-4 text-sm tabular-nums text-inkoust/70 sm:pl-0">
                  {[trasa.datum, trasa.km !== null ? formatKm(trasa.km) : "bez km"]
                    .filter((c) => c.length > 0)
                    .join(" · ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-inkoust/60">
        Mapové dlaždice © OpenStreetMap — bez API klíče, funguje i jako PWA s
        líným načtením.
      </p>
    </section>
  );
}
