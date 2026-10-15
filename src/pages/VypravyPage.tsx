import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import ExpeditionForm, {
  type ChybyExpedice,
} from "../components/expeditions/ExpeditionForm";
import ExpeditionList from "../components/expeditions/ExpeditionList";
import ExpeditionModal from "../components/expeditions/ExpeditionModal";
import KalendarMesic from "../components/kalendar/KalendarMesic";
import KalendarTyden from "../components/kalendar/KalendarTyden";
import SchuzkaForm from "../components/kalendar/SchuzkaForm";
import UdalostModal from "../components/kalendar/UdalostModal";
import { useAuth } from "../hooks/useAuth";
import { useUnreadExpeditions } from "../hooks/useUnreadExpeditions";
import { filtrujExpedicePodleJmena, normalizujProVyhledavani } from "../lib/expedice-filtr";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import {
  VYPRAVA_PARAM,
  parseVypravaId,
  sVypravouVUrl,
} from "../lib/vyprava-deep-link";
import { dnesniDatumYmd, jeProbihajici } from "../lib/expedition-utils";
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

const VOLBY: Array<{ id: Zobrazeni; popisek: string }> = [
  { id: "seznam", popisek: "Seznam" },
  { id: "kalendar", popisek: "Kalendář" },
];

function parseZobrazeni(hodnota: string | null): Zobrazeni {
  return hodnota === "kalendar" ? "kalendar" : "seznam";
}

/** Dnešní měsíc jako { rok, mesic } pro start kalendáře. */
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

/** Posun týdenní kotvy o ±7 dní (YMD → YMD, fail-safe beze změny). */
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

/** Velikost stránky archivu historie (`GET /api/expeditions?stav=proběhlá`). */
const HISTORIE_PAGE_SIZE = 6;

function prevedApiExpedici(api: ApiExpedice): Expedition {
  return {
    id: api.id,
    nazev: api.nazev,
    datum: api.datum,
    datumDo: api.datumDo,
    sraz: api.sraz,
    popis: api.popis,
    trasaOdkaz: api.trasaOdkaz,
    kapacita: { prihlaseno: api.kapacita.prihlaseno, celkem: api.kapacita.celkem },
    stav: api.stav,
    ...(api.nahledFotkaId !== undefined ? { nahledFotkaId: api.nahledFotkaId } : {}),
  };
}

