import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from "react";
import StatistikyPlocha from "../components/statistiky/StatistikyPlocha";
import PridatNaPlochuSheet from "../components/shell/PridatNaPlochuSheet";
import { ROLE_LIST, type Role } from "../config/roles";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import ProfileForm from "../components/profil/ProfileForm";
import { DlazdiceStatu, IdentitaProfilu, RadekUdaje } from "../components/ProfilKusy";
import { SEZNAM_KARTA_TRIDA } from "../components/SeznamKarta";
import { IkonaOdhlasit } from "../components/SeznamIkony";
import { zobrazeniTelefonu } from "../shared/telefon";
import { getMojeStatistiky } from "../lib/statistiky-api";
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

/**
 * Tab Osobní údaje (Step 4): formulář předvyplněný z GET /api/me.
 * Kontejner (fetch + stavy) + ProfileForm (editace) — fetch/mutate žije
 * v `useProfile`, UI jen konzumuje. Po uložení drží čerstvého usera
 * lokálně (server je zdrojem pravdy, žádný optimistic update).
 */
function iniciály(jmeno: string, prijmeni?: string): string {
  const a = jmeno.trim().charAt(0).toUpperCase();
  const b = (prijmeni ?? "").trim().charAt(0).toUpperCase();
  return `${a}${b.length > 0 ? b : ""}` || "?";
}

function nazevRole(role: Role): string {
  return ROLE_LIST.find((r) => r.id === role)?.nazev ?? role;
}

