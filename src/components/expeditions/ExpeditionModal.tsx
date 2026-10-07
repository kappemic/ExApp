import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
} from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  formatCelyDatum,
  jeProbehla,
  obsazenostProcenta,
  volnaMista,
} from "../../lib/expedition-utils";
import {
  nactiUcastniky,
  odhlasZVypravy,
  prihlasNaVypravu,
  smazVypravu,
  upravVypravu,
  uzavriVypravu,
  type ApiUcastnik,
} from "../../lib/expeditions-ucast";
import type { Expedition } from "../../lib/mock-expeditions";
import type {
  ApiExpedice,
  UpravitExpediciRequest,
  VytvoritExpediciRequest,
} from "../../shared/api-types";
import Obraz, { variantaObrazu } from "../gallery/Obraz";
import ExpeditionForm, {
  type ChybyExpedice,
  type ExpeditionFormVychozi,
} from "./ExpeditionForm";
import ExpeditionPhotos from "./ExpeditionPhotos";

export interface ExpeditionModalProps {
  expedice: Expedition;
  onZavrit: () => void;
  /** Propíše účast / úpravu / uzavření do seznamu (kapacita, stav). */
  onAktualizace: (nova: Expedition) => void;
  onSmazana: (id: string) => void;
}

type Rezim = "prehled" | "upravy" | "ruseni" | "uzavirani";
type UcastStav = "nacitani" | "hotovo" | "chyba";

const FOCUSOVATELNE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prevedExpedici(api: ApiExpedice): Expedition {
  return {
    id: api.id,
    nazev: api.nazev,
    datum: api.datum,
    sraz: api.sraz,
    popis: api.popis,
    kapacita: { prihlaseno: api.kapacita.prihlaseno, celkem: api.kapacita.celkem },
    stav: api.stav,
  };
}

function statusUcastiPopisek(status: ApiUcastnik["status"]): string {
  if (status === "ucastnil_se") return "zúčastnil se";
  if (status === "omluven") return "omluven";
  return "přihlášen";
}

/**
 * Deníkový detail výpravy — role=dialog + aria-modal, focus-trap, Esc,
 * klik na backdrop, křížek; po zavření vrací focus na kartu, která ho otevřela.
 * USER: seznam přihlášených + Přihlásit / Odhlásit. ADMIN: Upravit (reuse
 * ExpeditionForm), Odstranit (potvrzení), Uzavřít s docházkou (checkboxy).
 */
