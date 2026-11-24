import Ikona from "../components/Ikona";
import {
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
import { nahratAvatar, useProfile } from "../hooks/useProfile";
import ProfileForm from "../components/profil/ProfileForm";
import { DlazdiceStatu, IdentitaProfilu, KARTA_UDAJU, ProfilovaKarta, RadekUdaje, ZALOZKY_DRAHA, tridaZalozky } from "../components/ProfilKusy";
import Prepinac from "../components/Prepinac";
import { vypniOznameni, zapniOznameni } from "../lib/push-odber";
import { useSearchParams } from "react-router-dom";
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
import { useNabeh } from "../lib/pohyb";
import { nactiCleny } from "../lib/admin-clenove";

type ProfilTab = "oznameni" | "osobni" | "statistiky";

/** Záložky na počítači podle ExApp.pen. Telefon je nemá, Statistiky jsou ve Více. */
const TABY: Array<{ id: ProfilTab; popisek: string }> = [
  { id: "oznameni", popisek: "Oznámení" },
  { id: "osobni", popisek: "Účet" },
  { id: "statistiky", popisek: "Statistiky" },
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
      className="nahled-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-akcent-100 px-4 text-sm font-semibold text-akcent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-akcent"
    >
      <Ikona nazev="log-out" className="size-4" />
      Odhlásit se
    </button>
  );
}

