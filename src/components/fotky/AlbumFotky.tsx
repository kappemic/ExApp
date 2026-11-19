import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import PrazdnyStav from "../PrazdnyStav";
import { IkonaObrazek } from "../SeznamIkony";
import ConfirmDialog from "../kalendar/ConfirmDialog";
import { KostraFotky } from "../StrankaKostra";
import FotkyKosHlavicka from "./FotkyKosHlavicka";
import FotkyMazaciHlavicka from "./FotkyMazaciHlavicka";
import FotkyStahovaciHlavicka from "./FotkyStahovaciHlavicka";
import FotkyNahravaciIkona from "./FotkyNahravaciIkona";
import FotkaDialog from "./FotkaDialog";
import MazaniVyberVrstva from "./MazaniVyberVrstva";
import StahovaniVyberVrstva from "./StahovaniVyberVrstva";
import { useFotkyMazani } from "../../hooks/useFotkyMazani";
import {
  idAktualniFotkyProPotvrzeni,
  idsFotekKObnove,
  idsFotekKeSmazani,
  nadpisPotvrzeniMazaniFotek,
  nadpisPotvrzeniObnovy,
  popisPotvrzeniMazaniFotek,
  popisPotvrzeniObnovy,
  type PotvrzeniObnovyFotek,
} from "../../lib/fotky-mazani";
import { smazFotku } from "../../lib/expedition-fotky";
import { KOS_RETENTION_DAYS } from "../../shared/fotky-kos";
import {
  albumProFotku,
  nactiFotkyAlba,
  obnovFotkuZKose,
  popisekPoctuFotek,
  smazFotkuAlba,
  srcFotkyAlba,
  trvaleSmazFotkuZKose,
  urlSouboruAlba,
  type ApiAlbum,
  type ApiFotkaAlba,
} from "../../lib/alba-api";
import FotkyStavPanel from "./FotkyStavPanel";
import FotkyRadkovaMrizka from "./FotkyRadkovaMrizka";
import PostupnaFotka from "./PostupnaFotka";
import {
  fotkyAlbumToolbarKompaktni,
  fotkyAlbumToolbarZaklad,
  fotkyMrizkaDlazdice,
  fotkyTlacitkoZaklad,
} from "./fotky-ui";
import {
  nazevSouboruAlba,
  nazevSouboruVypravy,
  nazevZipAlba,
} from "../../lib/stahni-fotku";
import { popisekStahovaneFotky, useFotkyStahovani } from "../../hooks/useFotkyStahovani";

interface AlbumFotkyProps {
  album: ApiAlbum;
  /** Bumped after an upload so the grid reloads. */
  obnova: number;
  isAdmin: boolean;
  /** Album list cover/count should refresh after deletes. */
  onZmenaAlba?: () => void;
  /** Journal chrome on the photo lightbox and its confirm dialogs. */
  denik?: boolean;
  /** Pen layout: toolbar icons hidden; actions live in the page header. */
  skrytVychoziAkce?: boolean;
  onNahrati?: () => void;
  onPripravStahniVse?: (stahniVse: () => void) => void;
}

type Stav = "nacitani" | "hotovo" | "chyba";

/** Photos inside one album. A tap opens a large view, not the expedition lightbox. */
/** Selection prompt, then a count once any photo is marked. */
function popisekVyberu(pocet: number, prazdny: string): string {
  if (pocet <= 0) return prazdny;
  if (pocet === 1) return "Vybraná 1 fotka.";
  if (pocet < 5) return `Vybrané ${pocet} fotky.`;
  return `Vybraných ${pocet} fotek.`;
}

