import { useCallback, useEffect, useId, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import {
  nactiFotky,
  nastavNahledFotky,
  smazFotku,
  urlSouboruFotky,
  vyberNahledFotky,
  type ApiFotka,
} from "../../lib/expedition-fotky";
import ConfirmDialog from "../kalendar/ConfirmDialog";
import { KostraFotky } from "../StrankaKostra";
import FotkyMazaciHlavicka from "../fotky/FotkyMazaciHlavicka";
import MazaniVyberVrstva from "../fotky/MazaniVyberVrstva";
import Ikona from "../Ikona";
import FotkyRadkovaMrizka from "../fotky/FotkyRadkovaMrizka";
import NahravaciFormular from "../fotky/NahravaciFormular";
import NahravaniVAlbu from "../fotky/NahravaniVAlbu";
import PostupnaFotka from "../fotky/PostupnaFotka";
import SpodniSheet from "../shell/SpodniSheet";
import { nahrajDoAlba, poNahraniFotek, useNahravaniAlba } from "../../lib/nahravani-fotek";
import { useSledovaniNovych } from "../../hooks/useSledovaniNovych";
import { useFotkyMazani } from "../../hooks/useFotkyMazani";
import {
  idsFotekKeSmazani,
  nadpisPotvrzeniMazaniFotek,
  popisPotvrzeniMazaniFotek,
} from "../../lib/fotky-mazani";
import FotkyLightbox, { jeFotkyLightboxOtevreny } from "./FotkyLightbox";
import {
  fotkyHoverBgLinka,
  fotkyHoverOpacity,
  fotkyMrizkaDlazdice,
  fotkyTlacitkoPrimarni,
  fotkyTlacitkoZaklad,
} from "../fotky/fotky-ui";

export interface ExpeditionPhotosProps {
  expeditionId: string;
  /** Fotky existují jen u proběhlé — jinde komponenta nic nekreslí. */
  probehla: boolean;
  /** Fotku může přidat každý přihlášený (POST je za `vyzadujPrihlaseni`). */
  prihlasen: boolean;
  /** Highlight and delete are ADMIN only. */
  isAdmin: boolean;
  /** Cover id changed (load, pick, upload, delete). Optional. */
  onZmenaNahledu?: (fotkaId: string | null) => void;
  /** Preview journal: drop the empty lined plate and ease portaled controls. */
  denik?: boolean;
}

type FotkyStav = "nacitani" | "hotovo" | "chyba";
const FOCUSOVATELNE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ukázka v detailu výpravy: první řady alba, stejně složené jako celé album. */
const RADKU_UKAZKY = 2;
const FOTEK_UKAZKY = 12;

/**
 * Closed expedition shows one highlight photo. That preview is not a control.
 * The gallery sheet lists every photo, uploads, and (admin only) deletes.
 * An admin sets the highlight from the lightbox. `<img>` uses the app stream
 * URL so a private R2 bucket still renders.
 */
export default function ExpeditionPhotos({
  expeditionId,
  probehla,
  prihlasen,
  isAdmin,
  onZmenaNahledu,
  denik = false,
}: ExpeditionPhotosProps): JSX.Element | null {
  const nadpisId: string = useId();
  const dialogNadpisId: string = useId();
  const souborPoleId: string = useId();

  const [stav, setStav] = useState<FotkyStav>("nacitani");
  const [fotky, setFotky] = useState<ApiFotka[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [galerieOtevrena, setGalerieOtevrena] = useState<boolean>(false);
  const [galerieZavira, setGalerieZavira] = useState<boolean>(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const zavritRef = useRef<HTMLButtonElement>(null);
  const galerieZaviraRef = useRef(false);
  const [nahravaniOtevreno, setNahravaniOtevreno] = useState<boolean>(false);
  const nahravaniOtevrenoRef = useRef(nahravaniOtevreno);
  nahravaniOtevrenoRef.current = nahravaniOtevreno;
  const nahravani = useNahravaniAlba(expeditionId);
  const posledniNacteni = useRef(0);
  const konecRef = useRef<HTMLDivElement>(null);

  const [nastavujeId, setNastavujeId] = useState<string | null>(null);
  const [nahledChyba, setNahledChyba] = useState<string | null>(null);
  /** Broken stream (onError) — visible fallback instead of a silent hole. */
  const [rozbite, setRozbite] = useState<Record<string, boolean>>({});
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  useSledovaniNovych(konecRef, fotky.length, nahravani !== null && galerieOtevrena && lightboxId === null);

  const nacist = useCallback(async (): Promise<void> => {
    setStav("nacitani");
    setChyba(null);
    const vysledek = await nactiFotky(expeditionId);
    if (!vysledek.ok) {
      setStav("chyba");
      setChyba(vysledek.chyba);
      return;
    }
    setFotky(vysledek.data.fotky);
    setRozbite({});
    setStav("hotovo");
  }, [expeditionId]);

  const smazJednu = useCallback(
    async (fotkaId: string): Promise<{ ok: true } | { ok: false; chyba: string }> => {
      const vysledek = await smazFotku(expeditionId, fotkaId);
      return vysledek.ok ? { ok: true } : { ok: false, chyba: vysledek.chyba };
    },
    [expeditionId],
  );

  const poSmazani = useCallback(
    async (smazaneIds: readonly string[], _potvrzeni: unknown): Promise<void> => {
      const smazane = new Set(smazaneIds);
      setLightboxId((aktualni) =>
        aktualni !== null && smazane.has(aktualni) ? null : aktualni,
      );
      const obnoveno = await nactiFotky(expeditionId);
      if (!obnoveno.ok) {
        setFotky((prev) => prev.filter((fotka) => !smazane.has(fotka.id)));
        return;
      }
      setFotky(obnoveno.data.fotky);
      setRozbite({});
    },
    [expeditionId],
  );

  const mazani = useFotkyMazani(fotky, smazJednu, poSmazani);
  const resetMazaniFotek = mazani.resetMazani;
  const mazaciRezimRef = useRef(mazani.mazaciRezim);
  const zrusMazaniRef = useRef(mazani.zrusMazani);
  mazaciRezimRef.current = mazani.mazaciRezim;
  zrusMazaniRef.current = mazani.zrusMazani;

  useEffect(() => {
    setGalerieOtevrena(false);
    setLightboxId(null);
    if (!probehla) return;
    void nacist();
  }, [probehla, nacist]);

  // Nahrané fotky přibudou bez kostry, aby galerie neproblikla.
  useEffect(
    () =>
      poNahraniFotek((albumId) => {
        if (albumId !== expeditionId) return;
        posledniNacteni.current += 1;
        const poradi = posledniNacteni.current;
        void nactiFotky(expeditionId).then((obnoveno) => {
          // Načítá se po každé fotce, starší odpověď nesmí přepsat novější.
          if (!obnoveno.ok || poradi !== posledniNacteni.current) return;
          setFotky(obnoveno.data.fotky);
          setStav("hotovo");
        });
      }),
    [expeditionId],
  );

  useEffect(() => {
    if (stav !== "hotovo") return;
    onZmenaNahledu?.(vyberNahledFotky(fotky)?.id ?? null);
  }, [stav, fotky, onZmenaNahledu]);

  useEffect(() => {
    if (!galerieOtevrena) return;
    const predchoziFocus: Element | null = document.activeElement;
    if (mazaciRezimRef.current) {
      const koren: HTMLDivElement | null = dialogRef.current;
      const prvni: HTMLElement | null =
        koren?.querySelector<HTMLElement>(FOCUSOVATELNE) ?? null;
      prvni?.focus();
    } else {
      zavritRef.current?.focus();
    }

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (jeFotkyLightboxOtevreny() || nahravaniOtevrenoRef.current) return;
      if (udalost.key === "Escape") {
        udalost.preventDefault();
        udalost.stopPropagation();
        if (mazaciRezimRef.current) {
          zrusMazaniRef.current();
          return;
        }
        setGalerieOtevrena(false);
        resetMazaniFotek();
        return;
      }
      if (udalost.key !== "Tab") return;
      const koren: HTMLDivElement | null = dialogRef.current;
      if (koren === null) return;
      const prvky: HTMLElement[] = Array.from(
        koren.querySelectorAll<HTMLElement>(FOCUSOVATELNE),
      );
      if (prvky.length === 0) return;
      const prvni: HTMLElement | undefined = prvky[0];
      const posledni: HTMLElement | undefined = prvky[prvky.length - 1];
      if (prvni === undefined || posledni === undefined) return;
      if (udalost.shiftKey && document.activeElement === prvni) {
        udalost.preventDefault();
        udalost.stopPropagation();
        posledni.focus();
      } else if (!udalost.shiftKey && document.activeElement === posledni) {
        udalost.preventDefault();
        udalost.stopPropagation();
        prvni.focus();
      }
    }

    window.addEventListener("keydown", naStiskKlavesy, true);
    return () => {
      window.removeEventListener("keydown", naStiskKlavesy, true);
      if (predchoziFocus instanceof HTMLElement) predchoziFocus.focus();
    };
  }, [galerieOtevrena, mazani.mazaciRezim, resetMazaniFotek]);

  if (!probehla) return null;

  const pocet: string = stav === "hotovo" ? String(fotky.length) : "…";
  const potvrzeniPocet =
    mazani.potvrzeni === null
      ? 0
      : idsFotekKeSmazani(fotky, mazani.vybrane, mazani.potvrzeni).length;

  function otevriNahravani(): void {
    setNahravaniOtevreno(true);
  }

  function zavriGaleriiSPohybem(): void {
    if (galerieZaviraRef.current) return;
    const snizitPohyb =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!denik || snizitPohyb) {
      setGalerieOtevrena(false);
      resetMazaniFotek();
      return;
    }
    galerieZaviraRef.current = true;
    setGalerieZavira(true);
    window.setTimeout(() => {
      galerieZaviraRef.current = false;
      setGalerieOtevrena(false);
      setGalerieZavira(false);
      resetMazaniFotek();
    }, 220);
  }

  function zavriGalerii(): void {
    if (mazani.mazaciRezim) {
      mazani.zrusMazani();
      return;
    }
    zavriGaleriiSPohybem();
  }

  function zavriGaleriiNatvrdo(): void {
    zavriGaleriiSPohybem();
  }

  async function naNahled(fotkaId: string): Promise<void> {
    setNahledChyba(null);
    setNastavujeId(fotkaId);
    const vysledek = await nastavNahledFotky(expeditionId, fotkaId);
    setNastavujeId(null);
    if (!vysledek.ok) {
      setNahledChyba(vysledek.chyba);
      return;
    }
    setFotky(vysledek.data.fotky);
  }

  const galerie =
    galerieOtevrena && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`nocturne fixed inset-0 z-[80] flex items-end justify-center bg-inkoust/50 p-3 sm:items-center${
              denik ? ` nahled-ovladani${galerieZavira ? " nahled-zavira" : ""}` : ""
            }`}
            onMouseDown={zavriGalerii}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogNadpisId}
              onMouseDown={(e) => e.stopPropagation()}
              className="max-h-[92vh] w-full max-w-lg touch-manipulation lg:max-w-4xl min-[90rem]:max-w-6xl overflow-y-auto overscroll-contain rounded-lg border border-linka bg-papir shadow-denik"
            >
              <div
                className={`sticky top-0 z-10 flex gap-2 border-b-2 bg-papir/95 px-3 py-2.5 shadow-denik backdrop-blur-sm sm:px-4 sm:py-3 ${
                  mazani.mazaciRezim
                    ? "flex-col items-stretch border-jantar/60 bg-jantar/5"
                    : "flex-wrap items-center justify-between border-linka"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <h3 id={dialogNadpisId} className="text-base font-bold text-balance text-inkoust">
                    {mazani.mazaciRezim
                      ? "Mazání fotek"
                      : `Fotky z výpravy (${fotky.length})`}
                  </h3>
                  {mazani.mazaciRezim ? (
                    <p className="mt-0.5 text-sm text-inkoust/75">Vyber fotky, pak potvrď smazání.</p>
                  ) : null}
                </div>
                <div
                  className={
                    mazani.mazaciRezim
                      ? "flex w-full min-w-0 flex-col gap-2"
                      : "flex flex-wrap items-center justify-end gap-2"
                  }
                >
                  <FotkyMazaciHlavicka
                    isAdmin={isAdmin}
                    maFotky={fotky.length > 0}
                    mazaciRezim={mazani.mazaciRezim}
                    vybranyPocet={mazani.vybrane.size}
                    mazeSe={mazani.mazeSe}
                    onZacniMazani={mazani.zacniMazani}
                    onZrusMazani={mazani.zrusMazani}
                    onSmazatVybrane={() => {
                      mazani.otevriPotvrzeni("vybrane");
                    }}
                    onSmazatVse={() => {
                      mazani.otevriPotvrzeni("vse");
                    }}
                  />
                  {prihlasen && !mazani.mazaciRezim ? (
                    <button
                      type="button"
                      onClick={otevriNahravani}
                      className={`${fotkyTlacitkoPrimarni} h-11`}
                    >
                      <Ikona nazev="upload" className="size-4" />
                      Nahrát
                    </button>
                  ) : null}
                  {!mazani.mazaciRezim ? (
                    <button
                      ref={zavritRef}
                      type="button"
                      onClick={zavriGaleriiNatvrdo}
                      aria-label="Zavřít galerii"
                      className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgLinka} ${fotkyHoverOpacity} rounded-xl border border-linka bg-povrch text-sm font-semibold text-inkoust sm:px-3.5`}
                    >
                      <Ikona nazev="x" className="size-[17px] text-mech sm:hidden" />
                      <span className="hidden sm:inline">Zavřít</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="p-3">
                {fotky.length === 0 && nahravani !== null ? null : fotky.length === 0 ? (
                  <p
                    role="status"
                    className="rounded-2xl border border-dashed border-inkoust/25 bg-papir p-4 text-center text-sm text-inkoust/70"
                  >
                    {prihlasen
                      ? "Zatím tu není žádná fotka — přidej ji tlačítkem Nahrát."
                      : "Zatím tu není žádná fotka."}
                  </p>
                ) : (
                  <FotkyRadkovaMrizka
                    fotky={fotky}
                    render={(fotka, _rozmer, nahlasRozmer) => {
                      const poradi = fotky.findIndex((polozka) => polozka.id === fotka.id);
                      const jeNahled: boolean = fotka.jeNahled;
                      const vybrana: boolean = mazani.vybrane.has(fotka.id);
                      const rozbita: boolean = rozbite[fotka.id] === true;
                      const popisekFotky = `Otevřít fotku ${poradi + 1} z ${fotky.length}`;
                      if (mazani.mazaciRezim) {
                        return (
                          <button
                            type="button"
                            aria-pressed={vybrana}
                            aria-label="Vybrat fotku ke smazání"
                            onClick={() => {
                              mazani.prepniVyber(fotka.id);
                            }}
                            className={`group ${fotkyMrizkaDlazdice}`}
                          >
                            <ObrazekFotky
                              expeditionId={expeditionId}
                              fotkaId={fotka.id}
                              rozbita={rozbita}
                              bezOdkazu
                              onRozmer={nahlasRozmer}
                              onRozbita={() => {
                                setRozbite((prev) => ({ ...prev, [fotka.id]: true }));
                              }}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                            <MazaniVyberVrstva vybrana={vybrana} />
                          </button>
                        );
                      }
                      if (rozbita) {
                        return (
                          <div
                            className={`${fotkyMrizkaDlazdice} bg-inkoust/5`}
                            aria-current={jeNahled ? "true" : undefined}
                          >
                            <ObrazekFotky
                              expeditionId={expeditionId}
                              fotkaId={fotka.id}
                              rozbita
                              onRozmer={nahlasRozmer}
                              onRozbita={() => {
                                setRozbite((prev) => ({ ...prev, [fotka.id]: true }));
                              }}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          </div>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => setLightboxId(fotka.id)}
                          aria-label={popisekFotky}
                          aria-current={jeNahled ? "true" : undefined}
                          className={`${fotkyMrizkaDlazdice} bg-inkoust/5`}
                        >
                          <ObrazekFotky
                            expeditionId={expeditionId}
                            fotkaId={fotka.id}
                            rozbita={false}
                            onRozmer={nahlasRozmer}
                            onRozbita={() => {
                              setRozbite((prev) => ({ ...prev, [fotka.id]: true }));
                            }}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        </button>
                      );
                    }}
                  />
                )}

                {/* Panel průběhu leží dole přes galerii, nové fotky zůstanou nad ním. */}
                <div
                  ref={konecRef}
                  aria-hidden="true"
                  className={`scroll-mb-3 ${nahravani !== null ? "h-[calc(min(52vh,20rem)+4.5rem)] min-[90rem]:h-[min(52vh,20rem)]" : ""}`}
                />

                {nahledChyba !== null && (
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                    {nahledChyba}
                  </p>
                )}
                {mazani.mazatChyba !== null && (
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                    {mazani.mazatChyba}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const otevriGalerii = (): void => {
    if (fotky.length === 0 && prihlasen) {
      otevriNahravani();
      return;
    }
    setNahledChyba(null);
    galerieZaviraRef.current = false;
    setGalerieZavira(false);
    setGalerieOtevrena(true);
  };
  const ukazka = stav === "hotovo" ? fotky.slice(0, FOTEK_UKAZKY) : [];
  const popisekPoctu = `${pocet} ${fotky.length === 1 ? "fotka" : fotky.length >= 2 && fotky.length <= 4 ? "fotky" : "fotek"}`;

  return (
    <section aria-labelledby={nadpisId} className="flex flex-col gap-2 min-[90rem]:gap-4 min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:p-5 min-[90rem]:shadow-denik">
      <div className="flex items-center justify-between gap-3">
        <h3 id={nadpisId} className="font-display text-lg font-bold text-inkoust min-[90rem]:text-[17px] min-[90rem]:tracking-[-0.3px]">
          Fotky z výpravy
        </h3>
        {stav === "hotovo" ? <span className="text-[13px] font-semibold text-mech">{popisekPoctu}</span> : null}
      </div>

      {stav === "nacitani" && <KostraFotky pocet={4} />}

      {stav === "chyba" && (
        <div className="rounded-2xl border border-linka bg-povrch p-4 text-center">
          <p role="alert" className="text-sm font-semibold">
            {chyba ?? "Fotky se nepodařilo načíst."}
          </p>
          <button
            type="button"
            onClick={() => void nacist()}
            className={`${fotkyTlacitkoZaklad} ${fotkyHoverOpacity} mt-3 rounded-xl bg-smrk px-5 text-sm font-semibold text-povrch`}
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {ukazka.length > 0 && (
        <FotkyRadkovaMrizka
          fotky={ukazka}
          radku={RADKU_UKAZKY}
          render={(fotka, _rozmer, nahlasRozmer) => (
            <button
              type="button"
              onClick={otevriGalerii}
              aria-label="Otevřít album výpravy"
              className={`${fotkyMrizkaDlazdice} bg-mlha`}
            >
              <PostupnaFotka
                src={urlSouboruFotky(expeditionId, fotka.id)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onRozmer={nahlasRozmer}
              />
            </button>
          )}
        />
      )}

      {stav === "hotovo" && (
        <button
          type="button"
          onClick={otevriGalerii}
          aria-label={`Všechny fotky (${pocet})`}
          className="bez-prejeti -my-2 flex min-h-11 w-full items-center justify-between gap-1.5 text-left text-[13.5px] font-medium text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          {fotky.length === 0 ? "Přidat první fotku" : "Zobrazit album"}
          <Ikona nazev="chevron-right" className="size-[18px]" />
        </button>
      )}

      {galerie}
      <NahravaniVAlbu albumId={expeditionId} nadDialogem={galerieOtevrena} />
      <SpodniSheet
        otevreno={nahravaniOtevreno}
        titulek="Nahrát fotky"
        podtitul="Fotky z výpravy"
        nadDialogem
        onZavrit={() => {
          setNahravaniOtevreno(false);
        }}
      >
        <NahravaciFormular
          id={souborPoleId}
          onNahrat={(soubory) => {
            nahrajDoAlba(expeditionId, soubory);
            setNahravaniOtevreno(false);
            return null;
          }}
          onZrusit={() => {
            setNahravaniOtevreno(false);
          }}
        />
      </SpodniSheet>
      {lightboxId !== null ? (
        <FotkyLightbox
          trida={denik ? "nahled-ovladani" : undefined}
          expeditionId={expeditionId}
          pocatecniId={lightboxId}
          fotky={fotky}
          onZavrit={() => setLightboxId(null)}
          isAdmin={isAdmin}
          nastavujeNahled={nastavujeId !== null}
          nahledChyba={nahledChyba}
          onHighlight={(fotkaId) => void naNahled(fotkaId)}
          mazaciRezim={mazani.mazaciRezim}
          mazeSe={mazani.mazeSe}
          vybranyPocet={mazani.vybrane.size}
          onZacniMazani={() => {
            setLightboxId(null);
            mazani.zacniMazani();
          }}
          onZrusMazani={mazani.zrusMazani}
          onSmazatVybrane={() => {
            mazani.otevriPotvrzeni("vybrane");
          }}
          onSmazatVse={() => {
            mazani.otevriPotvrzeni("vse");
          }}
        />
      ) : null}
      {mazani.potvrzeni !== null ? (
        <ConfirmDialog
          trida={denik ? "nahled-ovladani" : undefined}
          otevreno
          nadpis={nadpisPotvrzeniMazaniFotek(mazani.potvrzeni, true)}
          popis={popisPotvrzeniMazaniFotek(mazani.potvrzeni, potvrzeniPocet, true)}
          potvrditPopisek="Ano, smazat"
          zrusitPopisek="Ponechat"
          probiha={mazani.mazeSe}
          probihaPopisek="Mažu…"
          chyba={mazani.mazatChyba}
          onPotvrdit={() => {
            void mazani.provedMazani();
          }}
          onZrusit={mazani.zavriPotvrzeni}
        />
      ) : null}
    </section>
  );
}

function ObrazekFotky({
  expeditionId,
  fotkaId,
  rozbita,
  onRozbita,
  onRozmer,
  className,
  bezOdkazu = false,
}: {
  expeditionId: string;
  fotkaId: string;
  rozbita: boolean;
  onRozbita: () => void;
  onRozmer?: (sirka: number, vyska: number) => void;
  className: string;
  /** Skip the fallback link when the image sits inside another button. */
  bezOdkazu?: boolean;
}): JSX.Element {
  const src: string = urlSouboruFotky(expeditionId, fotkaId);
  if (rozbita) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-inkoust/5 px-2 text-center">
        <p role="status" className="text-[12px] font-semibold text-inkoust/70">
          Fotku se nepodařilo načíst.
        </p>
        {bezOdkazu ? null : (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] touch-manipulation items-center justify-center px-3 text-[12px] font-bold text-smrk underline underline-offset-2"
          >
            Otevřít odkaz
          </a>
        )}
      </div>
    );
  }
  return (
    <PostupnaFotka
      src={src}
      alt="Fotka z výpravy"
      loading="lazy"
      className={className}
      onRozmer={onRozmer}
      onError={onRozbita}
    />
  );
}
