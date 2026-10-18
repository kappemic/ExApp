import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  getMojeStatistiky,
  type StatistikyResponse,
} from "../lib/statistiky-api";
import { useProfile } from "../hooks/useProfile";
import ProfileForm from "../components/profil/ProfileForm";
import type { ApiUser } from "../shared/api-types";
import {
  ctiStravaDuvodZUrl,
  ctiStravaPriznakZUrl,
  nactiStravaStav,
  nactiStravaStavRozsireny,
  odpojStravu,
  prelozStravaDuvod,
  presmerujNaStravuAutorizaci,
} from "../lib/strava-api";

type ProfilTab = "osobni" | "strava" | "statistiky" | "heatmapa";

const Heatmapa = lazy(() => import("../components/profil/Heatmapa"));

const TABY: Array<{ id: ProfilTab; popisek: string }> = [
  { id: "osobni", popisek: "Osobní údaje" },
  { id: "strava", popisek: "Strava" },
  { id: "statistiky", popisek: "Statistiky" },
  { id: "heatmapa", popisek: "Heatmapa" },
];

const PANEL_OBSAH: Record<
  Extract<ProfilTab, "statistiky" | "heatmapa">,
  { nadpis: string; text: string; paticka: string }
> = {
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

/**
 * Tab Osobní údaje (Step 4): formulář předvyplněný z GET /api/me.
 * Kontejner (fetch + stavy) + ProfileForm (editace) — fetch/mutate žije
 * v `useProfile`, UI jen konzumuje. Po uložení drží čerstvého usera
 * lokálně (server je zdrojem pravdy, žádný optimistic update).
 */
function OsobniPanel(): JSX.Element {
  const { profil, stav, chyba, znovuNacti } = useProfile();
  const [prepsany, setPrepsany] = useState<ApiUser | null>(null);
  const zobrazeny: ApiUser | null = prepsany ?? profil;

  if (stav === "nacitani" || zobrazeny === null) {
    if (stav === "chyba") {
      return (
        <div className="text-left">
          <p role="alert" className="rounded border-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-bold text-red-900">
            {chyba ?? "Profil se nepodařilo načíst."}
          </p>
          <button
            type="button"
            onClick={znovuNacti}
            className="mt-3 min-h-[44px] min-w-[44px] touch-manipulation rounded border-2 border-inkoust bg-white px-4 py-2 text-sm font-bold text-inkoust select-none hover:bg-linka/60"
          >
            Zkusit znovu
          </button>
        </div>
      );
    }
    return (
      <div
        aria-busy="true"
        aria-label="Načítám osobní údaje"
        className="mx-auto w-full max-w-2xl space-y-3 text-left"
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded border-2 border-inkoust/20 bg-linka/40"
          />
        ))}
      </div>
    );
  }

  return (
    <ProfileForm
      key={`${zobrazeny.id}-${zobrazeny.updatedAt}`}
      pocatecni={zobrazeny}
      onUlozeno={(novy: ApiUser) => setPrepsany(novy)}
    />
  );
}

type StravaFaze =
  | { stav: "nacitani" }
  | { stav: "nepropojeno" }
  | {
      stav: "propojeno";
      stravaId: string;
      scope: string | null;
      expirace: string | null;
    }
  | { stav: "chyba"; zprava: string };

/**
 * Formátuje ISO expiraci česky (`cs-CZ`). Nevalidní / null → null
 * (volající ukáže neutrální text, nikdy raw vstup ani `Invalid Date`).
 */
