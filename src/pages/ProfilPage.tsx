import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  getMojeStatistiky,
  type StatistikyResponse,
} from "../lib/statistiky-api";
import {
  ctiStravaDuvodZUrl,
  ctiStravaPriznakZUrl,
  getStravaAuthUrlPodrobne,
  nactiStravaStav,
  odpojStravu,
  prelozStravaDuvod,
} from "../lib/strava-api";

type ProfilTab = "prehled" | "statistiky" | "heatmapa";

const Heatmapa = lazy(() => import("../components/profil/Heatmapa"));

const TABY: Array<{ id: ProfilTab; popisek: string }> = [
  { id: "prehled", popisek: "Přehled" },
  { id: "statistiky", popisek: "Statistiky" },
  { id: "heatmapa", popisek: "Heatmapa" },
];

const PANEL_OBSAH: Record<ProfilTab, { nadpis: string; text: string; paticka: string }> = {
  prehled: {
    nadpis: "Zatím prázdný přehled",
    text: "Tvoje účast, odznaky a poslední záznamy se tu objeví po přihlášení a prvních výpravách.",
    paticka: "exapp · přehled se chystá",
  },
  statistiky: {
    nadpis: "Zatím bez kilometrů",
    text: "Kilometry, převýšení a počet výprav doplníme ve Fázi 4 po napojení Stravy.",
    paticka: "exapp · statistiky se chystají",
  },
  heatmapa: {
    nadpis: "Mapa je zatím čistá",
    text: "Prošlé trasy a heatmapa výprav se vykreslí, jakmile spárujeme první aktivity.",
    paticka: "exapp · mapa se chystá",
  },
};

type StravaFaze =
  | { stav: "nacitani" }
  | { stav: "nepropojeno" }
  | { stav: "propojeno"; stravaId: string }
  | { stav: "chyba"; zprava: string };

/**
 * Karta Strava propojení (Fáze 4, Krok 1) v Přehledu.
 * Připojit → redirect na Strava authorize (serverový callback vymění
 * code za tokeny, secret nikdy neopustí server). Odpojit → DELETE
 * /api/strava/odpojit (smaže tokeny + strava_id). Stav čte /api/me.
 */
interface StravaUpozorneni {
  text: string;
  typ: "uspech" | "chyba" | "info";
}

