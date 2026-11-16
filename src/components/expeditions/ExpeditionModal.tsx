import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
} from "react";
import { useAuth } from "../../hooks/useAuth";
import { apiBase } from "../../lib/api-base";
import AvatarKruh from "../AvatarKruh";
import VyberPole from "../VyberPole";
import ZastupnySnimek from "../vypravy-nahled/ZastupnySnimek";
import { paletaVypravy } from "../../lib/krajina";
import ZnackaOrganizatora from "../ZnackaOrganizatora";
import { jeClenProfilOtevreny, TlacitkoProfilu } from "../clen/ClenProfil";
import {
  formatRozsahData,
  jeBezOmezeni,
  jeProbihajici,
  jeProbehla,
  jeUplynula,
  obsazenostProcenta,
  volnaMista,
} from "../../lib/expedition-utils";
import {
  nactiDetailVypravy,
  nactiUcastniky,
  nahrajCestaSnimky,
  smazCestaSnimek,
  nactiUzivateleProSelektor,
  odeberUcastnika,
  odhlasZVypravy,
  pridejUcastnikaPoUzavreni,
  prihlasNaVypravu,
  smazVypravu,
  upravVypravu,
  uzavriVypravu,
  type ApiUcastnik,
} from "../../lib/expeditions-ucast";
import type { ApiCestaSnimek } from "../../shared/api-types";
import type { SnimkyCestyVyber } from "./ExpeditionForm";
import type { Expedition } from "../../lib/mock-expeditions";
import type {
  UserId,
  UserListItem,
} from "../../shared/api-types";
import type {
  ApiExpedice,
  UpravitExpediciRequest,
  VytvoritExpediciRequest,
} from "../../shared/api-types";
import ExpeditionForm, {
  type ChybyExpedice,
  type ExpeditionFormVychozi,
} from "./ExpeditionForm";
import DiskuzeBox from "../chat/DiskuzeBox";
import NeprectenaTecka from "../chat/NeprectenaTecka";
import ExpeditionPhotos from "./ExpeditionPhotos";
import { jeFotkyLightboxOtevreny } from "./FotkyLightbox";
import VypravaNahled from "./VypravaNahled";
import { useNahledFotkaId } from "../../hooks/useNahledFotkaId";
import { rozdelViditelne } from "../../lib/sbaleny-seznam";
import ExpeditionTrasaPrehled from "./ExpeditionTrasaPrehled";
import StravaParovani from "./StravaParovani";

export interface ExpeditionModalProps {
  expedice: Expedition;
  onZavrit: () => void;
  /** Propíše účast / úpravu / uzavření do seznamu (kapacita, stav). */
  onAktualizace: (nova: Expedition) => void;
  onSmazana: (id: string) => void;
  /**
   * Step 3 — tečka nepřečtené diskuze ze sdílené mapy rodiče
   * (`useUnreadExpeditions` žije jen ve VypravyPage, modal vlastní
   * poller nemá — jeden zdroj pravdy pro kartu + nástěnku + modal).
   */
  neprectenaDiskuze?: boolean;
  /**
   * Step 3 — deep-link (`/vypravy?vyprava=<id>`): po otevření doscrollovat
   * na sekci Diskuze + dát jí focus (mobil OK). Běžné otevření z karty
   * nechává `false` — detail začíná odshora jako dosud.
   */
  startNaDiskuzi?: boolean;
  /** Shown once after create when screenshot upload failed. */
  hlaseni?: string | null;
  /**
   * Journal chrome for the preview route. Production keeps the diary modal.
   * The cover frame is 4:3 so a standard photo fills it.
   */
  denik?: boolean;
}

type Rezim = "prehled" | "upravy" | "ruseni" | "uzavirani";
type UcastStav = "nacitani" | "hotovo" | "chyba";

const FOCUSOVATELNE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prevedExpedici(
  api: ApiExpedice,
  predchoziNahled: string | null | undefined,
): Expedition {
  const stravaId: string | null =
    typeof api.stravaActivityId === "string" ? api.stravaActivityId : null;
  const maKm: boolean = typeof api.km === "number";
  const nahled =
    api.nahledFotkaId !== undefined ? api.nahledFotkaId : predchoziNahled;
  return {
    id: api.id,
    nazev: api.nazev,
    datum: api.datum,
    datumDo: api.datumDo,
    sraz: api.sraz,
    popis: api.popis,
    trasaOdkaz: api.trasaOdkaz,
    organizatorId: api.organizatorId ?? null,
    kapacita: { prihlaseno: api.kapacita.prihlaseno, celkem: api.kapacita.celkem },
    stav: api.stav,
    // Step 4 — stav párování z detailu (expedice-level): Strava id NEBO
    // zapsané km (ruční zápis nese km bez Strava id). Vidí i neúčastník —
    // bez čtení osobních statistik. Rozlišení zdroje drží StravaParovani
    // (`rozhodniZdrojPripojeni`): Strava id → „Odpojit aktivitu",
    // km bez id → „Smazat ruční zápis". Účet („Odpojit účet") jen v profilu.
    jeSparovano: stravaId !== null || maKm,
    stravaActivityId: stravaId,
    ...(nahled !== undefined ? { nahledFotkaId: nahled } : {}),
  };
}

function statusUcastiPopisek(status: ApiUcastnik["status"]): string {
  if (status === "ucastnil_se") return "zúčastnil se";
  if (status === "omluven") return "omluven";
  return "přihlášen";
}

/** "Jede 11 lidí" before the trip; afterwards just the signed-up count. */
function textPoctuPrihlasenych(pocet: number, jede: boolean): string {
  if (pocet <= 0) return "";
  if (!jede) {
    if (pocet === 1) return "1 přihlášený";
    if (pocet < 5) return `${pocet} přihlášení`;
    return `${pocet} přihlášených`;
  }
  if (pocet === 1) return "Jede 1 člověk";
  if (pocet < 5) return `Jedou ${pocet} lidé`;
  return `Jede ${pocet} lidí`;
}

/** Every name, in one sentence. Nothing is held back for a second list. */
function textJmenPrihlasenych(jmena: readonly string[]): string {
  const cista = jmena.map((jmeno) => jmeno.trim()).filter((jmeno) => jmeno.length > 0);
  if (cista.length === 0) return "";
  if (cista.length === 1) return cista[0] ?? "";
  const posledni = cista[cista.length - 1] ?? "";
  return `${cista.slice(0, -1).join(", ")} a ${posledni}`;
}

