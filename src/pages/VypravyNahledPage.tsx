import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KalendarDenSeznam from "../components/kalendar/KalendarDenSeznam";
import KalendarPostranni from "../components/kalendar/KalendarPostranni";
import SchuzkaForm from "../components/kalendar/SchuzkaForm";
import UdalostModal from "../components/kalendar/UdalostModal";
import SpodniSheet from "../components/shell/SpodniSheet";
import NahledHlavicka from "../components/vypravy-nahled/NahledHlavicka";
import KalendarMesicMrizka from "../components/kalendar/KalendarMesic";
import NabidkaDne from "../components/kalendar/NabidkaDne";
import NahledPrazdne from "../components/vypravy-nahled/NahledPrazdne";
import VypravaRadek from "../components/vypravy-nahled/VypravaRadek";
import VypravaSekce from "../components/vypravy-nahled/VypravaSekce";
import PosuvnikVyprav, { VYPRAV_V_KATEGORII } from "../components/vypravy-nahled/PosuvnikVyprav";
import VypravyOkno from "../components/vypravy-nahled/VypravyOkno";
import VypravaHero from "../components/vypravy-nahled/VypravaHero";
import AgendaBrzy from "../components/vypravy-nahled/AgendaBrzy";
import RailNeuzavrene from "../components/vypravy-nahled/RailNeuzavrene";
import Strankovani from "../components/Strankovani";
import { useStrankovani } from "../hooks/useStrankovani";
import { RADKU_NA_STRANKU } from "../lib/strankovani";
import { nejblizsiAgenda } from "../lib/agenda";
import { useAuth } from "../hooks/useAuth";
import { useKonverzacePrehled } from "../hooks/useKonverzacePrehled";
import {
  filtrujExpedicePodleJmena,
  normalizujProVyhledavani,
  rozdelVypravy,
  seradVypravy,
  type RazeniVyprav,
} from "../lib/expedice-filtr";
import { dnesniDatumYmd, formatCelyDatum } from "../lib/expedition-utils";
import { apiBase } from "../lib/api-base";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import { nazevMesice, udalostiProMesic } from "../lib/kalendar";
import KalendarOvladani from "../components/kalendar/KalendarOvladani";
import {
  getSchuzky,
  smazSchuzku,
  upravSchuzku,
  vytvorSchuzku,
  type ChybySchuzky,
} from "../lib/schuzky-api";
import type { Expedition } from "../lib/mock-expeditions";
import { VYPRAVA_PARAM, parseVypravaId } from "../lib/vyprava-deep-link";
import { nastavZadateleZastupnych, zajistiBazenZastupnych } from "../lib/zastupne-fotky";
import type {
  ApiExpedice,
  ApiSchuzka,
  RozsahMazaniSchuzky,
  UpravitSchuzkuRequest,
  VytvoritSchuzkuRequest,
} from "../shared/api-types";
import { useNabeh } from "../lib/pohyb";
import KostraVyprav from "../components/vypravy-nahled/KostraVyprav";

type Zobrazeni = "seznam" | "kalendar";
type FiltrVyprav = "vse" | "nejblizsi" | "neuzavrene";
/** Kategorie otevřená v okně „Zobrazit vše“. */
type KategorieOkna = "probihajici" | "nadchazejici" | "neuzavrene" | "probehle";

/** Page size of the history archive (`GET /api/expeditions?stav=proběhlá`). */
const HISTORIE_PAGE_SIZE = 12;

/** Jak dlouho se čeká na živý seznam, než se ukáže ten zabalený při buildu. */
const CEKANI_NA_SERVER_MS = 4000;

/** Poslední seznam ze serveru. Návrat na stránku jím začne a nepřeblikne přes starý. */
let posledniZivySeznam: Expedition[] | null = null;

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