export default function AlbumFotky({
  album,
  obnova,
  isAdmin,
  onZmenaAlba,
  denik = false,
  skrytVychoziAkce = false,
  onNahrati,
  onPripravStahniVse,
}: AlbumFotkyProps): JSX.Element {
  const jeKos = album.druh === "kos";
  const [fotky, setFotky] = useState<ApiFotkaAlba[]>([]);
  const [stav, setStav] = useState<Stav>("nacitani");
  const [chyba, setChyba] = useState<string | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [potvrzeniObnovy, setPotvrzeniObnovy] = useState<PotvrzeniObnovyFotek | null>(null);
  const [obnovaAktualniFotkaId, setObnovaAktualniFotkaId] = useState<string | null>(null);
  const [obnovujeSe, setObnovujeSe] = useState<boolean>(false);
  const [obnovaChyba, setObnovaChyba] = useState<string | null>(null);

  const nacist = useCallback(async (): Promise<ApiFotkaAlba[] | null> => {
    setStav("nacitani");
    setChyba(null);
    const vysledek = await nactiFotkyAlba(album.id);
    if (!vysledek.ok) {
      setFotky([]);
      setChyba(vysledek.chyba);
      setStav("chyba");
      return null;
    }
    setFotky(vysledek.data);
    setStav("hotovo");
    return vysledek.data;
  }, [album.id]);

  useEffect(() => {
    let zive = true;
    void (async (): Promise<void> => {
      await nacist();
      if (!zive) return;
    })();
    return () => {
      zive = false;
    };
  }, [nacist, obnova]);

  const smazJednu = useCallback(
    async (fotkaId: string): Promise<{ ok: true } | { ok: false; chyba: string }> => {
      if (jeKos) {
        const vysledek = await trvaleSmazFotkuZKose(fotkaId);
        return vysledek.ok ? { ok: true } : { ok: false, chyba: vysledek.chyba };
      }
      if (album.druh === "vyprava" && album.expeditionId !== null) {
        const vysledek = await smazFotku(album.expeditionId, fotkaId);
        return vysledek.ok ? { ok: true } : { ok: false, chyba: vysledek.chyba };
      }
      const vysledek = await smazFotkuAlba(album.id, fotkaId);
      return vysledek.ok ? { ok: true } : { ok: false, chyba: vysledek.chyba };
    },
    [album.druh, album.expeditionId, album.id, jeKos],
  );

  const poSmazani = useCallback(
    async (
      smazaneIds: readonly string[],
      potvrzeni: import("../../lib/fotky-mazani").PotvrzeniMazaniFotek | null,
    ): Promise<void> => {
      const bylAktualni = potvrzeni === "aktualni";
      const puvodniIndex = index;
      onZmenaAlba?.();
      const nove = await nacist();
      if (bylAktualni && puvodniIndex !== null && nove !== null) {
        if (nove.length === 0) {
          setIndex(null);
        } else {
          setIndex(Math.min(puvodniIndex, nove.length - 1));
        }
        return;
      }
      if (smazaneIds.length > 0) setIndex(null);
    },
    [index, nacist, onZmenaAlba],
  );

  const mazani = useFotkyMazani(fotky, smazJednu, poSmazani);

  const pripravStahovani = useCallback(
    (ids: readonly string[]) => ({
      nazevZip: nazevZipAlba(album.id, album.nazev),
      polozky: ids.map((fotkaId) => {
        const fotka = fotky.find((polozka) => polozka.id === fotkaId);
        const kontext =
          fotka !== undefined && jeKos ? albumProFotku(fotka) : album;
        const url = urlSouboruAlba(kontext, fotkaId);
        const nazevSouboru =
          kontext.druh === "vyprava" && kontext.expeditionId !== null
            ? nazevSouboruVypravy(kontext.expeditionId, fotkaId)
            : nazevSouboruAlba(kontext.id, fotkaId);
        return {
          url,
          nazevSouboru,
          popisek: popisekStahovaneFotky(nazevSouboru),
        };
      }),
    }),
    [album, fotky, jeKos],
  );

  const stahovani = useFotkyStahovani(fotky, pripravStahovani);
  const stahniVseRef = useRef(stahovani.provedStahovani);
  stahniVseRef.current = stahovani.provedStahovani;

  useEffect(() => {
    if (onPripravStahniVse === undefined) return;
    onPripravStahniVse(() => {
      void stahniVseRef.current("vse");
    });
  }, [onPripravStahniVse, stav, fotky.length]);

  const vyberovyRezim = mazani.mazaciRezim || (!jeKos && stahovani.stahovaciRezim);

  const resetKosPotvrzeni = useCallback((): void => {
    setPotvrzeniObnovy(null);
    setObnovaAktualniFotkaId(null);
    setObnovaChyba(null);
  }, []);

  const provedObnovu = useCallback(async (): Promise<void> => {
    if (potvrzeniObnovy === null) return;
    const aktualniId = idAktualniFotkyProPotvrzeni(
      obnovaAktualniFotkaId,
      index !== null ? (fotky[index]?.id ?? null) : null,
    );
    const ids = idsFotekKObnove(fotky, mazani.vybrane, potvrzeniObnovy, aktualniId);
    if (ids.length === 0) {
      setPotvrzeniObnovy(null);
      return;
    }
    setObnovaChyba(null);
    setObnovujeSe(true);
    const obnovene = new Set<string>();
    let selhani: string | null = null;
    for (const fotkaId of ids) {
      const vysledek = await obnovFotkuZKose(fotkaId);
      if (!vysledek.ok) {
        selhani = vysledek.chyba;
        break;
      }
      obnovene.add(fotkaId);
    }
    setObnovujeSe(false);
    if (obnovene.size > 0) {
      onZmenaAlba?.();
      const puvodniIndex = index;
      const bylAktualni = potvrzeniObnovy === "aktualni";
      const nove = await nacist();
      if (bylAktualni && puvodniIndex !== null && nove !== null) {
        if (nove.length === 0) setIndex(null);
        else setIndex(Math.min(puvodniIndex, nove.length - 1));
      } else if (obnovene.size > 0) {
        setIndex(null);
      }
    }
    if (selhani !== null) {
      setObnovaChyba(selhani);
      return;
    }
    setPotvrzeniObnovy(null);
    setObnovaAktualniFotkaId(null);
    mazani.resetMazani();
    resetKosPotvrzeni();
  }, [
    fotky,
    index,
    mazani,
    nacist,
    obnovaAktualniFotkaId,
    onZmenaAlba,
    potvrzeniObnovy,
    resetKosPotvrzeni,
  ]);

  const zacniMazani = useCallback((): void => {
    stahovani.resetStahovani();
    resetKosPotvrzeni();
    mazani.zacniMazani();
  }, [mazani, resetKosPotvrzeni, stahovani]);

  const zacniStahovani = useCallback((): void => {
    mazani.resetMazani();
    resetKosPotvrzeni();
    stahovani.zacniStahovani();
  }, [mazani, resetKosPotvrzeni, stahovani]);

  useEffect(() => {
    setIndex(null);
    resetKosPotvrzeni();
    mazani.resetMazani();
    stahovani.resetStahovani();
  }, [album.id, obnova]);

  const aktualniFotkaId = index !== null ? (fotky[index]?.id ?? null) : null;
  const lightboxOtevren = index !== null;
  const potvrzeniNadLightboxem =
    mazani.potvrzeni !== null || potvrzeniObnovy !== null;

  const efektivniAktualniFotkaId = idAktualniFotkyProPotvrzeni(
    mazani.potvrzeniAktualniId,
    aktualniFotkaId,
  );
  const efektivniObnovaAktualniId = idAktualniFotkyProPotvrzeni(
    obnovaAktualniFotkaId,
    aktualniFotkaId,
  );

  const potvrzeniPocet =
    mazani.potvrzeni === null
      ? 0
      : idsFotekKeSmazani(
          fotky,
          mazani.vybrane,
          mazani.potvrzeni,
          efektivniAktualniFotkaId,
        ).length;

  const obnovaPocet =
    potvrzeniObnovy === null
      ? 0
      : idsFotekKObnove(
          fotky,
          mazani.vybrane,
          potvrzeniObnovy,
          efektivniObnovaAktualniId,
        ).length;

  const doKose = !jeKos;

  const toolbarRezimTrida =
    mazani.mazaciRezim && jeKos
      ? "border-smrk/50 bg-smrk/5"
      : mazani.mazaciRezim
        ? "border-jantar/60 bg-jantar/5"
        : stahovani.stahovaciRezim
          ? "border-smrk/60 bg-smrk/5"
          : "border-linka";

  const akceRowTrida =
    "flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto";

  if (stav === "nacitani") {
    return <KostraFotky />;
  }

  if (stav === "chyba") {
    return (
      <div role="alert" className="rounded-lg border border-linka bg-povrch p-5 text-center shadow-denik">
        <h2 className="text-base font-bold tracking-tight">Fotky se nepodařilo načíst</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">{chyba}</p>
      </div>
    );
  }

  if (fotky.length === 0) {
    return (
      <PrazdnyStav
        ikona={<IkonaObrazek />}
        nadpis={jeKos ? "Koš je prázdný" : "V albu zatím nejsou fotky"}
        text={
          jeKos
            ? `Fotky v koši se po ${KOS_RETENTION_DAYS} dnech smažou natrvalo.`
            : "Přidej první fotky tlačítkem Nahrát."
        }
      >
        {isAdmin && !jeKos && onNahrati === undefined ? (
          <FotkyNahravaciIkona
            albumId={album.id}
            onNahrano={() => {
              onZmenaAlba?.();
              void nacist();
            }}
          />
        ) : undefined}
      </PrazdnyStav>
    );
  }

  const hlavickaMazani = (
    <FotkyMazaciHlavicka
      isAdmin={isAdmin}
      maFotky={fotky.length > 0}
      mazaciRezim={mazani.mazaciRezim}
      vybranyPocet={mazani.vybrane.size}
      mazeSe={mazani.mazeSe}
      onZacniMazani={zacniMazani}
      onZrusMazani={mazani.zrusMazani}
      onSmazatVybrane={() => {
        mazani.otevriPotvrzeni("vybrane");
      }}
      onSmazatVse={() => {
        mazani.otevriPotvrzeni("vse");
      }}
    />
  );

  const hlavickaKos = (
    <FotkyKosHlavicka
      maFotky={fotky.length > 0}
      spravovaciRezim={mazani.mazaciRezim}
      vybranyPocet={mazani.vybrane.size}
      pracujeSe={mazani.mazeSe || obnovujeSe}
      onZacniSpravovat={zacniMazani}
      onZrusit={() => {
        mazani.zrusMazani();
        resetKosPotvrzeni();
      }}
      onObnovitVybrane={() => {
        setPotvrzeniObnovy("vybrane");
      }}
      onObnovitVse={() => {
        setPotvrzeniObnovy("vse");
      }}
      onSmazatNatrvaloVybrane={() => {
        mazani.otevriPotvrzeni("natrvalo_vybrane");
      }}
      onSmazatNatrvaloVse={() => {
        mazani.otevriPotvrzeni("natrvalo_vse");
      }}
    />
  );

  const hlavickaStahovani = (
    <FotkyStahovaciHlavicka
      maFotky={fotky.length > 0}
      stahovaciRezim={stahovani.stahovaciRezim}
      vybranyPocet={stahovani.vybrane.size}
      stahujeSe={stahovani.stahujeSe}
      onZacniStahovani={zacniStahovani}
      onZrusStahovani={stahovani.zrusStahovani}
      onStahnoutVybrane={() => {
        void stahovani.provedStahovani("vybrane");
      }}
      onStahnoutVse={() => {
        void stahovani.provedStahovani("vse");
      }}
    />
  );

  return (
    <>
      {index === null && (!skrytVychoziAkce || vyberovyRezim) ? (
        <>
          <div
            className={`${fotkyAlbumToolbarZaklad} px-3 py-2.5 ${toolbarRezimTrida} ${
              vyberovyRezim && !mazani.mazaciRezim && !stahovani.stahovaciRezim
                ? fotkyAlbumToolbarKompaktni
                : ""
            } ${vyberovyRezim ? "" : "max-sm:flex-row max-sm:items-center max-sm:justify-between"}`}
            data-fotky-album-toolbar
            {...(jeKos && mazani.mazaciRezim ? { "data-kos-sprava": "" } : {})}
          >
            <p
              data-fotky-album-toolbar-nadpis
              className="min-w-0 flex-1 text-sm font-semibold leading-snug text-inkoust"
            >
              {mazani.mazaciRezim
                ? jeKos
                  ? popisekVyberu(mazani.vybrane.size, "Vyber fotky v koši.")
                  : popisekVyberu(mazani.vybrane.size, "Vyber fotky ke smazání.")
                : stahovani.stahovaciRezim
                  ? popisekVyberu(stahovani.vybrane.size, "Vyber fotky ke stažení.")
                  : popisekPoctuFotek(fotky.length)}
            </p>
            <div
              data-fotky-album-akce-row
              className={`${akceRowTrida}${vyberovyRezim ? "" : " max-sm:w-auto max-sm:shrink-0 max-sm:flex-nowrap max-sm:gap-1.5"}`}
            >
              {jeKos ? (
                isAdmin ? hlavickaKos : null
              ) : mazani.mazaciRezim ? (
                hlavickaMazani
              ) : stahovani.stahovaciRezim ? (
                hlavickaStahovani
              ) : (
                <>
                  {isAdmin && !jeKos && !skrytVychoziAkce ? (
                    <FotkyNahravaciIkona
                      albumId={album.id}
                      onNahrano={() => {
                        onZmenaAlba?.();
                        void nacist();
                      }}
                    />
                  ) : null}
                  {!skrytVychoziAkce ? hlavickaStahovani : null}
                  {hlavickaMazani}
                </>
              )}
            </div>
          </div>
          {jeKos && !mazani.mazaciRezim && fotky.length > 0 ? (
            <p className="px-1 pb-1 text-center text-xs leading-relaxed text-inkoust/65">
              Fotky v koši se po {KOS_RETENTION_DAYS} dnech smažou natrvalo.
            </p>
          ) : null}
        </>
      ) : null}

      {stahovani.stahovatChyba !== null ? (
        <p role="alert" className="mb-3 text-sm font-semibold text-inkoust">
          {stahovani.stahovatChyba}
        </p>
      ) : null}

      <FotkyRadkovaMrizka
        fotky={fotky}
        karty
        className="w-full"
        render={(fotka, _rozmer, nahlasRozmer) => {
          const src = srcFotkyAlba(album, fotka);
          const poradi = fotky.findIndex((polozka) => polozka.id === fotka.id);
          const vybrana =
            (mazani.mazaciRezim && mazani.vybrane.has(fotka.id)) ||
            (stahovani.stahovaciRezim && stahovani.vybrane.has(fotka.id));
          const jeNahled = fotka.jeNahled;
          if (mazani.mazaciRezim) {
            return (
              <button
                type="button"
                aria-pressed={vybrana}
                aria-current={jeNahled ? "true" : undefined}
                aria-label={jeKos ? "Vybrat fotku v koši" : "Vybrat fotku ke smazání"}
                onClick={() => {
                  mazani.prepniVyber(fotka.id);
                }}
                className={`group ${fotkyMrizkaDlazdice}`}
              >
                <Miniatura src={src} onRozmer={nahlasRozmer} />
                <MazaniVyberVrstva vybrana={vybrana} />
              </button>
            );
          }
          if (!jeKos && stahovani.stahovaciRezim) {
            return (
              <button
                type="button"
                aria-pressed={vybrana}
                aria-current={jeNahled ? "true" : undefined}
                aria-label="Vybrat fotku ke stažení"
                onClick={() => {
                  stahovani.prepniVyber(fotka.id);
                }}
                className={`group ${fotkyMrizkaDlazdice}`}
              >
                <Miniatura src={src} onRozmer={nahlasRozmer} />
                <StahovaniVyberVrstva vybrana={vybrana} />
              </button>
            );
          }
          return (
            <FotoTlacitko
              src={src}
              poradi={poradi}
              celkem={fotky.length}
              onRozmer={nahlasRozmer}
              onOtevrit={() => {
                setIndex(poradi);
              }}
            />
          );
        }}
      />

      {mazani.mazatChyba !== null ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-inkoust">
          {mazani.mazatChyba}
        </p>
      ) : null}

      {stahovani.galeriePripravena ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm leading-snug text-inkoust">Fotky jsou připravené. Ulož je do galerie telefonu.</p>
          <button
            type="button"
            onClick={() => {
              void stahovani.ulozDoGalerie();
            }}
            disabled={stahovani.stahujeSe}
            className={`${fotkyTlacitkoZaklad} rounded-md bg-smrk px-4 text-sm font-bold text-papir disabled:opacity-60`}
          >
            Uložit do galerie
          </button>
        </div>
      ) : null}

      {index !== null ? (
        <FotkaDialog
          album={album}
          fotky={fotky}
          index={index}
          onIndex={setIndex}
          onZavrit={() => {
            setIndex(null);
          }}
          denik={denik}
          isAdmin={isAdmin}
          mazeSe={mazani.mazeSe || obnovujeSe}
          jeKos={jeKos}
          drzOtevrene={lightboxOtevren && potvrzeniNadLightboxem}
          onSmazatAktualni={
            isAdmin && !jeKos
              ? () => {
                  mazani.otevriPotvrzeni("aktualni", aktualniFotkaId);
                }
              : undefined
          }
          onObnovitAktualni={
            isAdmin && jeKos
              ? () => {
                  setObnovaAktualniFotkaId(aktualniFotkaId);
                  setPotvrzeniObnovy("aktualni");
                }
              : undefined
          }
          onSmazatNatrvaloAktualni={
            isAdmin && jeKos
              ? () => {
                  mazani.otevriPotvrzeni("aktualni", aktualniFotkaId);
                }
              : undefined
          }
        />
      ) : null}

      <FotkyStavPanel
        rezim="stahovani"
        polozky={stahovani.operacePolozky}
        viditelny={stahovani.operacePolozky.length > 0}
        probiha={stahovani.stahujeSe}
      />

      {mazani.potvrzeni !== null ? (
        <ConfirmDialog
          otevreno
          vrstva={potvrzeniNadLightboxem ? "nad-lightboxem" : "normal"}
          nadpis={nadpisPotvrzeniMazaniFotek(mazani.potvrzeni, doKose)}
          popis={popisPotvrzeniMazaniFotek(mazani.potvrzeni, potvrzeniPocet, doKose)}
          potvrditPopisek={jeKos ? "Ano, smazat natrvalo" : "Ano, smazat"}
          zrusitPopisek="Ponechat"
          probiha={mazani.mazeSe}
          probihaPopisek="Mažu…"
          chyba={mazani.mazatChyba}
          onPotvrdit={() => {
            void mazani.provedMazani(aktualniFotkaId);
          }}
          onZrusit={mazani.zavriPotvrzeni}
        />
      ) : null}

      {potvrzeniObnovy !== null ? (
        <ConfirmDialog
          otevreno
          vrstva={potvrzeniNadLightboxem ? "nad-lightboxem" : "normal"}
          nadpis={nadpisPotvrzeniObnovy(potvrzeniObnovy)}
          popis={popisPotvrzeniObnovy(potvrzeniObnovy, obnovaPocet)}
          potvrditPopisek="Ano, obnovit"
          zrusitPopisek="Ponechat"
          probiha={obnovujeSe}
          probihaPopisek="Obnovuji…"
          chyba={obnovaChyba}
          onPotvrdit={() => {
            void provedObnovu();
          }}
          onZrusit={() => {
            if (obnovujeSe) return;
            setPotvrzeniObnovy(null);
            setObnovaAktualniFotkaId(null);
            setObnovaChyba(null);
          }}
        />
      ) : null}

      {obnovaChyba !== null && potvrzeniObnovy === null ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-inkoust">
          {obnovaChyba}
        </p>
      ) : null}
    </>
  );
}

