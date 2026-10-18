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
import NahledRamec from "../components/vypravy-nahled/NahledRamec";
import VypravaKarta from "../components/vypravy-nahled/VypravaKarta";
import VypravaRadek from "../components/vypravy-nahled/VypravaRadek";
import VypravaSekce from "../components/vypravy-nahled/VypravaSekce";
import "../components/vypravy-nahled/nocturne.css";
import { useAuth } from "../hooks/useAuth";
import { useUnreadExpeditions } from "../hooks/useUnreadExpeditions";
import {
  filtrujExpedicePodleJmena,
  normalizujProVyhledavani,
} from "../lib/expedice-filtr";
import { dnesniDatumYmd, jeProbihajici, jeUplynula } from "../lib/expedition-utils";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import { vytvorVypravu } from "../lib/expeditions-ucast";
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

const ARCHIVO_ID = "exapp-archivo-nocturne";
const ARCHIVO_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&display=swap";

/** Page size of the history archive (`GET /api/expeditions?stav=proběhlá`). */
const HISTORIE_PAGE_SIZE = 6;

const HISTORIE_UVOD =
  "Archiv výprav. Přihlašování je uzavřené, detail ukazuje docházku a fotky.";

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

function textPoctuVyprav(n: number): string {
  return `${n} ${ceskyPocet(n, "výprava", "výpravy", "výprav")}`;
}

