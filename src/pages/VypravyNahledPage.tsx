import { apiBase } from "../lib/api-base";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { useSearchParams } from "react-router-dom";
import ExpeditionForm, {
  type ChybyExpedice,
} from "../components/expeditions/ExpeditionForm";
import ExpeditionModal from "../components/expeditions/ExpeditionModal";
import SchuzkaForm from "../components/kalendar/SchuzkaForm";
import UdalostModal from "../components/kalendar/UdalostModal";
import NahledHlavicka from "../components/vypravy-nahled/NahledHlavicka";
import NahledHistorieStranky from "../components/vypravy-nahled/NahledHistorieStranky";
import NahledKalendar from "../components/vypravy-nahled/NahledKalendar";
import NahledPrazdne from "../components/vypravy-nahled/NahledPrazdne";
import VypravaKarta from "../components/vypravy-nahled/VypravaKarta";
import VypravaRadek from "../components/vypravy-nahled/VypravaRadek";
import VypravaSekce from "../components/vypravy-nahled/VypravaSekce";
import VypravaHero from "../components/vypravy-nahled/VypravaHero";
import AgendaBrzy from "../components/vypravy-nahled/AgendaBrzy";
import { nejblizsiAgenda } from "../lib/agenda";
import { useAuth } from "../hooks/useAuth";
import { useKonverzacePrehled } from "../hooks/useKonverzacePrehled";
import {
  filtrujExpedicePodleJmena,
  normalizujProVyhledavani,
} from "../lib/expedice-filtr";
import { dnesniDatumYmd, formatCelyDatum, jeProbihajici, jeUplynula } from "../lib/expedition-utils";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import { nahrajCestaSnimky, vytvorVypravu } from "../lib/expeditions-ucast";
import type { SnimkyCestyVyber } from "../components/expeditions/ExpeditionForm";
import { udalostiProMesic, udalostiProTyden } from "../lib/kalendar";
import {
  getSchuzky,
  smazSchuzku,
  upravSchuzku,
  vytvorSchuzku,
  type ChybySchuzky,
} from "../lib/schuzky-api";
import type { Expedition } from "../lib/mock-expeditions";
import {
  VYPRAVA_PARAM,
  parseVypravaId,
  sVypravouVUrl,
} from "../lib/vyprava-deep-link";
import { rozdelViditelne } from "../lib/sbaleny-seznam";
import { nastavZadateleZastupnych, zajistiBazenZastupnych } from "../lib/zastupne-fotky";
import { expediceDetailPath, jeApiExpedice } from "../shared/api-types";
import type {
  ApiExpedice,
  ApiSchuzka,
  RozsahMazaniSchuzky,
  UpravitExpediciRequest,
  UpravitSchuzkuRequest,
  VytvoritExpediciRequest,
  VytvoritSchuzkuRequest,
} from "../shared/api-types";

type Zobrazeni = "seznam" | "kalendar";
type RezimKalendare = "mesic" | "tyden";

/** Page size of the history archive (`GET /api/expeditions?stav=proběhlá`). */
const HISTORIE_PAGE_SIZE = 6;

function parseZobrazeni(hodnota: string | null): Zobrazeni {
  return hodnota === "kalendar" ? "kalendar" : "seznam";
}

function ceskyPocet(
  n: number,
  jedna: string,
  dvaAzCtyri: string,
  jinak: string,
): string {
  if (n === 1) return jedna;
  if (n >= 2 && n <= 4) return dvaAzCtyri;
  return jinak;
}

/** Today's month as { rok, mesic } for the calendar start. */
function aktualniMesic(): { rok: number; mesic: number } {
  const dnes = new Date();
  return { rok: dnes.getFullYear(), mesic: dnes.getMonth() + 1 };
}

function posunMesic(
  rok: number,
  mesic: number,
  smer: -1 | 1,
): { rok: number; mesic: number } {
  const novy = mesic + smer;
  if (novy < 1) return { rok: rok - 1, mesic: 12 };
  if (novy > 12) return { rok: rok + 1, mesic: 1 };
  return { rok, mesic: novy };
}