function OdhlaseniPocitac(): JSX.Element {
  const { odhlasit } = useAuth();
  return (
    <button
      type="button"
      onClick={odhlasit}
      className="nahled-press hidden h-[46px] items-center gap-2 rounded-xl border border-linka bg-povrch px-[18px] text-sm font-semibold text-inkoust hover:bg-povrch-2 min-[90rem]:inline-flex"
    >
      <Ikona nazev="log-out" className="size-4 text-mech" />
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

interface VlastnostiAvataru {
  avatar: string | null;
  onZmenitAvatar: (soubor: File) => Promise<string | null>;
}

/** Počet vlastních fotek ze seznamu členů, statistiky ho nevracejí. */
async function pocetMychFotek(id: string | undefined): Promise<number> {
  if (id === undefined) return 0;
  const vysledek = await nactiCleny();
  return vysledek.ok ? (vysledek.data.find((clen) => clen.id === id)?.pocetFotek ?? 0) : 0;
}

/** Levá karta profilu na počítači („Profile Card“ v ExApp.pen). */
function ProfilKarta({ avatar, onZmenitAvatar }: VlastnostiAvataru): JSX.Element | null {
  const { profil } = useProfile();
  const [souhrn, setSouhrn] = useState<ProfilSouhrn>({ vypravy: 0, km: 0, fotek: 0 });
  const [plochaSheet, setPlochaSheet] = useState(false);
  useEffect(() => {
    let zije = true;
    void Promise.all([getMojeStatistiky(), pocetMychFotek(profil?.id)]).then(([stat, fotek]) => {
      if (!zije) return;
      setSouhrn({ vypravy: stat.data.vypravy, km: stat.data.kmCelkem, fotek });
    });
    return () => {
      zije = false;
    };
  }, [profil?.id]);
  if (profil === null) return null;
  const celeJmeno = [profil.jmeno, profil.prijmeni].filter((d) => (d ?? "").trim().length > 0).join(" ");
  const od = clenOd(profil.createdAt);
  const role: string = profil.isSuperadmin ? "Hlavní admin" : profil.isAdmin === true ? "Admin" : nazevRole(profil.role);
  return (
    <>
      <ProfilovaKarta
        inicialy={iniciály(profil.jmeno, profil.prijmeni)}
        url={avatar ?? profil.avatarUrl}
        onZmenitAvatar={onZmenitAvatar}
        jmeno={celeJmeno}
        email={profil.email}
        stitky={[
          { text: role, ton: "okr" },
          ...(od !== null ? [{ text: `Člen od ${od}`, ton: "neutralni" as const }] : []),
        ]}
        cisla={[
          { popisek: "Výprav", hodnota: String(souhrn.vypravy) },
          { popisek: "Kilometry", hodnota: kmCislo(souhrn.km) },
          { popisek: "Fotky", hodnota: String(souhrn.fotek) },
        ]}
      >
        <div className="flex flex-col gap-[9px]">
          <span aria-hidden="true" className="h-px bg-linka" />
          <p className="flex items-center gap-[7px] text-[10px] font-bold uppercase tracking-[1.1px] text-ink-3">
            <Ikona nazev="smartphone" className="size-[13px]" />
            Aplikace na plochu
          </p>
          <p className="text-[11.5px] leading-[17px] text-mech">Otevře se na celou obrazovku a historie jde i bez sítě.</p>
          <button
            type="button"
            onClick={() => setPlochaSheet(true)}
            className="nahled-press inline-flex h-[38px] w-full items-center justify-center gap-[7px] rounded-[10px] bg-mlha text-[12.5px] font-semibold text-smrk hover:bg-linka"
          >
            <Ikona nazev="download" className="size-3.5" />
            Nainstalovat aplikaci
          </button>
        </div>
      </ProfilovaKarta>
      <PridatNaPlochuSheet otevreno={plochaSheet} onZavrit={() => setPlochaSheet(false)} />
    </>
  );
}

function kmCislo(km: number): string {
  return km.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
}

/** Karta Oznámení: push v zařízení (jeden přepínač, server druhy zpráv nerozlišuje). */
function OznameniKarta(): JSX.Element {
  const [zapnuto, setZapnuto] = useState<boolean>(
    () => typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState<string | null>(null);

  async function prepnout(nove: boolean): Promise<void> {
    if (bezi) return;
    setBezi(true);
    setHlaska(null);
    const vysledek = nove ? await zapniOznameni() : await vypniOznameni();
    setBezi(false);
    if (!vysledek.ok) {
      setHlaska(vysledek.chyba);
      return;
    }
    setZapnuto(nove);
  }

  return (
    <section
      aria-labelledby="profil-oznameni"
      className="overflow-hidden rounded-2xl border border-linka bg-povrch shadow-karta"
    >
      <h2
        id="profil-oznameni"
        className="border-b border-linka px-4 py-3.5 font-display text-base font-bold text-inkoust min-[90rem]:px-5 min-[90rem]:py-[18px] min-[90rem]:text-[17px] min-[90rem]:tracking-[-0.3px]"
      >
        Oznámení
      </h2>
      <div className="flex items-center gap-4 px-4 py-1 min-[90rem]:px-5">
        <span className="min-w-0 flex-1 py-2.5 text-[13.5px] font-semibold text-inkoust">Nové výpravy, přihlášky a chat</span>
        <Prepinac zapnuto={zapnuto} onZmena={(nove) => void prepnout(nove)} popisek="Oznámení v zařízení" disabled={bezi} />
      </div>
      {hlaska !== null ? (
        <p role="status" className="border-t border-linka px-4 py-3 text-[12.5px] text-mech min-[90rem]:px-5">
          {hlaska}
        </p>
      ) : null}
    </section>
  );
}

function OsobniPanel({
  avatar,
  onZmenitAvatar,
  upravuje,
  onUpravuje,
  sHeslem = false,
}: VlastnostiAvataru & {
  /** Změna hesla patří do záložky Účet. */
  sHeslem?: boolean;
  /** Telefon: údaje jsou jen ke čtení, úpravy otevře „Upravit“ v hlavičce. */
  upravuje: boolean;
  onUpravuje: (upravuje: boolean) => void;
}): JSX.Element {
  const { profil, stav, chyba, znovuNacti } = useProfile();
  const [prepsany, setPrepsany] = useState<ApiUser | null>(null);
  const [souhrn, setSouhrn] = useState<ProfilSouhrn>({ vypravy: 0, km: 0, fotek: 0 });
  const [plochaSheet, setPlochaSheet] = useState(false);
  const zobrazeny: ApiUser | null = prepsany ?? profil;

  useEffect(() => {
    let zije = true;
    void (async (): Promise<void> => {
      const [stat, fotek] = await Promise.all([getMojeStatistiky(), pocetMychFotek(zobrazeny?.id)]);
      if (!zije) return;
      setSouhrn({
        vypravy: stat.data.vypravy,
        km: stat.data.kmCelkem,
        fotek,
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
          <p role="alert" className="rounded-xl bg-akcent-100 px-3.5 py-2.5 text-[13px] font-semibold text-akcent">
            {chyba ?? "Profil se nepodařilo načíst."}
          </p>
          <button
            type="button"
            onClick={znovuNacti}
            className="mt-3 min-h-[44px] min-w-[44px] touch-manipulation rounded-xl border border-linka bg-povrch px-4 py-2 text-sm font-semibold text-inkoust select-none hover:bg-povrch-2"
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
        className="w-full space-y-3 text-left"
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 text-left sm:max-w-none">
      <div className="flex flex-col gap-5 min-[90rem]:hidden">
        <IdentitaProfilu
          inicialy={iniciály(zobrazeny.jmeno, zobrazeny.prijmeni)}
          url={avatar ?? zobrazeny.avatarUrl}
          onZmenitAvatar={onZmenitAvatar}
          jmeno={celeJmeno}
          podtitul={zobrazeny.email}
          stitek={roleRadek}
        />

        <div className="grid grid-cols-3 gap-2">
          <DlazdiceStatu popisek="Výprav" hodnota={String(souhrn.vypravy)} />
          <DlazdiceStatu popisek="Kilometrů" hodnota={kmCislo(souhrn.km)} />
          <DlazdiceStatu popisek="Fotek" hodnota={String(souhrn.fotek)} />
        </div>

        <section className="flex flex-col gap-2.5 rounded-2xl border border-linka bg-povrch p-4 shadow-jemny">
          <h3 className="font-sans text-[15px] font-semibold tracking-normal text-inkoust">Aplikace na plochu</h3>
          <p className="text-[13px] leading-[18px] text-mech">Otevře se na celou obrazovku a historie jde i bez sítě.</p>
          <button
            type="button"
            className="nahled-press h-11 w-full rounded-xl bg-smrk px-4 text-sm font-semibold text-povrch"
            onClick={() => setPlochaSheet(true)}
          >
            Nainstalovat aplikaci
          </button>
        </section>

        <OznameniKarta />
      </div>

      <section
        aria-labelledby="profil-udaje"
        className="min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:p-5 min-[90rem]:shadow-denik"
      >
        <h3 id="profil-udaje" className="sr-only font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust min-[90rem]:not-sr-only min-[90rem]:mb-4 min-[90rem]:block">
          Osobní údaje
        </h3>
        <div className={upravuje ? "hidden" : "min-[90rem]:hidden"}>
          <ul className={KARTA_UDAJU}>
            <RadekUdaje popisek="E-mail" hodnota={zobrazeny.email} />
            <RadekUdaje popisek="Telefon" hodnota={zobrazeniTelefonu(zobrazeny.telefon).text} />
            <RadekUdaje popisek="Discord nick" hodnota={zobrazeny.discordNick ?? ""} />
            <RadekUdaje popisek="Škola" hodnota={zobrazeny.skola ?? ""} />
            <RadekUdaje popisek="Třída" hodnota={zobrazeny.trida ?? ""} />
            <RadekUdaje popisek="Datum narození" hodnota={zobrazeny.narozeniny ? datumCesky(zobrazeny.narozeniny) : ""} />
            <RadekUdaje popisek="Role" hodnota={roleRadek} />
          </ul>
        </div>
        <div className={upravuje ? "" : "hidden min-[90rem]:block"}>
          <ProfileForm
            key={`${zobrazeny.id}-${zobrazeny.updatedAt}`}
            variant="radky"
            sHeslem={upravuje || sHeslem}
            pocatecni={zobrazeny}
            onUlozeno={(novy: ApiUser) => {
              setPrepsany(novy);
              onUpravuje(false);
            }}
          />
        </div>
      </section>

      <div className="min-[90rem]:hidden">
        <Odhlaseni />
      </div>
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
      className={`flex flex-col gap-3 rounded-2xl border border-linka bg-povrch p-4 text-left shadow-karta min-[90rem]:p-5 ${
        faze.stav === "nepropojeno" && upozorneni === null ? "max-[90rem]:hidden" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-inkoust min-[90rem]:text-[17px] min-[90rem]:tracking-[-0.3px]">Strava</h2>
        {faze.stav === "propojeno" ? (
          <span className="rounded-full bg-mlha px-2 py-[3px] text-[10px] font-semibold text-smrk">připojeno</span>
        ) : null}
      </div>
      <div aria-live="polite" className="text-xs leading-[17px] text-mech">
        {faze.stav === "nacitani" && <p>Zjišťuji stav propojení…</p>}
        {faze.stav === "nepropojeno" && (
          <p>Propoj si účet se Stravou — kilometry a převýšení se pak připíšou k výpravám.</p>
        )}
        {faze.stav === "propojeno" && (
          <p>
            Propojeno jako atlet <span className="font-semibold text-inkoust">{faze.stravaId.length > 0 ? faze.stravaId : "—"}</span>. Kilometry se připisují k výpravám samy.
          </p>
        )}
        {faze.stav === "chyba" && <p role="alert">{faze.zprava}</p>}
      </div>
      {upozorneni !== null && (
        <p
          role={upozorneni.typ === "chyba" ? "alert" : "status"}
          className={`rounded-[10px] px-3 py-2 text-xs font-semibold ${
            upozorneni.typ === "uspech" ? "bg-mlha text-smrk" : upozorneni.typ === "chyba" ? "bg-akcent-100 text-akcent" : "bg-povrch-2 text-mech"
          }`}
        >
          {upozorneni.text}
        </p>
      )}
      <div className="flex gap-2">
        {faze.stav === "propojeno" ? (
          <button
            type="button"
            onClick={() => void odpoj()}
            disabled={pracuje}
            className="nahled-press inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[9px] border border-linka px-3 text-xs font-semibold text-ink-3 disabled:opacity-50 min-[90rem]:min-h-9"
          >
            {pracuje ? "Odpojuji…" : "Odpojit Stravu"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void pripoj()}
            disabled={pracuje || faze.stav === "nacitani"}
            className="nahled-press inline-flex min-h-[44px] min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-povrch-2 px-3 text-xs font-semibold text-mech disabled:opacity-50 min-[90rem]:min-h-9"
          >
            <Ikona nazev="link-2" className="size-[13px]" />
            {pracuje ? "Přesměrovávám…" : "Připojit Stravu"}
          </button>
        )}
      </div>
    </section>
  );
}

/** Záložka z URL. Staré hodnoty (strava, heatmapa) vedou na Statistiky. */
function tabZUrl(hodnota: string | null): ProfilTab | null {
  if (hodnota === "strava" || hodnota === "heatmapa" || hodnota === "statistiky") return "statistiky";
  if (hodnota === "osobni" || hodnota === "oznameni") return hodnota;
  return null;
}

/** Profil podle ExApp.pen. Statistiky jsou samostatná stránka se stejnou adresou (?tab=statistiky). */
export default function ProfilPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [poNavratuZeStravy] = useState<boolean>(() => ctiStravaPriznakZUrl() !== null);
  const aktivniTab: ProfilTab = tabZUrl(params.get("tab")) ?? (poNavratuZeStravy ? "statistiky" : "oznameni");
  const panelRef = useNabeh<HTMLDivElement>(aktivniTab);
  // Nová fotka se ukáže hned na obou místech, bez nového načtení profilu.
  const [avatar, setAvatar] = useState<string | null>(null);
  async function zmenAvatar(soubor: File): Promise<string | null> {
    const vysledek = await nahratAvatar(soubor);
    if (!vysledek.ok) return vysledek.chyba;
    setAvatar(vysledek.data.avatarUrl ?? null);
    return null;
  }
  const [upravuje, setUpravuje] = useState(false);

  function nastavTab(tab: ProfilTab): void {
    setParams(tab === "oznameni" ? {} : { tab });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const poradi = TABY.map((t) => t.id);
    const idx = poradi.indexOf(aktivniTab);
    let dalsi: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dalsi = (idx + 1) % poradi.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") dalsi = (idx - 1 + poradi.length) % poradi.length;
    else if (e.key === "Home") dalsi = 0;
    else if (e.key === "End") dalsi = poradi.length - 1;
    if (dalsi === null) return;
    e.preventDefault();
    const noveId = poradi[dalsi];
    if (noveId === undefined) return;
    nastavTab(noveId);
    document.getElementById(`tab-${noveId}`)?.focus();
  }

  const obal =
    "mx-auto w-full max-w-lg px-5 pb-6 pt-4 sm:max-w-[46rem] sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11";

  if (aktivniTab === "statistiky") {
    return (
      <main className={`${obal} lg:max-w-[70rem]`}>
        <StatistikyPlocha strava={<StravaKarta />} />
      </main>
    );
  }

  return (
    <main className={obal}>
      <div className="flex items-center justify-between gap-4 min-[90rem]:items-end">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
          Profil
        </h1>
        <button
          type="button"
          onClick={() => setUpravuje((pred) => !pred)}
          className="nahled-press inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center rounded-xl px-3 text-sm font-semibold text-smrk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:hidden"
        >
          {upravuje ? "Zrušit" : "Upravit"}
        </button>
        <OdhlaseniPocitac />
      </div>
      <div className="mt-5 min-[90rem]:mt-8 min-[90rem]:grid min-[90rem]:grid-cols-[340px_minmax(0,1fr)] min-[90rem]:items-start min-[90rem]:gap-7">
        <div className="hidden min-[90rem]:block">
          <ProfilKarta avatar={avatar} onZmenitAvatar={zmenAvatar} />
        </div>
        <div className="min-w-0">
          <div className="mb-5 hidden min-[90rem]:block">
          <div
            role="tablist"
            aria-label="Sekce profilu"
            onKeyDown={onKeyDown}
            className={`${ZALOZKY_DRAHA} max-w-full flex-wrap`}
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
                  onClick={() => nastavTab(tab.id)}
                  className={tridaZalozky(aktivni)}
                >
                  {tab.popisek}
                </button>
              );
            })}
          </div>
          </div>
          <div ref={panelRef} role="tabpanel" id={`panel-${aktivniTab}`} aria-labelledby={`tab-${aktivniTab}`} className="flex flex-col gap-5 text-left">
            {aktivniTab === "oznameni" ? (
              <div className="hidden min-[90rem]:block">
                <OznameniKarta />
              </div>
            ) : null}
            <OsobniPanel avatar={avatar} onZmenitAvatar={zmenAvatar} upravuje={upravuje} onUpravuje={setUpravuje} sHeslem={aktivniTab === "osobni"} />
          </div>
        </div>
      </div>
    </main>
  );
}