function Miniatura({
  src,
  onRozmer,
}: {
  src: string;
  onRozmer: (sirka: number, vyska: number) => void;
}): JSX.Element {
  const [rozbita, setRozbita] = useState<boolean>(false);
  const ukaz = src.length > 0 && !rozbita;
  return ukaz ? (
    <PostupnaFotka
      src={src}
      alt=""
      loading="lazy"
      className="absolute inset-0 h-full w-full object-cover"
      onRozmer={onRozmer}
      onError={() => {
        setRozbita(true);
      }}
    />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center bg-inkoust/5 text-xs font-semibold text-inkoust/60">
      Chyba
    </span>
  );
}

function FotoTlacitko({
  src,
  poradi,
  celkem,
  onRozmer,
  onOtevrit,
}: {
  src: string;
  poradi: number;
  celkem: number;
  onRozmer: (sirka: number, vyska: number) => void;
  onOtevrit: () => void;
}): JSX.Element {
  const [rozbita, setRozbita] = useState<boolean>(false);
  const ukaz = src.length > 0 && !rozbita;
  const popisek = `Otevřít fotku ${poradi + 1} z ${celkem}`;

  return (
    <button
      type="button"
      onClick={onOtevrit}
      aria-label={popisek}
      className={`${fotkyMrizkaDlazdice} bg-inkoust/5`}
    >
      {ukaz ? (
        <PostupnaFotka
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onRozmer={onRozmer}
          onError={() => {
            setRozbita(true);
          }}
        />
      ) : null}
    </button>
  );
}