/** Základ BFF z veřejného `VITE_API_BASE_URL` (nikdy secret, stejně jako read vrstva). */
function apiZaklad(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

/**
 * Step 3 — fallback detailu pro deep-link (`GET /api/expeditions/:id`,
 * veřejné, tvar `{ expedice }` jako přehled Ušlé).
 * Nikdy nevyhazuje — při chybě / 404 / nevalidním tvaru vrací `null`
 * (volající param ignoruje + smaže).
 */
async function nactiDetailVypravy(id: string): Promise<Expedition | null> {
  const zaklad: string = apiZaklad();
  if (zaklad.length === 0) return null;
  try {
    const odpoved: Response = await fetch(
      `${zaklad}${expediceDetailPath(id)}`,
      { headers: { Accept: "application/json" } },
    );
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
 * Sloučí živý seznam z BFF s lokálním stavem.
 * Živá data jsou pravda pro počty (`kapacita.prihlaseno` = COUNT v DB),
 * ale řádky změněné lokálně po mountu (účast / úprava / nová) jsou čerstvější
 * z mutačních odpovědí — ty se nechávají. Lokálně smazané se neobnovují.
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
    if (
      !smazane.has(mistni.id) &&
      !vysledek.some((e) => e.id === mistni.id)
    ) {
      vysledek.push(mistni);
    }
  }
  return vysledek.sort((a, b) => a.datum.localeCompare(b.datum));
}

export default function VypravyPage(): JSX.Element {
  const { muzeSpravovatVypravy } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const zobrazeni = parseZobrazeni(searchParams.get("zobrazeni"));
  /* Step 3 — deep-link `/vypravy?vyprava=<id>` (kompatibilní se `zobrazeni`).
     Surový param hlídáme zvlášť: nevalidní tvar se maže, i když po
     normalizaci dává `null` stejně jako chybějící. */
  const surovyParamVyprava: string | null = searchParams.get(VYPRAVA_PARAM);
  const vypravaIdZUrl: string | null = parseVypravaId(surovyParamVyprava);
  // Start: build-time snapshot pro okamžité vykreslení, po mountu se tiše
  // povýší na živá data z BFF (GET /api/expeditions, PUBLIC) — snapshot
  // jinak ukazuje zastaralé počty přihlášených proti detailu z DB.
  // Lokální stav, aby se účast / úprava / uzavření propsaly bez refetche.
  const [expedice, setExpedice] = useState<Expedition[]>(
    () => getExpeditionsSync().data,
  );
  /* ID změněná/smazaná lokálně po mountu — živý fetch je nesmí přepsat. */
  const zmeneneRef = useRef<Set<string>>(new Set());
  const smazaneRef = useRef<Set<string>>(new Set());

  /*
   * Fáze 3 — kalendář + schůzky.
   * `schuzky` = živý seznam z BFF (GET /api/meetings, PUBLIC); při selhání
   * prázdné (kalendář ukazuje jen výpravy). Mutace se propisují lokálně
   * bez refetche (stejný vzor jako výpravy výše).
   */
  const [schuzky, setSchuzky] = useState<ApiSchuzka[]>([]);
  const [kalendarRok, setKalendarRok] = useState<number>(() => aktualniMesic().rok);
  const [kalendarMesic, setKalendarMesic] = useState<number>(
    () => aktualniMesic().mesic,
  );
  const [rezimKalendare, setRezimKalendare] = useState<RezimKalendare>("mesic");
  const [kalendarKotva, setKalendarKotva] = useState<string>(() =>
    dnesniDatumYmd(),
  );
  const [denDetail, setDenDetail] = useState<string | null>(null);
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

  /*
   * Historie ze serveru (`GET /api/expeditions?stav=proběhlá&page&pageSize`).
   * `null` = BFF bez odpovědi → fallback na lokální filtr snapshotu jako dnes.
   * Lokálně změněné/smazané řádky živý fetch nepřepisuje (stejně jako výše).
   */
  const [historie, setHistorie] = useState<Expedition[] | null>(null);
  const [historieStranka, setHistorieStranka] = useState<number>(1);
  const [historieCelkem, setHistorieCelkem] = useState<number | null>(null);
  const [historieStranek, setHistorieStranek] = useState<number>(1);
  /*
   * Krok 6 — čerstvé hodnoty pro `naAktualizaci` (stabilní callback
   * přes `useCallback(..., [])` by jinak četl stale-closure snapshot).
   */
  const historieRef = useRef<Expedition[] | null>(null);
  const historieCelkemRef = useRef<number | null>(null);
  useEffect(() => {
    historieRef.current = historie;
    historieCelkemRef.current = historieCelkem;
  }, [historie, historieCelkem]);

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
  const [vybrana, setVybrana] = useState<Expedition | null>(null);
  /* Step 3 — cílí otevřený modal Diskuzi (`true` jen pro příchod z URL:
     Nástěnka / přímé URL / forward; klik na kartu v seznamu nechává
     detail odshora jako dosud). */
  const [cilDiskuze, setCilDiskuze] = useState<boolean>(false);
  const [tvorbaOtevrena, setTvorbaOtevrena] = useState<boolean>(false);
  const [vytvariSe, setVytvariSe] = useState<boolean>(false);
  const [chybaTvorby, setChybaTvorby] = useState<string | null>(null);
  const [chybyPoliTvorby, setChybyPoliTvorby] = useState<ChybyExpedice>({});
  /* Krok 14 — vyhledávání podle jména (klientský filtr, debounce 200 ms). */
  const hledatId: string = useId();
  const [dotaz, setDotaz] = useState<string>("");
  const [debouncedDotaz, setDebouncedDotaz] = useState<string>("");
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
    () => expedice.filter((e) => e.stav !== "proběhlá" && !jeProbihajici(e)),
    [expedice],
  );
  /*
   * Historie: server je pravda (`source: "db"`), bez BFF fallback na lokální
   * filtr snapshotu jako dnes. Lokálně upravené řádky mají přednost před
   * serverovou kopií (mutace bez refetche).
   */
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
  /* Krok 14 — klientský filtr existujícího seznamu (žádný nový endpoint). */
  const hledaSe: boolean = normalizujProVyhledavani(debouncedDotaz).length > 0;
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
    probihajiciFiltrovane.length +
    nadchazejiciFiltrovane.length +
    probehleFiltrovane.length;

  /*
   * Krok 3 — tečka nepřečtené diskuze na kartách (synchronně všech 3 sekcí).
   * Jedna sdílená mapa pro probíhající + nadcházející + historii; hook sám
   * fetchne meta, polluje 30 s a zhasne eventem bez reloadu.
   */
  const idsVypravProUnread: string[] = useMemo(() => {
    const vse: Expedition[] = [...probihajici, ...nadchazejici, ...probehle];
    return vse.map((e) => e.id);
  }, [probihajici, nadchazejici, probehle]);
  const neprecteneMapa: Map<string, boolean> =
    useUnreadExpeditions(idsVypravProUnread);

  /*
   * Fáze 3 — sjednocená data kalendáře (výpravy + schůzky na dny).
   * Výpravy ze všech stavů (nadcházející i proběhlé se propisují).
   */
  const kalendarUdalosti = useMemo(
    () =>
      udalostiProMesic({ expedice, schuzky }, kalendarRok, kalendarMesic),
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
  /* Step 3 — mount lookup pro deep-link: aktivní seznam + stránkovaná
     historie (tu `expedicePodleId` pro kalendář nekryje). Výpravu z URL
     nikdy nehledat ručně v UI — jen tahle mapa + fallback detail. */
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
          if (vysledek.chybyPoli !== undefined)
            setSchuzkaChybyPoli(vysledek.chybyPoli);
          else setSchuzkaChyba(vysledek.chyba);
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
        if (vysledek.chybyPoli !== undefined)
          setSchuzkaChybyPoli(vysledek.chybyPoli);
        else setSchuzkaChyba(vysledek.chyba);
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
            // Guard: při selhání BFF vrací getSchuzky [] s fallback —
            // bez něj by NENALEZENO-refetch smazal celý lokální seznam.
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

  function naAktualizaci(nova: Expedition): void {
    zmeneneRef.current.add(nova.id);
    setExpedice((prev) => prev.map((e) => (e.id === nova.id ? nova : e)));
    /*
     * Krok 6 — nově uzavřená se objeví v historii bez reloadu.
     * `historie` je stránkovaný serverový řez, takže samotné mapování
     * čerstvý záznam (dřív aktivní) nikdy nenajde → upsert: existující
     * řádek aktualizovat, nový vložit na začátek aktuálního řezu
     * (trim na HISTORIE_PAGE_SIZE, celkem +1). Bez fetch — žádný
     * double-fetch; příští stránkování srovná serverová pravda.
     * Fallback (`historie === null`, bez BFF): historie se odvozuje
     * z `expedice` (memo `probehle`), takže už je vidět — nic navíc.
     */
    if (nova.stav === "proběhlá" && historieRef.current !== null) {
      const jeNova: boolean = !historieRef.current.some(
        (e) => e.id === nova.id,
      );
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

  /* Step 3 — otevření karty zapisuje `?vyprava=<id>` (merge přes
     `sVypravouVUrl`, `zobrazeni` zůstává); zavření / smazání param maže.
     URL je sdílená pravda pro modal: přímé URL i zpětná navigace pak
     fungují bez ručního hledání výpravy. */
  function otevriVypravu(expedice: Expedition): void {
    setCilDiskuze(false);
    setVybrana(expedice);
    setSearchParams((prev) => sVypravouVUrl(prev, expedice.id));
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

  /* Step 3 — směr URL → modal (mount lookup + fallback detail).
     - `?vyprava=<id>` + modal zavřený / jiný → otevřít + cílit Diskuzi.
     - Param pryč + modal otevřený → zavřít (zpětná navigace nezavěsí).
     - Nevalidní / neznámé id → ignorovat + param smazat.
     - Už otevřeno (`vybrana.id` sedí) → nic (žádná smyčka).
     `vybrana` schválně mimo deps: každá změna výběru zapisuje i param,
     takže efekt se probudí přes `surovyParamVyprava` / mapu. */
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
      const detail: Expedition | null =
        await nactiDetailVypravy(vypravaIdZUrl);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surovyParamVyprava, vypravaIdZUrl, vypravaPodleId, setSearchParams]);

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
        if (vysledek.chybyPoli !== undefined) setChybyPoliTvorby(vysledek.chybyPoli);
        else setChybaTvorby(vysledek.chyba);
        return;
      }
      const nova = prevedApiExpedici(vysledek.data.expedice);
      zmeneneRef.current.add(nova.id);
      setExpedice((prev) =>
        [...prev, nova].sort((a, b) => a.datum.localeCompare(b.datum)),
      );
      setTvorbaOtevrena(false);
      /* Step 3 — nová výprava se rovnou otevře i v URL (refresh neztratí). */
      setCilDiskuze(false);
      setVybrana(nova);
      setSearchParams((prev) => sVypravouVUrl(prev, nova.id));
    })();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Klubové výpravy
        </h1>

        <div
          role="group"
          aria-label="Zobrazení výprav"
          className="mt-4 inline-flex rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik"
        >
          {VOLBY.map((volba) => {
            const aktivni = zobrazeni === volba.id;
            return (
              <button
                key={volba.id}
                type="button"
                aria-pressed={aktivni}
                onClick={() => zmenZobrazeni(volba.id)}
                className={`min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm font-bold transition-colors ${
                  aktivni
                    ? "bg-inkoust text-papir"
                    : "text-inkoust hover:bg-linka/60"
                }`}
              >
                {volba.popisek}
              </button>
            );
          })}
        </div>
        <div role="search" className="mt-4 max-w-md">
          <label
            htmlFor={hledatId}
            className="mb-1 block text-sm font-bold"
          >
            Hledat výpravu podle jména
          </label>
          <input
            id={hledatId}
            type="search"
            value={dotaz}
            onChange={(e) => setDotaz(e.target.value)}
            placeholder="Hledat podle jména…"
            autoComplete="off"
            className="block min-h-[44px] w-full rounded-md border-2 border-inkoust bg-white/80 px-3 py-2 text-base placeholder:text-inkoust/40"
          />
          {hledaSe && (
            <p aria-live="polite" className="mt-1 text-[13px] font-semibold text-inkoust/70 tabular-nums">
              Nalezeno {pocetVysledku}{" "}
              {pocetVysledku === 1
                ? "výprava"
                : pocetVysledku >= 2 && pocetVysledku <= 4
                  ? "výpravy"
                  : "výprav"}{" "}
              pro „{debouncedDotaz.trim()}“.
            </p>
          )}
        </div>
        {muzeSpravovatVypravy && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setChybaTvorby(null);
                setChybyPoliTvorby({});
                setTvorbaOtevrena(true);
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir shadow-denik motion-safe:transition-colors motion-safe:hover:bg-inkoust [touch-action:manipulation]"
            >
              <span aria-hidden="true">＋</span> Nová výprava
            </button>
          </div>
        )}
      </header>

      <div className="pt-6">
        {zobrazeni === "seznam" ? (
          <div className="space-y-10">
            {hledaSe && pocetVysledku === 0 ? (
              <div
                role="status"
                className="rounded-2xl border border-dashed border-inkoust/25 bg-papir/60 p-6 text-center"
              >
                <p className="text-base font-bold">Nic jsme nenašli</p>
                <p className="mt-1 text-sm text-inkoust/70">
                  Pro „{debouncedDotaz.trim()}" tu není žádná výprava. Zkus jiný název.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDotaz("");
                    setDebouncedDotaz("");
                  }}
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold"
                >
                  Zrušit hledání
                </button>
              </div>
            ) : (
              <>
            {probihajiciFiltrovane.length > 0 && (
              <section aria-labelledby="probihajici-nadpis">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id="probihajici-nadpis"
                    className="text-xl font-bold tracking-tight"
                  >
                    Právě probíhá
                  </h2>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-mech tabular-nums">
                    {probihajiciFiltrovane.length}{" "}
                    {probihajiciFiltrovane.length === 1
                      ? "výprava"
                      : probihajiciFiltrovane.length >= 2 && probihajiciFiltrovane.length <= 4
                        ? "výpravy"
                        : "výprav"}
                  </p>
                </div>
                <div className="pt-4">
                  <ExpeditionList expedice={probihajiciFiltrovane} onDetail={otevriVypravu} neprectene={neprecteneMapa} />
                </div>
              </section>
            )}
            <section aria-labelledby="nadchazejici-nadpis">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="nadchazejici-nadpis"
                  className="text-xl font-bold tracking-tight"
                >
                  Nadcházející
                </h2>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-mech tabular-nums">
                  {nadchazejiciFiltrovane.length}{" "}
                  {nadchazejiciFiltrovane.length === 1
                    ? "výprava"
                    : nadchazejiciFiltrovane.length >= 2 && nadchazejiciFiltrovane.length <= 4
                      ? "výpravy"
                      : "výprav"}
                </p>
              </div>
              <div className="pt-4">
                <ExpeditionList expedice={nadchazejiciFiltrovane} onDetail={otevriVypravu} neprectene={neprecteneMapa} />
              </div>
            </section>

            <section aria-labelledby="historie-nadpis">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-inkoust pt-8">
                <h2
                  id="historie-nadpis"
                  className="text-xl font-bold tracking-tight"
                >
                  Proběhlé · historie
                </h2>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-mech tabular-nums">
                  {historiePocet}{" "}
                  {historiePocet === 1
                    ? "záznam"
                    : historiePocet >= 2 && historiePocet <= 4
                      ? "záznamy"
                      : "záznamů"}
                </p>
              </div>
              <p className="mt-2 text-sm text-inkoust/70">
                Archiv výprav — přihlašování je uzavřené, detail ukazuje
                docházku a fotky.
              </p>
              <div className="pt-4">
                <ExpeditionList expedice={probehleFiltrovane} onDetail={otevriVypravu} neprectene={neprecteneMapa} />
              </div>
              {!hledaSe && historieZeServeru && historieStranek > 1 && (
                <nav
                  aria-label="Stránkování historie"
                  className="mt-5 flex flex-wrap items-center justify-center gap-2"
                >
                  <button
                    type="button"
                    disabled={historieStranka <= 1}
                    onClick={() =>
                      setHistorieStranka((prev) => Math.max(1, prev - 1))
                    }
                    className="min-h-[44px] min-w-[44px] rounded-md border-2 border-inkoust bg-white/60 px-4 py-2 text-sm font-bold shadow-denik transition-colors enabled:hover:bg-linka/60 disabled:opacity-40"
                  >
                    ← Novější
                  </button>
                  <p
                    aria-live="polite"
                    className="min-h-[44px] px-2 py-2 text-sm font-bold tabular-nums"
                  >
                    Stránka {historieStranka} z {historieStranek}
                  </p>
                  <button
                    type="button"
                    disabled={historieStranka >= historieStranek}
                    onClick={() =>
                      setHistorieStranka((prev) =>
                        Math.min(historieStranek, prev + 1),
                      )
                    }
                    className="min-h-[44px] min-w-[44px] rounded-md border-2 border-inkoust bg-white/60 px-4 py-2 text-sm font-bold shadow-denik transition-colors enabled:hover:bg-linka/60 disabled:opacity-40"
                  >
                    Starší →
                  </button>
                </nav>
              )}
            </section>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {schuzkaOznameni !== null && (
              <p
                role="status"
                className="rounded-md border-2 border-inkoust bg-white/60 px-3 py-2 text-sm font-bold"
              >
                {schuzkaOznameni}
              </p>
            )}
            <div
              role="group"
              aria-label="Režim kalendáře"
              className="inline-flex rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik"
            >
              <button
                type="button"
                aria-pressed={rezimKalendare === "mesic"}
                onClick={() => setRezimKalendare("mesic")}
                className={`min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm font-bold transition-colors ${
                  rezimKalendare === "mesic"
                    ? "bg-inkoust text-papir"
                    : "text-inkoust hover:bg-linka/60"
                }`}
              >
                Měsíc
              </button>
              <button
                type="button"
                aria-pressed={rezimKalendare === "tyden"}
                onClick={() => setRezimKalendare("tyden")}
                className={`min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm font-bold transition-colors ${
                  rezimKalendare === "tyden"
                    ? "bg-inkoust text-papir"
                    : "text-inkoust hover:bg-linka/60"
                }`}
              >
                Týden
              </button>
            </div>
            {rezimKalendare === "mesic" ? (
              <KalendarMesic
                rok={kalendarRok}
                mesic={kalendarMesic}
                udalosti={kalendarUdalosti}
                vybraneDatum={denDetail}
                dnes={dnesYmd}
                onDen={setDenDetail}
                onMesic={naPosunMesic}
                onDnes={naDnesniMesic}
              />
            ) : (
              <KalendarTyden
                kotva={kalendarKotva}
                udalosti={kalendarUdalostiTyden}
                vybraneDatum={denDetail}
                dnes={dnesYmd}
                onDen={setDenDetail}
                onTyden={naPosunTyden}
                onDnes={naDnesniTyden}
              />
            )}
            {muzeSpravovatVypravy && (
              <button
                type="button"
                onClick={() => {
                  setSchuzkaChyba(null);
                  setSchuzkaChybyPoli({});
                  setSchuzkaForm({ rezim: "nova", datum: denDetail ?? dnesYmd });
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-inkoust bg-smrk px-5 py-2 text-sm font-bold text-papir shadow-denik transition-colors hover:bg-inkoust [touch-action:manipulation]"
              >
                <span aria-hidden="true">＋</span> Nová schůzka
              </button>
            )}
          </div>
        )}
      </div>

      {denDetail !== null && schuzkaForm === null && (
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
          onDetailVypravy={(expedice) => {
            setDenDetail(null);
            setCilDiskuze(false);
            setVybrana(expedice);
            setSearchParams((prev) => sVypravouVUrl(prev, expedice.id));
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
        />
      )}

      {schuzkaForm !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 p-4 sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSchuzkaForm(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              schuzkaForm.rezim === "nova" ? "Nová schůzka" : "Upravit schůzku"
            }
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border-2 border-inkoust bg-papir p-5 shadow-denik sm:p-6"
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
              onZrusit={() => setSchuzkaForm(null)}
            />
          </div>
        </div>
      )}

      {vybrana !== null && (
        <ExpeditionModal
          key={vybrana.id}
          expedice={vybrana}
          onZavrit={naZavritModalStabilni}
          onAktualizace={naAktualizaciStabilni}
          onSmazana={naSmazanaStabilni}
          neprectenaDiskuze={neprecteneMapa.get(vybrana.id) === true}
          startNaDiskuzi={cilDiskuze}
        />
      )}

      {tvorbaOtevrena && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 p-4 sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTvorbaOtevrena(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nová výprava"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border-2 border-inkoust bg-papir p-5 shadow-denik sm:p-6"
          >
            <ExpeditionForm
              nadpis="Nová výprava"
              odeslatPopisek="Vytvořit výpravu"
              vychozi={null}
              odesilaSe={vytvariSe}
              serverChyba={chybaTvorby}
              serverChybyPoli={chybyPoliTvorby}
              onSubmit={naOdeslatNovou}
              onZrusit={() => setTvorbaOtevrena(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
