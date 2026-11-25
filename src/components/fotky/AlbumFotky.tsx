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
import ListaVyberu, { TlacitkoVyberu } from "./ListaVyberu";
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
import { smiNahratDoAlba } from "../../shared/fotky-nahledy";
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
import { useNahravaniAlba } from "../../lib/nahravani-fotek";
import FotkyStavPanel from "./FotkyStavPanel";
import FotkyRadkovaMrizka from "./FotkyRadkovaMrizka";
import PostupnaFotka from "./PostupnaFotka";
import {
  fotkyAlbumToolbarZaklad,
  fotkyMrizkaDlazdice,
} from "./fotky-ui";
import {
  nazevSouboruAlba,
  nazevSouboruVypravy,
  nazevZipAlba,
} from "../../lib/stahni-fotku";
import { jeVybranoVse } from "../../lib/fotky-stahovani";
import { useSledovaniNovych } from "../../hooks/useSledovaniNovych";
import { popisekStahovaneFotky, useFotkyStahovani } from "../../hooks/useFotkyStahovani";

export interface AkceAlba {
  vyberFotky: () => void;
  odstranFotky: () => void;
}

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
  /** Hands the album actions to the page header. */
  onPripravAkce?: (akce: AkceAlba) => void;
  /** Prompt of the selection mode for the page header, null when it is off. */
  onVyberovyRezim?: (popisek: string | null) => void;
  /** Place in the page header where the selection buttons go. Null until it mounts. */
  cilVyberu?: HTMLElement | null;
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
  onPripravAkce,
  onVyberovyRezim,
  cilVyberu,
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

  const nahravani = useNahravaniAlba(album.id);
  const prvniObnova = useRef(obnova);
  const posledniNacteni = useRef(0);
  const konecRef = useRef<HTMLDivElement>(null);

  /** Tiché načtení nechá na místě současné fotky, dokud nepřijdou nové. */
  const nacist = useCallback(async (tise = false): Promise<ApiFotkaAlba[] | null> => {
    if (!tise) {
      setStav("nacitani");
      setChyba(null);
    }
    posledniNacteni.current += 1;
    const poradi = posledniNacteni.current;
    const vysledek = await nactiFotkyAlba(album.id);
    // Během nahrávání se načítá po každé fotce, starší odpověď nesmí přepsat novější.
    if (poradi !== posledniNacteni.current) return null;
    if (!vysledek.ok) {
      if (tise) {
        setStav((aktualni) => (aktualni === "hotovo" ? "hotovo" : "chyba"));
        setChyba(vysledek.chyba);
        return null;
      }
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
      await nacist(obnova !== prvniObnova.current);
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
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  const zacniStahovaniRef = useRef(zacniStahovani);
  zacniStahovaniRef.current = zacniStahovani;
  const zacniMazaniRef = useRef(zacniMazani);
  zacniMazaniRef.current = zacniMazani;

  useEffect(() => {
    if (onPripravAkce === undefined) return;
    const maFotky = stav === "hotovo" && fotky.length > 0;
    onPripravAkce({
      vyberFotky: () => {
        if (maFotky) zacniStahovaniRef.current();
      },
      odstranFotky: () => {
        if (maFotky) zacniMazaniRef.current();
      },
    });
  }, [onPripravAkce, stav, fotky.length]);

  const popisekRezimu = !vyberovyRezim
    ? null
    : mazani.mazaciRezim
      ? popisekVyberu(mazani.vybrane.size, "Vyber fotky ke smazání.")
      : stahovani.galeriePripravena
        ? "Fotky jsou připravené. Ulož je do galerie telefonu."
        : popisekVyberu(stahovani.vybrane.size, "Vyber fotky ke stažení.");

  useEffect(() => {
    onVyberovyRezim?.(popisekRezimu);
  }, [onVyberovyRezim, popisekRezimu]);

  useEffect(
    () => () => {
      onVyberovyRezim?.(null);
    },
    [onVyberovyRezim],
  );

  useEffect(() => {
    // The button that started the mode leaves the page with the header actions.
    if (vyberovyRezim) toolbarRef.current?.focus({ preventScroll: true });
  }, [vyberovyRezim]);

  useEffect(() => {
    setIndex(null);
    resetKosPotvrzeni();
    mazani.resetMazani();
    stahovani.resetStahovani();
  }, [album.id]);

  useSledovaniNovych(konecRef, fotky.length, nahravani !== null && index === null && !vyberovyRezim);

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
      ? "border-smrk/50"
      : mazani.mazaciRezim
        ? "border-akcent/40"
        : stahovani.stahovaciRezim
          ? "border-smrk/50"
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
    if (nahravani !== null) return <></>;
    return (
      <PrazdnyStav
        ikona={<IkonaObrazek />}
        nadpis={jeKos ? "Koš je prázdný" : "V albu zatím nejsou fotky"}
        text={
          jeKos
            ? `Fotky v koši se po ${KOS_RETENTION_DAYS} dnech smažou natrvalo.`
            : smiNahratDoAlba(album.id, isAdmin)
              ? "Přidej první fotky tlačítkem Nahrát."
              : "Fotky sem přidávají vedoucí."
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
      vybranoVse={jeVybranoVse(fotky, stahovani.vybrane)}
      galeriePripravena={stahovani.galeriePripravena}
      onPrepnoutVse={stahovani.prepniVyberVse}
      onUlozitDoGalerie={() => {
        void stahovani.ulozDoGalerie();
      }}
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
      {cilVyberu !== undefined && vyberovyRezim && !jeKos ? (
        cilVyberu === null ? null : mazani.mazaciRezim ? (
          <ListaVyberu
            cil={cilVyberu}
            popisek="Mazání fotek"
            vybranoVse={jeVybranoVse(fotky, mazani.vybrane)}
            probiha={mazani.mazeSe}
            onZrusit={mazani.zrusMazani}
            onPrepnoutVse={mazani.prepniVyberVse}
          >
            <TlacitkoVyberu
              druh="smazat"
              disabled={mazani.vybrane.size === 0 || mazani.mazeSe}
              onClick={() => {
                mazani.otevriPotvrzeni("vybrane");
              }}
            >
              {mazani.vybrane.size > 0 ? `Smazat ${mazani.vybrane.size}` : "Smazat"}
            </TlacitkoVyberu>
          </ListaVyberu>
        ) : (
          <ListaVyberu
            cil={cilVyberu}
            popisek="Stahování fotek"
            vybranoVse={jeVybranoVse(fotky, stahovani.vybrane)}
            probiha={stahovani.stahujeSe}
            onZrusit={stahovani.zrusStahovani}
            onPrepnoutVse={stahovani.prepniVyberVse}
          >
            {stahovani.galeriePripravena ? (
              <TlacitkoVyberu
                druh="stahnout"
                disabled={stahovani.stahujeSe}
                onClick={() => {
                  void stahovani.ulozDoGalerie();
                }}
              >
                Do galerie
              </TlacitkoVyberu>
            ) : (
              <TlacitkoVyberu
                druh="stahnout"
                disabled={stahovani.vybrane.size === 0 || stahovani.stahujeSe}
                onClick={() => {
                  void stahovani.provedStahovani("vybrane");
                }}
              >
                {stahovani.stahujeSe
                  ? "Stahuji…"
                  : stahovani.vybrane.size > 0
                    ? `Stáhnout ${stahovani.vybrane.size}`
                    : "Stáhnout"}
              </TlacitkoVyberu>
            )}
          </ListaVyberu>
        )
      ) : index === null && (!skrytVychoziAkce || vyberovyRezim) ? (
        <>
          <div
            className={`${fotkyAlbumToolbarZaklad} p-3 outline-none! ${toolbarRezimTrida} ${vyberovyRezim ? "" : "max-sm:flex-row max-sm:items-center max-sm:justify-between"}`}
            ref={toolbarRef}
            tabIndex={-1}
            role="group"
            aria-label="Akce s fotkami"
            data-fotky-album-toolbar
            {...(jeKos && mazani.mazaciRezim ? { "data-kos-sprava": "" } : {})}
          >
            <p
              data-fotky-album-toolbar-nadpis
              aria-live="polite"
              className={`min-w-0 flex-1 px-1 text-sm leading-snug ${
                jeKos && !vyberovyRezim ? "text-mech" : "font-semibold text-inkoust"
              }`}
            >
              {mazani.mazaciRezim ? (
                jeKos
                  ? popisekVyberu(mazani.vybrane.size, "Vyber fotky v koši.")
                  : popisekVyberu(mazani.vybrane.size, "Vyber fotky ke smazání.")
              ) : stahovani.galeriePripravena ? (
                "Fotky jsou připravené. Ulož je do galerie telefonu."
              ) : stahovani.stahovaciRezim ? (
                popisekVyberu(stahovani.vybrane.size, "Vyber fotky ke stažení.")
              ) : jeKos ? (
                <>Fotky v koši se po {KOS_RETENTION_DAYS} dnech smažou natrvalo.</>
              ) : (
                popisekPoctuFotek(fotky.length)
              )}
            </p>
            {stahovani.stahovaciRezim && stahovani.stahovatChyba !== null ? (
              <p role="alert" className="w-full px-1 text-sm font-semibold text-akcent sm:order-last">
                {stahovani.stahovatChyba}
              </p>
            ) : null}
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
        </>
      ) : null}

      {stahovani.stahovatChyba !== null && (!stahovani.stahovaciRezim || cilVyberu !== undefined) ? (
        <p role="alert" className="mb-3 text-sm font-semibold text-inkoust">
          {stahovani.stahovatChyba}
        </p>
      ) : null}

      <FotkyRadkovaMrizka
        fotky={fotky}
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
                {jeKos ? (
                  <StahovaniVyberVrstva vybrana={vybrana} />
                ) : (
                  <MazaniVyberVrstva vybrana={vybrana} />
                )}
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

      {/* Panel průběhu leží dole přes stránku, nové fotky zůstanou nad ním. */}
      <div
        ref={konecRef}
        aria-hidden="true"
        className={`scroll-mb-24 min-[90rem]:scroll-mb-6 ${nahravani !== null ? "h-[min(52vh,20rem)]" : ""}`}
      />

      {mazani.mazatChyba !== null ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-inkoust">
          {mazani.mazatChyba}
        </p>
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
