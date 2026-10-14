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
  formatRozsahData,
  jeBezOmezeni,
  jeProbihajici,
  jeProbehla,
  obsazenostProcenta,
  volnaMista,
} from "../../lib/expedition-utils";
import {
  nactiUcastniky,
  nactiUzivateleProSelektor,
  odeberUcastnika,
  odhlasZVypravy,
  pridejUcastnikaPoUzavreni,
  prihlasNaVypravu,
  smazVypravu,
  upravVypravu,
  uzavriVypravu,
  type ApiUcastnik,
} from "../../lib/expeditions-ucast";
import type { Expedition } from "../../lib/mock-expeditions";
import type {
  UserId,
  UserListItem,
} from "../../shared/api-types";
import type {
  ApiExpedice,
  UpravitExpediciRequest,
  VytvoritExpediciRequest,
} from "../../shared/api-types";
import ExpeditionForm, {
  type ChybyExpedice,
  type ExpeditionFormVychozi,
} from "./ExpeditionForm";
import DiskuzeBox from "../chat/DiskuzeBox";
import ExpeditionPhotos from "./ExpeditionPhotos";
import ExpeditionTrasaPrehled from "./ExpeditionTrasaPrehled";
import StravaParovani from "./StravaParovani";

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
    datumDo: api.datumDo,
    sraz: api.sraz,
    popis: api.popis,
    trasaOdkaz: api.trasaOdkaz,
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
 * USER: seznam přihlášených + Přihlásit / Odhlásit. Správa výprav
 * (aktivní člen, dual-guard): Upravit (reuse ExpeditionForm),
 * Odstranit (potvrzení), Uzavřít s docházkou (checkboxy).
 */
