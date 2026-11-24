import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import AlbumFotky, { type AkceStahovaniAlba } from "../components/fotky/AlbumFotky";
import { KostraAlba, KostraFotky } from "../components/StrankaKostra";
import AlbumKarta from "../components/fotky/AlbumKarta";
import FotkyNahravaciPanel from "../components/fotky/FotkyNahravaciPanel";
import { useAuth } from "../hooks/useAuth";
import {
  fotkyChipNeaktivni,
  fotkyChipVybrany,
  fotkyHoverBgLinka,
  fotkyHoverBgSmrk,
  fotkyTlacitkoPrimarni,
  fotkyTlacitkoSekundarni,
  fotkyTlacitkoZaklad,
} from "../components/fotky/fotky-ui";
import PrazdnyStav from "../components/PrazdnyStav";
import { NacistDalsi } from "../components/Strankovani";
import { useNacistDalsi } from "../hooks/useStrankovani";
import { KARET_NA_DAVKU } from "../lib/strankovani";
import { IkonaLupa, IkonaObrazek } from "../components/SeznamIkony";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import Ikona from "../components/Ikona";
import { zneplatniBazenZastupnych } from "../lib/zastupne-fotky";
import { jeAlbumNahledu, smiNahratDoAlba } from "../shared/fotky-nahledy";
import { velikostiAlb } from "../lib/alba-prehled";
import { formatCelyDatum } from "../lib/expedition-utils";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import {
  nactiAlba,
  popisekPoctuFotek,
  smazAlbum,
  type ApiAlbum,
} from "../lib/alba-api";

const POPIS_ALBA_NAHLEDU =
  "Z těchto fotek se náhodně vybírá obrázek nadcházejících výprav, přidávají je vedoucí. Dvě výpravy po sobě nikdy nedostanou stejný. Dokud tu nejsou aspoň dvě fotky, doplňují se z alb proběhlých výprav.";

type StavSeznamu = "nacitani" | "hotovo" | "chyba";
type SegmentAlba = "vsechna" | "vypravy" | "ruzne";

const SEGMENTY: readonly { id: SegmentAlba; popisek: string }[] = [
  { id: "vsechna", popisek: "Všechna alba" },
  { id: "vypravy", popisek: "Výpravy" },
  { id: "ruzne", popisek: "Různé" },
];

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

function souhrnFotek(alba: readonly ApiAlbum[]): string {
  const bezKose = alba.filter((polozka) => polozka.druh !== "kos");
  const pocetAlb = bezKose.length;
  const pocetFotek = bezKose.reduce((soucet, polozka) => soucet + polozka.pocetFotek, 0);
  const albaPopisek = ceskyPocet(pocetAlb, "1 album", `${pocetAlb} alba`, `${pocetAlb} alb`);
  const fotkyPopisek = popisekPoctuFotek(pocetFotek);
  return `${albaPopisek} · ${fotkyPopisek}`;
}

function metaAlbaDetail(album: ApiAlbum, datumRadek: string | null): string {
  const casti = [popisekPoctuFotek(album.pocetFotek)];
  if (datumRadek !== null && datumRadek.length > 0) casti.push(datumRadek);
  return casti.join(" · ");
}

function bezDiakritiky(hodnota: string): string {
  return hodnota.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function patriDoSegmentu(album: ApiAlbum, segment: SegmentAlba): boolean {
  if (segment === "vypravy") return album.druh === "vyprava";
  if (segment === "ruzne") return album.druh === "vlastni";
  return true;
}

function filtrujAlba(alba: readonly ApiAlbum[], hledani: string, segment: SegmentAlba): ApiAlbum[] {
  const dotaz = bezDiakritiky(hledani);
  return alba.filter((album) => {
    if (!patriDoSegmentu(album, segment)) return false;
    if (dotaz.length === 0) return true;
    return bezDiakritiky(album.nazev).includes(dotaz);
  });
}

type FotkyNavigacniStav = {
  rozbalNahravani?: boolean;
  ciloveAlbumId?: string;
};

const TLACITKO_ZNOVU = `${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} mt-4 rounded-md border border-linka bg-papir px-4 text-sm font-bold`;

function TlacitkoZnovu({ onZnovu }: { onZnovu: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onZnovu} className={TLACITKO_ZNOVU}>
      Zkusit znovu
    </button>
  );
}