function formatujExpiraci(expirace: string | null): string | null {
  if (expirace === null || expirace.trim().length === 0) return null;
  const datum = new Date(expirace);
  if (Number.isNaN(datum.getTime())) return null;
  return datum.toLocaleString("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** True, když expirace už proběhla (krátkodobý přístupový klíč po platnosti). */
function jeExpiraceProšla(expirace: string | null): boolean {
  if (expirace === null || expirace.trim().length === 0) return false;
  const datum = new Date(expirace);
  if (Number.isNaN(datum.getTime())) return false;
  return datum.getTime() <= Date.now();
}

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

/**
 * Jednorázové načtení fáze propojení: primárně rozšířený stav
 * `GET /api/strava/stav` (atlet + scope + expirace), fallback na legacy
 * `/api/me` (starší BFF bez `/api/strava/stav`). Nikdy nenese tokeny.
 */
async function ctiFaziPropojeni(): Promise<StravaFaze> {
  const rozsireny = await nactiStravaStavRozsireny();
  if (rozsireny.ok) {
    if (rozsireny.data.propojeno) {
      return {
        stav: "propojeno",
        stravaId: rozsireny.data.stravaId ?? "",
        scope: rozsireny.data.scope,
        expirace: rozsireny.data.expirace,
      };
    }
    return { stav: "nepropojeno" };
  }
  const vysledek = await nactiStravaStav();
  if (!vysledek.ok) {
    return { stav: "chyba", zprava: vysledek.chyba };
  }
  if (vysledek.data.propojeno) {
    return {
      stav: "propojeno",
      stravaId: vysledek.data.stravaId ?? "",
      scope: null,
      expirace: null,
    };
  }
  return { stav: "nepropojeno" };
}

function StravaKarta(): JSX.Element {
  const [faze, setFaze] = useState<StravaFaze>({ stav: "nacitani" });
  const [pracuje, setPracuje] = useState<boolean>(false);
  const [obnovuje, setObnovuje] = useState<boolean>(false);
  const [upozorneni, setUpozorneni] = useState<StravaUpozorneni | null>(null);
  // Pořadí načtení stavu: mount efekt i ruční „Obnovit stav" sdílí jeden
  // čítač — pozdě dorazivší odpověď (mount vs. klik) nesmí přepsat
  // čerstvější stav. Vlastníkem spinneru je vždy nejnovější požadavek.
  const pozadavekRef = useRef<number>(0);

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
    const moje = (pozadavekRef.current += 1);
    void (async (): Promise<void> => {
      // Step 5: primárně rozšířený stav (atlet + scope + expirace),
      // fallback na legacy `/api/me` (starší BFF bez `/api/strava/stav`).
      const novaFaze = await ctiFaziPropojeni();
      if (!zije || pozadavekRef.current !== moje) return;
      setFaze(novaFaze);
    })();
    return () => {
      zije = false;
    };
  }, []);

  /**
   * Explicitní aktualizace stavu z `GET /api/strava/stav` (tlačítko
   * „Obnovit stav"). Jen znovu přečte veřejný stav z DB — klíče se
   * nikdy nevracejí klientovi, výměna přístupového klíče probíhá jen na
   * serveru při příštím volání Stravy.
   * - Každý klik vede na `ctiFaziPropojeni()` (primárně stavový
   *   endpoint, fallback legacy `/api/me`).
   * - Neočekávaná výjimka nesmí projít skrz `void onClick` tiše:
   *   zachytí se a složí chybovou fázi (žádný pád, žádný visící
   *   „Obnovuji…"). `finally` zháší spinner jen vlastníkovi.
   * - Guard `pozadavekRef` proti závodu s mount efektem: starší
   *   odpověď čerstvější stav nepřepíše.
   */
  async function obnovitStav(): Promise<void> {
    const moje = (pozadavekRef.current += 1);
    setObnovuje(true);
    try {
      const novaFaze = await ctiFaziPropojeni();
      if (pozadavekRef.current !== moje) return;
      setFaze(novaFaze);
    } catch {
      if (pozadavekRef.current !== moje) return;
      setFaze({
        stav: "chyba",
        zprava: "Stav se nepodařilo obnovit. Zkus to prosím později.",
      });
    } finally {
      if (pozadavekRef.current === moje) setObnovuje(false);
    }
  }

  async function pripoj(): Promise<void> {
    setPracuje(true);
    setUpozorneni(null);
    try {
      // Společný handler ze strava-api (sestav URL + redirect) — jediný
      // zdroj pravdy pro „Připojit Stravu" (required fix 7).
      const vysledek = await presmerujNaStravuAutorizaci();
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
      // Úspěch = redirect už proběhl v presmerujNaStravuAutorizaci.
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
      className="mb-4 overflow-hidden rounded-lg border-2 border-inkoust bg-white/60 text-left shadow-denik"
    >
      <div aria-hidden="true" className="h-1.5 w-full bg-jantar" />
      <div className="p-5">
      <h2 className="text-base font-extrabold tracking-tight">Strava</h2>
      <div aria-live="polite" className="mt-1.5 text-sm leading-relaxed text-inkoust/75">
        {faze.stav === "nacitani" && <p>Zjišťuji stav propojení…</p>}
        {faze.stav === "nepropojeno" && (
          <p>Propoj si účet se Stravou — kilometry a převýšení se pak připíšou k výpravám.</p>
        )}
        {faze.stav === "propojeno" && (
          <div className="space-y-1">
            <p>
              Propojeno jako atlet{" "}
              <span className="font-bold text-inkoust">
                {faze.stravaId.length > 0 ? faze.stravaId : "—"}
              </span>
              .
            </p>
            <p className="text-sm">
              Platnost propojení do{" "}
              <span className="font-bold text-inkoust">
                {formatujExpiraci(faze.expirace) ?? "—"}
              </span>
              {faze.scope !== null && faze.scope.length > 0 && (
                <>
                  {" · "}oprávnění{" "}
                  <code className="rounded bg-linka/50 px-1.5 py-0.5 text-xs font-bold">
                    {faze.scope}
                  </code>
                </>
              )}
              .
            </p>
            {jeExpiraceProšla(faze.expirace) && (
              <p role="status" className="text-sm font-semibold text-jantar">
                Přístupový klíč vypršel. Při příštím načtení aktivit ho
                server automaticky vymění pomocí uloženého obnovovacího
                klíče. Kdyby výměna selhala (např. odvolané oprávnění),
                bude potřeba Stravu znovu připojit.
              </p>
            )}
          </div>
        )}
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
        {/* Obnovit je k dispozici v každém ustáleném stavu (propojeno,
            nepropojeno i chyba) — po chybě je retry bez reloadu, jinak by
            setFaze({chyba}) tlačítko odmontoval. Jen během prvotního
            načítání se nezobrazuje (fetch už běží v mount efektu). */}
        {faze.stav !== "nacitani" && (
          <button
            type="button"
            onClick={() => void obnovitStav()}
            disabled={pracuje || obnovuje}
            className="min-h-[44px] min-w-[44px] rounded border-2 border-inkoust bg-papir px-4 py-2 text-sm font-bold text-inkoust transition-colors hover:bg-linka/60 disabled:opacity-50"
          >
            {obnovuje ? "Obnovuji…" : "Obnovit stav"}
          </button>
        )}
        {faze.stav === "propojeno" ? (
          <button
            type="button"
            onClick={() => void odpoj()}
            disabled={pracuje || obnovuje}
            className="min-h-[44px] min-w-[44px] rounded border-2 border-inkoust bg-white px-4 py-2 text-sm font-bold text-inkoust transition-colors hover:bg-linka/60 disabled:opacity-50"
          >
            {pracuje ? "Odpojuji…" : "Odpojit Stravu"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void pripoj()}
            disabled={pracuje || obnovuje || faze.stav === "nacitani"}
            className="min-h-[44px] min-w-[44px] rounded bg-inkoust px-4 py-2 text-sm font-bold text-papir transition-opacity disabled:opacity-50"
          >
            {pracuje ? "Přesměrovávám…" : "Připojit Stravu"}
          </button>
        )}
      </div>
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
  // Po návratu ze Stravy (?strava=propojeno|chyba) rovnou na tab Strava,
  // jinak výchozí Osobní údaje. Čte jen vlastní query, nikdy tokeny.
  const [aktivniTab, setAktivniTab] = useState<ProfilTab>(() =>
    ctiStravaPriznakZUrl() === null ? "osobni" : "strava",
  );

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
          Osobní údaje, propojení se Stravou, statistiky z docházky
          a heatmapa spárovaných tras z OSM — bez klíče, i offline s hláškou.
        </p>

        <div
          className="sticky top-0 z-10 -mx-4 bg-papir/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
        >
          <div
            role="tablist"
            aria-label="Sekce profilu"
            onKeyDown={onKeyDown}
            className="inline-flex max-w-full flex-wrap rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik"
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
                  className={`min-h-[44px] min-w-[44px] touch-manipulation rounded px-4 py-2 text-sm font-bold select-none transition-colors ${
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
        </div>
      </header>

      <div className="pt-6">
        <div
          role="tabpanel"
          id={`panel-${aktivniTab}`}
          aria-labelledby={`tab-${aktivniTab}`}
          className="rounded-lg border-2 border-inkoust bg-white/60 p-6 text-center shadow-denik"
        >
          {aktivniTab === "osobni" && <OsobniPanel />}
          {aktivniTab === "strava" && <StravaKarta />}
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