function StravaKarta(): JSX.Element {
  const [faze, setFaze] = useState<StravaFaze>({ stav: "nacitani" });
  const [pracuje, setPracuje] = useState<boolean>(false);
  const [upozorneni, setUpozorneni] = useState<StravaUpozorneni | null>(null);

  useEffect(() => {
    // Krok 9: po návratu ze Stravy ukaž zelený banner (propojeno) nebo
    // český důvod (chyba + ?duvod=). Query se pak z URL uklidí.
    const priznak = ctiStravaPriznakZUrl();
    if (priznak === "propojeno") {
      setUpozorneni({
        text: "Strava je propojená. Kilometry se začnou párovat k výpravám.",
        typ: "uspech",
      });
    } else if (priznak === "chyba") {
      setUpozorneni({ text: prelozStravaDuvod(ctiStravaDuvodZUrl()), typ: "chyba" });
    }
    if (priznak !== null && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("strava");
      url.searchParams.delete("duvod");
      window.history.replaceState(null, "", url.toString());
    }
    let zije = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiStravaStav();
      if (!zije) return;
      if (!vysledek.ok) {
        setFaze({ stav: "chyba", zprava: vysledek.chyba });
        return;
      }
      if (vysledek.data.propojeno) {
        setFaze({
          stav: "propojeno",
          stravaId: vysledek.data.stravaId ?? "",
        });
      } else {
        setFaze({ stav: "nepropojeno" });
      }
    })();
    return () => {
      zije = false;
    };
  }, []);

  async function pripoj(): Promise<void> {
    setPracuje(true);
    setUpozorneni(null);
    try {
      const vysledek = await getStravaAuthUrlPodrobne();
      if (!vysledek.ok) {
        // Krok 7b: místo redirectu na nepoužitelné mock URL ukaž
        // vysvětlující hlášku + návod (STRAVA_CLIENT_ID / vypni MOCK).
        // `zprava` pro `nenastavena` vždy nese obojí (server 503 i klient).
        if (vysledek.nenastavena) {
          setFaze({ stav: "chyba", zprava: vysledek.zprava });
        } else {
          setFaze({
            stav: "chyba",
            zprava: "Propojení teď nejde sestavit. Zkus to prosím později.",
          });
        }
        return;
      }
      window.location.href = vysledek.url;
    } finally {
      setPracuje(false);
    }
  }

  async function odpoj(): Promise<void> {
    setPracuje(true);
    setUpozorneni(null);
    try {
      const vysledek = await odpojStravu();
      if (!vysledek.ok) {
        setFaze({ stav: "chyba", zprava: vysledek.chyba });
        return;
      }
      setFaze({ stav: "nepropojeno" });
      setUpozorneni({ text: "Strava je odpojená.", typ: "info" });
    } finally {
      setPracuje(false);
    }
  }

  return (
    <section
      aria-label="Propojení se Stravou"
      className="mb-4 rounded-lg border-2 border-inkoust bg-white/60 p-5 text-left shadow-denik"
    >
      <h2 className="text-base font-extrabold tracking-tight">Strava</h2>
      <div aria-live="polite" className="mt-1.5 text-sm leading-relaxed text-inkoust/75">
        {faze.stav === "nacitani" && <p>Zjišťuji stav propojení…</p>}
        {faze.stav === "nepropojeno" && (
          <p>Propoj si účet se Stravou — kilometry a převýšení se pak připíšou k výpravám.</p>
        )}
        {faze.stav === "propojeno" && <p>Propojeno. Aktivity se budou párovat k tvým výpravám.</p>}
        {faze.stav === "chyba" && <p role="alert">{faze.zprava}</p>}
      </div>
      {upozorneni !== null && (
        <p
          role={upozorneni.typ === "chyba" ? "alert" : "status"}
          className={
            upozorneni.typ === "uspech"
              ? "mt-2 rounded border-2 border-green-700 bg-green-50 px-3 py-2 text-sm font-bold text-green-900"
              : upozorneni.typ === "chyba"
                ? "mt-2 rounded border-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-bold text-red-900"
                : "mt-2 rounded border border-inkoust/20 bg-papir px-3 py-2 text-sm font-medium"
          }
        >
          {upozorneni.text}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {faze.stav === "propojeno" ? (
          <button
            type="button"
            onClick={() => void odpoj()}
            disabled={pracuje}
            className="min-h-[44px] min-w-[44px] rounded border-2 border-inkoust bg-white px-4 py-2 text-sm font-bold text-inkoust transition-colors hover:bg-linka/60 disabled:opacity-50"
          >
            {pracuje ? "Odpojuji…" : "Odpojit Stravu"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void pripoj()}
            disabled={pracuje || faze.stav === "nacitani"}
            className="min-h-[44px] min-w-[44px] rounded bg-inkoust px-4 py-2 text-sm font-bold text-papir transition-opacity disabled:opacity-50"
          >
            {pracuje ? "Přesměrovávám…" : "Připojit Stravu"}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Tab Statistiky (Fáze 4, Krok 3): agregace z DB bez live Stravy.
 * Kontejner (fetch + stavy) + prezentace (karty + seznam) v jednom
 * souboru — stránka je malá, oddělený hook by byl over-engineering.
 * Stavy: načítání → skeleton; nuly/[] → prázdný stav pro nováčka
 * (stejná kopie jako placeholder); data → karty čísel + seznam.
 * Fallback klienta (backend mimo / 401) → stejný prázdný stav,
 * nikdy nevyhazuje. Responzivní mřížka 1 → 3 sloupce (mobile-first).
 */
function StatistikyPanel(): JSX.Element {
  const [faze, setFaze] = useState<"nacitani" | "hotovo">("nacitani");
  const [data, setData] = useState<StatistikyResponse | null>(null);

  useEffect(() => {
    let zije = true;
    void (async (): Promise<void> => {
      const vysledek = await getMojeStatistiky();
      if (!zije) return;
      setData(vysledek.data);
      setFaze("hotovo");
    })();
    return () => {
      zije = false;
    };
  }, []);

  if (faze === "nacitani" || data === null) {
    return (
      <div
        aria-busy="true"
        aria-label="Načítám statistiky"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border-2 border-inkoust/20 bg-linka/40"
          />
        ))}
      </div>
    );
  }

  if (data.vypravy === 0) {
    return (
      <div
        role="status"
        className="flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-6 py-10"
      >
        <h2 className="text-lg font-bold tracking-tight">
          {PANEL_OBSAH.statistiky.nadpis}
        </h2>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
          {PANEL_OBSAH.statistiky.text}
        </p>
        <p
          aria-hidden="true"
          className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
        >
          {PANEL_OBSAH.statistiky.paticka}
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Osobní statistiky" className="text-left">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border-2 border-inkoust bg-papir px-4 py-5 text-center shadow-denik">
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-inkoust/70">
            Výpravy
          </dt>
          <dd className="mt-1 text-3xl font-extrabold tabular-nums">
            {data.vypravy}
          </dd>
        </div>
        <div className="rounded-lg border-2 border-inkoust bg-papir px-4 py-5 text-center shadow-denik">
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-inkoust/70">
            Kilometry
          </dt>
          <dd className="mt-1 text-3xl font-extrabold tabular-nums">
            {formatKm(data.kmCelkem)}
          </dd>
        </div>
        <div className="rounded-lg border-2 border-inkoust bg-papir px-4 py-5 text-center shadow-denik">
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-inkoust/70">
            Převýšení
          </dt>
          <dd className="mt-1 text-3xl font-extrabold tabular-nums">
            {formatPrevyseni(data.prevyseniCelkem)}
          </dd>
        </div>
      </dl>

      <h3 className="mt-6 text-base font-extrabold tracking-tight">
        Navštívené výpravy ({data.aktivity.length})
      </h3>
      <ul role="list" className="mt-2 divide-y divide-inkoust/15 rounded-lg border-2 border-inkoust/20 bg-white/70">
        {data.aktivity.map((aktivita) => {
          const nazev =
            typeof aktivita.nazev === "string" && aktivita.nazev.length > 0
              ? aktivita.nazev
              : aktivita.expeditionId;
          const meta: string[] = [];
          if (typeof aktivita.datum === "string" && aktivita.datum.length > 0) {
            meta.push(aktivita.datum);
          }
          meta.push(
            typeof aktivita.km === "number"
              ? formatKm(aktivita.km)
              : "bez kilometrů",
          );
          meta.push(
            typeof aktivita.prevyseniM === "number"
              ? formatPrevyseni(aktivita.prevyseniM)
              : "bez převýšení",
          );
          return (
            <li
              key={aktivita.id}
              className="flex flex-col gap-0.5 px-4 py-3 text-left sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
            >
              <span className="text-sm font-bold">{nazev}</span>
              <span className="text-sm tabular-nums text-inkoust/70">
                {meta.join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatKm(km: number): string {
  const zaokrouhleno = Math.round(km * 10) / 10;
  return `${String(zaokrouhleno).replace(".", ",")} km`;
}

function formatPrevyseni(metry: number): string {
  return `${metry} m`;
}

export default function ProfilPage(): JSX.Element {
  const [aktivniTab, setAktivniTab] = useState<ProfilTab>("prehled");
  const obsah = PANEL_OBSAH[aktivniTab];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const poradi = TABY.map((t) => t.id);
    const idx = poradi.indexOf(aktivniTab);
    let dalsi: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dalsi = (idx + 1) % poradi.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      dalsi = (idx - 1 + poradi.length) % poradi.length;
    else if (e.key === "Home") dalsi = 0;
    else if (e.key === "End") dalsi = poradi.length - 1;
    if (dalsi === null) return;
    e.preventDefault();
    const noveId = poradi[dalsi];
    setAktivniTab(noveId);
    document.getElementById(`tab-${noveId}`)?.focus();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Školní expediční klub</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Profil
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Tvůj přehled, statistiky z docházky a heatmapa spárovaných tras z
          OSM — bez klíče, i offline s hláškou.
        </p>

        <div
          role="tablist"
          aria-label="Sekce profilu"
          onKeyDown={onKeyDown}
          className="mt-4 inline-flex max-w-full flex-wrap rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik"
        >
          {TABY.map((tab) => {
            const aktivni = aktivniTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={aktivni}
                aria-controls={aktivni ? `panel-${tab.id}` : undefined}
                tabIndex={aktivni ? 0 : -1}
                onClick={() => setAktivniTab(tab.id)}
                className={`min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm font-bold transition-colors ${
                  aktivni
                    ? "bg-inkoust text-papir"
                    : "text-inkoust hover:bg-linka/60"
                }`}
              >
                {tab.popisek}
              </button>
            );
          })}
        </div>
      </header>

      <div className="pt-6">
        <div
          role="tabpanel"
          id={`panel-${aktivniTab}`}
          aria-labelledby={`tab-${aktivniTab}`}
          className="rounded-lg border-2 border-inkoust bg-white/60 p-6 text-center shadow-denik"
        >
          {aktivniTab === "prehled" && (
            <>
              <StravaKarta />
              <div
                role="status"
                className="mt-4 flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-6 py-10"
              >
                <h2 className="text-lg font-bold tracking-tight">
                  {obsah.nadpis}
                </h2>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
                  {obsah.text}
                </p>
                <p
                  aria-hidden="true"
                  className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
                >
                  {obsah.paticka}
                </p>
              </div>
            </>
          )}
          {aktivniTab === "statistiky" && <StatistikyPanel />}
          {aktivniTab === "heatmapa" && (
            <Suspense
              fallback={
                <div
                  aria-busy="true"
                  aria-label="Načítám mapu tras"
                  className="h-[320px] animate-pulse rounded-lg border-2 border-inkoust/20 bg-linka/40 sm:h-[420px]"
                />
              }
            >
              <Heatmapa />
            </Suspense>
          )}
        </div>
      </div>
    </main>
  );
}