export default function ExpeditionModal({
  expedice,
  onZavrit,
  onAktualizace,
  onSmazana,
}: ExpeditionModalProps): JSX.Element {
  const { user, isAdmin, muzeSpravovatVypravy } = useAuth();
  const nadpisId: string = useId();
  const popisId: string = useId();
  const ucastNadpisId: string = useId();
  const spravaNadpisId: string = useId();
  const filtrUzivateluId: string = useId();
  const vyberUzivateleId: string = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const krizekRef = useRef<HTMLButtonElement>(null);
  const vyberUzivateleRef = useRef<HTMLSelectElement>(null);
  /* onZavrit držíme v refu — focus efekt smí běžet jen při mountu.
     Jinak každá aktualizace rodiče (např. přidání účastníka →
     onAktualizace → nový render) refocusne křížek a scrollne
     dialog zpět nahoru. */
  const onZavritRef = useRef(onZavrit);
  onZavritRef.current = onZavrit;
  const onAktualizaceRef = useRef(onAktualizace);
  onAktualizaceRef.current = onAktualizace;

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

  /* Správa docházky po uzavření (jen proběhlá + správa výprav, Krok 4: userId). */
  type UzivateleStav = "neaktivni" | "nacitani" | "hotovo" | "chyba";
  const [uzivatele, setUzivatele] = useState<UserListItem[]>([]);
  const [uzivateleStav, setUzivateleStav] = useState<UzivateleStav>("neaktivni");
  const [uzivateleChyba, setUzivateleChyba] = useState<string | null>(null);
  const [filtrUzivatelu, setFiltrUzivatelu] = useState<string>("");
  const [vybranyUzivatelId, setVybranyUzivatelId] = useState<string>("");
  const [pridavaSe, setPridavaSe] = useState<boolean>(false);
  const [spravaZprava, setSpravaZprava] = useState<string | null>(null);
  const [spravaChyba, setSpravaChyba] = useState<string | null>(null);
  const [potvrzOdebraniId, setPotvrzOdebraniId] = useState<string | null>(null);
  const [odebiraId, setOdebiraId] = useState<string | null>(null);

  const probehla: boolean = jeProbehla(expedice);
  const probiha: boolean = !probehla && jeProbihajici(expedice);
  const bezOmezeni: boolean = jeBezOmezeni(expedice);
  const procenta: number = obsazenostProcenta(expedice);
  const volna: number = volnaMista(expedice);
  const plno: boolean = !bezOmezeni && volna === 0;

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
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice));
  }, []);

  const nacistiUzivatele = useCallback(async (): Promise<void> => {
    setUzivateleStav("nacitani");
    setUzivateleChyba(null);
    const vysledek = await nactiUzivateleProSelektor();
    if (!vysledek.ok) {
      setUzivateleStav("chyba");
      setUzivateleChyba(vysledek.chyba);
      return;
    }
    setUzivatele(vysledek.data);
    setUzivateleStav("hotovo");
  }, []);

  /* Selektor reálných users (GET /api/users) jen v editačním režimu Upravit. */
  useEffect(() => {
    if (!probehla || !muzeSpravovatVypravy || rezim !== "upravy") return;
    if (uzivateleStav !== "neaktivni") return;
    void nacistiUzivatele();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probehla, muzeSpravovatVypravy, rezim, uzivateleStav]);

  useEffect(() => {
    setRezim("prehled");
    setAkceChyba(null);
    setServerChyba(null);
    setServerChybyPoli({});
    setSmazChyba(null);
    setUzavriChyba(null);
    setSpravaZprava(null);
    setSpravaChyba(null);
    setPotvrzOdebraniId(null);
    setFiltrUzivatelu("");
    setVybranyUzivatelId("");
    setUzivateleStav("neaktivni");
    setUzivatele([]);
    setUzivateleChyba(null);
    void nacistiUcastniky(expedice.id);
  }, [expedice.id, nacistiUcastniky]);

  /* Focus-trap + Esc + zamknutí scrollu + návrat fokusu.
     Schválně jen při mountu ([]) — refocus křížku při každé
     aktualizaci by házel scroll dialogu nahoru (viz onZavritRef). */
  useEffect(() => {
    const predchoziFocus: Element | null = document.activeElement;
    krizekRef.current?.focus();
    const puvodniOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        udalost.stopPropagation();
        onZavritRef.current();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice));
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
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice));
    await nacistiUcastniky(expedice.id);
  }

  /* ——— Správa docházky po uzavření: filtrování + mutace ——— */

  /** Uloží scroll dialogu a po překreslení ho vrátí — přidání/odebrání
      účastníka nesmí házet uživatele nahoru. */
  function obnovScrollPoPrekresleni(ulozene: number): void {
    const dialog: HTMLDivElement | null = dialogRef.current;
    if (dialog === null) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dialog.scrollTop = ulozene;
      });
    });
  }

  function normalizujJmeno(hodnota: string): string {
    return hodnota
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  const userIdUzEvidovanych = new Set<string>(
    ucastnici.flatMap((u) => (u.userId === null ? [] : [u.userId])),
  );
  const jmenaUzEvidovanych = new Set<string>(
    ucastnici.map((u) => normalizujJmeno(u.jmeno)),
  );
  const filtrNorm: string = normalizujJmeno(filtrUzivatelu);
  const dostupniUzivatele: UserListItem[] = uzivatele.filter((uzivatel) => {
    if (userIdUzEvidovanych.has(uzivatel.id)) return false;
    if (jmenaUzEvidovanych.has(normalizujJmeno(uzivatel.jmeno))) return false;
    if (filtrNorm.length > 0 && !normalizujJmeno(uzivatel.jmeno).includes(filtrNorm))
      return false;
    return true;
  });

  async function naPridatUcastnika(): Promise<void> {
    if (vybranyUzivatelId.trim().length === 0) {
      setSpravaChyba("Vyber uživatele ze seznamu.");
      return;
    }
    const dialog: HTMLDivElement | null = dialogRef.current;
    const pozice: number = dialog?.scrollTop ?? 0;
    setPridavaSe(true);
    setSpravaChyba(null);
    setSpravaZprava(null);
    const vysledek = await pridejUcastnikaPoUzavreni(expedice.id, {
      userId: vybranyUzivatelId as UserId,
    });
    setPridavaSe(false);
    if (!vysledek.ok) {
      setSpravaChyba(vysledek.chyba);
      obnovScrollPoPrekresleni(pozice);
      return;
    }
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice));
    setSpravaZprava(`„${vysledek.data.ucastnik.jmeno}“ je zapsán v kronice.`);
    setVybranyUzivatelId("");
    setFiltrUzivatelu("");
    await nacistiUcastniky(expedice.id);
    obnovScrollPoPrekresleni(pozice);
    /* Fokus zpět k selektoru bez scrollu — uživatel pokračuje v přidávání
       tam, kde skončil. */
    requestAnimationFrame(() => {
      vyberUzivateleRef.current?.focus({ preventScroll: true });
    });
  }

  async function naOdebratUcastnika(idUcastnika: string): Promise<void> {
    const dialog: HTMLDivElement | null = dialogRef.current;
    const pozice: number = dialog?.scrollTop ?? 0;
    setOdebiraId(idUcastnika);
    setSpravaChyba(null);
    setSpravaZprava(null);
    const odebirany: ApiUcastnik | undefined = ucastnici.find(
      (u) => u.id === idUcastnika,
    );
    const vysledek = await odeberUcastnika(expedice.id, idUcastnika);
    setOdebiraId(null);
    if (!vysledek.ok) {
      setSpravaChyba(vysledek.chyba);
      obnovScrollPoPrekresleni(pozice);
      return;
    }
    onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice));
    setSpravaZprava(
      odebirany === undefined
        ? "Účastník byl odebrán z kroniky."
        : `„${odebirany.jmeno}“ byl odebrán z kroniky.`,
    );
    setPotvrzOdebraniId(null);
    await nacistiUcastniky(expedice.id);
    obnovScrollPoPrekresleni(pozice);
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
      onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice));
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
      onAktualizaceRef.current(prevedExpedici(vysledek.data.expedice));
      setUcastnici(vysledek.data.ucastnici);
      setRezim("prehled");
    })();
  }

  const vychoziUpravy: ExpeditionFormVychozi = {
    nazev: expedice.nazev,
    datum: expedice.datum,
    datumDo: expedice.datumDo,
    sraz: expedice.sraz,
    popis: expedice.popis,
    trasaOdkaz: expedice.trasaOdkaz,
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
            : probiha
              ? "Právě probíhá"
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border-2 border-inkoust bg-papir shadow-denik"
      >
        <div className="relative border-b-2 border-inkoust bg-linka/70">
          <div
            aria-hidden="true"
            className="relative h-36 w-full overflow-hidden"
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent 0 23px, rgba(26,46,34,0.08) 23px 24px)",
              }}
            />
            <svg
              viewBox="0 0 400 180"
              preserveAspectRatio="xMidYMax slice"
              className={`absolute inset-x-0 bottom-0 h-full w-full text-inkoust ${probehla ? "opacity-50 grayscale" : ""}`}
            >
              <path
                d="M0 150 L90 70 L150 130 L220 45 L300 130 L350 85 L400 130 L400 180 L0 180 Z"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="M0 165 L110 100 L190 155 L270 90 L340 155 L400 120 L400 180 L0 180 Z"
                fill="currentColor"
                fillOpacity="0.16"
                stroke="currentColor"
                className="text-smrk"
                strokeOpacity="0.45"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="absolute bottom-2 right-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70">
              {probehla ? "archiv · exapp" : "exapp"}
            </span>
          </div>
          <div className="absolute left-4 top-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-inkoust/25 bg-papir/90 px-3 py-1 text-[11px] font-bold backdrop-blur">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${probehla ? "bg-mech" : "bg-smrk"}`}
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
          <h2 id={nadpisId} className="mt-1 break-words text-xl font-bold tracking-tight">
            {expedice.nazev}
          </h2>
          <p id={popisId} className="mt-1 break-words text-sm text-inkoust/70">
            <time dateTime={expedice.datum}>{formatRozsahData(expedice.datum, expedice.datumDo)}</time>
            {" · "}
            {expedice.sraz}
          </p>

          {rezim === "prehled" && (
            <>
              {expedice.popis.trim().length > 0 && (
                <p className="mt-3 break-words border-t border-dashed border-linka pt-3 text-[15px] leading-relaxed">
                  {expedice.popis}
                </p>
              )}
              {expedice.trasaOdkaz.trim().length > 0 && (
                <p className="mt-3">
                  <a
                    href={expedice.trasaOdkaz}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-inkoust bg-papir px-4 text-sm font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50"
                  >
                    <span aria-hidden="true">🗺</span> Zobrazit naplánovanou
                    trasu
                  </a>
                </p>
              )}

              <div className="mt-4 rounded-2xl border border-inkoust/15 bg-papir/60 p-3">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-semibold tabular-nums">
                    {bezOmezeni ? (
                      <>
                        {expedice.kapacita.prihlaseno}
                        <span className="font-normal text-inkoust/60"> přihlášeno · bez omezení</span>
                      </>
                    ) : (
                      <>
                        {expedice.kapacita.prihlaseno} / {expedice.kapacita.celkem}
                        <span className="font-normal text-inkoust/60"> přihlášeno</span>
                      </>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] text-inkoust/60">
                    {probehla
                      ? "výprava proběhla"
                      : bezOmezeni
                        ? "místa dost"
                        : volna === 0
                          ? "plně obsazeno"
                          : `zbývá ${volna} ${volna === 1 ? "místo" : volna >= 2 && volna <= 4 ? "místa" : "míst"}`}
                  </span>
                </div>
                {!bezOmezeni ? (
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
                      className={`h-full rounded-full ${probehla ? "bg-mech" : "bg-smrk"}`}
                      style={{ width: `${procenta}%` }}
                    />
                  </div>
                ) : (
                  <div
                    role="status"
                    aria-label={`Počet přihlášených: ${expedice.kapacita.prihlaseno} (bez omezení)`}
                    className="mt-2 h-1 overflow-hidden rounded-full bg-inkoust/15"
                  >
                    <span className="sr-only">
                      {`Počet přihlášených: ${expedice.kapacita.prihlaseno} (bez omezení)`}
                    </span>
                    <div
                      aria-hidden="true"
                      className="h-full w-full rounded-full"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(45deg, rgba(26,46,34,0.28) 0 6px, transparent 6px 12px)",
                      }}
                    />
                  </div>
                )}
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
                            title={akceBezi ? "Odhlašování probíhá…" : "Odhlásit se z výpravy"}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50 disabled:opacity-60"
                          >
                            {akceBezi ? "Odhlašuji…" : "Odhlásit se"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void naPrihlasit()}
                            disabled={akceBezi || plno}
                            title={plno ? "Výprava je plná" : "Přihlásit se na výpravu"}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-inkoust disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {akceBezi ? "Přihlašuji…" : plno ? "Plně obsazeno" : "Přihlásit se"}
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

              {/* Diskuze — živé vlákno (GET PUBLIC čte i anonym,
                  POST USER píše přihlášený). Vlastní sekce s nadpisem
                  uvnitř DiskuzeBoxu (role=log + aria-live, composer
                  44px+, optimistic insert s rollbackem). */}
              <div className="mt-5 border-t border-dashed border-linka pt-4">
                <DiskuzeBox
                  idVypravy={expedice.id}
                  nazevVypravy={expedice.nazev}
                />
              </div>

              {/* Ušlé — jen proběhlá (Krok 17: stavová brána dle kontraktu
                  volno/skoro plno/proběhlá); u neproběhlé vůbec nerenderuj. */}
              {probehla && (
                <ExpeditionTrasaPrehled
                  expeditionId={expedice.id}
                  probehla={probehla}
                  pocetUcastniku={
                    ucastStav === "hotovo" ? ucastnici.length : expedice.kapacita.prihlaseno
                  }
                />
              )}

              {/* Fotky — jen proběhlá; přidat smí každý přihlášený,
                  mazat jen admin (Krok 19: POST převeden z admina na USER). */}
              {probehla && (
                <ExpeditionPhotos
                  expeditionId={expedice.id}
                  probehla={probehla}
                  prihlasen={user !== null}
                  isAdmin={isAdmin}
                />
              )}

              {/* Prohlížecí režim: jen read-only výše. Kronika i trasa/Strava je v Upravit. */}
              {probehla && muzeSpravovatVypravy && (
                <p role="status" className="mt-5 rounded-2xl border border-dashed border-inkoust/25 bg-papir/60 p-3 text-center text-[13px] text-inkoust/70">
                  Kroniku i trasu upravíš v režimu Upravit — přidání ze seznamu uživatelů, odebrání i párování je jen tam.
                </p>
              )}
              {/* Správa výpravy (dual-guard): aktivní člen i bez admin příznaku */}
              {muzeSpravovatVypravy && (
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
            <div className="mt-4 space-y-5">
              <ExpeditionForm
                id="upravit-expedici-form"
                nadpis="Upravit výpravu"
                odeslatPopisek="Uložit změny"
                vychozi={vychoziUpravy}
                odesilaSe={odesilaSe}
                serverChyba={serverChyba}
                serverChybyPoli={serverChybyPoli}
                onSubmit={naOdeslatUpravu}
                onZrusit={() => setRezim("prehled")}
                povolitMinulost
                skrytAkce
              />
              {/* Propojení trasy/Stravy POUZE v editačním režimu — proběhlá + správa výprav (dual-guard). */}
              {probehla && muzeSpravovatVypravy && (
                <StravaParovani
                  expeditionId={expedice.id}
                  onSparovano={() => {
                    void nacistiUcastniky(expedice.id);
                  }}
                  onOdpojeno={() => {
                    void nacistiUcastniky(expedice.id);
                  }}
                />
              )}
              {/* Správa docházky POUZE v editačním režimu — proběhlá + správa výprav, zdroj GET /api/users. */}
              {probehla && muzeSpravovatVypravy && (
                <section
                  aria-labelledby={spravaNadpisId}
                  className="rounded-2xl border-2 border-inkoust bg-papir/60 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      id={spravaNadpisId}
                      className="text-[11px] font-bold uppercase tracking-[0.18em] text-inkoust/60"
                    >
                      Správa docházky
                    </h3>
                    {uzivateleStav === "hotovo" && (
                      <button
                        type="button"
                        onClick={() => void nacistiUzivatele()}
                        className="min-h-[44px] min-w-[44px] rounded-full px-2 text-[13px] font-bold text-smrk underline underline-offset-2 motion-safe:hover:text-inkoust"
                      >
                        Obnovit seznam
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-inkoust/70">
                    Kronika po uzavření — odeber omylem zapsané a dopiš ty, kdo
                    dorazili bez přihlášky. Změna se hned propíše do seznamu.
                  </p>

                  {spravaZprava !== null && (
                    <p
                      role="status"
                      className="mt-2 rounded-xl border border-smrk/30 bg-smrk/10 p-3 text-sm font-semibold text-inkoust"
                    >
                      {spravaZprava}
                    </p>
                  )}
                  {spravaChyba !== null && (
                    <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                      {spravaChyba}
                    </p>
                  )}

                  {ucastStav === "nacitani" && (
                    <p role="status" className="mt-3 text-sm text-inkoust/70">
                      Načítám kroniku…
                    </p>
                  )}
                  {ucastStav === "chyba" && (
                    <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
                      {ucastChyba ?? "Kroniku se nepodařilo načíst."}
                    </p>
                  )}
                  {ucastStav === "hotovo" && ucastnici.length === 0 && (
                    <p
                      role="status"
                      className="mt-3 rounded-xl border border-dashed border-inkoust/25 p-3 text-center text-sm text-inkoust/70"
                    >
                      V kronice zatím nikdo není — prvního dopište níže, prázdný
                      stav přidání nebrání.
                    </p>
                  )}
                  {ucastStav === "hotovo" && ucastnici.length > 0 && (
                    <ul role="list" className="mt-3 divide-y divide-inkoust/10 rounded-xl border border-inkoust/15">
                      {ucastnici.map((u) => {
                        const potvrzuje: boolean = potvrzOdebraniId === u.id;
                        const odebirani: boolean = odebiraId === u.id;
                        return (
                          <li key={u.id} className="px-3 py-2">
                            <div className="flex min-h-[44px] items-center justify-between gap-3">
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                                {u.jmeno}
                                <span className="ml-2 text-[12px] font-normal text-inkoust/60">
                                  {statusUcastiPopisek(u.status)}
                                </span>
                              </span>
                              {!potvrzuje && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSpravaZprava(null);
                                    setSpravaChyba(null);
                                    setPotvrzOdebraniId(u.id);
                                  }}
                                  aria-label={`Odebrat účastníka ${u.jmeno}`}
                                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-inkoust/25 px-4 text-[13px] font-bold text-red-800 motion-safe:transition-colors motion-safe:hover:bg-red-800 motion-safe:hover:text-papir"
                                >
                                  Odebrat
                                </button>
                              )}
                            </div>
                            {potvrzuje && (
                              <div className="mt-2 rounded-xl bg-red-800/5 p-2">
                                <p className="text-[13px] font-semibold">
                                  Odebrat „{u.jmeno}“ z kroniky?
                                </p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                  <button
                                    type="button"
                                    onClick={() => void naOdebratUcastnika(u.id)}
                                    disabled={odebirani}
                                    title={odebirani ? "Odebírání probíhá…" : `Odebrat „${u.jmeno}“ z kroniky`}
                                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border-2 border-red-800 bg-red-800 px-4 text-sm font-bold text-papir disabled:opacity-60"
                                  >
                                    {odebirani ? "Odebírám…" : "Ano, odebrat"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPotvrzOdebraniId(null)}
                                    disabled={odebirani}
                                    title={odebirani ? "Odebírání probíhá…" : "Ponechat účastníka v kronice"}
                                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border-2 border-inkoust bg-papir px-4 text-sm font-bold disabled:opacity-60"
                                  >
                                    Ponechat
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="mt-4 border-t border-dashed border-linka pt-3">
                    <h4 className="text-sm font-bold">Přidat účastníka</h4>
                    {uzivateleStav === "neaktivni" && (
                      <p role="status" className="mt-2 text-sm text-inkoust/70">
                        Připravuji seznam uživatelů…
                      </p>
                    )}
                    {uzivateleStav === "nacitani" && (
                      <div className="mt-2 space-y-2" aria-busy="true" aria-label="Načítám uživatele">
                        {[0, 1].map((i) => (
                          <div key={i} className="h-11 animate-pulse rounded-xl bg-inkoust/10 motion-reduce:animate-none" />
                        ))}
                        <p role="status" className="text-sm text-inkoust/70">
                          Načítám uživatele…
                        </p>
                      </div>
                    )}
                    {uzivateleStav === "chyba" && (
                      <div className="mt-2 rounded-xl border border-inkoust/20 p-3 text-center">
                        <p role="alert" className="text-sm font-semibold">
                          {uzivateleChyba ?? "Seznam uživatelů se nepodařilo načíst."}
                        </p>
                        <button
                          type="button"
                          onClick={() => void nacistiUzivatele()}
                          className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold"
                        >
                          Zkusit znovu
                        </button>
                      </div>
                    )}
                    {uzivateleStav === "hotovo" && (
                      <div className="mt-2 space-y-2">
                        <div>
                          <label
                            htmlFor={filtrUzivateluId}
                            className="mb-1 block text-[13px] font-semibold text-inkoust/70"
                          >
                            Hledat uživatele
                          </label>
                          <input
                            id={filtrUzivateluId}
                            type="search"
                            value={filtrUzivatelu}
                            onChange={(e) => setFiltrUzivatelu(e.target.value)}
                            placeholder="Začni psát jméno…"
                            autoComplete="off"
                            className="block min-h-[44px] w-full rounded-xl border-2 border-inkoust/25 bg-papir px-3 text-sm placeholder:text-inkoust/40"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={vyberUzivateleId}
                            className="mb-1 block text-[13px] font-semibold text-inkoust/70"
                          >
                            Uživatel k přidání
                          </label>
                          <select
                            id={vyberUzivateleId}
                            ref={vyberUzivateleRef}
                            value={vybranyUzivatelId}
                            onChange={(e) => setVybranyUzivatelId(e.target.value)}
                            className="block min-h-[44px] w-full rounded-xl border-2 border-inkoust bg-papir px-3 text-sm font-semibold"
                          >
                            <option value="">— Vyber uživatele —</option>
                            {dostupniUzivatele.map((uzivatel) => (
                              <option key={uzivatel.id} value={uzivatel.id}>
                                {uzivatel.jmeno}
                              </option>
                            ))}
                          </select>
                        </div>
                        {dostupniUzivatele.length === 0 ? (
                          <p role="status" className="text-[13px] text-inkoust/70">
                            Žádný další uživatel k přidání — všichni už jsou v kronice.
                          </p>
                        ) : (
                          <p role="status" className="text-[13px] text-inkoust/60">
                            K přidání: {dostupniUzivatele.length}{" "}
                            {dostupniUzivatele.length === 1
                              ? "uživatel"
                              : dostupniUzivatele.length >= 2 && dostupniUzivatele.length <= 4
                                ? "uživatelé"
                                : "uživatelů"}.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => void naPridatUcastnika()}
                          disabled={pridavaSe || vybranyUzivatelId === ""}
                          title={
                            vybranyUzivatelId === ""
                              ? "Nejdřív vyber uživatele"
                              : "Přidat uživatele do kroniky"
                          }
                          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-inkoust disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pridavaSe ? "Zapisuji…" : "Přidat do kroniky"}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {/* Krok 16: Zrušit/Uložit až na úplném spodku (za Strava + docházkou),
                  sticky pro dlouhý formulář. Submit míří na form id výše. */}
              <div className="sticky bottom-0 -mx-1 flex flex-col-reverse gap-2 border-t-2 border-inkoust bg-papir px-1 py-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setRezim("prehled")}
                  disabled={odesilaSe}
                  title={odesilaSe ? "Ukládání probíhá…" : "Zrušit úpravy"}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  form="upravit-expedici-form"
                  disabled={odesilaSe}
                  title={odesilaSe ? "Ukládání probíhá…" : "Uložit změny"}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir disabled:opacity-60"
                >
                  {odesilaSe ? "Ukládám…" : "Uložit změny"}
                </button>
              </div>
            </div>
          )}

          {rezim === "ruseni" && (
            <div className="mt-4 rounded-2xl border-2 border-red-800/40 bg-red-800/5 p-4">
              <h3 className="break-words font-bold">Opravdu odstranit „{expedice.nazev}"?</h3>
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
                  title={mazeSe ? "Mazání probíhá…" : "Ponechat výpravu"}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
                >
                  Ponechat
                </button>
                <button
                  type="button"
                  onClick={naSmazat}
                  disabled={mazeSe}
                  title={mazeSe ? "Mazání probíhá…" : "Odstranit výpravu nevratně"}
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
                  title={uzaviraSe ? "Uzavírání probíhá…" : "Zpět na přehled"}
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