export default function ExpeditionModal({
  expedice,
  onZavrit,
  onAktualizace,
  onSmazana,
}: ExpeditionModalProps): JSX.Element {
  const { user, isAdmin } = useAuth();
  const nadpisId: string = useId();
  const popisId: string = useId();
  const ucastNadpisId: string = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const krizekRef = useRef<HTMLButtonElement>(null);

  const [rezim, setRezim] = useState<Rezim>("prehled");
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

  const [dochazka, setDochazka] = useState<Set<string>>(new Set());
  const [uzaviraSe, setUzaviraSe] = useState<boolean>(false);
  const [uzavriChyba, setUzavriChyba] = useState<string | null>(null);

  const probehla: boolean = jeProbehla(expedice);
  const procenta: number = obsazenostProcenta(expedice);
  const volna: number = volnaMista(expedice);
  const varianta: number = variantaObrazu(expedice.id);

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
    setDochazka(new Set(vysledek.data.ucastnici.map((u) => u.id)));
    setUcastStav("hotovo");
    onAktualizace(prevedExpedici(vysledek.data.expedice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setRezim("prehled");
    setAkceChyba(null);
    setServerChyba(null);
    setServerChybyPoli({});
    setSmazChyba(null);
    setUzavriChyba(null);
    void nacistiUcastniky(expedice.id);
  }, [expedice.id, nacistiUcastniky]);

  /* Focus-trap + Esc + zamknutí scrollu + návrat fokusu. */
  useEffect(() => {
    const predchoziFocus: Element | null = document.activeElement;
    krizekRef.current?.focus();
    const puvodniOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        udalost.stopPropagation();
        onZavrit();
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
      if (predchoziFocus instanceof HTMLElement) predchoziFocus.focus();
    };
  }, [onZavrit]);

  function naKlikBackdropu(udalost: MouseEvent<HTMLDivElement>): void {
    if (udalost.target === udalost.currentTarget) onZavrit();
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
    onAktualizace(prevedExpedici(vysledek.data.expedice));
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
    onAktualizace(prevedExpedici(vysledek.data.expedice));
    await nacistiUcastniky(expedice.id);
  }

  function naOdeslatUpravu(
    payload: VytvoritExpediciRequest | UpravitExpediciRequest,
  ): void {
    setOdesilaSe(true);
    setServerChyba(null);
    void (async (): Promise<void> => {
      const vysledek = await upravVypravu(expedice.id, payload);
      setOdesilaSe(false);
      if (!vysledek.ok) {
        if (vysledek.chybyPoli !== undefined) setServerChybyPoli(vysledek.chybyPoli);
        else setServerChyba(vysledek.chyba);
        return;
      }
      onAktualizace(prevedExpedici(vysledek.data.expedice));
      setRezim("prehled");
    })();
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
      onZavrit();
    })();
  }

  function prepniDochazku(idUcastnika: string): void {
    setDochazka((prev) => {
      const next = new Set(prev);
      if (next.has(idUcastnika)) next.delete(idUcastnika);
      else next.add(idUcastnika);
      return next;
    });
  }

  function naUzavrit(): void {
    setUzaviraSe(true);
    setUzavriChyba(null);
    const zaznamy = ucastnici.map((u) => ({
      ucastnikId: u.id,
      status: (dochazka.has(u.id) ? "ucastnil_se" : "omluven") as "ucastnil_se" | "omluven",
    }));
    void (async (): Promise<void> => {
      const vysledek = await uzavriVypravu(expedice.id, zaznamy);
      setUzaviraSe(false);
      if (!vysledek.ok) {
        setUzavriChyba(vysledek.chyba);
        return;
      }
      onAktualizace(prevedExpedici(vysledek.data.expedice));
      setUcastnici(vysledek.data.ucastnici);
      setRezim("prehled");
    })();
  }

  const vychoziUpravy: ExpeditionFormVychozi = {
    nazev: expedice.nazev,
    datum: expedice.datum,
    sraz: expedice.sraz,
    popis: expedice.popis,
    kapacitaCelkem: expedice.kapacita.celkem,
  };

  const nadpisRezim: string =
    rezim === "upravy"
      ? "Upravit výpravu"
      : rezim === "ruseni"
        ? "Odstranit výpravu"
        : rezim === "uzavirani"
          ? "Uzavřít výpravu"
          : probehla
            ? "Archivní záznam"
            : "Detail výpravy";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 p-4 sm:items-center"
      onMouseDown={naKlikBackdropu}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={nadpisId}
        aria-describedby={popisId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border-2 border-inkoust bg-karta shadow-denik"
      >
        <div className="relative">
          <Obraz
            varianta={varianta}
            nazev={expedice.nazev}
            className={`h-36 w-full object-cover ${probehla ? "saturate-50" : ""}`}
          />
          <div className="absolute left-4 top-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-inkoust/25 bg-papir/90 px-3 py-1 text-[11px] font-bold backdrop-blur">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${probehla ? "bg-mech" : "bg-jantar"}`}
              />
              {expedice.stav}
            </span>
          </div>
          <button
            ref={krizekRef}
            type="button"
            onClick={onZavrit}
            aria-label="Zavřít detail výpravy"
            className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir text-xl font-extrabold leading-none shadow-razitko motion-safe:transition-colors motion-safe:hover:bg-linka"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-inkoust/55">
            {nadpisRezim}
          </p>
          <h2 id={nadpisId} className="font-galerie mt-1 text-3xl leading-tight">
            {expedice.nazev}
          </h2>
          <p id={popisId} className="mt-1 text-sm text-inkoust/70">
            <time dateTime={expedice.datum}>{formatCelyDatum(expedice.datum)}</time>
            {" · "}
            {expedice.sraz}
          </p>

          {rezim === "prehled" && (
            <>
              {expedice.popis.trim().length > 0 && (
                <p className="mt-3 border-t border-dashed border-linka pt-3 text-[15px] leading-relaxed">
                  {expedice.popis}
                </p>
              )}

              <div className="mt-4 rounded-2xl border border-inkoust/15 bg-papir/60 p-3">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-semibold tabular-nums">
                    {expedice.kapacita.prihlaseno} / {expedice.kapacita.celkem}
                    <span className="font-normal text-inkoust/60"> přihlášeno</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-inkoust/60">
                    {probehla
                      ? "výprava proběhla"
                      : volna === 0
                        ? "plně obsazeno"
                        : `zbývá ${volna} ${volna === 1 ? "místo" : volna >= 2 && volna <= 4 ? "místa" : "míst"}`}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Obsazenost: ${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}`}
                  aria-valuenow={expedice.kapacita.prihlaseno}
                  aria-valuemin={0}
                  aria-valuemax={expedice.kapacita.celkem}
                  className="mt-2 h-1 overflow-hidden rounded-full bg-inkoust/15"
                >
                  <div
                    aria-hidden="true"
                    className={`h-full rounded-full ${probehla ? "bg-mech" : "bg-jantar"}`}
                    style={{ width: `${procenta}%` }}
                  />
                </div>
              </div>

              {/* Účast — USER akce */}
              <section aria-labelledby={ucastNadpisId} className="mt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id={ucastNadpisId} className="text-sm font-bold uppercase tracking-[0.14em] text-inkoust/60">
                    Přihlášení ({ucastStav === "hotovo" ? ucastnici.length : "…"})
                  </h3>
                  {ucastStav === "hotovo" && (
                    <button
                      type="button"
                      onClick={() => void nacistiUcastniky(expedice.id)}
                      className="min-h-[44px] min-w-[44px] rounded-full px-2 text-[13px] font-bold text-smrk underline underline-offset-2 motion-safe:hover:text-inkoust"
                    >
                      Obnovit
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
                  <div className="mt-2 rounded-2xl border-2 border-inkoust/20 bg-papir p-4 text-center">
                    <p role="alert" className="text-sm font-semibold">
                      {ucastChyba ?? "Seznam se nepodařilo načíst."}
                    </p>
                    <button
                      type="button"
                      onClick={() => void nacistiUcastniky(expedice.id)}
                      className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-5 text-sm font-bold text-papir"
                    >
                      Zkusit znovu
                    </button>
                  </div>
                )}

                {ucastStav === "hotovo" && (
                  <>
                    {ucastnici.length === 0 ? (
                      <p role="status" className="mt-2 rounded-2xl border border-dashed border-inkoust/25 bg-papir/60 p-4 text-center text-sm text-inkoust/70">
                        Zatím se nikdo nepřihlásil — buď první, kdo zapíše své jméno do kroniky.
                      </p>
                    ) : (
                      <ul role="list" className="mt-2 divide-y divide-inkoust/10 rounded-2xl border border-inkoust/15 bg-papir/60">
                        {ucastnici.map((u) => (
                          <li key={u.id} className="flex min-h-[44px] items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="min-w-0 truncate font-semibold">
                              {u.jmeno}
                              {user !== null && u.userId === user.id && (
                                <span className="ml-2 rounded-full bg-smrk/10 px-2 py-0.5 text-[11px] font-bold text-smrk">
                                  ty
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-[12px] text-inkoust/60">
                              {statusUcastiPopisek(u.status)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {akceChyba !== null && (
                      <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                        {akceChyba}
                      </p>
                    )}

                    {!probehla && user !== null && (
                      <div className="mt-3">
                        {jsemPrihlasen ? (
                          <button
                            type="button"
                            onClick={() => void naOdhlasit()}
                            disabled={akceBezi}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50 disabled:opacity-60"
                          >
                            {akceBezi ? "Odhlašuji…" : "Odhlásit se"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void naPrihlasit()}
                            disabled={akceBezi || volna === 0}
                            title={volna === 0 ? "Výprava je plná" : "Přihlásit se na výpravu"}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-inkoust disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {akceBezi ? "Přihlašuji…" : volna === 0 ? "Plně obsazeno" : "Přihlásit se"}
                          </button>
                        )}
                      </div>
                    )}
                    {!probehla && user === null && (
                      <p className="mt-3 text-center text-sm text-inkoust/70">
                        Pro přihlášení se nejdřív přihlas ke svému účtu.
                      </p>
                    )}
                    {probehla && (
                      <p className="mt-3 rounded-2xl bg-mech/10 p-3 text-center text-sm text-inkoust/70">
                        Tahle výprava už proběhla — přihlašování je uzavřené, níže je archivní docházka.
                      </p>
                    )}
                  </>
                )}
              </section>

              {/* Fotky — jen proběhlá; ADMIN zapisuje, user čte (Krok 6). */}
              {probehla && (
                <ExpeditionPhotos
                  expeditionId={expedice.id}
                  probehla={probehla}
                  isAdmin={isAdmin}
                />
              )}

              {/* Admin akce */}
              {isAdmin && (
                <div className="mt-5 border-t-2 border-inkoust pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-inkoust/55">
                    Správa výpravy
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        setServerChyba(null);
                        setServerChybyPoli({});
                        setRezim("upravy");
                      }}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-4 text-sm font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50"
                    >
                      Upravit
                    </button>
                    {!probehla && (
                      <button
                        type="button"
                        onClick={() => {
                          setUzavriChyba(null);
                          setRezim("uzavirani");
                        }}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-jantar px-4 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:brightness-95"
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
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-red-800 bg-papir px-4 text-sm font-bold text-red-800 motion-safe:transition-colors motion-safe:hover:bg-red-800 motion-safe:hover:text-papir"
                    >
                      Odstranit
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 flex justify-end border-t border-dashed border-linka pt-4">
                <button
                  type="button"
                  onClick={onZavrit}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-6 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-smrk"
                >
                  Zavřít
                </button>
              </div>
            </>
          )}

          {rezim === "upravy" && (
            <div className="mt-4">
              <ExpeditionForm
                nadpis="Upravit výpravu"
                odeslatPopisek="Uložit změny"
                vychozi={vychoziUpravy}
                odesilaSe={odesilaSe}
                serverChyba={serverChyba}
                serverChybyPoli={serverChybyPoli}
                onSubmit={naOdeslatUpravu}
                onZrusit={() => setRezim("prehled")}
              />
            </div>
          )}

          {rezim === "ruseni" && (
            <div className="mt-4 rounded-2xl border-2 border-red-800/40 bg-red-800/5 p-4">
              <h3 className="font-bold">Opravdu odstranit „{expedice.nazev}"?</h3>
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
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setRezim("prehled")}
                  disabled={mazeSe}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
                >
                  Ponechat
                </button>
                <button
                  type="button"
                  onClick={naSmazat}
                  disabled={mazeSe}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-red-800 bg-red-800 px-5 text-sm font-bold text-papir disabled:opacity-60"
                >
                  {mazeSe ? "Mažu…" : "Ano, odstranit"}
                </button>
              </div>
            </div>
          )}

          {rezim === "uzavirani" && (
            <div className="mt-4">
              <h3 className="font-bold">Docházka — kdo doopravdy dorazil?</h3>
              <p className="mt-1 text-sm text-inkoust/70">
                Zatržený = zúčastnil se, nezatržený = omluven. Uzavřením se výprava přesune do historie.
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
                <p role="alert" className="mt-3 rounded-2xl border border-dashed border-inkoust/25 bg-papir p-3 text-sm font-semibold">
                  Bez přihlášených nelze uzavřít — docházka by byla prázdná.
                </p>
              )}
              {ucastStav === "hotovo" && ucastnici.length > 0 && (
                <fieldset className="mt-3">
                  <legend className="sr-only">Docházka účastníků</legend>
                  <ul role="list" className="space-y-2">
                    {ucastnici.map((u) => {
                      const zaskrtnuto: boolean = dochazka.has(u.id);
                      return (
                        <li key={u.id}>
                          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl border border-inkoust/15 bg-papir/70 px-3 py-2 motion-safe:transition-colors motion-safe:hover:bg-linka/30">
                            <input
                              type="checkbox"
                              checked={zaskrtnuto}
                              onChange={() => prepniDochazku(u.id)}
                              className="h-5 w-5 shrink-0 accent-smrk"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {u.jmeno}
                            </span>
                            <span className="shrink-0 text-[12px] text-inkoust/60">
                              {zaskrtnuto ? "dorazil" : "omluven"}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
              {uzavriChyba !== null && (
                <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                  {uzavriChyba}
                </p>
              )}
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setRezim("prehled")}
                  disabled={uzaviraSe}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
                >
                  Zpět
                </button>
                <button
                  type="button"
                  onClick={naUzavrit}
                  disabled={uzaviraSe || ucastnici.length === 0}
                  title={ucastnici.length === 0 ? "Bez přihlášených nelze uzavřít" : `Uzavřít s docházkou (${dochazka.size} dorazilo)`}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-jantar px-5 text-sm font-bold text-papir disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uzaviraSe ? "Uzavírám…" : `Uzavřít (${dochazka.size} dorazilo)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
