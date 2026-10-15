import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import AlbumFotky from "../components/fotky/AlbumFotky";
import AlbumKarta from "../components/fotky/AlbumKarta";
import FotkyNahravaciPanel from "../components/fotky/FotkyNahravaciPanel";
import SlozkySeznam from "../components/fotky/SlozkySeznam";
import { useAuth } from "../hooks/useAuth";
import { fotkyHoverBgLinka, fotkyTlacitkoZaklad } from "../components/fotky/fotky-ui";
import {
  nactiAlba,
  popisekDruhu,
  popisekPoctuFotek,
  smazAlbum,
  type ApiAlbum,
} from "../lib/alba-api";

type StavSeznamu = "nacitani" | "hotovo" | "chyba";

type FotkyNavigacniStav = {
  rozbalNahravani?: boolean;
  ciloveAlbumId?: string;
};

export default function FotkyPage(): JSX.Element {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [alba, setAlba] = useState<ApiAlbum[]>([]);
  const [stav, setStav] = useState<StavSeznamu>("nacitani");
  const [chyba, setChyba] = useState<string | null>(null);
  const [vybraneId, setVybraneId] = useState<string>("");
  const [obnova, setObnova] = useState<number>(0);
  const [pokus, setPokus] = useState<number>(0);
  const [keSmazani, setKeSmazani] = useState<ApiAlbum | null>(null);
  const [maze, setMaze] = useState<boolean>(false);
  const [chybaMazani, setChybaMazani] = useState<string | null>(null);
  const [rozbalitNahravani, setRozbalitNahravani] = useState<"nahravani" | null>(null);
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
  const zobrazitSlozky = stav === "hotovo" && alba.length > 0;
  const vybraneAlbumId = albumId ?? vybraneId;
  const albumKeSmazani =
    isAdmin && otevrene !== null && otevrene.druh === "vlastni"
      ? otevrene
      : isAdmin
        ? (alba.find((album) => album.id === vybraneId && album.druh === "vlastni") ?? null)
        : null;

  function poNahrani(): void {
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

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pt-10">
      <header className="border-b-2 border-inkoust pb-5">
        {albumId === undefined ? (
          <p className="text-sm font-medium text-mech">Školní expediční klub</p>
        ) : (
          <Link
            to="/fotky"
            data-fotky-nav-prephed-alb
            className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} lg:hidden -ml-1 mb-1 inline-flex w-auto gap-1.5 rounded-md px-1.5 text-sm font-semibold text-mech`}
          >
            <span aria-hidden="true">←</span>
            Přehled alb
          </Link>
        )}
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {otevrene !== null ? otevrene.nazev : "Fotky"}
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          {otevrene !== null
            ? `${popisekDruhu(otevrene.druh)} · ${popisekPoctuFotek(otevrene.pocetFotek)}`
            : "Alba z výprav a další alba klubu."}
        </p>
      </header>

      <div className="mt-6">
        {otevrene?.druh !== "kos" ? (
        <FotkyNahravaciPanel
          isAdmin={isAdmin}
          alba={alba.filter((polozka) => polozka.druh !== "kos")}
          vybraneId={vybraneAlbumId}
          onVyber={setVybraneId}
          onNahrano={poNahrani}
          onVytvoreno={poNovemAlbu}
          rozbalitSekci={albumId === undefined ? rozbalitNahravani : null}
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
        />
        ) : null}
      </div>

      <div className="mt-6 lg:flex lg:items-start lg:gap-6" data-fotky-master-detail>
        {zobrazitSlozky ? (
          <aside className="hidden min-w-0 shrink-0 lg:block lg:w-72 xl:w-80">
            <SlozkySeznam alba={alba} aktivniId={albumId} />
          </aside>
        ) : null}

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
                void nacti();
              }}
              onZnovu={() => {
                setPokus((hodnota) => hodnota + 1);
              }}
            />
          ) : (
            <>
              <div className="hidden lg:block">
                {stav === "hotovo" && alba.length > 0 ? (
                  <div
                    role="status"
                    className="rounded-lg border-2 border-dashed border-inkoust/35 bg-white/40 p-8 text-center"
                  >
                    <h2 className="text-base font-bold tracking-tight">Vyber složku vlevo</h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
                      Klikni na album ve složkách a uvidíš jeho fotky.
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="lg:hidden">
                <SeznamAlb
                  alba={alba}
                  stav={stav}
                  chyba={chyba}
                  jeAdmin={isAdmin}
                  onZnovu={() => {
                    setPokus((hodnota) => hodnota + 1);
                  }}
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
      <div role="status" aria-label="Načítám alba" className="mt-4 space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border-2 border-inkoust/20 bg-white/60" />
        ))}
      </div>
    );
  }
  if (stav === "chyba") {
    return (
      <div role="alert" className="mt-4 rounded-lg border-2 border-inkoust bg-white/60 p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Alba se nepodařilo načíst</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">{chyba}</p>
        <button
          type="button"
          onClick={onZnovu}
          className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} mt-4 rounded-md border-2 border-inkoust bg-papir px-4 text-sm font-bold`}
        >
          Zkusit znovu
        </button>
      </div>
    );
  }
  if (alba.length === 0 && stav === "hotovo") {
    return (
      <div role="status" className="mt-4 rounded-lg border-2 border-dashed border-inkoust/40 bg-white/40 p-6 text-center">
        <h2 className="text-base font-bold tracking-tight">Zatím tu nejsou žádná alba</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
          {jeAdmin
            ? "Založ první album tlačítkem Nové album."
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
  onZnovu,
}: {
  alba: readonly ApiAlbum[];
  stav: StavSeznamu;
  chyba: string | null;
  jeAdmin: boolean;
  onZnovu: () => void;
}): JSX.Element {
  if (stav === "nacitani") {
    return (
      <div role="status" aria-label="Načítám alba" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-lg border-2 border-inkoust/20 bg-white/60" />
        ))}
      </div>
    );
  }

  if (stav === "chyba") {
    return (
      <div role="alert" className="rounded-lg border-2 border-inkoust bg-white/60 p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Alba se nepodařilo načíst</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">{chyba}</p>
        <button
          type="button"
          onClick={onZnovu}
          className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} mt-4 rounded-md border-2 border-inkoust bg-papir px-4 text-sm font-bold`}
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (alba.length === 0) {
    return (
      <div role="status" className="rounded-lg border-2 border-dashed border-inkoust/40 bg-white/40 p-6 text-center">
        <h2 className="text-base font-bold tracking-tight">Zatím tu nejsou žádná alba</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
          {jeAdmin
            ? "Založ první album tlačítkem Nové album."
            : "Až vedoucí založí album, objeví se tady."}
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {alba.map((album) => (
        <AlbumKarta key={`${album.druh}:${album.id}`} album={album} />
      ))}
    </ul>
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
}: {
  albumId: string;
  album: ApiAlbum | null;
  stavSeznamu: StavSeznamu;
  chybaSeznamu: string | null;
  obnova: number;
  isAdmin: boolean;
  onZmenaAlba: () => void;
  onZnovu: () => void;
}): JSX.Element {
  if (stavSeznamu === "nacitani" && album === null) {
    return (
      <p role="status" aria-busy="true" className="text-sm text-inkoust/70">
        Načítám album…
      </p>
    );
  }

  if (stavSeznamu === "chyba" && album === null) {
    return (
      <div role="alert" className="rounded-lg border-2 border-inkoust bg-white/60 p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Album se nepodařilo načíst</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">{chybaSeznamu}</p>
        <button
          type="button"
          onClick={onZnovu}
          className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} mt-4 rounded-md border-2 border-inkoust bg-papir px-4 text-sm font-bold`}
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (album === null) {
    return (
      <div role="status" className="rounded-lg border-2 border-inkoust bg-white/60 p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Tohle album tu není</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
          Zkontroluj odkaz, nebo se vrať na všechna alba.
        </p>
        <Link
          to="/fotky"
          className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} mt-4 rounded-md border-2 border-inkoust bg-papir px-4 text-sm font-bold lg:hidden`}
        >
          Všechna alba
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border-2 border-inkoust bg-white/40 p-3 shadow-denik sm:p-4 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <AlbumFotky
          key={albumId}
          album={album}
          obnova={obnova}
          isAdmin={isAdmin}
          onZmenaAlba={onZmenaAlba}
        />
      </div>
    </>
  );
}