/** Shift the week anchor by ±7 days (YMD to YMD, unchanged on bad input). */
function posunKotvu(kotva: string, smer: -1 | 1): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kotva)) return kotva;
  const dt = new Date(`${kotva}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return kotva;
  dt.setDate(dt.getDate() + smer * 7);
  const rok = dt.getFullYear();
  const mesic = String(dt.getMonth() + 1).padStart(2, "0");
  const den = String(dt.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

function prevedApiExpedici(api: ApiExpedice): Expedition {
  return {
    id: api.id,
    nazev: api.nazev,
    datum: api.datum,
    datumDo: api.datumDo,
    sraz: api.sraz,
    popis: api.popis,
    trasaOdkaz: api.trasaOdkaz,
    organizatorId: api.organizatorId ?? null,
    kapacita: {
      prihlaseno: api.kapacita.prihlaseno,
      celkem: api.kapacita.celkem,
    },
    stav: api.stav,
    ...(api.nahledFotkaId !== undefined
      ? { nahledFotkaId: api.nahledFotkaId }
      : {}),
  };
}

/**
 * Deep-link detail fallback (`GET /api/expeditions/:id`).
 * Never throws — bad shape / 404 returns null and the caller drops the param.
 */
async function nactiDetailVypravy(id: string): Promise<Expedition | null> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return null;
  try {
    const odpoved: Response = await fetch(`${zaklad}${expediceDetailPath(id)}`, {
      headers: { Accept: "application/json" },
    });
    if (!odpoved.ok) return null;
    const telo: unknown = await odpoved.json();
    const expedice: unknown =
      typeof telo === "object" && telo !== null
        ? (telo as Record<string, unknown>)["expedice"]
        : null;
    if (!jeApiExpedice(expedice)) return null;
    return prevedApiExpedici(expedice);
  } catch {
    return null;
  }
}

/**
 * Merge the live BFF list with local state.
 * The server list is the source of truth. A snapshot row the server
 * does not return is dropped. A trip created or edited in this session
 * stays until the next response includes it.
 */
function sloucSeZivymi(
  lokalni: Expedition[],
  zive: ApiExpedice[],
  zmenene: ReadonlySet<string>,
  smazane: ReadonlySet<string>,
): Expedition[] {
  const lokalnePodleId = new Map(lokalni.map((e) => [e.id, e]));
  const vysledek: Expedition[] = [];
  for (const api of zive) {
    if (smazane.has(api.id)) continue;
    const lokalniVerze: Expedition | undefined = lokalnePodleId.get(api.id);
    vysledek.push(
      lokalniVerze !== undefined && zmenene.has(api.id)
        ? lokalniVerze
        : prevedApiExpedici(api),
    );
  }
  for (const mistni of lokalni) {
    if (smazane.has(mistni.id) || vysledek.some((e) => e.id === mistni.id)) continue;
    if (!zmenene.has(mistni.id)) continue;
    vysledek.push(mistni);
  }
  return vysledek.sort((a, b) => a.datum.localeCompare(b.datum));
}

const ZAVRENI_FORMULARE_MS = 220;

/** Pointer close replays the dialog enter. Escape skips it. */
function useZavreniFormulare(
  otevreno: boolean,
  zavrit: () => void,
): { zavira: boolean; zavri: (hned?: boolean) => void } {
  const [zavira, setZavira] = useState(false);
  const bezi = useRef(false);
  const casovac = useRef<number | null>(null);
  const zavritRef = useRef(zavrit);
  zavritRef.current = zavrit;

  const zavri = useCallback((hned = false) => {
    const snizitPohyb =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (hned || snizitPohyb) {
      if (casovac.current !== null) {
        window.clearTimeout(casovac.current);
        casovac.current = null;
      }
      bezi.current = false;
      setZavira(false);
      zavritRef.current();
      return;
    }
    if (bezi.current) return;
    bezi.current = true;
    setZavira(true);
    casovac.current = window.setTimeout(() => {
      casovac.current = null;
      bezi.current = false;
      setZavira(false);
      zavritRef.current();
    }, ZAVRENI_FORMULARE_MS);
  }, []);

  useEffect(() => {
    if (!otevreno) {
      bezi.current = false;
      setZavira(false);
      return;
    }
    function naEscape(udalost: KeyboardEvent): void {
      if (udalost.key !== "Escape") return;
      udalost.preventDefault();
      udalost.stopPropagation();
      zavri(true);
    }
    window.addEventListener("keydown", naEscape);
    return () => window.removeEventListener("keydown", naEscape);
  }, [otevreno, zavri]);

  useEffect(
    () => () => {
      if (casovac.current !== null) window.clearTimeout(casovac.current);
    },
    [],
  );

  return { zavira, zavri };
}

function SeznamRadku({
  polozky,
  neprectene,
  onDetail,
}: {
  polozky: Expedition[];
  neprectene: ReadonlyMap<string, boolean>;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-y-1 p-0 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-1">
      {polozky.map((polozka) => (
        <li key={polozka.id} className="min-w-0">
          <VypravaRadek
            expedice={polozka}
            neprecteno={neprectene.get(polozka.id) === true}
            onDetail={onDetail}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Collapsed archive fills the grid without a short row.
 * Phone is one column, so two rows are two cards. Tablet is two
 * columns, so two rows are four. From `lg` one row is three, from
 * `2xl` one row is four. Breakpoints match the card grid below.
 */
function limitHistorie(sirka: number): number {
  if (sirka >= 1536) return 4;
  if (sirka >= 1024) return 3;
  if (sirka >= 640) return 4;
  return 2;
}

function useLimitHistorie(): number {
  const [limit, setLimit] = useState(() =>
    typeof window === "undefined" ? 3 : limitHistorie(window.innerWidth),
  );
  useEffect(() => {
    const uplatni = (): void => setLimit(limitHistorie(window.innerWidth));
    uplatni();
    window.addEventListener("resize", uplatni);
    return () => window.removeEventListener("resize", uplatni);
  }, []);
  return limit;
}

function HistorieKarty({
  polozky,
  vysunuto,
  onPrepnout,
  neprectene,
  onDetail,
}: {
  polozky: Expedition[];
  vysunuto: boolean;
  onPrepnout: () => void;
  neprectene: ReadonlyMap<string, boolean>;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const limit = useLimitHistorie();
  const rozdelene = rozdelViditelne(polozky, limit);
  const karty = vysunuto ? polozky : rozdelene.viditelne;
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {karty.map((polozka) => (
          <li key={polozka.id} className="min-w-0">
            <VypravaKarta
              expedice={polozka}
              neprecteno={neprectene.get(polozka.id) === true}
              onDetail={onDetail}
            />
          </li>
        ))}
      </ul>
      {rozdelene.skryte.length > 0 ? (
        <button
          type="button"
          data-historie-vysunout
          aria-expanded={vysunuto}
          onClick={onPrepnout}
          className="nahled-press mt-6 inline-flex min-h-[44px] touch-manipulation select-none items-center gap-2 rounded-lg border border-pole bg-papir px-4 text-sm font-semibold text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${vysunuto ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
          {vysunuto
            ? "Zasunout"
            : `Vysunout další (${rozdelene.skryte.length})`}
        </button>
      ) : null}
    </>
  );
}

export default function VypravyNahledPage(): JSX.Element {
  const { muzeSpravovatVypravy } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const zobrazeni = parseZobrazeni(searchParams.get("zobrazeni"));
  const surovyParamVyprava: string | null = searchParams.get(VYPRAVA_PARAM);
  const vypravaIdZUrl: string | null = parseVypravaId(surovyParamVyprava);
  const [expedice, setExpedice] = useState<Expedition[]>(
    () => getExpeditionsSync().data,
  );
  const zmeneneRef = useRef<Set<string>>(new Set());
  const smazaneRef = useRef<Set<string>>(new Set());
  const [schuzky, setSchuzky] = useState<ApiSchuzka[]>([]);
  const [kalendarRok, setKalendarRok] = useState<number>(
    () => aktualniMesic().rok,
  );
  const [kalendarMesic, setKalendarMesic] = useState<number>(
    () => aktualniMesic().mesic,
  );
  const [rezimKalendare, setRezimKalendare] = useState<RezimKalendare>("mesic");
  const [kalendarKotva, setKalendarKotva] = useState<string>(() =>
    dnesniDatumYmd(),
  );
  const [denDetail, setDenDetail] = useState<string | null>(null);
  const [tvorbaOtevrena, setTvorbaOtevrena] = useState<boolean>(false);
  const [vytvariSe, setVytvariSe] = useState<boolean>(false);
  const [chybaTvorby, setChybaTvorby] = useState<string | null>(null);
  const [hlaseniSnimku, setHlaseniSnimku] = useState<string | null>(null);
  const [chybyPoliTvorby, setChybyPoliTvorby] = useState<ChybyExpedice>({});
  const [schuzkaForm, setSchuzkaForm] = useState<
    | { rezim: "nova"; datum: string }
    | { rezim: "uprava"; schuzka: ApiSchuzka; datumVyskytu: string | null }
    | null
  >(null);
  const [schuzkaOdesilaSe, setSchuzkaOdesilaSe] = useState<boolean>(false);
  const [schuzkaChyba, setSchuzkaChyba] = useState<string | null>(null);
  const [schuzkaChybyPoli, setSchuzkaChybyPoli] = useState<ChybySchuzky>({});
  const [mazeSeSchuzka, setMazeSeSchuzka] = useState<string | null>(null);
  const [schuzkaOznameni, setSchuzkaOznameni] = useState<string | null>(null);
  const tvorbaZavreni = useZavreniFormulare(tvorbaOtevrena, () => {
    setTvorbaOtevrena(false);
  });
  const schuzkaZavreni = useZavreniFormulare(schuzkaForm !== null, () => {
    setSchuzkaForm(null);
  });
  const [historie, setHistorie] = useState<Expedition[] | null>(null);
  const [historieStranka, setHistorieStranka] = useState<number>(1);
  const [historieCelkem, setHistorieCelkem] = useState<number | null>(null);
  const [historieStranek, setHistorieStranek] = useState<number>(1);
  const [historieVysunuta, setHistorieVysunuta] = useState<boolean>(false);
  const historieRef = useRef<Expedition[] | null>(null);
  const historieCelkemRef = useRef<number | null>(null);
  const [vybrana, setVybrana] = useState<Expedition | null>(null);
  const [cilDiskuze, setCilDiskuze] = useState<boolean>(false);
  const hledaniId: string = useId();
  const [dotaz, setDotaz] = useState<string>("");
  const [debouncedDotaz, setDebouncedDotaz] = useState<string>("");

  useEffect(() => {
    historieRef.current = historie;
    historieCelkemRef.current = historieCelkem;
  }, [historie, historieCelkem]);

  useEffect(() => {
    if (!tvorbaOtevrena && schuzkaForm === null) return;
    const html = document.documentElement;
    const body = document.body;
    const posun = window.scrollY;
    const puvodni = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${posun}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      html.style.overflow = puvodni.htmlOverflow;
      body.style.overflow = puvodni.bodyOverflow;
      body.style.position = puvodni.position;
      body.style.top = puvodni.top;
      body.style.left = puvodni.left;
      body.style.right = puvodni.right;
      body.style.width = puvodni.width;
      window.scrollTo(0, posun);
    };
  }, [tvorbaOtevrena, schuzkaForm]);

  useEffect(() => {
    let zruseno = false;
    void (async (): Promise<void> => {
      const vysledek = await getSchuzky();
      if (!zruseno) setSchuzky(vysledek.data);
    })();
    return () => {
      zruseno = true;
    };
  }, []);

  useEffect(() => {
    let zruseno = false;
    void (async (): Promise<void> => {
      const zive = await getExpeditions();
      if (zruseno || zive.source !== "db") return;
      setExpedice((prev) =>
        sloucSeZivymi(prev, zive.data, zmeneneRef.current, smazaneRef.current),
      );
      setVybrana((prev) => {
        if (prev === null || zmeneneRef.current.has(prev.id)) return prev;
        const cerstva: ApiExpedice | undefined = zive.data.find(
          (e) => e.id === prev.id,
        );
        return cerstva === undefined ? prev : prevedApiExpedici(cerstva);
      });
    })();
    return () => {
      zruseno = true;
    };
  }, []);

  useEffect(() => {
    let zruseno = false;
    void (async (): Promise<void> => {
      const ziva = await getExpeditions({
        stav: "proběhlá",
        page: historieStranka,
        pageSize: HISTORIE_PAGE_SIZE,
      });
      if (zruseno) return;
      if (ziva.source !== "db") {
        setHistorie(null);
        return;
      }
      setHistorie(
        ziva.data
          .filter((e) => !smazaneRef.current.has(e.id))
          .map((e) => prevedApiExpedici(e)),
      );
      if (ziva.pagination !== undefined) {
        setHistorieCelkem(ziva.pagination.totalItems);
        setHistorieStranek(ziva.pagination.totalPages);
      } else {
        setHistorieCelkem(ziva.data.length);
        setHistorieStranek(1);
      }
    })();
    return () => {
      zruseno = true;
    };
  }, [historieStranka]);

  useEffect(() => {
    const casovac = setTimeout(() => {
      setDebouncedDotaz(dotaz);
    }, 200);
    return () => {
      clearTimeout(casovac);
    };
  }, [dotaz]);

  const probihajici: Expedition[] = useMemo(
    () =>
      expedice
        .filter((e) => e.stav !== "proběhlá" && jeProbihajici(e))
        .sort((a, b) => a.datum.localeCompare(b.datum)),
    [expedice],
  );
  const nadchazejici: Expedition[] = useMemo(
    () =>
      expedice
        .filter(
          (e) =>
            e.stav !== "proběhlá" && !jeProbihajici(e) && !jeUplynula(e),
        )
        .sort((a, b) => a.datum.localeCompare(b.datum)),
    [expedice],
  );
  const neuzavrene: Expedition[] = useMemo(
    () =>
      expedice
        .filter((e) => jeUplynula(e))
        // Earliest start first. A later single day must not sit above a range that began sooner.
        .sort(
          (a, b) =>
            a.datum.localeCompare(b.datum) ||
            (a.datumDo ?? a.datum).localeCompare(b.datumDo ?? b.datum),
        ),
    [expedice],
  );
  const probehle: Expedition[] = useMemo(() => {
    const serad = (seznam: Expedition[]): Expedition[] =>
      [...seznam].sort(
        (a, b) =>
          b.datum.localeCompare(a.datum) ||
          (b.datumDo ?? b.datum).localeCompare(a.datumDo ?? a.datum),
      );
    if (historie === null) {
      return serad(expedice.filter((e) => e.stav === "proběhlá"));
    }
    const lokalnePodleId = new Map(expedice.map((e) => [e.id, e]));
    return serad(
      historie.map((h) => {
        if (!zmeneneRef.current.has(h.id)) return h;
        return lokalnePodleId.get(h.id) ?? h;
      }),
    );
  }, [historie, expedice]);
  const historieZeServeru = historie !== null;
  useEffect(() => {
    nastavZadateleZastupnych([...probihajici, ...nadchazejici].map((vyprava) => vyprava.id));
  }, [probihajici, nadchazejici]);
  useEffect(() => {
    let zruseno = false;
    void (async () => {
      // Wider than the archive page, so each current trip can borrow a different photo.
      const ziva = await getExpeditions({ stav: "proběhlá", page: 1, pageSize: 24 });
      if (zruseno) return;
      const ids =
        ziva.source === "db"
          ? ziva.data.map((vyprava) => vyprava.id)
          : [...probehle]
              .sort((a, b) => b.datum.localeCompare(a.datum))
              .map((vyprava) => vyprava.id);
      zajistiBazenZastupnych(ids);
    })();
    return () => {
      zruseno = true;
    };
  }, [probehle]);
  const hledaSe: boolean = normalizujProVyhledavani(debouncedDotaz).length > 0;
  useEffect(() => {
    setHistorieVysunuta(false);
  }, [historieStranka, hledaSe]);
  const neuzavreneFiltrovane: Expedition[] = useMemo(
    () =>
      muzeSpravovatVypravy
        ? filtrujExpedicePodleJmena(neuzavrene, debouncedDotaz)
        : [],
    [muzeSpravovatVypravy, neuzavrene, debouncedDotaz],
  );
  const probihajiciFiltrovane: Expedition[] = useMemo(
    () => filtrujExpedicePodleJmena(probihajici, debouncedDotaz),
    [probihajici, debouncedDotaz],
  );
  const nadchazejiciFiltrovane: Expedition[] = useMemo(
    () => filtrujExpedicePodleJmena(nadchazejici, debouncedDotaz),
    [nadchazejici, debouncedDotaz],
  );
  const probehleFiltrovane: Expedition[] = useMemo(
    () => filtrujExpedicePodleJmena(probehle, debouncedDotaz),
    [probehle, debouncedDotaz],
  );
  const pocetVysledku: number =
    neuzavreneFiltrovane.length +
    probihajiciFiltrovane.length +
    nadchazejiciFiltrovane.length +
    probehleFiltrovane.length;
  const { neprecteneVypravy } = useKonverzacePrehled();
  const neprecteneMapa: ReadonlyMap<string, boolean> = neprecteneVypravy;
  const kalendarUdalosti = useMemo(
    () => udalostiProMesic({ expedice, schuzky }, kalendarRok, kalendarMesic),
    [expedice, schuzky, kalendarRok, kalendarMesic],
  );
  const kalendarUdalostiTyden = useMemo(
    () => udalostiProTyden({ expedice, schuzky }, kalendarKotva),
    [expedice, schuzky, kalendarKotva],
  );
  const expedicePodleId = useMemo(
    () => new Map(expedice.map((e) => [e.id, e])),
    [expedice],
  );
  const vypravaPodleId = useMemo(() => {
    const mapa = new Map(expedice.map((e) => [e.id, e]));
    if (historie !== null) {
      for (const zaznam of historie) {
        if (!mapa.has(zaznam.id)) mapa.set(zaznam.id, zaznam);
      }
    }
    return mapa;
  }, [expedice, historie]);
  const schuzkyPodleId = useMemo(
    () => new Map(schuzky.map((s) => [s.id, s])),
    [schuzky],
  );
  const dnesYmd = dnesniDatumYmd();
  const [tedHm, setTedHm] = useState(() => {
    const ted = new Date();
    return `${String(ted.getHours()).padStart(2, "0")}:${String(ted.getMinutes()).padStart(2, "0")}`;
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const ted = new Date();
      setTedHm(
        `${String(ted.getHours()).padStart(2, "0")}:${String(ted.getMinutes()).padStart(2, "0")}`,
      );
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const orezanyDotaz = debouncedDotaz.trim();
  /** Nejbližší výprava pro velký náhled: probíhající, jinak první nadcházející. */
  const heroVyprava: Expedition | undefined = hledaSe
    ? undefined
    : (probihajici[0] ?? nadchazejici[0]);
  const heroProbiha: boolean =
    heroVyprava !== undefined && probihajici[0]?.id === heroVyprava.id;
  const agenda = useMemo(
    () => nejblizsiAgenda({ expedice, schuzky }, dnesYmd, 14, 6, tedHm),
    [expedice, schuzky, dnesYmd, tedHm],
  );
  const bezHero = (seznam: Expedition[]): Expedition[] =>
    heroVyprava === undefined
      ? seznam
      : seznam.filter((e) => e.id !== heroVyprava.id);

  function zmenZobrazeni(nove: Zobrazeni): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("zobrazeni", nove);
      return next;
    });
  }

  function naPosunMesic(smer: -1 | 1): void {
    const dalsi = posunMesic(kalendarRok, kalendarMesic, smer);
    setKalendarRok(dalsi.rok);
    setKalendarMesic(dalsi.mesic);
  }

  function naDnesniMesic(): void {
    const aktualni = aktualniMesic();
    setKalendarRok(aktualni.rok);
    setKalendarMesic(aktualni.mesic);
    setDenDetail(dnesYmd);
  }

  function naPosunTyden(smer: -1 | 1): void {
    setKalendarKotva((prev) => posunKotvu(prev, smer));
  }

  function naDnesniTyden(): void {
    setKalendarKotva(dnesYmd);
    setDenDetail(dnesYmd);
  }

  function zrusHledani(): void {
    setDotaz("");
    setDebouncedDotaz("");
  }

  function naAktualizaci(nova: Expedition): void {
    zmeneneRef.current.add(nova.id);
    setExpedice((prev) => prev.map((e) => (e.id === nova.id ? nova : e)));
    if (nova.stav === "proběhlá" && historieRef.current !== null) {
      const jeNova: boolean = !historieRef.current.some((e) => e.id === nova.id);
      setHistorie((prev) => {
        if (prev === null) return prev;
        if (prev.some((e) => e.id === nova.id)) {
          return prev.map((e) => (e.id === nova.id ? nova : e));
        }
        return [...prev, nova]
          .sort(
            (a, b) =>
              b.datum.localeCompare(a.datum) ||
              (b.datumDo ?? b.datum).localeCompare(a.datumDo ?? a.datum),
          )
          .slice(0, HISTORIE_PAGE_SIZE);
      });
      if (jeNova) {
        const predchoziCelkem: number | null = historieCelkemRef.current;
        if (predchoziCelkem !== null) {
          const novyCelkem: number = predchoziCelkem + 1;
          setHistorieCelkem(novyCelkem);
          setHistorieStranek(
            Math.max(1, Math.ceil(novyCelkem / HISTORIE_PAGE_SIZE)),
          );
        }
      }
    } else {
      setHistorie((prev) =>
        prev === null ? prev : prev.map((e) => (e.id === nova.id ? nova : e)),
      );
    }
    setVybrana((prev) => (prev !== null && prev.id === nova.id ? nova : prev));
  }

  const naAktualizaciStabilni = useCallback(naAktualizaci, []);

  function naOdeslatSchuzku(
    payload: VytvoritSchuzkuRequest | UpravitSchuzkuRequest,
  ): void {
    setSchuzkaOdesilaSe(true);
    setSchuzkaChyba(null);
    setSchuzkaChybyPoli({});
    void (async (): Promise<void> => {
      if (schuzkaForm !== null && schuzkaForm.rezim === "uprava") {
        const rada = schuzkaForm.schuzka;
        const den = schuzkaForm.datumVyskytu;
        const uprava = payload as UpravitSchuzkuRequest;
        const popisJenTomutoDni =
          rada.opakovani === "tydenni" &&
          (uprava.opakovani ?? rada.opakovani) === "tydenni" &&
          den !== null &&
          (uprava.popis ?? "") !== rada.popis;
        if (popisJenTomutoDni && den !== null) {
          const nova = await vytvorSchuzku({
            nazev: uprava.nazev ?? rada.nazev,
            datum: den,
            cas: uprava.cas === undefined ? (rada.cas ?? null) : uprava.cas,
            mistnost: uprava.mistnost === undefined ? rada.mistnost : uprava.mistnost,
            popis: uprava.popis ?? "",
            opakovani: "jednorazova",
          });
          if (!nova.ok) {
            setSchuzkaOdesilaSe(false);
            if (nova.chybyPoli !== undefined) setSchuzkaChybyPoli(nova.chybyPoli);
            else setSchuzkaChyba(nova.chyba);
            return;
          }
          const vynechano = await smazSchuzku(rada.id, "vyskyt", den);
          if (!vynechano.ok) {
            await smazSchuzku(nova.data.schuzka.id, "rada");
            setSchuzkaOdesilaSe(false);
            setSchuzkaChyba(vynechano.chyba);
            return;
          }
          const zmenaRady =
            (uprava.nazev !== undefined && uprava.nazev !== rada.nazev) ||
            (uprava.datum !== undefined && uprava.datum !== rada.datum) ||
            (uprava.cas !== undefined && uprava.cas !== (rada.cas ?? null)) ||
            (uprava.mistnost !== undefined && uprava.mistnost !== rada.mistnost) ||
            (uprava.opakovani !== undefined && uprava.opakovani !== rada.opakovani);
          let radaPoUprave: ApiSchuzka = {
            ...rada,
            vynecheneVyskyty: [...new Set([...(rada.vynecheneVyskyty ?? []), den])],
          };
          if (zmenaRady) {
            const bezPopisu: UpravitSchuzkuRequest = {
              nazev: uprava.nazev,
              datum: uprava.datum,
              cas: uprava.cas,
              mistnost: uprava.mistnost,
              opakovani: uprava.opakovani,
            };
            const ulozenaRada = await upravSchuzku(rada.id, bezPopisu);
            if (!ulozenaRada.ok) {
              setSchuzkaOdesilaSe(false);
              setSchuzky((prev) => [
                ...prev.map((s) => (s.id === rada.id ? radaPoUprave : s)),
                nova.data.schuzka,
              ]);
              setSchuzkaForm(null);
              setSchuzkaChyba(
                "Popis tohoto dne je uložený. Úprava názvu nebo místa u celé řady se nepovedla.",
              );
              return;
            }
            radaPoUprave = {
              ...ulozenaRada.data.schuzka,
              vynecheneVyskyty: [
                ...new Set([
                  ...(ulozenaRada.data.schuzka.vynecheneVyskyty ?? []),
                  den,
                ]),
              ],
            };
          }
          setSchuzkaOdesilaSe(false);
          setSchuzky((prev) => [
            ...prev
              .filter((s) => s.id !== nova.data.schuzka.id)
              .map((s) => (s.id === rada.id ? radaPoUprave : s)),
            nova.data.schuzka,
          ]);
          setSchuzkaForm(null);
          return;
        }
        const vysledek = await upravSchuzku(rada.id, uprava);
        setSchuzkaOdesilaSe(false);
        if (!vysledek.ok) {
          if (vysledek.chybyPoli !== undefined) {
            setSchuzkaChybyPoli(vysledek.chybyPoli);
          } else {
            setSchuzkaChyba(vysledek.chyba);
          }
          return;
        }
        setSchuzky((prev) =>
          prev.map((s) =>
            s.id === vysledek.data.schuzka.id ? vysledek.data.schuzka : s,
          ),
        );
        setSchuzkaForm(null);
        return;
      }
      const vysledek = await vytvorSchuzku(payload as VytvoritSchuzkuRequest);
      setSchuzkaOdesilaSe(false);
      if (!vysledek.ok) {
        if (vysledek.chybyPoli !== undefined) {
          setSchuzkaChybyPoli(vysledek.chybyPoli);
        } else {
          setSchuzkaChyba(vysledek.chyba);
        }
        return;
      }
      setSchuzky((prev) => [...prev, vysledek.data.schuzka]);
      setSchuzkaForm(null);
      setDenDetail(vysledek.data.schuzka.datum);
    })();
  }

  function naSmazatSchuzku(
    id: string,
    rozsah: RozsahMazaniSchuzky | null,
    datum?: string,
  ): void {
    if (mazeSeSchuzka !== null) return;
    setMazeSeSchuzka(id);
    setSchuzkaChyba(null);
    setSchuzkaOznameni(null);
    void (async (): Promise<void> => {
      try {
        const vysledek = await smazSchuzku(id, rozsah ?? "rada", datum);
        if (!vysledek.ok) {
          if (vysledek.kod === "NENALEZENO") {
            setSchuzky((prev) => prev.filter((s) => s.id !== id));
            setSchuzkaChyba(null);
            setSchuzkaOznameni("Schůzka už je smazaná. Seznam jsem obnovil.");
            const cerstve = await getSchuzky();
            if (cerstve.source === "db") setSchuzky(cerstve.data);
            return;
          }
          setSchuzkaChyba(vysledek.chyba);
          return;
        }
        setSchuzkaChyba(null);
        if ((rozsah ?? "rada") === "vyskyt" && datum !== undefined) {
          const vymaz: string = datum;
          setSchuzky((prev) =>
            prev.map((s) =>
              s.id === id
                ? {
                    ...s,
                    vynecheneVyskyty: [...(s.vynecheneVyskyty ?? []), vymaz],
                  }
                : s,
            ),
          );
        } else {
          setSchuzky((prev) => prev.filter((s) => s.id !== id));
        }
      } finally {
        setMazeSeSchuzka(null);
      }
    })();
  }

  function naOdeslatNovou(
    payload: VytvoritExpediciRequest | UpravitExpediciRequest,
    snimky: SnimkyCestyVyber,
  ): void {
    setVytvariSe(true);
    setChybaTvorby(null);
    setChybyPoliTvorby({});
    void (async (): Promise<void> => {
      const vysledek = await vytvorVypravu(payload as VytvoritExpediciRequest);
      setVytvariSe(false);
      if (!vysledek.ok) {
        if (vysledek.chybyPoli !== undefined) {
          setChybyPoliTvorby(vysledek.chybyPoli);
        } else {
          setChybaTvorby(vysledek.chyba);
        }
        return;
      }
      const tam = await nahrajCestaSnimky(vysledek.data.expedice.id, "tam", snimky.tam);
      const zpet = await nahrajCestaSnimky(vysledek.data.expedice.id, "zpet", snimky.zpet);
      if (!tam.ok) setHlaseniSnimku(`Výprava je založená. ${tam.chyba}`);
      else if (!zpet.ok) setHlaseniSnimku(`Výprava je založená. ${zpet.chyba}`);
      else setHlaseniSnimku(null);
      const nova = prevedApiExpedici(vysledek.data.expedice);
      zmeneneRef.current.add(nova.id);
      setExpedice((prev) =>
        [...prev, nova].sort((a, b) => a.datum.localeCompare(b.datum)),
      );
      setTvorbaOtevrena(false);
      setCilDiskuze(false);
      setVybrana(nova);
      setSearchParams((prev) => sVypravouVUrl(prev, nova.id));
    })();
  }

  function otevriVypravu(zaznam: Expedition): void {
    setCilDiskuze(false);
    setVybrana(zaznam);
    setSearchParams((prev) => sVypravouVUrl(prev, zaznam.id));
  }

  const naSmazanaStabilni = useCallback(
    (id: string): void => {
      smazaneRef.current.add(id);
      setExpedice((prev) => prev.filter((e) => e.id !== id));
      setHistorie((prev) =>
        prev === null ? prev : prev.filter((e) => e.id !== id),
      );
      setCilDiskuze(false);
      setVybrana(null);
      setSearchParams((prev) => sVypravouVUrl(prev, null));
    },
    [setSearchParams],
  );
  const naZavritModalStabilni = useCallback((): void => {
    setCilDiskuze(false);
    setVybrana(null);
    setSearchParams((prev) => sVypravouVUrl(prev, null));
  }, [setSearchParams]);

  useEffect(() => {
    if (surovyParamVyprava !== null && vypravaIdZUrl === null) {
      setSearchParams((prev) => sVypravouVUrl(prev, null));
      return;
    }
    if (vypravaIdZUrl === null) {
      if (vybrana !== null) {
        setCilDiskuze(false);
        setVybrana(null);
      }
      return;
    }
    if (vybrana !== null && vybrana.id === vypravaIdZUrl) return;
    const mistni: Expedition | undefined = vypravaPodleId.get(vypravaIdZUrl);
    if (mistni !== undefined) {
      setCilDiskuze(true);
      setVybrana(mistni);
      return;
    }
    let zruseno = false;
    void (async (): Promise<void> => {
      const detail: Expedition | null = await nactiDetailVypravy(vypravaIdZUrl);
      if (zruseno) return;
      if (detail === null) {
        setSearchParams((prev) => sVypravouVUrl(prev, null));
        return;
      }
      setCilDiskuze(true);
      setVybrana(detail);
    })();
    return () => {
      zruseno = true;
    };
    // Same as the production page: `vybrana` is written together with the param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surovyParamVyprava, vypravaIdZUrl, vypravaPodleId, setSearchParams]);

  // Kalendář hledání nemá, hlášení o výsledcích patří jen k seznamu.
  const hlaseni =
    hledaSe && zobrazeni === "seznam" ? (
      <>
        {`Nalezeno ${pocetVysledku} ${ceskyPocet(pocetVysledku, "výprava", "výpravy", "výprav")} pro „${orezanyDotaz}“.`}
      </>
    ) : null;

  const probihajiciBezHero = bezHero(probihajiciFiltrovane);
  const nadchazejiciBezHero = bezHero(nadchazejiciFiltrovane);
  const ukazProbiha = probihajiciBezHero.length > 0;
  const ukazNadchazejici =
    (!hledaSe && heroVyprava === undefined) || nadchazejiciBezHero.length > 0;
  const ukazHistorii = !hledaSe || probehleFiltrovane.length > 0;
  const ukazAgendu = !hledaSe;

  return (
    <>
      <main className="w-full px-4 pb-24 pt-6 sm:px-6 sm:pt-10 lg:px-10 2xl:px-16">
            <NahledHlavicka
              zobrazeni={zobrazeni}
              onZobrazeni={zmenZobrazeni}
              hledaniId={hledaniId}
              dotaz={dotaz}
              onDotaz={setDotaz}
              hlaseni={hlaseni}
              novaVyprava={
                muzeSpravovatVypravy
                  ? () => {
                      setChybaTvorby(null);
                      setChybyPoliTvorby({});
                      setTvorbaOtevrena(true);
                    }
                  : undefined
              }
            />
            <div className="nahled-pane pt-8 lg:pt-10">
              {zobrazeni === "seznam" ? (
                hledaSe && pocetVysledku === 0 ? (
                  <NahledPrazdne
                    nadpis="Nic jsme nenašli"
                    text={`Pro „${orezanyDotaz}“ tu není žádná výprava.`}
                    akce={{ popisek: "Zrušit hledání", onClick: zrusHledani }}
                  />
                ) : (
                  <div className="space-y-16">
                    <div
                      className={`grid min-w-0 gap-12 ${
                        ukazAgendu
                          ? "lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-x-12 xl:gap-x-16"
                          : ""
                      }`}
                    >
                      {heroVyprava !== undefined ? (
                        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                          <VypravaHero
                            expedice={heroVyprava}
                            dnes={dnesYmd}
                            probiha={heroProbiha}
                            neprecteno={neprecteneMapa.get(heroVyprava.id) === true}
                            onDetail={otevriVypravu}
                          />
                        </div>
                      ) : null}
                      {ukazAgendu ? (
                        <aside className="min-w-0 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
                          <AgendaBrzy
                            polozky={agenda}
                            dnes={dnesYmd}
                            onSchuzka={setDenDetail}
                            onVyprava={(id) => {
                              const zaznam = expedicePodleId.get(id);
                              if (zaznam !== undefined) otevriVypravu(zaznam);
                            }}
                            onKalendar={() => zmenZobrazeni("kalendar")}
                            datumVypravy={(id) => expedicePodleId.get(id)?.datum ?? dnesYmd}
                          />
                        </aside>
                      ) : null}
                      <div
                        className={`min-w-0 space-y-12 lg:col-start-1 ${
                          heroVyprava !== undefined ? "lg:row-start-2" : "lg:row-start-1"
                        }`}
                      >
                        {ukazProbiha ? (
                          <VypravaSekce nadpis="Probíhá" nadpisId="nahled-probiha">
                            <SeznamRadku
                              polozky={probihajiciBezHero}
                              neprectene={neprecteneMapa}
                              onDetail={otevriVypravu}
                            />
                          </VypravaSekce>
                        ) : null}
                        {ukazNadchazejici ? (
                          <VypravaSekce
                            nadpis={heroVyprava !== undefined ? "Další výpravy" : "Nadcházející"}
                            nadpisId="nahled-nadchazejici"
                          >
                            {nadchazejiciBezHero.length === 0 ? (
                              <NahledPrazdne
                                nadpis="Žádné nadcházející výpravy"
                                text="Vedoucí sem brzy připíše první záznam."
                              />
                            ) : (
                              <SeznamRadku
                                polozky={nadchazejiciBezHero}
                                neprectene={neprecteneMapa}
                                onDetail={otevriVypravu}
                              />
                            )}
                          </VypravaSekce>
                        ) : null}
                        {neuzavreneFiltrovane.length > 0 ? (
                          <VypravaSekce nadpis="Čeká na uzavření" nadpisId="nahled-neuzavrene">
                            <SeznamRadku
                              polozky={neuzavreneFiltrovane}
                              neprectene={neprecteneMapa}
                              onDetail={otevriVypravu}
                            />
                          </VypravaSekce>
                        ) : null}
                      </div>
                    </div>
                    {ukazHistorii ? (
                      <VypravaSekce nadpis="Proběhlo" nadpisId="nahled-historie">
                        {probehleFiltrovane.length === 0 ? (
                          <NahledPrazdne
                            nadpis="Archiv je prázdný"
                            text="Proběhlé výpravy se sem propíšou po uzavření."
                          />
                        ) : (
                          <HistorieKarty
                            polozky={probehleFiltrovane}
                            vysunuto={historieVysunuta}
                            onPrepnout={() => setHistorieVysunuta((pred) => !pred)}
                            neprectene={neprecteneMapa}
                            onDetail={otevriVypravu}
                          />
                        )}
                        {!hledaSe && historieZeServeru && historieStranek > 1 ? (
                          <NahledHistorieStranky
                            stranka={historieStranka}
                            stranek={historieStranek}
                            onPredchozi={() =>
                              setHistorieStranka((prev) => Math.max(1, prev - 1))
                            }
                            onDalsi={() =>
                              setHistorieStranka((prev) =>
                                Math.min(historieStranek, prev + 1),
                              )
                            }
                          />
                        ) : null}
                      </VypravaSekce>
                    ) : null}
                  </div>
                )
              ) : (
                <section aria-label="Kalendář výprav a schůzek">
                  {schuzkaOznameni !== null ? (
                    <p role="status" className="mb-4 rounded-2xl bg-mlha px-4 py-3 text-sm text-inkoust">
                      {schuzkaOznameni}
                    </p>
                  ) : null}
                  <NahledKalendar
                    rezim={rezimKalendare}
                    onRezim={setRezimKalendare}
                    mesic={{
                      rok: kalendarRok,
                      mesic: kalendarMesic,
                      udalosti: kalendarUdalosti,
                      vybraneDatum: denDetail,
                      dnes: dnesYmd,
                      onDen: setDenDetail,
                      onMesic: naPosunMesic,
                      onDnes: naDnesniMesic,
                    }}
                    tyden={{
                      kotva: kalendarKotva,
                      udalosti: kalendarUdalostiTyden,
                      vybraneDatum: denDetail,
                      dnes: dnesYmd,
                      onDen: setDenDetail,
                      onTyden: naPosunTyden,
                      onDnes: naDnesniTyden,
                    }}
                    datumVypravy={(id) => vypravaPodleId.get(id)?.datum ?? dnesYmd}
                  />
                  {muzeSpravovatVypravy ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSchuzkaChyba(null);
                        setSchuzkaChybyPoli({});
                        setSchuzkaForm({
                          rezim: "nova",
                          datum: denDetail ?? dnesYmd,
                        });
                      }}
                      aria-label="Nová schůzka"
                      className="nahled-press mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-mlha px-3 text-sm font-semibold text-inkoust hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Schůzka
                    </button>
                  ) : null}
                </section>
              )}
            </div>
      </main>
      {denDetail !== null && schuzkaForm === null ? (
        <>
          {/* production dialog */}
          <UdalostModal
            datum={denDetail}
            udalosti={
              kalendarUdalosti.get(denDetail) ??
              kalendarUdalostiTyden.get(denDetail) ??
              []
            }
            expedicePodleId={expedicePodleId}
            schuzkyPodleId={schuzkyPodleId}
            muzeSpravovat={muzeSpravovatVypravy}
            mazeSeSchuzka={mazeSeSchuzka}
            chybaMazani={schuzkaChyba}
            onZavrit={() => setDenDetail(null)}
            onDetailVypravy={(zaznam) => {
              setDenDetail(null);
              setCilDiskuze(false);
              setVybrana(zaznam);
              setSearchParams((prev) => sVypravouVUrl(prev, zaznam.id));
            }}
            onUpravitSchuzku={(schuzka) => {
              setSchuzkaChyba(null);
              setSchuzkaChybyPoli({});
              setSchuzkaForm({
                rezim: "uprava",
                schuzka,
                datumVyskytu: denDetail,
              });
            }}
            onSmazatSchuzku={naSmazatSchuzku}
            onNovaSchuzka={(datum) => {
              setSchuzkaChyba(null);
              setSchuzkaChybyPoli({});
              setSchuzkaForm({ rezim: "nova", datum });
            }}
            denik
          />
        </>
      ) : null}
      {vybrana !== null ? (
        <>
          {/* production dialog */}
          <ExpeditionModal
            key={vybrana.id}
            expedice={vybrana}
            onZavrit={naZavritModalStabilni}
            onAktualizace={naAktualizaciStabilni}
            onSmazana={naSmazanaStabilni}
            neprectenaDiskuze={neprecteneMapa.get(vybrana.id) === true}
            startNaDiskuzi={cilDiskuze}
            hlaseni={hlaseniSnimku}
            denik
          />
        </>
      ) : null}
      {schuzkaForm !== null ? (
        <div
          className={`nocturne nahled-modal fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-4${
            schuzkaZavreni.zavira ? " nahled-zavira" : ""
          }`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) schuzkaZavreni.zavri();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              schuzkaForm.rezim === "nova" ? "Nová schůzka" : "Upravit schůzku"
            }
            className="max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl bg-papir p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-denik lg:max-h-[90vh] lg:max-w-lg lg:rounded-3xl lg:p-6"
          >
            <SchuzkaForm
              nadpis={
                schuzkaForm.rezim === "nova" ? "Nová schůzka" : "Upravit schůzku"
              }
              odeslatPopisek={
                schuzkaForm.rezim === "nova" ? "Vytvořit schůzku" : "Uložit změny"
              }
              vychozi={
                schuzkaForm.rezim === "nova"
                  ? {
                      nazev: "",
                      datum: schuzkaForm.datum,
                      cas: null,
                      mistnost: null,
                      popis: "",
                      opakovani: "jednorazova",
                    }
                  : {
                      nazev: schuzkaForm.schuzka.nazev,
                      datum: schuzkaForm.schuzka.datum,
                      cas: schuzkaForm.schuzka.cas ?? null,
                      mistnost: schuzkaForm.schuzka.mistnost,
                      popis: schuzkaForm.schuzka.popis,
                      opakovani: schuzkaForm.schuzka.opakovani,
                    }
              }
              poznamkaPopisu={
                schuzkaForm.rezim === "uprava" &&
                schuzkaForm.schuzka.opakovani === "tydenni" &&
                schuzkaForm.datumVyskytu !== null
                  ? `Popis se uloží jen pro ${formatCelyDatum(schuzkaForm.datumVyskytu)}. Další týdny zůstanou, jak jsou.`
                  : null
              }
              odesilaSe={schuzkaOdesilaSe}
              serverChyba={schuzkaChyba}
              serverChybyPoli={schuzkaChybyPoli}
              onSubmit={naOdeslatSchuzku}
              onZrusit={() => schuzkaZavreni.zavri()}
            />
          </div>
        </div>
      ) : null}
      {tvorbaOtevrena ? (
        <div
          className={`nocturne nahled-modal fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-4${
            tvorbaZavreni.zavira ? " nahled-zavira" : ""
          }`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) tvorbaZavreni.zavri();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nová výprava"
            className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-papir shadow-denik lg:block lg:h-auto lg:max-h-[90vh] lg:max-w-2xl lg:overflow-y-auto lg:overscroll-y-contain lg:rounded-3xl lg:p-8"
          >
            <ExpeditionForm
              nadpis="Nová výprava"
              odeslatPopisek="Vytvořit výpravu"
              vychozi={null}
              odesilaSe={vytvariSe}
              serverChyba={chybaTvorby}
              serverChybyPoli={chybyPoliTvorby}
              onSubmit={naOdeslatNovou}
              onZrusit={() => tvorbaZavreni.zavri()}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