function SeznamRadku({
  polozky,
  limit,
  neprectene,
  onDetail,
}: {
  polozky: Expedition[];
  /** V přehledu jen první výpravy, zbytek je v okně „Zobrazit vše“. */
  limit?: number;
  neprectene: ReadonlyMap<string, boolean>;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const { viditelne, cislo, pocet, nastav } = useStrankovani(
    limit === undefined ? polozky : polozky.slice(0, limit),
    RADKU_NA_STRANKU,
    String(polozky.length),
  );
  return (
    <>
      <ul className="m-0 list-none divide-y divide-linka overflow-hidden rounded-2xl border border-linka bg-povrch p-0 shadow-karta ">
        {viditelne.map((polozka) => (
          <li key={polozka.id} className="min-w-0">
            <VypravaRadek
              expedice={polozka}
              neprecteno={neprectene.get(polozka.id) === true}
              onDetail={onDetail}
            />
          </li>
        ))}
      </ul>
      <Strankovani cislo={cislo} pocet={pocet} onZmena={nastav} className="mt-4" />
    </>
  );
}

export default function VypravyNahledPage(): JSX.Element {
  const { muzeSpravovatVypravy } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const zobrazeni = parseZobrazeni(searchParams.get("zobrazeni"));
  const surovyParamVyprava: string | null = searchParams.get(VYPRAVA_PARAM);
  const vypravaIdZUrl: string | null = parseVypravaId(surovyParamVyprava);
  const [nacita, setNacita] = useState<boolean>(
    () => posledniZivySeznam === null && apiBase().length > 0,
  );
  const [expedice, setExpedice] = useState<Expedition[]>(
    () => posledniZivySeznam ?? (apiBase().length > 0 ? [] : getExpeditionsSync().data),
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
  const [denDetail, setDenDetail] = useState<string | null>(null);
  const [schuzkaDetail, setSchuzkaDetail] = useState<{
    schuzka: ApiSchuzka;
    datumVyskytu: string;
  } | null>(null);
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
  const [historie, setHistorie] = useState<Expedition[] | null>(null);
  const [historieStranka, setHistorieStranka] = useState<number>(1);
  const [historieCelkem, setHistorieCelkem] = useState<number | null>(null);
  const [historieStranek, setHistorieStranek] = useState<number>(1);
  const historieRef = useRef<Expedition[] | null>(null);
  const historieCelkemRef = useRef<number | null>(null);
  const hledaniId: string = useId();
  const denRef = useNabeh<HTMLDivElement>(denDetail ?? "", "x");
  const [dotaz, setDotaz] = useState<string>("");
  const [filtrVyprav, setFiltrVyprav] = useState<FiltrVyprav>("vse");
  const [okno, setOkno] = useState<KategorieOkna | null>(null);
  const [razeni, setRazeni] = useState<RazeniVyprav>("datum");
  const obsahRef = useNabeh<HTMLDivElement>(`${zobrazeni}-${filtrVyprav}-${razeni}`);
  const [debouncedDotaz, setDebouncedDotaz] = useState<string>("");

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
    // Pomalý nebo nedostupný server: ukáže se seznam zabalený při buildu.
    const zabaleny = (): void => {
      if (posledniZivySeznam === null) {
        setExpedice((prev) => (prev.length > 0 ? prev : getExpeditionsSync().data));
      }
      setNacita(false);
    };
    const casovac = window.setTimeout(zabaleny, CEKANI_NA_SERVER_MS);
    void (async (): Promise<void> => {
      const zive = await getExpeditions();
      if (zruseno) return;
      window.clearTimeout(casovac);
      if (zive.source !== "db") {
        zabaleny();
        return;
      }
      setExpedice((prev) => {
        const dalsi = sloucSeZivymi(prev, zive.data, zmeneneRef.current, smazaneRef.current);
        posledniZivySeznam = dalsi;
        return dalsi;
      });
      setNacita(false);
    })();
    return () => {
      zruseno = true;
      window.clearTimeout(casovac);
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
      const nove = ziva.data
        .filter((e) => !smazaneRef.current.has(e.id))
        .map((e) => prevedApiExpedici(e));
      setHistorie((pred) => {
        if (historieStranka === 1 || pred === null) return nove;
        const maId = new Set(pred.map((e) => e.id));
        return [...pred, ...nove.filter((e) => !maId.has(e.id))];
      });
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

  const rozdelene = useMemo(
    () => rozdelVypravy(expedice, dnesniDatumYmd()),
    [expedice],
  );
  const probihajici: Expedition[] = useMemo(
    () => [...rozdelene.probihajici].sort((a, b) => b.datum.localeCompare(a.datum)),
    [rozdelene],
  );
  const nadchazejici: Expedition[] = useMemo(
    () => [...rozdelene.nadchazejici].sort((a, b) => a.datum.localeCompare(b.datum)),
    [rozdelene],
  );
  const neuzavrene: Expedition[] = useMemo(
    () =>
      [...rozdelene.cekaNaUzavreni].sort(
        (a, b) =>
          b.datum.localeCompare(a.datum) ||
          (b.datumDo ?? b.datum).localeCompare(a.datumDo ?? a.datum),
      ),
    [rozdelene],
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
    if (nacita) return;
    nastavZadateleZastupnych([...probihajici, ...nadchazejici].map((vyprava) => vyprava.id));
  }, [nacita, probihajici, nadchazejici]);
  useEffect(() => {
    if (nacita) return;
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
  }, [nacita, probehle]);
  const hledaSe: boolean = normalizujProVyhledavani(debouncedDotaz).length > 0;
  const neuzavreneFiltrovane: Expedition[] = useMemo(
    () =>
      muzeSpravovatVypravy
        ? seradVypravy(filtrujExpedicePodleJmena(neuzavrene, debouncedDotaz), razeni)
        : [],
    [muzeSpravovatVypravy, neuzavrene, debouncedDotaz, razeni],
  );
  const probihajiciFiltrovane: Expedition[] = useMemo(
    () => seradVypravy(filtrujExpedicePodleJmena(probihajici, debouncedDotaz), razeni),
    [probihajici, debouncedDotaz, razeni],
  );
  const nadchazejiciFiltrovane: Expedition[] = useMemo(
    () => seradVypravy(filtrujExpedicePodleJmena(nadchazejici, debouncedDotaz), razeni),
    [nadchazejici, debouncedDotaz, razeni],
  );
  const probehleFiltrovane: Expedition[] = useMemo(
    () => seradVypravy(filtrujExpedicePodleJmena(probehle, debouncedDotaz), razeni),
    [probehle, debouncedDotaz, razeni],
  );
  const pocetVysledku: number =
    neuzavreneFiltrovane.length +
    probihajiciFiltrovane.length +
    nadchazejiciFiltrovane.length +
    probehleFiltrovane.length;
  const { neprecteneVypravy } = useKonverzacePrehled();
  const neprecteneMapa: ReadonlyMap<string, boolean> = neprecteneVypravy;
  // Hledání v hlavičce zúží i kalendář.
  const kalendarUdalosti = useMemo(
    () =>
      udalostiProMesic(
        {
          expedice: filtrujExpedicePodleJmena(expedice, debouncedDotaz),
          schuzky: filtrujExpedicePodleJmena(schuzky, debouncedDotaz),
        },
        kalendarRok,
        kalendarMesic,
      ),
    [expedice, schuzky, debouncedDotaz, kalendarRok, kalendarMesic],
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
  /** Velký náhled je nejbližší nadcházející výprava, probíhající má vlastní sekci. */
  const heroVyprava: Expedition | undefined = hledaSe ? undefined : nadchazejici[0];
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

  function otevriNovouSchuzku(): void {
    setSchuzkaDetail(null);
    setSchuzkaChyba(null);
    setSchuzkaChybyPoli({});
    setSchuzkaForm({ rezim: "nova", datum: denDetail ?? dnesYmd });
  }

  function zrusHledani(): void {
    setDotaz("");
    setDebouncedDotaz("");
  }

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
          setSchuzkaDetail((pred) =>
            pred?.schuzka.id === id && pred.datumVyskytu === datum ? null : pred,
          );
        } else {
          setSchuzky((prev) => prev.filter((s) => s.id !== id));
          setSchuzkaDetail((pred) => (pred?.schuzka.id === id ? null : pred));
        }
      } finally {
        setMazeSeSchuzka(null);
      }
    })();
  }

  function otevriVypravu(zaznam: Expedition): void {
    navigate(`/vypravy/${zaznam.id}`);
  }

  function prihlasitNaVypravu(zaznam: Expedition): void {
    navigate(`/vypravy/${zaznam.id}?prihlasit=1`);
  }

  function otevriSchuzkuDetail(schuzka: ApiSchuzka, datumVyskytu: string): void {
    setSchuzkaForm(null);
    setSchuzkaDetail({ schuzka, datumVyskytu });
    setDenDetail(datumVyskytu);
  }

  useEffect(() => {
    if (zobrazeni !== "kalendar") return;
    setDenDetail((pred) => pred ?? dnesYmd);
  }, [zobrazeni, dnesYmd]);

  useEffect(() => {
    if (vypravaIdZUrl === null) return;
    const next = new URLSearchParams(searchParams);
    next.delete(VYPRAVA_PARAM);
    next.set("diskuze", "1");
    const qs = next.toString();
    navigate(
      `/vypravy/${vypravaIdZUrl}${qs.length > 0 ? `?${qs}` : ""}`,
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vypravaIdZUrl, navigate]);

  // Kalendář hledání nemá, hlášení o výsledcích patří jen k seznamu.
  const hlaseni =
    hledaSe && zobrazeni === "seznam" ? (
      <>
        {`Nalezeno ${pocetVysledku} ${ceskyPocet(pocetVysledku, "výprava", "výpravy", "výprav")} pro „${orezanyDotaz}“.`}
      </>
    ) : null;

  const probihajiciBezHero = bezHero(probihajiciFiltrovane);
  const nadchazejiciBezHero = bezHero(nadchazejiciFiltrovane);
  const ukazProbiha = filtrVyprav !== "neuzavrene" && probihajiciBezHero.length > 0;
  const ukazNadchazejici =
    filtrVyprav !== "neuzavrene" &&
    ((!hledaSe && heroVyprava === undefined) || nadchazejiciBezHero.length > 0);
  const ukazNeuzavrene = filtrVyprav !== "nejblizsi" && neuzavreneFiltrovane.length > 0;
  const ukazHistorii = filtrVyprav === "vse" && (!hledaSe || probehleFiltrovane.length > 0);
  const ukazAgendu = !hledaSe;
  // Filtr i hledání ukazují celý výsledek, přehled jen začátek každé kategorie.
  const limitKategorie = filtrVyprav === "vse" && !hledaSe ? VYPRAV_V_KATEGORII : undefined;
  const zobrazitVse = (
    kategorie: KategorieOkna,
    pocet: number,
  ): { popisek: string; onClick: () => void } | undefined =>
    limitKategorie !== undefined && pocet > limitKategorie
      ? { popisek: "Zobrazit vše", onClick: () => setOkno(kategorie) }
      : undefined;
  const probehleCelkem = Math.max(
    probehleFiltrovane.length,
    historieZeServeru && !hledaSe ? (historieCelkem ?? 0) : 0,
  );
  const obsahOkna: Record<KategorieOkna, { titulek: string; polozky: Expedition[]; celkem: number }> = {
    probihajici: {
      titulek: "Probíhající výpravy",
      polozky: probihajiciFiltrovane,
      celkem: probihajiciFiltrovane.length,
    },
    nadchazejici: {
      titulek: "Nadcházející výpravy",
      polozky: nadchazejiciFiltrovane,
      celkem: nadchazejiciFiltrovane.length,
    },
    neuzavrene: {
      titulek: "Čeká na uzavření",
      polozky: neuzavreneFiltrovane,
      celkem: neuzavreneFiltrovane.length,
    },
    probehle: { titulek: "Proběhlé výpravy", polozky: probehleFiltrovane, celkem: probehleCelkem },
  };

  return (
    <>
      <main className="mx-auto w-full min-w-0 max-w-[46rem] px-5 pb-6 pt-4 sm:px-6 sm:pt-8 lg:max-w-full lg:px-8 min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-10">
            <NahledHlavicka
              zobrazeni={zobrazeni}
              onZobrazeni={zmenZobrazeni}
              hledaniId={hledaniId}
              dotaz={dotaz}
              onDotaz={setDotaz}
              hlaseni={hlaseni}
              filtr={filtrVyprav}
              onFiltr={setFiltrVyprav}
              razeni={razeni}
              onRazeni={setRazeni}
              mesicKalendare={nazevMesice(kalendarRok, kalendarMesic)}
              kalendarOvladani={
                <KalendarOvladani
                  nadpis={nazevMesice(kalendarRok, kalendarMesic)}
                  posun={{
                    predchozi: "Předchozí měsíc",
                    dalsi: "Další měsíc",
                    onPredchozi: () => naPosunMesic(-1),
                    onDalsi: () => naPosunMesic(1),
                    onDnes: naDnesniMesic,
                  }}
                />
              }
              novaVyprava={
                muzeSpravovatVypravy
                  ? () => navigate("/vypravy/nova")
                  : undefined
              }
            />
            <div ref={obsahRef} className={`nahled-pane pt-[22px] ${zobrazeni === "kalendar" ? "min-[90rem]:pt-8" : "min-[90rem]:pt-10"}`}>
              {zobrazeni === "seznam" ? (
                <>
                {nacita ? (
                  <KostraVyprav />
                ) : hledaSe && pocetVysledku === 0 ? (
                  <NahledPrazdne
                    nadpis="Nic jsme nenašli"
                    text={`Pro „${orezanyDotaz}“ tu není žádná výprava.`}
                    akce={{ popisek: "Zrušit hledání", onClick: zrusHledani }}
                  />
                ) : (
                  <div className="space-y-[22px] min-[90rem]:space-y-10">
                    <div
                      className={`grid min-w-0 gap-[22px] min-[90rem]:gap-y-10 ${
                        ukazAgendu
                          ? "lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-6 min-[90rem]:grid-cols-[minmax(0,1fr)_324px] min-[90rem]:gap-x-10"
                          : ""
                      }`}
                    >
                      {heroVyprava !== undefined ? (
                        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                          <VypravaHero
                            expedice={heroVyprava}
                            dnes={dnesYmd}
                            neprecteno={neprecteneMapa.get(heroVyprava.id) === true}
                            onDetail={otevriVypravu}
                          />
                        </div>
                      ) : null}
                      {ukazAgendu ? (
                        <aside className="hidden min-w-0 space-y-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:self-start min-[90rem]:top-24">
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
                          {ukazNeuzavrene && filtrVyprav !== "neuzavrene" ? (
                            <RailNeuzavrene
                              polozky={neuzavreneFiltrovane}
                              onDetail={otevriVypravu}
                              onVse={() => setOkno("neuzavrene")}
                            />
                          ) : null}
                        </aside>
                      ) : null}
                      <div
                        className={`min-w-0 space-y-[22px] min-[90rem]:space-y-10 lg:col-start-1 ${
                          heroVyprava !== undefined ? "lg:row-start-2" : "lg:row-start-1"
                        }`}
                      >
                        {ukazProbiha ? (
                          <VypravaSekce
                            nadpis="Probíhající"
                            nadpisId="nahled-probiha"
                            pocet={probihajiciBezHero.length}
                            akce={zobrazitVse("probihajici", probihajiciBezHero.length)}
                          >
                            <SeznamRadku
                              polozky={probihajiciBezHero}
                              limit={limitKategorie}
                              neprectene={neprecteneMapa}
                              onDetail={otevriVypravu}
                            />
                          </VypravaSekce>
                        ) : null}
                        {ukazNadchazejici ? (
                          <VypravaSekce
                            nadpis="Nadcházející"
                            nadpisId="nahled-nadchazejici"
                            pocet={nadchazejiciBezHero.length}
                            akce={zobrazitVse("nadchazejici", nadchazejiciBezHero.length)}
                          >
                            {nadchazejiciBezHero.length === 0 ? (
                              <NahledPrazdne
                                nadpis="Žádné nadcházející výpravy"
                                text="Vedoucí sem brzy připíše první záznam."
                              />
                            ) : (
                              <SeznamRadku
                                polozky={nadchazejiciBezHero}
                                limit={limitKategorie}
                                neprectene={neprecteneMapa}
                                onDetail={otevriVypravu}
                              />
                            )}
                          </VypravaSekce>
                        ) : null}
                        {ukazNeuzavrene ? (
                          <div className={ukazAgendu && filtrVyprav !== "neuzavrene" ? "lg:hidden" : undefined}>
                          <VypravaSekce
                            nadpis="Čeká na uzavření"
                            nadpisId="nahled-neuzavrene"
                            pocet={neuzavreneFiltrovane.length}
                            akce={zobrazitVse("neuzavrene", neuzavreneFiltrovane.length)}
                          >
                            <SeznamRadku
                              polozky={neuzavreneFiltrovane}
                              limit={limitKategorie}
                              neprectene={neprecteneMapa}
                              onDetail={otevriVypravu}
                            />
                          </VypravaSekce>
                          </div>
                        ) : null}
                        {ukazHistorii ? (
                          <VypravaSekce
                            nadpis="Proběhlo"
                            nadpisId="nahled-historie"
                            pocet={probehleCelkem}
                            akce={
                              probehleCelkem > VYPRAV_V_KATEGORII
                                ? { popisek: "Zobrazit vše", onClick: () => setOkno("probehle") }
                                : undefined
                            }
                          >
                            {probehleFiltrovane.length === 0 ? (
                              <NahledPrazdne
                                nadpis="Archiv je prázdný"
                                text="Proběhlé výpravy se sem propíšou po uzavření."
                              />
                            ) : (
                              <PosuvnikVyprav
                                polozky={probehleFiltrovane}
                                neprectene={neprecteneMapa}
                                onDetail={otevriVypravu}
                              />
                            )}
                          </VypravaSekce>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
                </>
              ) : (
                <section aria-label="Kalendář výprav a schůzek">
                  {schuzkaOznameni !== null ? (
                    <p role="status" className="mb-4 rounded-2xl bg-mlha px-4 py-3 text-sm text-inkoust">
                      {schuzkaOznameni}
                    </p>
                  ) : null}
                  <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-7 min-[90rem]:grid-cols-[minmax(0,1fr)_348px] min-[90rem]:gap-9">
                    <div className="min-w-0">
                      <KalendarMesicMrizka
                        rok={kalendarRok}
                        mesic={kalendarMesic}
                        udalosti={kalendarUdalosti}
                        vybraneDatum={denDetail}
                        dnes={dnesYmd}
                        onDen={setDenDetail}
                        onMesic={naPosunMesic}
                        onDnes={naDnesniMesic}
                        datumVypravy={(id) => vypravaPodleId.get(id)?.datum ?? dnesYmd}
                      />
                      {denDetail !== null ? (
                        <div ref={denRef} className="lg:hidden">
                          <KalendarDenSeznam
                            datum={denDetail}
                            udalosti={kalendarUdalosti.get(denDetail) ?? []}
                            dalsiVypravy={nadchazejici}
                            akce={
                              muzeSpravovatVypravy ? <NabidkaDne onNovaSchuzka={otevriNovouSchuzku} /> : undefined
                            }
                            expedicePodleId={expedicePodleId}
                            schuzkyPodleId={schuzkyPodleId}
                            onVyprava={otevriVypravu}
                            onPrihlaseni={prihlasitNaVypravu}
                            onSchuzka={(schuzka) =>
                              otevriSchuzkuDetail(schuzka, denDetail)
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="hidden lg:block">
                      <KalendarPostranni
                        datum={denDetail}
                        udalosti={kalendarUdalosti}
                        akce={
                          muzeSpravovatVypravy ? <NabidkaDne onNovaSchuzka={otevriNovouSchuzku} /> : undefined
                        }
                        expedicePodleId={expedicePodleId}
                        schuzkyPodleId={schuzkyPodleId}
                        nadchazejici={nadchazejici}
                        dnes={dnesYmd}
                        onVyprava={otevriVypravu}
                        onPrihlaseni={prihlasitNaVypravu}
                        onSchuzkaDetail={otevriSchuzkuDetail}
                        onSeznam={() => zmenZobrazeni("seznam")}
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>
      </main>
      {okno !== null ? (
        <VypravyOkno
          {...obsahOkna[okno]}
          karty={okno === "probehle"}
          neprectene={neprecteneMapa}
          onDetail={otevriVypravu}
          onDalsi={
            okno === "probehle" && !hledaSe && historieZeServeru && historieStranka < historieStranek
              ? () => setHistorieStranka((pred) => Math.min(historieStranek, pred + 1))
              : undefined
          }
          onZavrit={() => setOkno(null)}
        />
      ) : null}
      {schuzkaDetail !== null ? (
        <UdalostModal
          schuzka={
            schuzkyPodleId.get(schuzkaDetail.schuzka.id) ?? schuzkaDetail.schuzka
          }
          datumVyskytu={schuzkaDetail.datumVyskytu}
          otevreno
          rok={kalendarRok}
          mesic={kalendarMesic}
          muzeSpravovat={muzeSpravovatVypravy}
          mazeSeSchuzka={mazeSeSchuzka}
          chybaMazani={schuzkaChyba}
          onZavrit={() => setSchuzkaDetail(null)}
          onUpravit={(schuzka) => {
            setSchuzkaDetail(null);
            setSchuzkaChyba(null);
            setSchuzkaChybyPoli({});
            setSchuzkaForm({
              rezim: "uprava",
              schuzka,
              datumVyskytu: schuzkaDetail.datumVyskytu,
            });
          }}
          onSmazatSchuzku={naSmazatSchuzku}
        />
      ) : null}
      <SpodniSheet
        otevreno={schuzkaForm !== null}
        titulek={
          schuzkaForm?.rezim === "uprava" ? "Upravit schůzku" : "Nová schůzka"
        }
        onZavrit={() => setSchuzkaForm(null)}
      >
        {schuzkaForm !== null ? (
          <SchuzkaForm
            bezNadpisu
            bezPopisu={schuzkaForm.rezim === "nova"}
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
            onZrusit={() => setSchuzkaForm(null)}
          />
        ) : null}
      </SpodniSheet>
    </>
  );
}