export default function FotkyPage(): JSX.Element {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, user } = useAuth();
  const prihlasen = user !== null;
  const [nahravaniOtevreno, setNahravaniOtevreno] = useState(false);
  const [albumFormOtevreno, setAlbumFormOtevreno] = useState(false);
  const stahovaniAlbaRef = useRef<AkceStahovaniAlba | null>(null);
  const [vyberFotek, setVyberFotek] = useState(false);
  const pripravStahovani = useCallback((akce: AkceStahovaniAlba): void => {
    stahovaniAlbaRef.current = akce;
  }, []);
  const [alba, setAlba] = useState<ApiAlbum[]>([]);
  const [datumVyprav, setDatumVyprav] = useState<ReadonlyMap<string, string>>(
    () => new Map(getExpeditionsSync().data.map((v) => [v.id, formatCelyDatum(v.datum)])),
  );
  useEffect(() => {
    let zive = true;
    void getExpeditions().then((vysledek) => {
      if (!zive || vysledek.source !== "db") return;
      setDatumVyprav(new Map(vysledek.data.map((v) => [v.id, formatCelyDatum(v.datum)])));
    });
    return () => {
      zive = false;
    };
  }, []);
  const [stav, setStav] = useState<StavSeznamu>("nacitani");
  const [chyba, setChyba] = useState<string | null>(null);
  const [vybraneId, setVybraneId] = useState<string>("");
  const [obnova, setObnova] = useState<number>(0);
  const [pokus, setPokus] = useState<number>(0);
  const [keSmazani, setKeSmazani] = useState<ApiAlbum | null>(null);
  const [maze, setMaze] = useState<boolean>(false);
  const [chybaMazani, setChybaMazani] = useState<string | null>(null);
  const [rozbalitNahravani, setRozbalitNahravani] = useState<"nahravani" | null>(null);
  const [hledaniAlba, setHledaniAlba] = useState("");
  const [segmentAlba, setSegmentAlba] = useState<SegmentAlba>("vsechna");
  const zrusFiltrAlb = (): void => {
    setHledaniAlba("");
    setSegmentAlba("vsechna");
  };
  const navratPoSmazaniAlbaRef = useRef<HTMLElement | null>(null);

  const nacti = useCallback(async (): Promise<ApiAlbum[] | null> => {
    const vysledek = await nactiAlba();
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      setStav((aktualni) => (aktualni === "hotovo" ? "hotovo" : "chyba"));
      return null;
    }
    setAlba(vysledek.data);
    setChyba(null);
    setStav("hotovo");
    return vysledek.data;
  }, []);

  useEffect(() => {
    let zive = true;
    setStav("nacitani");
    void (async (): Promise<void> => {
      const vysledek = await nactiAlba();
      if (!zive) return;
      if (!vysledek.ok) {
        setChyba(vysledek.chyba);
        setStav("chyba");
        return;
      }
      setAlba(vysledek.data);
      setChyba(null);
      setStav("hotovo");
    })();
    return () => {
      zive = false;
    };
  }, [pokus]);

  useEffect(() => {
    if (albumId === undefined) return;
    setVybraneId(albumId);
  }, [albumId]);

  useEffect(() => {
    setVybraneId((aktualni) => {
      if (alba.length === 0) return "";
      if (alba.some((album) => album.id === aktualni)) return aktualni;
      if (albumId !== undefined && alba.some((album) => album.id === albumId)) return albumId;
      return alba[0]?.id ?? "";
    });
  }, [alba, albumId]);

  useEffect(() => {
    if (albumId !== undefined) return;
    const stav = location.state as FotkyNavigacniStav | null;
    if (stav?.rozbalNahravani !== true) return;
    if (stav.ciloveAlbumId !== undefined && stav.ciloveAlbumId.length > 0) {
      setVybraneId(stav.ciloveAlbumId);
    }
    setRozbalitNahravani("nahravani");
    void navigate(location.pathname, { replace: true, state: null });
  }, [albumId, location.pathname, location.state, navigate]);

  const otevrene = alba.find((album) => album.id === albumId) ?? null;
  const albaVPrehledu = filtrujAlba(alba, hledaniAlba, segmentAlba).filter((album) => album.druh !== "kos");
  const bezFiltru = segmentAlba === "vsechna" && hledaniAlba.trim().length === 0;
  const albumKos = alba.find((album) => album.druh === "kos");
  const albaKNahrani = alba.filter(
    (album) => album.druh !== "kos" && smiNahratDoAlba(album.id, isAdmin),
  );
  const vybraneKNahrani = albaKNahrani.some((album) => album.id === vybraneId)
    ? vybraneId
    : (albaKNahrani[0]?.id ?? "");
  const albumKeSmazani =
    isAdmin && otevrene !== null && otevrene.druh === "vlastni" && !jeAlbumNahledu(otevrene.id)
      ? otevrene
      : isAdmin
        ? (alba.find(
            (album) =>
              album.id === vybraneId && album.druh === "vlastni" && !jeAlbumNahledu(album.id),
          ) ?? null)
        : null;

  function poNahrani(): void {
    zneplatniBazenZastupnych();
    setObnova((hodnota) => hodnota + 1);
    void nacti();
  }

  function otevriSmazaniAlba(album: ApiAlbum, spoustec: HTMLElement): void {
    navratPoSmazaniAlbaRef.current = spoustec;
    setChybaMazani(null);
    setKeSmazani(album);
  }

  async function potvrdSmazani(): Promise<void> {
    if (keSmazani === null || maze) return;
    setMaze(true);
    setChybaMazani(null);
    const vysledek = await smazAlbum(keSmazani.id);
    setMaze(false);
    if (!vysledek.ok) {
      setChybaMazani(vysledek.chyba);
      return;
    }
    const smazaneId = keSmazani.id;
    setAlba((predchozi) =>
      predchozi.filter((album) => album.druh !== "vlastni" || album.id !== smazaneId),
    );
    setKeSmazani(null);
    if (albumId === smazaneId) void navigate("/fotky");
  }

  function poNovemAlbu(album: ApiAlbum | null, nazev: string): void {
    if (album === null) {
      void (async (): Promise<void> => {
        const cerstva = await nacti();
        const stejneJmeno = cerstva?.find(
          (polozka) => polozka.druh === "vlastni" && polozka.nazev === nazev,
        );
        const cil = stejneJmeno ?? cerstva?.[0];
        if (cil !== undefined) {
          setVybraneId(cil.id);
          void navigate(`/fotky/${cil.id}`);
        }
      })();
      return;
    }
    setAlba((predchozi) => [album, ...predchozi.filter((polozka) => polozka.id !== album.id)]);
    setStav("hotovo");
    setVybraneId(album.id);
    void navigate(`/fotky/${album.id}`);
  }

  const datumOtevreneho =
    otevrene !== null && otevrene.expeditionId !== null
      ? (datumVyprav.get(otevrene.expeditionId) ?? null)
      : otevrene?.druh === "vlastni"
        ? "průběžně"
        : null;

  return (
    <main className="mx-auto w-full max-w-[46rem] px-5 pb-8 lg:max-w-[70rem] pt-4 sm:px-6 sm:pt-8 lg:px-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      {albumId === undefined ? (
        <header className="mb-5 flex flex-col gap-5 min-[90rem]:mb-8 min-[90rem]:gap-8">
          <div className="flex items-center justify-between gap-3 min-[90rem]:items-end">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[0.98] min-[90rem]:tracking-[-1.4px]">
                Fotky
              </h1>
              <p className="text-xs text-ink-3 min-[90rem]:hidden">
                {stav === "hotovo" ? souhrnFotek(alba) : "Načítám přehled…"}
              </p>
            </div>
            <div
              className="flex shrink-0 items-center justify-end gap-2 min-[90rem]:gap-2.5"
              data-fotky-nahravaci-spoustice
            >
              <div className="relative hidden w-[232px] min-[90rem]:block">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
                  <Ikona nazev="search" className="size-[17px]" />
                </span>
                <input
                  type="search"
                  value={hledaniAlba}
                  onChange={(udalost) => {
                    setHledaniAlba(udalost.target.value);
                  }}
                  placeholder="Hledat album"
                  autoComplete="off"
                  aria-label="Hledat album"
                  className="block h-[46px] w-full rounded-xl border border-linka bg-povrch pl-10 pr-3.5 text-sm text-inkoust placeholder:text-ink-3 focus:border-pole"
                />
              </div>
              {prihlasen ? (
                <button
                  type="button"
                  data-fotky-rozbal-nahravani
                  aria-expanded={nahravaniOtevreno}
                  onClick={() => {
                    setNahravaniOtevreno(true);
                  }}
                  className={`${fotkyTlacitkoPrimarni} h-11 min-[90rem]:h-[46px] min-[90rem]:gap-2 min-[90rem]:px-[18px]`}
                >
                  <Ikona nazev="upload" className="size-4" />
                  <span className="min-[90rem]:hidden">Nahrát</span>
                  <span className="hidden min-[90rem]:inline">Nahrát fotky</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative min-[90rem]:hidden">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
              <Ikona nazev="search" className="size-4" />
            </span>
            <input
              id="fotky-hledani-alba"
              type="search"
              value={hledaniAlba}
              onChange={(udalost) => {
                setHledaniAlba(udalost.target.value);
              }}
              placeholder="Hledat album"
              autoComplete="off"
              aria-label="Hledat album"
              className="block h-11 w-full rounded-xl border border-linka bg-povrch pl-10 pr-3.5 text-base text-inkoust placeholder:text-ink-4 focus:border-pole"
            />
          </div>

          <div className="flex items-center justify-between gap-3 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Druh alba">
              {SEGMENTY.map((segment) => {
                const vybrany = segmentAlba === segment.id;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    aria-pressed={vybrany}
                    onClick={() => {
                      setSegmentAlba(segment.id);
                    }}
                    className={vybrany ? fotkyChipVybrany : fotkyChipNeaktivni}
                  >
                    {segment.popisek}
                  </button>
                );
              })}
              {albumKos !== undefined ? (
                <Link to={`/fotky/${albumKos.id}`} className={`${fotkyChipNeaktivni} min-[90rem]:hidden`}>
                  Koš
                </Link>
              ) : null}
            </div>
            <div className="hidden shrink-0 items-center gap-[18px] text-[13px] font-medium min-[90rem]:flex">
              <p className="text-ink-3">{stav === "hotovo" ? souhrnFotek(alba) : ""}</p>
              {albumKos !== undefined ? (
                <>
                  <span aria-hidden="true" className="h-4 w-px bg-linka" />
                  <Link
                    to={`/fotky/${albumKos.id}`}
                    className={`${fotkyHoverBgSmrk} -my-2 -mr-3 inline-flex min-h-11 items-center gap-[7px] rounded-xl px-3 text-mech`}
                  >
                    <Ikona nazev="trash-2" className="size-[15px] text-ink-3" />
                    Koš
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </header>
      ) : otevrene !== null ? (
        <header className="mb-5 flex flex-col gap-5 min-[90rem]:mb-8 min-[90rem]:flex-row min-[90rem]:items-end min-[90rem]:justify-between">
          <HlavickaZpet zpet="/fotky" zpetPopisek="Zpět na přehled alb" titulek="Album" className="min-[90rem]:hidden" />
          <div className="flex min-w-0 flex-col gap-5 min-[90rem]:gap-3">
            <ZpetPocitac zpet="/fotky" popisek="Zpět na alba" className="!-mb-2" />
            <h2 className="font-display text-[22px] font-bold tracking-[-0.3px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
              {otevrene.nazev}
            </h2>
            <p className="text-[13px] text-ink-3 min-[90rem]:text-[15px] min-[90rem]:leading-[23px] min-[90rem]:text-mech">
              {metaAlbaDetail(otevrene, datumOtevreneho)}
            </p>
            {jeAlbumNahledu(otevrene.id) ? (
              <p className="max-w-prose text-[13px] leading-[19px] text-mech min-[90rem]:text-[15px] min-[90rem]:leading-[23px]">
                {POPIS_ALBA_NAHLEDU}
              </p>
            ) : null}
          </div>
          {otevrene.druh !== "kos" && !vyberFotek ? (
            <div className="flex gap-2 min-[90rem]:shrink-0 min-[90rem]:flex-row-reverse min-[90rem]:gap-2.5">
              {prihlasen && smiNahratDoAlba(otevrene.id, isAdmin) ? (
                <button
                  type="button"
                  data-fotky-rozbal-nahravani
                  onClick={() => {
                    setNahravaniOtevreno(true);
                  }}
                  className={`${fotkyTlacitkoPrimarni} h-11 flex-1 text-[13.5px] min-[90rem]:h-[46px] min-[90rem]:flex-none min-[90rem]:gap-2 min-[90rem]:px-[18px] min-[90rem]:text-sm`}
                >
                  <Ikona nazev="upload" className="size-4" />
                  <span className="min-[90rem]:hidden">Nahrát</span>
                  <span className="hidden min-[90rem]:inline">Nahrát fotky</span>
                </button>
              ) : null}
              {otevrene.pocetFotek > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      stahovaniAlbaRef.current?.stahniVse();
                    }}
                    className={`${fotkyTlacitkoSekundarni} h-[46px] gap-2 px-[18px] max-[90rem]:hidden`}
                  >
                    <Ikona nazev="download" className="size-4 text-mech" />
                    Stáhnout album
                  </button>
                  <button
                    type="button"
                    data-fotky-vybrat-ke-stazeni
                    onClick={() => {
                      stahovaniAlbaRef.current?.vyberFotky();
                    }}
                    className={`${fotkyTlacitkoSekundarni} h-11 flex-1 text-[13.5px] min-[90rem]:h-[46px] min-[90rem]:flex-none min-[90rem]:gap-2 min-[90rem]:px-[18px] min-[90rem]:text-sm`}
                  >
                    <Ikona nazev="download" className="size-4 min-[90rem]:hidden" />
                    <Ikona nazev="check" className="hidden size-4 text-mech min-[90rem]:block" />
                    <span className="min-[90rem]:hidden">Stáhnout</span>
                    <span className="hidden min-[90rem]:inline">Vybrat fotky</span>
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </header>
      ) : null}


      {otevrene?.druh !== "kos" ? (
        <FotkyNahravaciPanel
          isAdmin={isAdmin}
          alba={albaKNahrani}
          vybraneId={vybraneKNahrani}
          onVyber={setVybraneId}
          onNahrano={poNahrani}
          onVytvoreno={poNovemAlbu}
          rozbalitSekci={rozbalitNahravani}
          onRozbaleno={() => {
            setRozbalitNahravani(null);
          }}
          albumKeSmazani={albumKeSmazani}
          onSmazatAlbum={
            albumKeSmazani !== null
              ? (spoustec) => {
                  otevriSmazaniAlba(albumKeSmazani, spoustec);
                }
              : undefined
          }
          nahravaniOtevreno={nahravaniOtevreno}
          onNahravaniOtevreno={setNahravaniOtevreno}
          albumFormOtevreno={albumFormOtevreno}
          onAlbumFormOtevreno={setAlbumFormOtevreno}
        />
      ) : null}

      <div data-fotky-master-detail>
        <div className="min-w-0 flex-1">
          {albumId !== undefined ? (
            <DetailAlba
              albumId={albumId}
              album={otevrene}
              stavSeznamu={stav}
              chybaSeznamu={chyba}
              obnova={obnova}
              isAdmin={isAdmin}
              onZmenaAlba={() => {
                zneplatniBazenZastupnych();
                void nacti();
              }}
              onZnovu={() => {
                setPokus((hodnota) => hodnota + 1);
              }}
              onNahrati={() => {
                setNahravaniOtevreno(true);
              }}
              onPripravStahovani={pripravStahovani}
              onVyberovyRezim={setVyberFotek}
            />
          ) : (
            <>
              <div className="hidden lg:block">
                {stav === "hotovo" && alba.length > 0 ? (
                  <SeznamAlb
                    alba={albaVPrehledu}
                    stav={stav}
                    chyba={chyba}
                    jeAdmin={isAdmin}
                    prazdnyFiltr={albaVPrehledu.length === 0}
                    zvyraznitNejnovejsi={bezFiltru}
                    datumVyprav={datumVyprav}
                    onZnovu={() => {
                      setPokus((hodnota) => hodnota + 1);
                    }}
                    onZrusitFiltr={zrusFiltrAlb}
                  />
                ) : null}
              </div>
              <div className="lg:hidden">
                <SeznamAlb
                  alba={stav === "hotovo" ? albaVPrehledu : alba}
                  stav={stav}
                  chyba={chyba}
                  jeAdmin={isAdmin}
                  zvyraznitNejnovejsi={bezFiltru}
                  prazdnyFiltr={stav === "hotovo" && alba.length > 0 && albaVPrehledu.length === 0}
                  datumVyprav={datumVyprav}
                  onZnovu={() => {
                    setPokus((hodnota) => hodnota + 1);
                  }}
                  onZrusitFiltr={zrusFiltrAlb}
                />
              </div>
              {stav === "hotovo" || stav === "chyba" || stav === "nacitani" ? (
                <div className="hidden lg:block">
                  <StavSeznamuObsah
                    alba={alba}
                    stav={stav}
                    chyba={chyba}
                    jeAdmin={isAdmin}
                    jenPrazdnyNeboChyba
                    onZnovu={() => {
                      setPokus((hodnota) => hodnota + 1);
                    }}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      {keSmazani !== null ? (
        <ConfirmDialog
          otevreno
          nadpis={`Smazat album „${keSmazani.nazev}"?`}
          popis={`${popisekPoctuFotek(keSmazani.pocetFotek)} v tomto albu budou trvale smazané. Akci nejde vrátit — pokračuj jen pokud jsi si jistý.`}
          potvrditPopisek="Ano, smazat album"
          navratElement={navratPoSmazaniAlbaRef.current}
          zrusitPopisek="Ponechat"
          probiha={maze}
          probihaPopisek="Mažu…"
          chyba={chybaMazani}
          onPotvrdit={() => {
            void potvrdSmazani();
          }}
          onZrusit={() => {
            if (maze) return;
            setKeSmazani(null);
            setChybaMazani(null);
          }}
        />
      ) : null}
    </main>
  );
}

function StavSeznamuObsah({
  alba,
  stav,
  chyba,
  jeAdmin,
  jenPrazdnyNeboChyba,
  onZnovu,
}: {
  alba: readonly ApiAlbum[];
  stav: StavSeznamu;
  chyba: string | null;
  jeAdmin: boolean;
  jenPrazdnyNeboChyba: boolean;
  onZnovu: () => void;
}): JSX.Element | null {
  if (stav === "nacitani" && jenPrazdnyNeboChyba) {
    return (
      <div className="mt-4">
        <KostraAlba pocet={2} />
      </div>
    );
  }
  if (stav === "chyba") {
    return (
      <div role="alert" className="mt-4 rounded-lg border border-linka bg-povrch p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Alba se nepodařilo načíst</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">{chyba}</p>
        <TlacitkoZnovu onZnovu={onZnovu} />
      </div>
    );
  }
  if (alba.length === 0 && stav === "hotovo") {
    return (
      <div role="status" className="mt-4 rounded-lg border-2 border-dashed border-inkoust/40 bg-white/40 p-6 text-center">
        <h2 className="text-base font-bold tracking-tight">Zatím tu nejsou žádná alba</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
          {jeAdmin
            ? "První album založíš přes Nahrát, volba Nové album."
            : "Až vedoucí založí album, objeví se tady."}
        </p>
      </div>
    );
  }
  return null;
}

function SeznamAlb({
  alba,
  stav,
  chyba,
  jeAdmin,
  prazdnyFiltr = false,
  zvyraznitNejnovejsi,
  datumVyprav,
  onZnovu,
  onZrusitFiltr,
}: {
  alba: readonly ApiAlbum[];
  stav: StavSeznamu;
  chyba: string | null;
  jeAdmin: boolean;
  prazdnyFiltr?: boolean;
  /** Počítač: první (nejnovější) album přes dva sloupce. */
  zvyraznitNejnovejsi: boolean;
  datumVyprav: ReadonlyMap<string, string>;
  onZnovu: () => void;
  onZrusitFiltr: () => void;
}): JSX.Element {
  const davky = useNacistDalsi(alba, KARET_NA_DAVKU, String(alba.length));
  const velikosti = velikostiAlb(davky.viditelne, zvyraznitNejnovejsi);
  if (stav === "nacitani") {
    return (
      <KostraAlba pocet={3} />
    );
  }

  if (stav === "chyba") {
    return (
      <div role="alert" className="rounded-lg border border-linka bg-povrch p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Alba se nepodařilo načíst</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">{chyba}</p>
        <TlacitkoZnovu onZnovu={onZnovu} />
      </div>
    );
  }

  if (prazdnyFiltr) {
    return (
      <PrazdnyStav
        ikona={<IkonaLupa />}
        nadpis="Nic jsme nenašli"
        text="Hledání ani filtr neodpovídá žádnému albu."
        akce={{ popisek: "Zrušit filtry", onClick: onZrusitFiltr, varianta: "vedlejsi" }}
      />
    );
  }

  if (alba.length === 0) {
    return (
      <PrazdnyStav
        ikona={<IkonaObrazek />}
        nadpis="Zatím tu nejsou žádná alba"
        text={
          jeAdmin
            ? "První album založíš přes Nahrát, volba Nové album."
            : "Až vedoucí založí album, objeví se tady."
        }
      />
    );
  }

  return (
    <>
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 min-[90rem]:gap-x-5 min-[90rem]:gap-y-7">
      {davky.viditelne.map((album) => {
        const datumRadek =
          album.expeditionId !== null
            ? (datumVyprav.get(album.expeditionId) ?? null)
            : album.druh === "vlastni"
              ? "průběžně"
              : null;
        return (
          <AlbumKarta
            key={`${album.druh}:${album.id}`}
            album={album}
            datumRadek={datumRadek}
            velikost={velikosti.get(album.id)}
          />
        );
      })}
    </ul>
    <NacistDalsi zbyva={davky.zbyva} onClick={davky.nactiDalsi} className="mt-4" />
    </>
  );
}

function DetailAlba({
  albumId,
  album,
  stavSeznamu,
  chybaSeznamu,
  obnova,
  isAdmin,
  onZmenaAlba,
  onZnovu,
  onNahrati,
  onPripravStahovani,
  onVyberovyRezim,
}: {
  albumId: string;
  album: ApiAlbum | null;
  stavSeznamu: StavSeznamu;
  chybaSeznamu: string | null;
  obnova: number;
  isAdmin: boolean;
  onZmenaAlba: () => void;
  onZnovu: () => void;
  onNahrati: () => void;
  onPripravStahovani: (akce: AkceStahovaniAlba) => void;
  onVyberovyRezim: (aktivni: boolean) => void;
}): JSX.Element {
  if (stavSeznamu === "nacitani" && album === null) {
    return (
      <KostraFotky popisek="Načítám album" />
    );
  }

  if (stavSeznamu === "chyba" && album === null) {
    return (
      <div role="alert" className="rounded-lg border border-linka bg-povrch p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Album se nepodařilo načíst</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">{chybaSeznamu}</p>
        <TlacitkoZnovu onZnovu={onZnovu} />
      </div>
    );
  }

  if (album === null) {
    return (
      <div role="status" className="rounded-lg border border-linka bg-povrch p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Tohle album tu není</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
          Zkontroluj odkaz, nebo se vrať na všechna alba.
        </p>
        <Link
          to="/fotky"
          className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} mt-4 rounded-md border border-linka bg-papir px-4 text-sm font-bold lg:hidden`}
        >
          Všechna alba
        </Link>
      </div>
    );
  }

  return (
    <>
      <AlbumFotky
        key={albumId}
        album={album}
        obnova={obnova}
        isAdmin={isAdmin}
        onZmenaAlba={onZmenaAlba}
        skrytVychoziAkce={album.druh !== "kos"}
        onNahrati={onNahrati}
        onPripravStahovani={onPripravStahovani}
        onVyberovyRezim={onVyberovyRezim}
      />
    </>
  );
}