function clenOd(iso: string | undefined): string | null {
  if (iso === undefined || !Number.isFinite(Date.parse(iso))) return null;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getFullYear()}`;
}

type ProfilSouhrn = { vypravy: number; km: number; fotek: number };

function Odhlaseni(): JSX.Element {
  const { odhlasit } = useAuth();
  return (
    <button
      type="button"
      onClick={odhlasit}
      className="nahled-press mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-akcent/25 bg-akcent-100 px-4 text-base font-semibold text-akcent [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
    >
      <IkonaOdhlasit />
      Odhlásit se
    </button>
  );
}

/** "2007-04-14" → "14. 4. 2007". Neplatné datum zůstane, jak je. */
function datumCesky(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return iso;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

function OsobniPanel(): JSX.Element {
  const { profil, stav, chyba, znovuNacti } = useProfile();
  const [prepsany, setPrepsany] = useState<ApiUser | null>(null);
  const [souhrn, setSouhrn] = useState<ProfilSouhrn>({ vypravy: 0, km: 0, fotek: 0 });
  const [plochaSheet, setPlochaSheet] = useState(false);
  const [upravuje, setUpravuje] = useState(false);
  const zobrazeny: ApiUser | null = prepsany ?? profil;

  useEffect(() => {
    let zije = true;
    void (async (): Promise<void> => {
      const stat = await getMojeStatistiky();
      if (!zije) return;
      setSouhrn({
        vypravy: stat.data.vypravy,
        km: Math.round(stat.data.kmCelkem),
        fotek: 0,
      });
    })();
    return () => {
      zije = false;
    };
  }, [zobrazeny?.id]);

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
            className="mt-3 min-h-[44px] min-w-[44px] touch-manipulation rounded border border-linka bg-white px-4 py-2 text-sm font-bold text-inkoust select-none hover:bg-linka/60"
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
        className="mx-auto w-full max-w-2xl space-y-3 text-left lg:mx-0 lg:max-w-none"
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-2xl border border-linka bg-linka/40"
          />
        ))}
      </div>
    );
  }

  const celeJmeno = [zobrazeny.jmeno, zobrazeny.prijmeni].filter((d) => (d ?? "").trim().length > 0).join(" ");
  const od = clenOd(zobrazeny.createdAt);
  const role: string = zobrazeny.isSuperadmin
    ? "Hlavní admin"
    : zobrazeny.isAdmin === true
      ? "Admin"
      : nazevRole(zobrazeny.role);
  const roleRadek: string = od !== null ? `${role} · člen od ${od}` : role;

  return (
    <div className="mx-auto w-full max-w-lg text-left">
      <IdentitaProfilu
        inicialy={iniciály(zobrazeny.jmeno, zobrazeny.prijmeni)}
        jmeno={celeJmeno}
        podtitul={zobrazeny.email}
        stitek={roleRadek}
      />

      <div className="grid grid-cols-3 gap-2">
        <DlazdiceStatu popisek="Výprav" hodnota={String(souhrn.vypravy)} />
        <DlazdiceStatu popisek="Kilometrů" hodnota={String(souhrn.km)} />
        <DlazdiceStatu popisek="Fotek" hodnota={String(souhrn.fotek)} />
      </div>

      <section className="mt-4 rounded-2xl border border-linka bg-povrch p-4">
        <h3 className="font-display text-[17px] font-bold text-inkoust">Aplikace na plochu</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">
          Otevře se na celou obrazovku a historie jde i bez sítě.
        </p>
        <button
          type="button"
          className="nahled-press mt-3 min-h-11 w-full rounded-xl bg-smrk px-4 text-[15px] font-semibold text-papir"
          onClick={() => setPlochaSheet(true)}
        >
          Nainstalovat aplikaci
        </button>
      </section>

      {upravuje ? (
        <section className="mt-4" aria-label="Úprava osobních údajů">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="font-display text-[17px] font-bold text-inkoust">Upravit údaje</h3>
            <button
              type="button"
              onClick={() => setUpravuje(false)}
              className="nahled-press inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-end text-[15px] font-semibold text-smrk"
            >
              Zrušit
            </button>
          </div>
          <ProfileForm
            key={`${zobrazeny.id}-${zobrazeny.updatedAt}`}
            variant="radky"
            pocatecni={zobrazeny}
            onUlozeno={(novy: ApiUser) => {
              setPrepsany(novy);
              setUpravuje(false);
            }}
          />
        </section>
      ) : (
        <section className="mt-4" aria-labelledby="profil-udaje">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 id="profil-udaje" className="font-display text-[17px] font-bold text-inkoust">
              Osobní údaje
            </h3>
            <button
              type="button"
              onClick={() => setUpravuje(true)}
              className="nahled-press inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-end text-[15px] font-semibold text-smrk"
            >
              Upravit údaje
            </button>
          </div>
          <ul className={SEZNAM_KARTA_TRIDA}>
            <RadekUdaje popisek="E-mail" hodnota={zobrazeny.email} />
            <RadekUdaje popisek="Telefon" hodnota={zobrazeniTelefonu(zobrazeny.telefon).text} />
            <RadekUdaje popisek="Discord nick" hodnota={zobrazeny.discordNick ?? ""} />
            <RadekUdaje popisek="Škola" hodnota={zobrazeny.skola ?? ""} />
            <RadekUdaje popisek="Třída" hodnota={zobrazeny.trida ?? ""} />
            <RadekUdaje
              popisek="Datum narození"
              hodnota={zobrazeny.narozeniny ? datumCesky(zobrazeny.narozeniny) : ""}
            />
            <RadekUdaje popisek="Role" hodnota={roleRadek} />
          </ul>
        </section>
      )}
      <PridatNaPlochuSheet otevreno={plochaSheet} onZavrit={() => setPlochaSheet(false)} />
    </div>
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
async function ctiFaziPropojeni(obnovit = false): Promise<StravaFaze> {
  const rozsireny = await nactiStravaStavRozsireny({ obnovit });
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
  const [upozorneni, setUpozorneni] = useState<StravaUpozorneni | null>(null);
  // Pozdě dorazivší odpověď z mountu nesmí přepsat novější stav.
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
      className="mb-4 overflow-hidden rounded-lg border border-linka bg-povrch text-left shadow-denik"
    >
      <div aria-hidden="true" className="h-1.5 w-full bg-jantar" />
      <div className="p-5">
      <h2 className="text-base font-extrabold tracking-tight">Strava</h2>
      <div aria-live="polite" className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-inkoust/75">
        {faze.stav === "nacitani" && <p>Zjišťuji stav propojení…</p>}
        {faze.stav === "nepropojeno" && (
          <p>Propoj si účet se Stravou — kilometry a převýšení se pak připíšou k výpravám.</p>
        )}
        {faze.stav === "propojeno" && (
          <p>
            Propojeno jako atlet{" "}
            <span className="font-bold text-inkoust">
              {faze.stravaId.length > 0 ? faze.stravaId : "—"}
            </span>
            . Kilometry se připisují k výpravám samy.
          </p>
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
        {faze.stav === "propojeno" ? (
          <button
            type="button"
            onClick={() => void odpoj()}
            disabled={pracuje}
            className="nahled-press nahled-prejeti min-h-[44px] min-w-[44px] rounded border border-linka bg-papir px-4 py-2 text-sm font-bold text-inkoust disabled:opacity-50"
          >
            {pracuje ? "Odpojuji…" : "Odpojit Stravu"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void pripoj()}
            disabled={pracuje || faze.stav === "nacitani"}
            className="nahled-press nahled-prejeti min-h-[44px] min-w-[44px] rounded border border-linka bg-papir px-4 py-2 text-sm font-bold text-inkoust disabled:opacity-50"
          >
            {pracuje ? "Přesměrovávám…" : "Připojit Stravu"}
          </button>
        )}
      </div>
      </div>
    </section>
  );
}

function jeProfilTab(hodnota: string | null): hodnota is ProfilTab {
  return hodnota === "osobni" || hodnota === "strava" || hodnota === "statistiky" || hodnota === "heatmapa";
}

export default function ProfilPage(): JSX.Element {
  const [aktivniTab, setAktivniTab] = useState<ProfilTab>(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (jeProfilTab(tab)) return tab;
    }
    return ctiStravaPriznakZUrl() === null ? "osobni" : "strava";
  });

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
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:max-w-2xl lg:px-8">
      <header className="border-b border-linka pb-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-inkoust">Profil</h1>

        <div
          className="sticky top-0 z-10 -mx-4 bg-papir px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-12 xl:px-12"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
        >
          <div
            role="tablist"
            aria-label="Sekce profilu"
            onKeyDown={onKeyDown}
            className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden"
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
                  className={`bez-prejeti min-h-[44px] min-w-[44px] touch-manipulation shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold select-none transition-colors motion-reduce:transition-none ${
                    aktivni
                      ? "border-transparent bg-smrk text-papir"
                      : "border-linka bg-povrch text-inkoust hover:bg-mlha/60"
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
          className={
            aktivniTab === "osobni" || aktivniTab === "statistiky"
              ? "text-left"
              : "rounded-2xl border border-linka bg-povrch p-5 text-left"
          }
        >
          {aktivniTab === "osobni" && <OsobniPanel />}
          {aktivniTab === "strava" && <StravaKarta />}
          {aktivniTab === "statistiky" && <StatistikyPlocha />}
          {aktivniTab === "heatmapa" && (
            <Suspense
              fallback={
                <div
                  aria-busy="true"
                  aria-label="Načítám mapu tras"
                  className="h-[320px] animate-pulse rounded-2xl border border-linka bg-linka/40 sm:h-[420px]"
                />
              }
            >
              <Heatmapa />
            </Suspense>
          )}
        </div>
        <Odhlaseni />
      </div>
    </main>
  );
}