function PrehledPrihlasenych({
  ucastnici,
  jede,
}: {
  ucastnici: readonly ApiUcastnik[];
  jede: boolean;
}): JSX.Element | null {
  const lide = jede ? ucastnici.filter((clovek) => clovek.status !== "omluven") : ucastnici;
  const pocet = textPoctuPrihlasenych(lide.length, jede);
  if (pocet.length === 0) return null;
  const jmena = textJmenPrihlasenych(lide.map((clovek) => clovek.jmeno));
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex max-w-full flex-wrap sm:max-w-56">
        {lide.map((clovek, index) => (
          <span key={clovek.id} className={`rounded-full ring-2 ring-papir ${index === 0 ? "" : "-ml-2"}`}>
            <AvatarKruh jmeno={clovek.jmeno} url={clovek.avatarUrl} />
          </span>
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-inkoust">{pocet}</p>
        {jmena.length > 0 && (
          <p className="text-[13px] leading-snug text-mech">{jmena}</p>
        )}
      </div>
    </div>
  );
}

function JmenoUcastnika({
  ucastnik,
  doplnek,
  jeOrganizator = false,
}: {
  ucastnik: ApiUcastnik;
  doplnek?: JSX.Element;
  jeOrganizator?: boolean;
}): JSX.Element {
  const obsah = (
    <>
      <AvatarKruh jmeno={ucastnik.jmeno} url={ucastnik.avatarUrl} />
      <span className="min-w-0 truncate font-semibold">
        {ucastnik.jmeno}
        {jeOrganizator ? <ZnackaOrganizatora /> : null}
        {doplnek}
      </span>
    </>
  );
  if (ucastnik.userId === null) {
    return <span className="flex min-w-0 items-center gap-2">{obsah}</span>;
  }
  return (
    <TlacitkoProfilu
      id={ucastnik.userId}
      jmeno={ucastnik.jmeno}
      avatarUrl={ucastnik.avatarUrl}
      className="flex min-w-0 items-center gap-2 bg-transparent p-0"
    >
      {obsah}
    </TlacitkoProfilu>
  );
}

/**
 * Deníkový detail výpravy — role=dialog + aria-modal, focus-trap, Esc,
 * klik na backdrop, křížek; po zavření vrací focus na kartu, která ho otevřela.
 * USER: seznam přihlášených + Přihlásit / Odhlásit. Správa výprav
 * (aktivní člen, dual-guard): Upravit (reuse ExpeditionForm),
 * Odstranit (potvrzení), Uzavřít (bez vyplňování docházky).
 */
function srcSnimku(url: string): string {
  if (url.startsWith("/api/")) return `${apiBase()}${url}`;
  return url;
}

function MrizkaSnimku({
  nadpis,
  snimky,
}: {
  nadpis: string;
  snimky: readonly ApiCestaSnimek[];
}): JSX.Element | null {
  if (snimky.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-sm font-bold">{nadpis}</h3>
      <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {snimky.map((snimek) => (
          <li key={snimek.id}>
            <a href={srcSnimku(snimek.url)} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={srcSnimku(snimek.url)}
                alt={nadpis}
                className="aspect-square w-full rounded-xl object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tlačítka dialogu (C2): stejná výška, zaoblení a písmo ve všech režimech. */
const TLACITKO_ZAKLAD =
  "inline-flex min-h-[48px] items-center justify-center rounded-xl px-6 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-not-allowed disabled:opacity-60";
const PAPIR = `${TLACITKO_ZAKLAD} bg-mlha text-inkoust hover:bg-linka`;
const TLACITKO_HLAVNI = `${TLACITKO_ZAKLAD} bg-okr text-inkoust hover:bg-okr-tmavy`;
const TLACITKO_NEBEZPECI = `${TLACITKO_ZAKLAD} bg-red-800 text-papir hover:bg-red-900`;
const TLACITKO_UZAVRIT = `${TLACITKO_ZAKLAD} bg-jantar text-papir hover:brightness-95`;
const TLACITKO_NA_MLZE = `${TLACITKO_ZAKLAD} bg-papir text-inkoust hover:bg-linka`;
/** Lišta akcí na konci režimu: na telefonu pod sebou, od sm vedle sebe vpravo. */
const LISTA_AKCI = "mt-6 flex flex-col-reverse gap-2 border-t border-linka pt-4 sm:flex-row sm:justify-end";

function TlacitkoPapir({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: string;
}): JSX.Element {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={PAPIR}>
      {children}
    </button>
  );
}

/** Two full rows of the two-column grid, so the next name cannot snap into a hole. */
const VIDITELNYCH_PRIHLASENYCH = 4;

function viditelniUcastnici(
  seznam: readonly ApiUcastnik[],
): { nahore: ApiUcastnik[]; dole: ApiUcastnik[]; skrytych: number } {
  const rozdelene = rozdelViditelne(seznam, VIDITELNYCH_PRIHLASENYCH);
  return {
    nahore: rozdelene.viditelne,
    dole: rozdelene.skryte,
    skrytych: rozdelene.skryte.length,
  };
}

function TlacitkoDalsichUcastniku({
  skrytych,
  vysunuto,
  onPrepnout,
}: {
  skrytych: number;
  vysunuto: boolean;
  onPrepnout: () => void;
}): JSX.Element | null {
  if (skrytych <= 0) return null;
  return (
    <button
      type="button"
      aria-expanded={vysunuto}
      onClick={onPrepnout}
      className="inline-flex min-h-[44px] w-full touch-manipulation select-none items-center justify-center gap-2 rounded-lg border border-pole bg-papir px-3 text-sm font-semibold text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${vysunuto ? "rotate-180" : ""}`}>
        <path d="m6 9 6 6 6-6" />
      </svg>
      {vysunuto ? "Zobrazit méně" : `Zobrazit další (${skrytych})`}
    </button>
  );
}

export default function ExpeditionModal({
  expedice,
  onZavrit,
  onAktualizace,
  onSmazana,
  neprectenaDiskuze = false,
  startNaDiskuzi = false,
  hlaseni = null,
  denik = false,
}: ExpeditionModalProps): JSX.Element {
  const { user, isAdmin, muzeSpravovatVypravy } = useAuth();
  const nadpisId: string = useId();
  const popisId: string = useId();
  const ucastNadpisId: string = useId();
  const spravaNadpisId: string = useId();
  const filtrUzivateluId: string = useId();
  const vyberUzivateleId: string = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const krizekRef = useRef<HTMLButtonElement>(null);
  const vyberUzivateleRef = useRef<HTMLButtonElement>(null);
  /* Step 3 — cíl deep-linku (sekce Diskuze). Mount-only: modal se pro každou
     výpravu montuje znovu (`key={vybrana.id}`), pozdější aktualizace rodiče
     (účast, pairing) scroll ani focus znovu nehýbou. */
  const diskuzeRef = useRef<HTMLElement>(null);
  const startNaDiskuziRef = useRef<boolean>(startNaDiskuzi);
  /* onZavrit držíme v refu — focus efekt smí běžet jen při mountu.
     Jinak každá aktualizace rodiče (např. přidání účastníka →
     onAktualizace → nový render) refocusne křížek a scrollne
     dialog zpět nahoru. */
  const onZavritRef = useRef(onZavrit);
  onZavritRef.current = onZavrit;
  /* Preview close plays the enter motion backwards, then unmounts. */
  const ZAVRENI_MS = 220;
  const zaviraRef = useRef(false);
  const zavriCasovacRef = useRef<number | null>(null);
  const [zavira, setZavira] = useState(false);
  const zavriRef = useRef<(hned?: boolean) => void>(() => {});
  zavriRef.current = (hned = false) => {
    if (zaviraRef.current) return;
    const snizitPohyb =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!denik || hned || snizitPohyb) {
      onZavritRef.current();
      return;
    }
    zaviraRef.current = true;
    setZavira(true);
    zavriCasovacRef.current = window.setTimeout(() => {
      onZavritRef.current();
    }, ZAVRENI_MS);
  };
  const onAktualizaceRef = useRef(onAktualizace);
  onAktualizaceRef.current = onAktualizace;

  const [rezim, setRezim] = useState<Rezim>("prehled");
  const [cestaTam, setCestaTam] = useState<ApiCestaSnimek[]>([]);
  const [cestaZpet, setCestaZpet] = useState<ApiCestaSnimek[]>([]);
  const [ucastStav, setUcastStav] = useState<UcastStav>("nacitani");
  const [ucastnici, setUcastnici] = useState<ApiUcastnik[]>([]);
  const [ucastChyba, setUcastChyba] = useState<string | null>(null);
  const [akceBezi, setAkceBezi] = useState<boolean>(false);
  const [akceChyba, setAkceChyba] = useState<string | null>(null);

  const [odesilaSe, setOdesilaSe] = useState<boolean>(false);
  const [serverChyba, setServerChyba] = useState<string | null>(null);
  const [serverChybyPoli, setServerChybyPoli] = useState<ChybyExpedice>({});

  const [mazeSe, setMazeSe] = useState<boolean>(false);
  const [smazChyba, setSmazChyba] = useState<string | null>(null);

  const [uzaviraSe, setUzaviraSe] = useState<boolean>(false);
  const [uzavriChyba, setUzavriChyba] = useState<string | null>(null);

  /* Správa docházky po uzavření (jen proběhlá + správa výprav, Krok 4: userId). */
  type UzivateleStav = "neaktivni" | "nacitani" | "hotovo" | "chyba";
  const [uzivatele, setUzivatele] = useState<UserListItem[]>([]);
  const [uzivateleStav, setUzivateleStav] = useState<UzivateleStav>("neaktivni");
  const [uzivateleChyba, setUzivateleChyba] = useState<string | null>(null);
  const [filtrUzivatelu, setFiltrUzivatelu] = useState<string>("");
  const [vybranyUzivatelId, setVybranyUzivatelId] = useState<string>("");
  const [spravaZprava, setSpravaZprava] = useState<string | null>(null);
  const [spravaChyba, setSpravaChyba] = useState<string | null>(null);
  const [potvrzOdebraniId, setPotvrzOdebraniId] = useState<string | null>(null);
  const [odebiraId, setOdebiraId] = useState<string | null>(null);
  const [ucastVysunuto, setUcastVysunuto] = useState(false);
  const [kronikaVysunuto, setKronikaVysunuto] = useState(false);
  const pridatTlacitkoRef = useRef<HTMLButtonElement>(null);
  const kotvaPridani = useRef<number | null>(null);

  const [nahledZGalerie, setNahledZGalerie] = useState<string | null | undefined>(
    undefined,
  );
  const fotkaId = useNahledFotkaId(
    expedice.id,
    nahledZGalerie !== undefined ? nahledZGalerie : expedice.nahledFotkaId,
  );
  const onZmenaNahledu = useCallback((dalsiId: string | null): void => {
    setNahledZGalerie(dalsiId);
  }, []);

  const probehla: boolean = jeProbehla(expedice);
  const poTerminu: boolean = jeUplynula(expedice);
  /** Closed, or the date passed and the trip still waits in Neuzavřené. */
  const archiv: boolean = probehla || poTerminu;
  const probiha: boolean = !probehla && jeProbihajici(expedice);
  /* Step 3 — tečka na záložce Diskuze ze sdílené mapy rodiče
     (synchronně s kartou + nástěnkou, bez vlastního polleru). */
  const diskuzeNeprectena: boolean = neprectenaDiskuze;
  const bezOmezeni: boolean = jeBezOmezeni(expedice);
  const procenta: number = obsazenostProcenta(expedice);
  const volna: number = volnaMista(expedice);
  const plno: boolean = !bezOmezeni && volna === 0;

  const nacistiUcastniky = useCallback(async (idVypravy: string): Promise<void> => {
    setUcastStav("nacitani");
    setUcastChyba(null);
    const vysledek = await nactiUcastniky(idVypravy);
    if (!vysledek.ok) {
      setUcastStav("chyba");
      setUcastChyba(vysledek.chyba);
      return;
    }
    setUcastnici(vysledek.data.ucastnici);
    setUcastStav("hotovo");
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice, expedice.nahledFotkaId));
  }, []);

  const nacistiUzivatele = useCallback(async (): Promise<void> => {
    setUzivateleStav("nacitani");
    setUzivateleChyba(null);
    const vysledek = await nactiUzivateleProSelektor();
    if (!vysledek.ok) {
      setUzivateleStav("chyba");
      setUzivateleChyba(vysledek.chyba);
      return;
    }
    setUzivatele(vysledek.data);
    setUzivateleStav("hotovo");
  }, []);

  useEffect(() => {
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiDetailVypravy(expedice.id);
      if (!zive || !vysledek.ok) return;
      setCestaTam(vysledek.data.cestaTam);
      setCestaZpet(vysledek.data.cestaZpet);
    })();
    return () => {
      zive = false;
    };
  }, [expedice.id]);

  /* Thin bar stays hidden until the dialog or a nested list is scrolling. */
  useEffect(() => {
    if (!denik) return;
    const koren = dialogRef.current;
    if (koren === null) return;
    const casovace = new Map<HTMLElement, number>();
    function posuvnik(cil: EventTarget | null): HTMLElement | null {
      if (!(cil instanceof HTMLElement)) return null;
      let uzel: HTMLElement | null = cil;
      while (uzel !== null) {
        const styl = window.getComputedStyle(uzel);
        const daSePosouvat =
          (styl.overflowY === "auto" || styl.overflowY === "scroll") &&
          uzel.scrollHeight > uzel.clientHeight + 1;
        if (daSePosouvat) return uzel;
        if (uzel === koren) break;
        uzel = uzel.parentElement;
      }
      return null;
    }
    function ukaz(udalost: Event): void {
      const cil = posuvnik(udalost.target);
      if (cil === null) return;
      cil.classList.add("nahled-scrolluje");
      const predchozi = casovace.get(cil);
      if (predchozi !== undefined) window.clearTimeout(predchozi);
      casovace.set(
        cil,
        window.setTimeout(() => {
          cil.classList.remove("nahled-scrolluje");
          casovace.delete(cil);
        }, 700),
      );
    }
    koren.addEventListener("scroll", ukaz, true);
    koren.addEventListener("scroll", ukaz);
    koren.addEventListener("wheel", ukaz, { capture: true, passive: true });
    koren.addEventListener("touchmove", ukaz, { capture: true, passive: true });
    return () => {
      koren.removeEventListener("scroll", ukaz, true);
      koren.removeEventListener("scroll", ukaz);
      koren.removeEventListener("wheel", ukaz, true);
      koren.removeEventListener("touchmove", ukaz, true);
      for (const casovac of casovace.values()) window.clearTimeout(casovac);
    };
  }, [denik]);

  /* Selektor reálných users (GET /api/users) jen v editačním režimu Upravit. */
  useEffect(() => {
    if (!archiv || !muzeSpravovatVypravy || rezim !== "upravy") return;
    if (uzivateleStav !== "neaktivni") return;
    void nacistiUzivatele();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiv, muzeSpravovatVypravy, rezim, uzivateleStav]);

  useEffect(() => {
    setRezim("prehled");
    setAkceChyba(null);
    setServerChyba(null);
    setServerChybyPoli({});
    setSmazChyba(null);
    setUzavriChyba(null);
    setSpravaZprava(null);
    setSpravaChyba(null);
    setPotvrzOdebraniId(null);
    setFiltrUzivatelu("");
    setVybranyUzivatelId("");
    setUcastVysunuto(false);
    setKronikaVysunuto(false);
    setUzivateleStav("neaktivni");
    setUzivatele([]);
    setUzivateleChyba(null);
    void nacistiUcastniky(expedice.id);
  }, [expedice.id, nacistiUcastniky]);

  /* Focus-trap + Esc + zamknutí scrollu + návrat fokusu.
     Schválně jen při mountu ([]) — refocus křížku při každé
     aktualizaci by házel scroll dialogu nahoru (viz onZavritRef). */
  useEffect(() => {
    const predchoziFocus: Element | null = document.activeElement;
    /* Step 3 — deep-link cílí Diskuzi (vlastní efekt níže); běžné otevření
       drží dosavadní focus na křížku. */
    if (!startNaDiskuziRef.current) {
      krizekRef.current?.focus();
    }
    const puvodniOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (jeFotkyLightboxOtevreny() || jeClenProfilOtevreny()) return;
      if (udalost.key === "Escape") {
        udalost.stopPropagation();
        zavriRef.current(true);
        return;
      }
      if (udalost.key !== "Tab") return;
      const koren: HTMLDivElement | null = dialogRef.current;
      if (koren === null) return;
      const prvky: HTMLElement[] = Array.from(
        koren.querySelectorAll<HTMLElement>(FOCUSOVATELNE),
      );
      if (prvky.length === 0) return;
      const prvni: HTMLElement = prvky[0];
      const posledni: HTMLElement = prvky[prvky.length - 1];
      if (udalost.shiftKey && document.activeElement === prvni) {
        udalost.preventDefault();
        posledni.focus();
      } else if (!udalost.shiftKey && document.activeElement === posledni) {
        udalost.preventDefault();
        prvni.focus();
      }
    }

    document.addEventListener("keydown", naStiskKlavesy, true);
    return () => {
      document.removeEventListener("keydown", naStiskKlavesy, true);
      document.body.style.overflow = puvodniOverflow;
      document.documentElement.style.overflow = puvodniOverflow;
      if (zavriCasovacRef.current !== null) window.clearTimeout(zavriCasovacRef.current);
      if (predchoziFocus instanceof HTMLElement) predchoziFocus.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Step 3 — deep-link: otevření z Nástěnky / přímé URL doscrolluje na
     Diskuzi + dá jí focus. Mobil OK (start bloku, dialog je vlastní
     scroll-kontejner). Reduced-motion → bez smooth animace. Focus drží
     `preventScroll`, aby po doscrollování už nic neskákalo; mobilní
     klávesnice nevyskočí (focus míří na sekci, ne na textarea). */
  useEffect(() => {
    if (!startNaDiskuziRef.current) return;
    const cil: HTMLElement | null = diskuzeRef.current;
    if (cil === null) return;
    const snizitPohyb: boolean =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ramec: number = window.requestAnimationFrame(() => {
      cil.scrollIntoView({
        block: "start",
        behavior: denik || snizitPohyb ? "auto" : "smooth",
      });
      cil.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(ramec);
    };
  }, []);

  function naKlikBackdropu(udalost: MouseEvent<HTMLDivElement>): void {
    if (udalost.target === udalost.currentTarget) zavriRef.current();
  }

  const mojeUcast: ApiUcastnik | undefined =
    user === null
      ? undefined
      : ucastnici.find((u) => u.userId === user.id);
  const jsemPrihlasen: boolean = mojeUcast !== undefined;

  async function naPrihlasit(): Promise<void> {
    setAkceBezi(true);
    setAkceChyba(null);
    const vysledek = await prihlasNaVypravu(expedice.id);
    setAkceBezi(false);
    if (!vysledek.ok) {
      setAkceChyba(vysledek.chyba);
      return;
    }
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice, expedice.nahledFotkaId));
    await nacistiUcastniky(expedice.id);
  }

  async function naOdhlasit(): Promise<void> {
    setAkceBezi(true);
    setAkceChyba(null);
    const vysledek = await odhlasZVypravy(expedice.id);
    setAkceBezi(false);
    if (!vysledek.ok) {
      setAkceChyba(vysledek.chyba);
      return;
    }
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice, expedice.nahledFotkaId));
    await nacistiUcastniky(expedice.id);
  }

  /* ——— Správa docházky po uzavření: filtrování + mutace ——— */

  /** Uloží scroll dialogu a po překreslení ho vrátí — přidání/odebrání
      účastníka nesmí házet uživatele nahoru. */
  function obnovScrollPoPrekresleni(ulozene: number): void {
    const dialog: HTMLDivElement | null = dialogRef.current;
    if (dialog === null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dialog.scrollTop = ulozene;
      });
    });
  }

  function normalizujJmeno(hodnota: string): string {
    return hodnota
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  const userIdUzEvidovanych = new Set<string>(
    ucastnici.flatMap((u) => (u.userId === null ? [] : [u.userId])),
  );
  const jmenaUzEvidovanych = new Set<string>(
    ucastnici.map((u) => normalizujJmeno(u.jmeno)),
  );
  const filtrNorm: string = normalizujJmeno(filtrUzivatelu);
  const dostupniUzivatele: UserListItem[] = uzivatele.filter((uzivatel) => {
    if (userIdUzEvidovanych.has(uzivatel.id)) return false;
    if (jmenaUzEvidovanych.has(normalizujJmeno(uzivatel.jmeno))) return false;
    if (filtrNorm.length > 0 && !normalizujJmeno(uzivatel.jmeno).includes(filtrNorm))
      return false;
    return true;
  });

  function pripravKotvuPridani(): void {
    const tlacitko = pridatTlacitkoRef.current;
    if (tlacitko === null) return;
    kotvaPridani.current = tlacitko.getBoundingClientRect().top;
  }

  useLayoutEffect(() => {
    const cil = kotvaPridani.current;
    const dialog = dialogRef.current;
    const tlacitko = pridatTlacitkoRef.current;
    if (cil === null || dialog === null || tlacitko === null) return;
    const posun = tlacitko.getBoundingClientRect().top - cil;
    if (posun !== 0) dialog.scrollTop += posun;
    kotvaPridani.current = null;
  });

  async function naPridatUcastnika(): Promise<void> {
    const userId = vybranyUzivatelId.trim();
    if (userId.length === 0) {
      setSpravaChyba("Vyber uživatele ze seznamu.");
      return;
    }
    const vybrany = uzivatele.find((uzivatel) => uzivatel.id === userId);
    if (vybrany === undefined) {
      setSpravaChyba("Vyber uživatele ze seznamu.");
      return;
    }
    const docasneId = `docasne:${userId}:${Date.now()}`;
    const optimisticky: ApiUcastnik = {
      id: docasneId,
      expeditionId: expedice.id,
      userId: userId as UserId,
      clenId: null,
      jmeno: vybrany.jmeno,
      status: "ucastnil_se",
      createdAt: new Date().toISOString(),
      avatarUrl: null,
    };
    const predchoziExpedice = expedice;
    pripravKotvuPridani();
    setSpravaChyba(null);
    setSpravaZprava(null);
    setUcastnici((prev) =>
      prev.some((u) => u.userId === userId) ? prev : [...prev, optimisticky],
    );
    setVybranyUzivatelId("");
    setFiltrUzivatelu("");
    onAktualizaceRef.current({
      ...expedice,
      kapacita: {
        ...expedice.kapacita,
        prihlaseno: expedice.kapacita.prihlaseno + 1,
      },
    });
    const vysledek = await pridejUcastnikaPoUzavreni(expedice.id, {
      userId: userId as UserId,
    });
    if (!vysledek.ok) {
      pripravKotvuPridani();
      setUcastnici((prev) => prev.filter((u) => u.id !== docasneId));
      setVybranyUzivatelId(userId);
      setSpravaChyba(vysledek.chyba);
      onAktualizaceRef.current(predchoziExpedice);
      return;
    }
    const ulozeny = vysledek.data.ucastnik;
    pripravKotvuPridani();
    setUcastnici((prev) => prev.map((u) => (u.id === docasneId ? ulozeny : u)));
    onAktualizaceRef.current(
      prevedExpedici(vysledek.data.expedice, expedice.nahledFotkaId),
    );
    setSpravaZprava(`„${ulozeny.jmeno}“ je zapsán v kronice.`);
    requestAnimationFrame(() => {
      vyberUzivateleRef.current?.focus({ preventScroll: true });
    });
  }

  async function naOdebratUcastnika(idUcastnika: string): Promise<void> {
    const dialog: HTMLDivElement | null = dialogRef.current;
    const pozice: number = dialog?.scrollTop ?? 0;
    setOdebiraId(idUcastnika);
    setSpravaChyba(null);
    setSpravaZprava(null);
    const odebirany: ApiUcastnik | undefined = ucastnici.find(
      (u) => u.id === idUcastnika,
    );
    const vysledek = await odeberUcastnika(expedice.id, idUcastnika);
    setOdebiraId(null);
    if (!vysledek.ok) {
      setSpravaChyba(vysledek.chyba);
      obnovScrollPoPrekresleni(pozice);
      return;
    }
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice, expedice.nahledFotkaId));
    setSpravaZprava(
      odebirany === undefined
        ? "Účastník byl odebrán z kroniky."
        : `„${odebirany.jmeno}“ byl odebrán z kroniky.`,
    );
    setPotvrzOdebraniId(null);
    await nacistiUcastniky(expedice.id);
    obnovScrollPoPrekresleni(pozice);
  }

  function naOdeslatUpravu(
    payload: VytvoritExpediciRequest | UpravitExpediciRequest,
    snimky: SnimkyCestyVyber,
  ): void {
    setOdesilaSe(true);
    setServerChyba(null);
    void (async (): Promise<void> => {
      const vysledek = await upravVypravu(expedice.id, payload);
      if (!vysledek.ok) {
        setOdesilaSe(false);
        if (vysledek.chybyPoli !== undefined) setServerChybyPoli(vysledek.chybyPoli);
        else setServerChyba(vysledek.chyba);
        return;
      }
      const tam = await nahrajCestaSnimky(expedice.id, "tam", snimky.tam);
      const zpet = await nahrajCestaSnimky(expedice.id, "zpet", snimky.zpet);
      setOdesilaSe(false);
      if (!tam.ok) {
        setServerChyba(tam.chyba);
        return;
      }
      if (!zpet.ok) {
        setServerChyba(zpet.chyba);
        return;
      }
      if (tam.data.snimky.length > 0) setCestaTam(tam.data.snimky);
      if (zpet.data.snimky.length > 0) setCestaZpet(zpet.data.snimky);
      onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice, expedice.nahledFotkaId));
      setRezim("prehled");
    })();
  }

  async function naSmazatSnimek(snimekId: string): Promise<void> {
    const vysledek = await smazCestaSnimek(expedice.id, snimekId);
    if (!vysledek.ok) {
      setServerChyba(vysledek.chyba);
      return;
    }
    setCestaTam((prev) => prev.filter((snimek) => snimek.id !== snimekId));
    setCestaZpet((prev) => prev.filter((snimek) => snimek.id !== snimekId));
  }

  function naSmazat(): void {
    setMazeSe(true);
    setSmazChyba(null);
    void (async (): Promise<void> => {
      const vysledek = await smazVypravu(expedice.id);
      setMazeSe(false);
      if (!vysledek.ok) {
        setSmazChyba(vysledek.chyba);
        return;
      }
      onSmazana(expedice.id);
      zavriRef.current();
    })();
  }

  function naUzavrit(): void {
    setUzaviraSe(true);
    setUzavriChyba(null);
    // Closing no longer asks who showed up. Signed-up people count as present;
    // anyone already excused stays excused.
    const zaznamy = ucastnici.map((u) => ({
      ucastnikId: u.id,
      status: (u.status === "omluven" ? "omluven" : "ucastnil_se") as "ucastnil_se" | "omluven",
    }));
    void (async (): Promise<void> => {
      const vysledek = await uzavriVypravu(expedice.id, zaznamy);
      setUzaviraSe(false);
      if (!vysledek.ok) {
        setUzavriChyba(vysledek.chyba);
        return;
      }
      onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice, expedice.nahledFotkaId));
      setUcastnici(vysledek.data.ucastnici);
      setRezim("prehled");
    })();
  }

  const vychoziUpravy: ExpeditionFormVychozi = {
    nazev: expedice.nazev,
    datum: expedice.datum,
    datumDo: expedice.datumDo,
    sraz: expedice.sraz,
    popis: expedice.popis,
    trasaOdkaz: expedice.trasaOdkaz,
    kapacitaCelkem: expedice.kapacita.celkem,
  };

  const kronikaUcasti = viditelniUcastnici(ucastnici);

  const nadpisRezim: string =
    rezim === "upravy"
      ? "Upravit výpravu"
      : rezim === "ruseni"
        ? "Odstranit výpravu"
        : rezim === "uzavirani"
          ? "Uzavřít výpravu"
          : probehla
            ? "Archivní záznam"
            : poTerminu
              ? "Neuzavřená výprava"
              : probiha
                ? "Právě probíhá"
                : "Detail výpravy";

  const akcentVypravy: string = paletaVypravy(expedice.id, expedice.datum).akcent;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 lg:items-center lg:p-4 ${
        denik ? `nocturne nahled-modal${zavira ? " nahled-zavira" : ""}` : ""
      }`}
      onMouseDown={naKlikBackdropu}
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
      touch-action="none"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={nadpisId}
        aria-describedby={popisId}
        /* chat-scroll-fix: dialog je jediný vnější scroll detailu.
           Diskuze (DiskuzeBox `data-vlakno-scroll`) má vlastní vnitřní
           scroll-kartu max-h-80 — scroll detailu celým vláknem jen odjede,
           chat nikoho nenásleduje. `overscroll-contain` brání propadu. */
        className={`max-h-[100dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-papir shadow-denik lg:max-h-[92vh] lg:rounded-3xl ${
          rezim === "prehled" ? "lg:max-w-5xl" : "lg:max-w-3xl"
        }`}
      >
        <div className="relative">
          <div className="relative h-48 w-full overflow-hidden sm:h-56 lg:h-64">
            {probehla && fotkaId !== null ? (
              <VypravaNahled
                expeditionId={expedice.id}
                fotkaId={fotkaId}
                probehla={probehla}
              />
            ) : (
              <ZastupnySnimek
                id={expedice.id}
                datum={expedice.datum}
                povolit={!probehla && !poTerminu}
              />
            )}
          </div>
          <button
            ref={krizekRef}
            type="button"
            onClick={() => zavriRef.current()}
            aria-label="Zavřít detail výpravy"
            className="bez-prejeti absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-papir/90 text-2xl font-semibold leading-none text-inkoust shadow-razitko [touch-action:manipulation] motion-safe:transition-colors motion-safe:hover:bg-papir"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          <p className="text-sm font-semibold" style={{ color: akcentVypravy }}>
            {nadpisRezim}
          </p>
          <h2
            id={nadpisId}
            className="mt-1 break-words text-3xl font-bold leading-tight text-inkoust sm:text-4xl"
          >
            {expedice.nazev}
          </h2>
          <dl
            id={popisId}
            className={
              rezim === "prehled"
                ? "mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-base"
                : "sr-only"
            }
          >
            <dt className="text-mech">Termín</dt>
            <dd className="m-0 font-medium text-inkoust">
              <time dateTime={expedice.datum}>{formatRozsahData(expedice.datum, expedice.datumDo)}</time>
            </dd>
            <dt className="text-mech">Sraz</dt>
            <dd className="m-0 break-words font-medium text-inkoust">{expedice.sraz}</dd>
          </dl>

          {rezim === "prehled" && !archiv && ucastStav === "hotovo" && akceChyba !== null ? (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
              {akceChyba}
            </p>
          ) : null}

          {rezim === "prehled" && !archiv && ucastStav === "hotovo" && user !== null ? (
            <div className="mt-4">
              {jsemPrihlasen ? (
                <button
                  type="button"
                  onClick={() => void naOdhlasit()}
                  disabled={akceBezi}
                  title={akceBezi ? "Odhlašování probíhá…" : "Odhlásit se z výpravy"}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-okr px-6 text-base font-semibold text-inkoust hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 sm:w-auto"
                >
                  {akceBezi ? "Odhlašuji…" : "Odhlásit se"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void naPrihlasit()}
                  disabled={akceBezi || plno}
                  title={plno ? "Výprava je plná" : "Přihlásit se na výpravu"}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-okr px-6 text-base font-semibold text-inkoust hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {akceBezi ? "Přihlašuji…" : plno ? "Plně obsazeno" : "Přihlásit se"}
                </button>
              )}
            </div>
          ) : null}

          {rezim === "prehled" && !archiv && ucastStav === "hotovo" && user === null ? (
            <p className="mt-4 text-sm text-inkoust/70">
              Pro přihlášení se nejdřív přihlas ke svému účtu.
            </p>
          ) : null}

          {rezim === "prehled" && (
            <>
              <div className={probehla ? "mt-2" : "lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-10"}>
              <div className="min-w-0">
              {expedice.popis.trim().length > 0 && (
                <p className="mt-3 break-words border-t border-linka pt-3 text-base leading-relaxed">
                  {expedice.popis}
                </p>
              )}
              {hlaseni !== null && hlaseni.length > 0 && (
                <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
                  {hlaseni}
                </p>
              )}
              <MrizkaSnimku nadpis="Cesta tam" snimky={cestaTam} />
              <MrizkaSnimku nadpis="Cesta zpátky" snimky={cestaZpet} />
              {expedice.trasaOdkaz.trim().length > 0 && (
                <p className="mt-3">
                  <a
                    href={expedice.trasaOdkaz}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-mlha px-6 text-base font-semibold motion-safe:transition-colors motion-safe:hover:bg-linka"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" /><path d="M9 4v14" /><path d="M15 6v14" /></svg>
                    Zobrazit naplánovanou trasu
                  </a>
                </p>
              )}

              {archiv ? (
                <div
                  className={`mt-5 rounded-2xl p-4 sm:p-5 ${probehla ? "bg-mlha" : "bg-okr/15"}`}
                >
                  <p className="font-display text-lg font-bold text-inkoust">
                    {probehla ? "Výprava proběhla" : "Čeká na uzavření"}
                  </p>
                  <p className="mt-1 text-base leading-relaxed text-mech">
                    {probehla
                      ? ucastStav === "hotovo" && ucastnici.length > 0
                        ? `Dorazilo ${ucastnici.filter((u) => u.status === "ucastnil_se").length} z ${ucastnici.length} přihlášených. Fotky a kilometry jdou dál doplňovat.`
                        : "Přihlašování je uzavřené. Fotky a kilometry jdou dál doplňovat."
                      : "Termín skončil. Uzavřením se výprava přesune mezi proběhlé. Fotky a kilometry jdou doplnit i potom."}
                  </p>
                  {muzeSpravovatVypravy ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!probehla ? (
                        <button
                          type="button"
                          onClick={() => {
                            setUzavriChyba(null);
                            setRezim("uzavirani");
                          }}
                          className={TLACITKO_UZAVRIT}
                        >
                          Uzavřít výpravu
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setServerChyba(null);
                          setServerChybyPoli({});
                          setRezim("upravy");
                        }}
                        className={`${TLACITKO_NA_MLZE} gap-2`}
                        aria-label="Upravit výpravu"
                        title="Upravit výpravu"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        Upravit výpravu
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
              <div className="mt-5 rounded-lg border border-pole bg-papir p-4">
                <p className="text-base font-semibold tabular-nums">
                  {bezOmezeni ? (
                    <>
                      {expedice.kapacita.prihlaseno}
                      <span className="font-normal text-inkoust/60"> přihlášeno · bez omezení</span>
                    </>
                  ) : (
                    <>
                      {expedice.kapacita.prihlaseno} / {expedice.kapacita.celkem}
                      <span className="font-normal text-inkoust/60"> přihlášeno</span>
                    </>
                  )}
                </p>
                {!bezOmezeni ? (
                  <div
                    role="progressbar"
                    aria-label={`Obsazenost: ${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}`}
                    aria-valuenow={expedice.kapacita.prihlaseno}
                    aria-valuemin={0}
                    aria-valuemax={expedice.kapacita.celkem}
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-linka"
                  >
                    <div
                      aria-hidden="true"
                      className={`h-full rounded-full ${probehla ? "bg-mech" : "bg-smrk"}`}
                      style={{ width: `${procenta}%` }}
                    />
                  </div>
                ) : (
                  <div
                    role="status"
                    aria-label={`Počet přihlášených: ${expedice.kapacita.prihlaseno} (bez omezení)`}
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-linka"
                  >
                    <span className="sr-only">
                      {`Počet přihlášených: ${expedice.kapacita.prihlaseno} (bez omezení)`}
                    </span>
                    <div
                      aria-hidden="true"
                      className={`h-full w-full rounded-full ${probehla ? "bg-mech" : "bg-smrk"}`}
                    />
                  </div>
                )}
              </div>
              )}

              {/* Kdo jede / kdo byl vidí každý, i bez správy výpravy. */}
              <section aria-labelledby={ucastNadpisId} className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 id={ucastNadpisId} className="font-display text-xl font-bold text-inkoust">
                    {probehla ? "Kdo byl" : poTerminu ? "Přihlášení" : "Kdo jede"}
                  </h3>
                  {ucastStav === "hotovo" && (
                    <button
                      type="button"
                      onClick={() => void nacistiUcastniky(expedice.id)}
                      aria-label="Obnovit seznam přihlášených"
                      title="Obnovit seznam"
                      className="bez-prejeti flex h-11 w-11 items-center justify-center rounded-full text-mech hover:bg-mlha hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
                        <path d="M21 3v5h-5" />
                      </svg>
                    </button>
                  )}
                </div>

                {ucastStav === "nacitani" && (
                  <div className="mt-2 space-y-2" aria-busy="true" aria-label="Načítám seznam přihlášených">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-11 animate-pulse rounded-xl bg-inkoust/10 motion-reduce:animate-none" />
                    ))}
                  </div>
                )}

                {ucastStav === "chyba" && (
                  <div className="mt-2 rounded-2xl border border-linka bg-papir p-4 text-center">
                    <p role="alert" className="text-sm font-semibold">
                      {ucastChyba ?? "Seznam se nepodařilo načíst."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void nacistiUcastniky(expedice.id)}
                      className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-mlha px-6 text-base font-semibold text-inkoust hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                    >
                      Zkusit znovu
                    </button>
                  </div>
                )}

                {ucastStav === "hotovo" && (
                  <>
                    {ucastnici.length === 0 ? (
                      <p role="status" className="mt-3 rounded-2xl bg-mlha/60 p-4 text-base text-mech">
                        {archiv
                          ? "Na výpravu se nikdo nepřihlásil."
                          : "Zatím se nikdo nepřihlásil. Buď první."}
                      </p>
                    ) : (
                      <PrehledPrihlasenych
                        ucastnici={ucastnici}
                        jede={!poTerminu && !probehla}
                      />
                    )}

                  </>
                )}
              </section>

              {archiv && (
                <div className="mt-8 grid w-full items-stretch gap-8 sm:grid-cols-2 sm:gap-10 [&>section]:mt-0 [&>section]:h-full">
                  <ExpeditionTrasaPrehled
                    expeditionId={expedice.id}
                    probehla={archiv}
                  />
                  <ExpeditionPhotos
                    expeditionId={expedice.id}
                    probehla={archiv}
                    prihlasen={user !== null}
                    isAdmin={isAdmin}
                    onZmenaNahledu={onZmenaNahledu}
                    denik={denik}
                    obalClassName="h-full min-h-48 w-full flex-1"
                  />
                </div>
              )}

              </div>
              <div className={probehla ? "mt-8 min-w-0" : "min-w-0 lg:border-l lg:border-linka lg:pl-8"}>
              {/* Diskuze — živé vlákno (GET PUBLIC čte i anonym,
                  POST USER píše přihlášený). Vlastní sekce s nadpisem
                  uvnitř DiskuzeBoxu (role=log + aria-live, composer
                  44px+, optimistic insert s rollbackem). Step 3: cíl
                  deep-linku (`id="diskuze"`, focusovatelná pro doscroll). */}
              <section
                ref={diskuzeRef}
                id="diskuze"
                tabIndex={-1}
                aria-label={`Diskuze k výpravě ${expedice.nazev}`}
                data-deep-link-cil="diskuze"
                className="mt-5 scroll-mt-4 focus-visible:outline-3 lg:mt-0 focus-visible:outline-smrk focus-visible:outline-offset-2"
              >
                {diskuzeNeprectena && (
                  <p className="mb-2 flex min-h-[24px] items-center gap-2 text-base font-bold text-red-800">
                    <NeprectenaTecka
                      viditelna={diskuzeNeprectena}
                      velikost="nadpis"
                      nazevVypravy={expedice.nazev}
                    />
                    <span>Nové zprávy v diskuzi</span>
                  </p>
                )}
                <DiskuzeBox
                  idVypravy={expedice.id}
                  nazevVypravy={expedice.nazev}
                  organizatorId={expedice.organizatorId ?? null}
                  klidna={probehla}
                />
              </section>

              </div>
              </div>
              {/* Trip admin stays at the end of the sheet, without a section title. */}
              {muzeSpravovatVypravy && (
                <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
                    {!archiv && (
                      <button
                        type="button"
                        onClick={() => {
                          setServerChyba(null);
                          setServerChybyPoli({});
                          setRezim("upravy");
                        }}
                        aria-label="Upravit výpravu"
                        title="Upravit výpravu"
                        className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    )}
                    {probiha && (
                      <button
                        type="button"
                        onClick={() => {
                          setUzavriChyba(null);
                          setRezim("uzavirani");
                        }}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-jantar px-6 text-base font-semibold text-papir motion-safe:transition-colors motion-safe:hover:brightness-95"
                      >
                        Uzavřít
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSmazChyba(null);
                        setRezim("ruseni");
                      }}
                      aria-label={`Odstranit výpravu ${expedice.nazev}`}
                      title="Odstranit výpravu"
                      className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M4 7h16" />
                        <path d="M9 7V5h6v2" />
                        <path d="M6 7l1 13h10l1-13" />
                      </svg>
                    </button>
                </div>
              )}

            </>
          )}

          {rezim === "upravy" && (
            <div className="mt-6 space-y-8">
              <ExpeditionForm
                id="upravit-expedici-form"
                nadpis="Upravit výpravu"
                odeslatPopisek="Uložit změny"
                vychozi={vychoziUpravy}
                odesilaSe={odesilaSe}
                serverChyba={serverChyba}
                serverChybyPoli={serverChybyPoli}
                onSubmit={naOdeslatUpravu}
                ulozeneTam={cestaTam}
                ulozeneZpet={cestaZpet}
                onSmazatSnimek={(snimekId) => {
                  void naSmazatSnimek(snimekId);
                }}
                onZrusit={() => setRezim("prehled")}
                povolitMinulost
                skrytAkce
              />
              {/* Propojení trasy/Stravy POUZE v editačním režimu — proběhlá + správa výprav (dual-guard).
                  Step 4: popisky se nesmí plést — Strava aktivita „Odpojit aktivitu",
                  ruční km „Smazat ruční zápis" s confirmem, účet „Odpojit účet" jen v profilu. */}
              {archiv && muzeSpravovatVypravy && (
                <div className="border-t border-linka pt-6">
                <StravaParovani
                  expeditionId={expedice.id}
                  jeSparovano={expedice.jeSparovano ?? false}
                  stravaActivityId={expedice.stravaActivityId ?? null}
                  onSparovano={() => {
                    void nacistiUcastniky(expedice.id);
                  }}
                  onOdpojeno={() => {
                    void nacistiUcastniky(expedice.id);
                  }}
                />
                </div>
              )}
              {/* Správa docházky POUZE v editačním režimu — proběhlá + správa výprav, zdroj GET /api/users. */}
              {archiv && muzeSpravovatVypravy && (
                <section
                  aria-labelledby={spravaNadpisId}
                  className="border-t border-linka pt-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      id={spravaNadpisId}
                      className="font-display text-xl font-bold text-inkoust"
                    >
                      Docházka
                    </h3>
                    {uzivateleStav === "hotovo" && (
                      <button
                        type="button"
                        onClick={() => void nacistiUzivatele()}
                        className="min-h-[48px] min-w-[44px] rounded-xl px-2 text-base font-semibold text-smrk underline underline-offset-2 motion-safe:hover:text-inkoust"
                      >
                        Obnovit seznam
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-base leading-relaxed text-inkoust/70">
                    Kronika po uzavření — odeber omylem zapsané a dopiš ty, kdo
                    dorazili bez přihlášky. Změna se hned propíše do seznamu.
                  </p>

                  {ucastStav === "nacitani" && (
                    <p role="status" className="mt-3 text-sm text-inkoust/70">
                      Načítám kroniku…
                    </p>
                  )}
                  {ucastStav === "chyba" && (
                    <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
                      {ucastChyba ?? "Kroniku se nepodařilo načíst."}
                    </p>
                  )}
                  {ucastStav === "hotovo" && ucastnici.length === 0 && (
                    <p
                      role="status"
                      className="mt-3 rounded-xl border border-linka p-3 text-center text-sm text-inkoust/70"
                    >
                      V kronice zatím nikdo není — prvního dopište níže, prázdný
                      stav přidání nebrání.
                    </p>
                  )}
                  {ucastStav === "hotovo" && ucastnici.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-inkoust/15">
                    <ul role="list" className="divide-y divide-linka">
                      {(kronikaVysunuto
                        ? [...kronikaUcasti.nahore, ...kronikaUcasti.dole]
                        : kronikaUcasti.nahore
                      ).map((u) => {
                        const potvrzuje: boolean = potvrzOdebraniId === u.id;
                        const odebirani: boolean = odebiraId === u.id;
                        return (
                          <li key={u.id} className="px-3 py-2">
                            <div className="flex min-h-[44px] items-center justify-between gap-3">
                              <JmenoUcastnika
                                ucastnik={u}
                                jeOrganizator={
                                  u.userId !== null && u.userId === expedice.organizatorId
                                }
                                doplnek={
                                  <span className="ml-2 text-base font-normal text-inkoust/70 lg:text-[12px] lg:text-inkoust/60">
                                    {statusUcastiPopisek(u.status)}
                                  </span>
                                }
                              />
                              {!potvrzuje && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSpravaZprava(null);
                                    setSpravaChyba(null);
                                    setPotvrzOdebraniId(u.id);
                                  }}
                                  aria-label={`Odebrat účastníka ${u.jmeno}`}
                                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-linka px-6 text-base font-semibold text-red-800 motion-safe:transition-colors motion-safe:hover:bg-red-800 motion-safe:hover:text-papir"
                                >
                                  Odebrat
                                </button>
                              )}
                            </div>
                            {potvrzuje && (
                              <div className="mt-2 rounded-xl bg-red-800/5 p-2">
                                <p className="text-base font-semibold">
                                  Odebrat „{u.jmeno}“ z kroniky?
                                </p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                  <button
                                    type="button"
                                    onClick={() => void naOdebratUcastnika(u.id)}
                                    disabled={odebirani}
                                    title={odebirani ? "Odebírání probíhá…" : `Odebrat „${u.jmeno}“ z kroniky`}
                                    className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border-2 border-red-800 bg-red-800 px-6 text-base font-semibold text-papir disabled:opacity-60"
                                  >
                                    {odebirani ? "Odebírám…" : "Ano, odebrat"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPotvrzOdebraniId(null)}
                                    disabled={odebirani}
                                    title={odebirani ? "Odebírání probíhá…" : "Ponechat účastníka v kronice"}
                                    className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-mlha hover:bg-linka px-6 text-base font-semibold disabled:opacity-60"
                                  >
                                    Ponechat
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <TlacitkoDalsichUcastniku
                      skrytych={kronikaUcasti.skrytych}
                      vysunuto={kronikaVysunuto}
                      onPrepnout={() => setKronikaVysunuto((pred) => !pred)}
                    />
                    </div>
                  )}

                  <div className="mt-4 border-t border-linka pt-3">
                    <h4 className="text-sm font-bold">Přidat účastníka</h4>
                    {uzivateleStav === "neaktivni" && (
                      <p role="status" className="mt-2 text-sm text-inkoust/70">
                        Připravuji seznam uživatelů…
                      </p>
                    )}
                    {uzivateleStav === "nacitani" && (
                      <div className="mt-2 space-y-2" aria-busy="true" aria-label="Načítám uživatele">
                        {[0, 1].map((i) => (
                          <div key={i} className="h-11 animate-pulse rounded-xl bg-inkoust/10 motion-reduce:animate-none" />
                        ))}
                        <p role="status" className="text-sm text-inkoust/70">
                          Načítám uživatele…
                        </p>
                      </div>
                    )}
                    {uzivateleStav === "chyba" && (
                      <div className="mt-2 rounded-xl border border-inkoust/20 p-3 text-center">
                        <p role="alert" className="text-sm font-semibold">
                          {uzivateleChyba ?? "Seznam uživatelů se nepodařilo načíst."}
                        </p>
                        <button
                          type="button"
                          onClick={() => void nacistiUzivatele()}
                          className="mt-2 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-mlha hover:bg-linka px-6 text-base font-semibold"
                        >
                          Zkusit znovu
                        </button>
                      </div>
                    )}
                    {uzivateleStav === "hotovo" && (
                      <div className="mt-2 space-y-2">
                        <div>
                          <label
                            htmlFor={filtrUzivateluId}
                            className="mb-1 block text-base font-semibold text-inkoust/70"
                          >
                            Hledat uživatele
                          </label>
                          <input
                            id={filtrUzivateluId}
                            type="search"
                            value={filtrUzivatelu}
                            onChange={(e) => setFiltrUzivatelu(e.target.value)}
                            placeholder="Začni psát jméno…"
                            autoComplete="off"
                            className="block min-h-[48px] w-full rounded-xl border border-pole bg-papir px-3 text-base text-inkoust placeholder:text-mech"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={vyberUzivateleId}
                            className="mb-1 block text-base font-semibold text-inkoust/70"
                          >
                            Uživatel k přidání
                          </label>
                          <VyberPole
                            ref={vyberUzivateleRef}
                            id={vyberUzivateleId}
                            value={vybranyUzivatelId}
                            onChange={setVybranyUzivatelId}
                            className="block min-h-[48px] w-full rounded-xl border border-pole bg-papir px-3 text-base font-semibold text-inkoust"
                            volby={[
                              { value: "", popisek: "— Vyber uživatele —" },
                              ...dostupniUzivatele.map((uzivatel) => ({
                                value: uzivatel.id,
                                popisek: uzivatel.jmeno,
                              })),
                            ]}
                          />
                        </div>
                        {dostupniUzivatele.length === 0 ? (
                          <p role="status" className="text-base text-inkoust/70">
                            Žádný další uživatel k přidání — všichni už jsou v kronice.
                          </p>
                        ) : (
                          <p role="status" className="text-base text-inkoust/60">
                            K přidání: {dostupniUzivatele.length}{" "}
                            {dostupniUzivatele.length === 1
                              ? "uživatel"
                              : dostupniUzivatele.length >= 2 && dostupniUzivatele.length <= 4
                                ? "uživatelé"
                                : "uživatelů"}.
                          </p>
                        )}
                        {spravaZprava !== null && (
                          <p
                            role="status"
                            className="rounded-xl border border-smrk/30 bg-smrk/10 p-3 text-sm font-semibold text-inkoust"
                          >
                            {spravaZprava}
                          </p>
                        )}
                        {spravaChyba !== null && (
                          <p role="alert" className="text-sm font-semibold text-red-800">
                            {spravaChyba}
                          </p>
                        )}
                        <button
                          type="button"
                          ref={pridatTlacitkoRef}
                          onClick={() => void naPridatUcastnika()}
                          disabled={vybranyUzivatelId === ""}
                          title={
                            vybranyUzivatelId === ""
                              ? "Nejdřív vyber uživatele"
                              : "Přidat uživatele do kroniky"
                          }
                          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-okr px-6 text-base font-semibold text-inkoust motion-safe:transition-colors motion-safe:hover:bg-okr-tmavy disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Přidat do kroniky
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {/* Krok 16: Zrušit/Uložit až na úplném spodku (za Strava + docházkou),
                  sticky pro dlouhý formulář. Submit míří na form id výše. */}
              <div className="sticky bottom-0 z-10 -mx-5 flex flex-col-reverse gap-2 border-t border-linka bg-papir px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:flex-row sm:justify-end sm:px-6 lg:-mx-8 lg:px-8">
                <TlacitkoPapir
                  onClick={() => setRezim("prehled")}
                  disabled={odesilaSe}
                  title={odesilaSe ? "Ukládání probíhá…" : "Zrušit úpravy"}
                >
                  Zrušit
                </TlacitkoPapir>
                <button
                  type="submit"
                  form="upravit-expedici-form"
                  disabled={odesilaSe}
                  title={odesilaSe ? "Ukládání probíhá…" : "Uložit změny"}
                  className={TLACITKO_HLAVNI}
                >
                  {odesilaSe ? "Ukládám…" : "Uložit změny"}
                </button>
              </div>
            </div>
          )}

          {rezim === "ruseni" && (
            <div className="mt-6 rounded-2xl border border-red-800/30 bg-red-50 p-5">
              <h3 className="font-display break-words text-xl font-bold text-inkoust">Opravdu odstranit „{expedice.nazev}"?</h3>
              <p className="mt-1 text-sm text-inkoust/70">
                Smaže se i seznam {ucastnici.length}{" "}
                {ucastnici.length === 1 ? "přihlášeného" : ucastnici.length >= 2 && ucastnici.length <= 4 ? "přihlášených" : "přihlášených"}.
                Tahle akce nejde vzít zpět.
              </p>
              {smazChyba !== null && (
                <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                  {smazChyba}
                </p>
              )}
              <div className={LISTA_AKCI}>
                <TlacitkoPapir
                  onClick={() => setRezim("prehled")}
                  disabled={mazeSe}
                  title={mazeSe ? "Mazání probíhá…" : "Ponechat výpravu"}
                >
                  Ponechat
                </TlacitkoPapir>
                <button
                  type="button"
                  onClick={naSmazat}
                  disabled={mazeSe}
                  title={mazeSe ? "Mazání probíhá…" : "Odstranit výpravu nevratně"}
                  className={TLACITKO_NEBEZPECI}
                >
                  {mazeSe ? "Mažu…" : "Ano, odstranit"}
                </button>
              </div>
            </div>
          )}

          {rezim === "uzavirani" && (
            <div className="mt-6">
              <h3 className="font-display text-xl font-bold text-inkoust">Uzavřít výpravu</h3>
              <p className="mt-1 text-sm text-inkoust/70">
                Výprava se přesune mezi proběhlé. Přihlášení se zapíšou jako účastníci.
              </p>
              {ucastStav === "nacitani" && (
                <p role="status" className="mt-3 text-sm text-inkoust/70">
                  Načítám přihlášené…
                </p>
              )}
              {ucastStav === "chyba" && (
                <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
                  {ucastChyba ?? "Seznam se nepodařilo načíst."}
                </p>
              )}
              {ucastStav === "hotovo" && ucastnici.length === 0 && (
                <p role="alert" className="mt-3 rounded-2xl border border-linka bg-papir p-3 text-sm font-semibold">
                  Bez přihlášených nelze uzavřít.
                </p>
              )}
              {uzavriChyba !== null && (
                <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                  {uzavriChyba}
                </p>
              )}
              <div className={LISTA_AKCI}>
                <TlacitkoPapir
                  onClick={() => setRezim("prehled")}
                  disabled={uzaviraSe}
                  title={uzaviraSe ? "Uzavírání probíhá…" : "Zpět na přehled"}
                >
                  Zpět
                </TlacitkoPapir>
                <button
                  type="button"
                  onClick={naUzavrit}
                  disabled={uzaviraSe || ucastnici.length === 0 || ucastStav !== "hotovo"}
                  title={ucastnici.length === 0 ? "Bez přihlášených nelze uzavřít" : "Uzavřít výpravu"}
                  className={TLACITKO_UZAVRIT}
                >
                  {uzaviraSe ? "Uzavírám…" : "Uzavřít výpravu"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