function textPoctuZaznamu(n: number): string {
  return `${n} ${ceskyPocet(n, "záznam", "záznamy", "záznamů")}`;
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

/** Public BFF base from `VITE_API_BASE_URL` (never a secret). */
function apiZaklad(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

/**
 * Deep-link detail fallback (`GET /api/expeditions/:id`).
 * Never throws — bad shape / 404 returns null and the caller drops the param.
 */
async function nactiDetailVypravy(id: string): Promise<Expedition | null> {
  const zaklad: string = apiZaklad();
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
 * Live counts win, except rows mutated or deleted after mount.
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
    if (!smazane.has(mistni.id) && !vysledek.some((e) => e.id === mistni.id)) {
      vysledek.push(mistni);
    }
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
  neprectene: Map<string, boolean>;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  return (
    <ul className="m-0 list-none p-0">
      {polozky.map((polozka, index) => (
        <li key={polozka.id} className={index > 0 ? "-mt-px" : undefined}>
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
  const [chybyPoliTvorby, setChybyPoliTvorby] = useState<ChybyExpedice>({});
  const [schuzkaForm, setSchuzkaForm] = useState<
    | { rezim: "nova"; datum: string }
    | { rezim: "uprava"; schuzka: ApiSchuzka }
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
  const historieRef = useRef<Expedition[] | null>(null);
  const historieCelkemRef = useRef<number | null>(null);
  const [vybrana, setVybrana] = useState<Expedition | null>(null);
  const [cilDiskuze, setCilDiskuze] = useState<boolean>(false);
  const hledaniId: string = useId();
  const [dotaz, setDotaz] = useState<string>("");
  const [debouncedDotaz, setDebouncedDotaz] = useState<string>("");

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("nahled-stranka");
    let casovac = 0;
    function ukaz(): void {
      html.classList.add("nahled-scrolluje");
      window.clearTimeout(casovac);
      casovac = window.setTimeout(() => {
        html.classList.remove("nahled-scrolluje");
      }, 700);
    }
    window.addEventListener("scroll", ukaz, { passive: true });
    window.addEventListener("wheel", ukaz, { passive: true });
    window.addEventListener("touchmove", ukaz, { passive: true });
    return () => {
      window.clearTimeout(casovac);
      html.classList.remove("nahled-stranka", "nahled-scrolluje");
      window.removeEventListener("scroll", ukaz);
      window.removeEventListener("wheel", ukaz);
      window.removeEventListener("touchmove", ukaz);
    };
  }, []);

  useEffect(() => {
    if (document.getElementById(ARCHIVO_ID) !== null) return;
    for (const href of [
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]) {
      const pred = document.createElement("link");
      pred.rel = "preconnect";
      pred.href = href;
      if (href.includes("gstatic")) pred.crossOrigin = "anonymous";
      document.head.appendChild(pred);
    }
    const link = document.createElement("link");
    link.id = ARCHIVO_ID;
    link.rel = "stylesheet";
    link.href = ARCHIVO_HREF;
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    historieRef.current = historie;
    historieCelkemRef.current = historieCelkem;
  }, [historie, historieCelkem]);

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
      expedice.filter(
        (e) =>
          e.stav !== "proběhlá" && !jeProbihajici(e) && !jeUplynula(e),
      ),
    [expedice],
  );
  const neuzavrene: Expedition[] = useMemo(
    () =>
      expedice
        .filter((e) => jeUplynula(e))
        .sort((a, b) => b.datum.localeCompare(a.datum)),
    [expedice],
  );
  const probehle: Expedition[] = useMemo(() => {
    if (historie === null) {
      return expedice.filter((e) => e.stav === "proběhlá");
    }
    const lokalnePodleId = new Map(expedice.map((e) => [e.id, e]));
    return historie.map((h) => {
      if (!zmeneneRef.current.has(h.id)) return h;
      return lokalnePodleId.get(h.id) ?? h;
    });
  }, [historie, expedice]);
  const historieZeServeru = historie !== null;
  const historiePocet: number =
    historieZeServeru && historieCelkem !== null
      ? historieCelkem
      : probehle.length;
  const hledaSe: boolean = normalizujProVyhledavani(debouncedDotaz).length > 0;
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
  const idsVypravProUnread: string[] = useMemo(() => {
    const vse: Expedition[] = [
      ...neuzavrene,
      ...probihajici,
      ...nadchazejici,
      ...probehle,
    ];
    return vse.map((e) => e.id);
  }, [neuzavrene, probihajici, nadchazejici, probehle]);
  const neprecteneMapa: Map<string, boolean> =
    useUnreadExpeditions(idsVypravProUnread);
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
  const orezanyDotaz = debouncedDotaz.trim();

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
        return [nova, ...prev].slice(0, HISTORIE_PAGE_SIZE);
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
        const vysledek = await upravSchuzku(
          schuzkaForm.schuzka.id,
          payload as UpravitSchuzkuRequest,
        );
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
                    vynechaneVyskyty: [...(s.vynechaneVyskyty ?? []), vymaz],
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

  const hlaseni = hledaSe ? (
    <>
      {`Nalezeno ${pocetVysledku} ${ceskyPocet(pocetVysledku, "výprava", "výpravy", "výprav")} pro „${orezanyDotaz}“.`}
      {zobrazeni === "kalendar"
        ? " Hledání třídí seznam, kalendář zůstává celý."
        : null}
    </>
  ) : null;

  const ukazProbiha = probihajiciFiltrovane.length > 0;
  const ukazNadchazejici = !hledaSe || nadchazejiciFiltrovane.length > 0;
  const ukazHistorii = !hledaSe || probehleFiltrovane.length > 0;
  const historiePocetText = hledaSe
    ? textPoctuVyprav(probehleFiltrovane.length)
    : textPoctuZaznamu(historiePocet);

  return (
    <>
      <div className="nocturne">
        <NahledRamec>
          <main className="space-y-12">
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
            <div className="nahled-pane">
              {zobrazeni === "seznam" ? (
                hledaSe && pocetVysledku === 0 ? (
                  <NahledPrazdne
                    nadpis="Nic jsme nenašli"
                    text={`Pro „${orezanyDotaz}“ tu není žádná výprava.`}
                    akce={{ popisek: "Zrušit hledání", onClick: zrusHledani }}
                  />
                ) : (
                  <div className="space-y-12">
                    {neuzavreneFiltrovane.length > 0 ? (
                      <VypravaSekce
                        tag="Neuzavřené"
                        tagId="nahled-neuzavrene"
                        svisle="Neuzavřené"
                        strana="vpravo"
                        pozadi="panel"
                        odstin="ruz"
                        pocetText={textPoctuVyprav(neuzavreneFiltrovane.length)}
                        uvod="Termín už skončil. Výprava pořád čeká na uzavření."
                      >
                        <SeznamRadku
                          polozky={neuzavreneFiltrovane}
                          neprectene={neprecteneMapa}
                          onDetail={otevriVypravu}
                        />
                      </VypravaSekce>
                    ) : null}
                    {ukazProbiha ? (
                      <VypravaSekce
                        tag="01 — Probíhá"
                        tagId="nahled-probiha"
                        svisle="01 — Probíhá"
                        strana="vpravo"
                        pozadi="panel"
                        odstin="mech"
                        pocetText={textPoctuVyprav(probihajiciFiltrovane.length)}
                      >
                        <SeznamRadku
                          polozky={probihajiciFiltrovane}
                          neprectene={neprecteneMapa}
                          onDetail={otevriVypravu}
                        />
                      </VypravaSekce>
                    ) : null}
                    {ukazNadchazejici ? (
                      <VypravaSekce
                        tag="02 — Nadcházející"
                        tagId="nahled-nadchazejici"
                        svisle="02 — Nadcházející"
                        strana="vlevo"
                        pozadi="papir"
                        pocetText={textPoctuVyprav(nadchazejiciFiltrovane.length)}
                      >
                        {nadchazejiciFiltrovane.length === 0 ? (
                          <NahledPrazdne
                            nadpis="Žádné nadcházející výpravy"
                            text="Vedoucí sem brzy připíše první záznam."
                          />
                        ) : (
                          <SeznamRadku
                            polozky={nadchazejiciFiltrovane}
                            neprectene={neprecteneMapa}
                            onDetail={otevriVypravu}
                          />
                        )}
                      </VypravaSekce>
                    ) : null}
                    {ukazHistorii ? (
                      <VypravaSekce
                        tag="03 — Historie"
                        tagId="nahled-historie"
                        svisle="03 — Historie"
                        strana="vpravo"
                        pozadi="panel"
                        odstin="nebe"
                        pocetText={historiePocetText}
                        uvod={HISTORIE_UVOD}
                      >
                        {probehleFiltrovane.length === 0 ? (
                          <NahledPrazdne
                            nadpis="Archiv je prázdný"
                            text="Proběhlé výpravy se sem propíšou po uzavření."
                          />
                        ) : (
                          <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-2">
                            {probehleFiltrovane.map((polozka) => (
                              <li key={polozka.id} className="min-w-0">
                                <VypravaKarta
                                  expedice={polozka}
                                  neprecteno={neprecteneMapa.get(polozka.id) === true}
                                  onDetail={otevriVypravu}
                                />
                              </li>
                            ))}
                          </ul>
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
                <VypravaSekce
                  tag="Kalendář"
                  tagId="nahled-kalendar"
                  svisle="Kalendář"
                  strana="vpravo"
                  pozadi="papir"
                  odstin="nebe"
                  pocetText=""
                >
                  {schuzkaOznameni !== null ? (
                    <p role="status" className="mb-4 border border-[hsl(var(--foreground))] px-3 py-2 text-sm">
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
                      className="nahled-press nahled-prejeti mt-4 inline-flex min-h-[44px] items-center border border-[hsl(var(--foreground))] px-4 font-condensed text-sm"
                    >
                      Nová schůzka
                    </button>
                  ) : null}
                </VypravaSekce>
              )}
            </div>
          </main>
        </NahledRamec>
      </div>
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
              setSchuzkaForm({ rezim: "uprava", schuzka });
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
            denik
          />
        </>
      ) : null}
      {schuzkaForm !== null ? (
        <div
          className={`nocturne nahled-modal fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center${
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
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-[hsl(var(--foreground))] bg-[hsl(var(--card))] p-5"
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
                      mistnost: null,
                      popis: "",
                      opakovani: "jednorazova",
                    }
                  : {
                      nazev: schuzkaForm.schuzka.nazev,
                      datum: schuzkaForm.schuzka.datum,
                      mistnost: schuzkaForm.schuzka.mistnost,
                      popis: schuzkaForm.schuzka.popis,
                      opakovani: schuzkaForm.schuzka.opakovani,
                    }
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
          className={`nocturne nahled-modal fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center${
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
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-[hsl(var(--foreground))] bg-[hsl(var(--card))] p-5"
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
