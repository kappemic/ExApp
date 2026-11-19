import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import { KostraZpravy } from "../StrankaKostra";
import { useAuth } from "../../hooks/useAuth";
import { oznacVlaknoJakoPrectene } from "../../hooks/useUnreadExpeditions";
import {
  getZpravy,
  posliZpravu,
  smazZpravu,
  type ApiZprava,
} from "../../lib/diskuze-api";
import {
  INTERVAL_ZIVYCH_ZPRAV_MS,
  dobaOdchoduZpravy,
  odeberZpravu,
  vratZpravu,
  vyhodnotSlouceni,
  vlaknaSeLisi,
  jsemUDna,
  maScrollovatNaNove,
  type VysledekSlouceni,
} from "../../lib/zive-vlakno";
import { optimistickePrilohy, pridejPrilohy } from "../../lib/prilohy-zpravy";
import { nactiFotkyVlakna, seskupRadkyVlakna } from "../../lib/chat-fotky";
import { VALIDACE } from "../../shared/api-types";
import { smiSmazatZpravu } from "../../shared/mazani-zprav";
import ZpravaBublina from "./ZpravaBublina";

function stejnyDen(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
import ChatLightroom, { useChatLightroom } from "./ChatLightroom";
import { ChipyPriloh, TlacitkoPrilohy } from "./VyberPriloh";

export interface DiskuzeBoxProps {
  idVypravy: string;
  /** Volitelné jméno výpravy pro aria-label vlákna. */
  nazevVypravy?: string;
  /** User id of the person who created this expedition. */
  organizatorId?: string | null;
  /** Finished trip: the thread is a record, not the main column. */
  klidna?: boolean;
}

type StavVlakna = "nacitani" | "hotovo" | "chyba";

const MAX_DELKA: number = VALIDACE.zpravaTextMaxDelka;

/* ------------------------------------------------------------------ */
/* Pure pomocníci — export pro tests/diskuze-box.test.tsx (bez jsdom).  */
/* ------------------------------------------------------------------ */

/** Zbývající znaky do limitu 1000 (může být záporné = přes limit). */
export function spocitejZbyvajiciZnaky(text: string): number {
  return MAX_DELKA - Array.from(text.trim()).length;
}

/**
 * Composer jde odeslat s textem (1–1000) nebo aspoň jedním souborem, mimo běh.
 * Třetí argument je volitelný kvůli starším testům bez příloh.
 */
export function muzeOdeslat(
  text: string,
  odesilaSe: boolean,
  pocetSouboru = 0,
): boolean {
  if (odesilaSe) return false;
  const delka: number = Array.from(text.trim()).length;
  if (delka > MAX_DELKA) return false;
  if (pocetSouboru < 0 || pocetSouboru > VALIDACE.prilohyMaxPocet) return false;
  return delka >= 1 || pocetSouboru >= 1;
}

/** Dočasná zpráva pro optimistic insert (id `optimistic-*` = odesílá se). */
export function vytvorOptimistickouZpravu(
  idVypravy: string,
  autorId: string | null,
  text: string,
  authorName = "Ty",
): ApiZprava {
  const nahodne: string =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 1e9).toString(36);
  return {
    id: `optimistic-${Date.now().toString(36)}-${nahodne}`,
    expeditionId: idVypravy,
    autorId,
    authorName,
    channel: "expedice",
    text: text.trim(),
    prilohy: [],
    createdAt: new Date().toISOString(),
  };
}

/** Přidá optimistickou zprávu na konec vlákna (ASC řazení). */
export function aplikujOptimistickyInsert(
  zpravy: ApiZprava[],
  docasna: ApiZprava,
): ApiZprava[] {
  return [...zpravy, docasna];
}

/** Nahradí dočasnou zprávu potvrzenou ze serveru (201). */
export function potvrdOptimistickouZpravu(
  zpravy: ApiZprava[],
  docasneId: string,
  potvrzena: ApiZprava,
): ApiZprava[] {
  if (!zpravy.some((z) => z.id === docasneId)) {
    if (zpravy.some((z) => z.id === potvrzena.id)) return [...zpravy];
    return seradZpravy([...zpravy, potvrzena]);
  }
  return zpravy.map((z) => (z.id === docasneId ? potvrzena : z));
}

/** Rollback po neúspěchu POST — dočasnou zprávu odstraní. */
export function aplikujRollback(
  zpravy: ApiZprava[],
  docasneId: string,
): ApiZprava[] {
  return zpravy.filter((z) => z.id !== docasneId);
}

/** Vlákno řadí server ASC — klient pořadí drží (stabilní, bez přehazování). */
export function seradZpravy(zpravy: ApiZprava[]): ApiZprava[] {
  return [...zpravy].sort((a, b) => {
    const cas: number =
      Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (cas !== 0) return cas;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Popisek autora bez dalšího fetch (Step 2: jméno nese `authorName` z JOINu).
 * Moje → „Ty" (jen při shodě `autorId === currentUserId`), cizí → živé
 * `authorName`, smazaný účet bez jména → „Bývalý člen". Starý fallback
 * `Člen · xxxx` zůstává jen pro porušená data s prázdným `authorName`.
 */
const VYSKA_RADKU = 44;
const STROP_POLE = 160;

/** Grow the composer once the text no longer fits on one line. */
function prizpusobVysku(pole: HTMLTextAreaElement): void {
  pole.style.height = `${VYSKA_RADKU}px`;
  const potreba = pole.scrollHeight;
  pole.style.height = `${Math.min(potreba, STROP_POLE)}px`;
  pole.style.overflowY = potreba > STROP_POLE ? "auto" : "hidden";
}

export function vyberAutorPopisek(
  zprava: ApiZprava,
  mojeId: string | null,
): string {
  if (mojeId !== null && zprava.autorId === mojeId) return "Ty";
  const zive: string = zprava.authorName.trim().replace(/\s+/g, " ");
  if (zive.length > 0) return zive;
  if (zprava.autorId === null) return "Bývalý člen";
  return `Člen · ${zprava.autorId.slice(0, 8)}`;
}

/**
 * Reusable vlákno diskuze k výpravě — list + composer.
 *
 * - List: `role="log"` + `aria-live="polite"` (čtečka hlásí nové zprávy),
 *   prázdný stav `role="status"`, chyba `role="alert"`.
 * - Composer: 16px field (no iOS zoom), `enterkeyhint="send"`. It stays
 *   one line until the text wraps, then grows up to a short cap. It sits
 *   under the thread, not inside `data-vlakno-scroll`.
 * - Optimistic insert s rollbackem: zpráva se objeví hned (`optimistic-*`,
 *   „Odesílá se…"), 201 ji potvrdí, chyba ji odstraní + ukáže alert.
 * - Anonym: vlákno čte (PUBLIC), psát musí po přihlášení (POST = USER).
 */
export default function DiskuzeBox({
  idVypravy,
  nazevVypravy,
  organizatorId = null,
  klidna = false,
}: DiskuzeBoxProps): JSX.Element {
  const { user, isAdmin } = useAuth();
  const nadpisId: string = useId();
  const composerId: string = useId();
  const pocitadloId: string = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const poleRef = useRef<HTMLTextAreaElement>(null);
  const obalRef = useRef<HTMLDivElement>(null);
  /* Messages scroll here. The composer is a sibling below this node. */
  const vlaknoRef = useRef<HTMLDivElement>(null);
  const oznacenoRef = useRef<string | null>(null);
  const generaceRef = useRef<number>(0);
  const probihaObnovaRef = useRef<boolean>(false);
  const drzetRef = useRef<Map<string, ApiZprava>>(new Map());
  const skrytRef = useRef<Set<string>>(new Set());
  const odchodRef = useRef<Map<string, number>>(new Map());
  const scrollNaKonecRef = useRef<boolean>(true);

  const [stav, setStav] = useState<StavVlakna>("nacitani");
  const [zpravy, setZpravy] = useState<ApiZprava[]>([]);
  const nactiFotky = useCallback(
    () => nactiFotkyVlakna((cursor) => getZpravy(idVypravy, { limit: 100, cursor })),
    [idVypravy],
  );
  const lightroom = useChatLightroom(nactiFotky);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [text, setText] = useState<string>("");
  const [soubory, setSoubory] = useState<File[]>([]);
  const [chybaSouboru, setChybaSouboru] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState<boolean>(false);
  const [chybaOdeslani, setChybaOdeslani] = useState<string | null>(null);
  const [mazeId, setMazeId] = useState<string | null>(null);
  const [chybaMazani, setChybaMazani] = useState<string | null>(null);
  const [oznameni, setOznamenie] = useState<string | null>(null);
  const [tedMs, setTedMs] = useState<number>(() => Date.now());
  const [odchazejici, setOdchazejici] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const timer: number = window.setInterval(() => setTedMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const casovace: Map<string, number> = odchodRef.current;
    return () => {
      for (const casovac of casovace.values()) window.clearTimeout(casovac);
      casovace.clear();
    };
  }, []);

  useEffect(() => {
    const pole = poleRef.current;
    if (pole !== null) prizpusobVysku(pole);
  }, [text]);

  const mojeId: string | null = user?.id ?? null;
  const prihlasen: boolean = user !== null;

  const nacti = useCallback(async (): Promise<void> => {
    const generace: number = generaceRef.current;
    setStav("nacitani");
    setChybaNacteni(null);
    const vysledek = await getZpravy(idVypravy, { limit: 50, tail: true });
    if (generace !== generaceRef.current) return;
    if (!vysledek.ok) {
      setStav("chyba");
      setChybaNacteni(vysledek.chyba);
      return;
    }
    scrollNaKonecRef.current = true;
    setZpravy(seradZpravy(vysledek.data.zpravy));
    setStav("hotovo");
  }, [idVypravy]);

  /* Quiet refresh: same GET as the first load, no loading skeleton. */
  const obnovTise = useCallback(async (): Promise<void> => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (probihaObnovaRef.current) return;
    const generace: number = generaceRef.current;
    probihaObnovaRef.current = true;
    try {
      const vysledek = await getZpravy(idVypravy, { limit: 50, tail: true });
      if (generace !== generaceRef.current) return;
      if (!vysledek.ok) return;
      for (const zprava of vysledek.data.zpravy) {
        drzetRef.current.delete(zprava.id);
      }
      const vlakno: HTMLDivElement | null = vlaknoRef.current;
      const uDna: boolean = vlakno === null || jsemUDna(vlakno);
      const schranka: { slouceni: VysledekSlouceni | null } = { slouceni: null };
      setZpravy((prev) => {
        const dalsi: VysledekSlouceni = vyhodnotSlouceni(prev, vysledek.data.zpravy, {
          drzet: [...drzetRef.current.values()],
          skrytId: skrytRef.current,
          konecOkna: true,
        });
        schranka.slouceni = dalsi;
        if (!vlaknaSeLisi(prev, dalsi.zpravy)) return prev;
        const nove: ApiZprava[] = dalsi.zpravy.filter((zprava) => dalsi.novaId.includes(zprava.id));
        if (maScrollovatNaNove(uDna, nove, mojeId)) {
          scrollNaKonecRef.current = true;
        }
        return dalsi.zpravy;
      });
      const slouceni: VysledekSlouceni | null = schranka.slouceni;
      if (slouceni !== null && slouceni.novaId.length > 0 && prihlasen) {
        oznacenoRef.current = idVypravy;
        void oznacVlaknoJakoPrectene(idVypravy);
      }
    } finally {
      probihaObnovaRef.current = false;
    }
  }, [idVypravy, mojeId, prihlasen]);

  useEffect(() => {
    generaceRef.current += 1;
    drzetRef.current = new Map();
    skrytRef.current = new Set();
    for (const casovac of odchodRef.current.values()) window.clearTimeout(casovac);
    odchodRef.current.clear();
    setOdchazejici(new Set());
    scrollNaKonecRef.current = true;
    setText("");
    setChybaOdeslani(null);
    setChybaMazani(null);
    setOznamenie(null);
    void nacti();
  }, [nacti]);

  useEffect(() => {
    if (stav !== "hotovo") return;
    let zruseno = false;
    const tik = (): void => {
      if (zruseno || document.hidden) return;
      void obnovTise();
    };
    const timer: number = window.setInterval(tik, INTERVAL_ZIVYCH_ZPRAV_MS);
    const naViditelnost = (): void => {
      if (!document.hidden) tik();
    };
    document.addEventListener("visibilitychange", naViditelnost);
    window.addEventListener("focus", naViditelnost);
    return () => {
      zruseno = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", naViditelnost);
      window.removeEventListener("focus", naViditelnost);
    };
  }, [stav, obnovTise]);

  /* Scroll only this thread. Stay put when the reader has moved up,
     unless the new message is theirs. */
  useEffect(() => {
    if (!scrollNaKonecRef.current) return;
    const vlakno: HTMLDivElement | null = vlaknoRef.current;
    if (vlakno === null) return;
    scrollNaKonecRef.current = false;
    vlakno.scrollTop = vlakno.scrollHeight;
  }, [zpravy, stav]);

  /*
   * Krok 3 — trigger visible: vlákno se označí jako přečtené, jakmile je
   * DiskuzeBox skutečně vidět (IntersectionObserver, práh 35 %).
   * Jednou na idVypravy, jen pro přihlášené (anonym unread nikdy nesvítí).
   * Po úspěchu hook zhasne tečku eventem bez reloadu.
   */
  useEffect(() => {
    oznacenoRef.current = null;
    const prvek: HTMLDivElement | null = obalRef.current;
    if (prvek === null) return;
    if (stav !== "hotovo") return;
    if (!prihlasen) return;
    function oznac(): void {
      if (oznacenoRef.current === idVypravy) return;
      oznacenoRef.current = idVypravy;
      void oznacVlaknoJakoPrectene(idVypravy);
    }
    if (typeof IntersectionObserver === "undefined") {
      oznac();
      return;
    }
    const pozorovatel = new IntersectionObserver(
      ( zaznamy ) => {
        for (const zaznam of zaznamy) {
          if (zaznam.isIntersecting) oznac();
        }
      },
      { threshold: 0.35 },
    );
    pozorovatel.observe(prvek);
    return () => {
      pozorovatel.disconnect();
    };
  }, [idVypravy, stav, prihlasen]);

  function naVyberSouboru(nove: File[]): void {
    const vysledek = pridejPrilohy(soubory, nove);
    setSoubory(vysledek.soubory);
    setChybaSouboru(vysledek.chyba);
  }

  function naOdebratSoubor(index: number): void {
    setSoubory((prev) => prev.filter((_, i) => i !== index));
    setChybaSouboru(null);
  }

  async function naOdeslat(udalost: FormEvent<HTMLFormElement>): Promise<void> {
    udalost.preventDefault();
    if (!muzeOdeslat(text, odesilaSe, soubory.length)) return;
    const vybrane: File[] = soubory;
    const docasna: ApiZprava = {
      ...vytvorOptimistickouZpravu(idVypravy, mojeId, text),
      prilohy: optimistickePrilohy(vybrane),
    };
    scrollNaKonecRef.current = true;
    setZpravy((prev) => aplikujOptimistickyInsert(prev, docasna));
    setText("");
    setSoubory([]);
    setChybaSouboru(null);
    setChybaOdeslani(null);
    setOznamenie(null);
    setOdesilaSe(true);
    const vysledek = await posliZpravu(idVypravy, docasna.text, vybrane);
    setOdesilaSe(false);
    if (!vysledek.ok) {
      setZpravy((prev) => aplikujRollback(prev, docasna.id));
      setText(docasna.text);
      setSoubory(vybrane);
      setChybaOdeslani(vysledek.chyba);
      return;
    }
    drzetRef.current.set(vysledek.data.zprava.id, vysledek.data.zprava);
    scrollNaKonecRef.current = true;
    setZpravy((prev) =>
      potvrdOptimistickouZpravu(prev, docasna.id, vysledek.data.zprava),
    );
    setOznamenie("Zpráva odeslána.");
    /* Krok 3 — trigger onSend: vlastní zpráva vlákno rovnou přečte. */
    oznacenoRef.current = idVypravy;
    void oznacVlaknoJakoPrectene(idVypravy);
  }

  function oznacOdchod(id: string): void {
    setOdchazejici((prev) => {
      const dalsi: Set<string> = new Set(prev);
      dalsi.add(id);
      return dalsi;
    });
    const stavajici: number | undefined = odchodRef.current.get(id);
    if (stavajici !== undefined) window.clearTimeout(stavajici);
    const casovac: number = window.setTimeout(() => {
      odchodRef.current.delete(id);
      setZpravy((prev) => odeberZpravu(prev, id));
      setOdchazejici((prev) => {
        if (!prev.has(id)) return prev;
        const dalsi: Set<string> = new Set(prev);
        dalsi.delete(id);
        return dalsi;
      });
    }, dobaOdchoduZpravy());
    odchodRef.current.set(id, casovac);
  }

  function zrusOdchod(id: string): void {
    const casovac: number | undefined = odchodRef.current.get(id);
    if (casovac !== undefined) window.clearTimeout(casovac);
    odchodRef.current.delete(id);
    setOdchazejici((prev) => {
      if (!prev.has(id)) return prev;
      const dalsi: Set<string> = new Set(prev);
      dalsi.delete(id);
      return dalsi;
    });
  }

  async function naSmazat(idZpravy: string): Promise<void> {
    if (mazeId !== null) return;
    const puvodni: ApiZprava | undefined = zpravy.find((z) => z.id === idZpravy);
    if (puvodni === undefined) return;
    setMazeId(idZpravy);
    skrytRef.current.add(idZpravy);
    drzetRef.current.delete(idZpravy);
    setChybaMazani(null);
    setOznamenie(null);
    oznacOdchod(idZpravy);
    const vysledek = await smazZpravu(idVypravy, idZpravy);
    setMazeId(null);
    if (!vysledek.ok) {
      skrytRef.current.delete(idZpravy);
      zrusOdchod(idZpravy);
      setZpravy((prev) => vratZpravu(prev, puvodni));
      setChybaMazani(vysledek.chyba);
      return;
    }
    setOznamenie("Zpráva smazána.");
  }

  const zbyva: number = spocitejZbyvajiciZnaky(text);
  const muzePsat: boolean = prihlasen;
  const popisVlakna: string =
    nazevVypravy !== undefined && nazevVypravy.trim().length > 0
      ? `Diskuze k výpravě ${nazevVypravy}`
      : "Diskuze k výpravě";

  return (
    <div ref={obalRef} className={`min-w-0 rounded-2xl border border-linka bg-povrch shadow-jemny ${klidna ? "p-3" : "p-4 min-[90rem]:p-5"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={nadpisId}
            className={klidna ? "text-base font-semibold text-inkoust" : "font-display text-lg font-bold tracking-[-0.3px] text-inkoust min-[90rem]:text-[17px]"}
          >
            Diskuze
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void lightroom.otevri(null)}
          aria-label="Fotky z diskuze"
          title="Fotky z diskuze"
          className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="m21 16-5-5-9 8" />
          </svg>
        </button>
      </div>

      {stav === "nacitani" && (
        <div className="mt-2">
          <KostraZpravy popisek="Načítám diskuzi" />
        </div>
      )}

      {stav === "chyba" && (
        <div className="mt-3 rounded-lg bg-mlha/60 p-4 text-center">
          <p role="alert" className="text-sm font-semibold">
            {chybaNacteni ?? "Diskuzi se nepodařilo načíst."}
          </p>
          <button
            type="button"
            onClick={() => void nacti()}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-okr px-5 text-sm font-semibold text-inkoust hover:bg-okr-tmavy [touch-action:manipulation]"
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {stav === "hotovo" && (
        <>
          {oznameni !== null && (
            <p
              role="status"
              className="mt-2 rounded-xl border border-smrk/30 bg-smrk/10 px-3 py-2 text-sm font-semibold"
            >
              {oznameni}
            </p>
          )}
          {/* Thread scrolls on its own. The composer sits underneath,
              so typing does not move the messages. Height follows the
              text and only stops at the cap. */}
          {zpravy.length === 0 ? (
            <p role="status" className="mt-2 text-sm text-mech">
              Zatím tu není žádná zpráva — začni domluvu první vzkazem níže.
            </p>
          ) : (
          <div
            ref={vlaknoRef}
            data-vlakno-scroll="diskuze"
            className="mt-2 min-w-0 overflow-y-auto overscroll-contain max-h-80"
          >
              {/* M2: jediná pravda pro název vlákna je popisek s názvem
                výpravy. Odkaz na generický nadpis „Diskuze" se nesmí
                kombinovat — čtečka by upřednostnila nadpis bez kontextu
                a popisek s názvem by ignorovala. */}
              <ul
                ref={listRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label={popisVlakna}
                className="flex min-w-0 flex-col"
              >
              {seskupRadkyVlakna(zpravy).map((radek, index, radky) => {
                const zprava = radek.druh === "zprava" ? radek.zprava : radek.zpravy[0];
                if (zprava === undefined) return null;
                const predchozi = index > 0 ? radky[index - 1] : undefined;
                const predchoziZprava =
                  predchozi?.druh === "zprava"
                    ? predchozi.zprava
                    : predchozi?.zpravy[predchozi.zpravy.length - 1];
                const skrytHlavicku =
                  predchoziZprava !== undefined &&
                  zprava.autorId !== null &&
                  predchoziZprava.autorId === zprava.autorId &&
                  stejnyDen(predchoziZprava.createdAt, zprava.createdAt);
                const dalsi = radek.druh === "davka" ? radek.zpravy.slice(1) : [];
                const jeMoje: boolean =
                  mojeId !== null && zprava.autorId === mojeId;
                const muzeMazat: boolean = smiSmazatZpravu({
                  jeAdmin: isAdmin,
                  jeAutor: jeMoje,
                  createdAt: zprava.createdAt,
                  ted: new Date(tedMs),
                });
                return (
                  <ZpravaBublina
                    key={zprava.id}
                    zprava={zprava}
                    dalsiZpravy={dalsi}
                    podoba="zapis"
                    skrytHlavicku={skrytHlavicku}
                    odstup={!skrytHlavicku && index > 0}
                    autorPopisek={vyberAutorPopisek(zprava, mojeId)}
                    jeOrganizator={
                      organizatorId !== null && zprava.autorId === organizatorId
                    }
                    jeMoje={jeMoje}
                    muzeMazat={muzeMazat && !zprava.id.startsWith("optimistic-")}
                    lzeSmazat={(id) => {
                      const cil = (radek.druh === "davka" ? radek.zpravy : [zprava]).find(
                        (polozka) => polozka.id === id,
                      );
                      if (cil === undefined || cil.id.startsWith("optimistic-")) return false;
                      return smiSmazatZpravu({
                        jeAdmin: isAdmin,
                        jeAutor: mojeId !== null && cil.autorId === mojeId,
                        createdAt: cil.createdAt,
                        ted: new Date(tedMs),
                      });
                    }}
                    mazeSe={mazeId === zprava.id}
                    mazeId={mazeId}
                    odchazi={odchazejici.has(zprava.id)}
                    onSmazat={(id) => void naSmazat(id)}
                    onOtevriObrazek={(prilohaId) => void lightroom.otevri(prilohaId)}
                  />
                );
              })}
              </ul>
            {chybaMazani !== null && (
              <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                {chybaMazani}
              </p>
            )}
          </div>
          )}

          {muzePsat ? (
            <form
              onSubmit={(e) => void naOdeslat(e)}
              /* One writing line under the thread. Safe-area keeps it above the keyboard.
                 Not sticky inside the message scroller, so focus does not jump. */
              className="mt-3 border-t border-linka pt-3"
              style={{
                paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <label htmlFor={composerId} className="sr-only">
                Napsat vzkaz
              </label>
              <div className="flex min-w-0 items-end gap-2">
              <div className="flex min-w-0 flex-1 items-end rounded-[10px] border border-transparent bg-povrch-2 px-1 focus-within:border-pole">
                <TlacitkoPrilohy vzhled="tichy" disabled={odesilaSe} onVyber={naVyberSouboru} />
                <textarea
                  ref={poleRef}
                  id={composerId}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    prizpusobVysku(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    if (!muzeOdeslat(text, odesilaSe, soubory.length)) return;
                    e.currentTarget.form?.requestSubmit();
                  }}
                  rows={1}
                  enterKeyHint="send"
                  maxLength={MAX_DELKA + 50}
                  placeholder="Napsat vzkaz ke výpravě…"
                  autoComplete="off"
                  aria-describedby={zbyva <= 80 ? pocitadloId : undefined}
                  className="block max-h-32 min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2.5 text-base leading-5 text-inkoust caret-smrk outline-none selection:bg-okr/40 placeholder:text-ink-3 min-[90rem]:text-[13px]"
                />
              </div>
                <button
                  type="submit"
                  disabled={!muzeOdeslat(text, odesilaSe, soubory.length)}
                  aria-label={
                    odesilaSe ? "Odesílání probíhá…" : "Poslat zprávu do diskuze"
                  }
                  title={
                    odesilaSe ? "Odesílání probíhá…" : "Poslat zprávu do diskuze"
                  }
                  className="nahled-poslat inline-flex h-11 min-h-[44px] shrink-0 items-center justify-center rounded-[10px] bg-smrk px-3.5 text-[13px] font-semibold text-papir [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {odesilaSe ? "…" : "Poslat"}
                </button>
              </div>
              <ChipyPriloh vzhled="tichy" soubory={soubory} disabled={odesilaSe} onOdebrat={naOdebratSoubor} />
              {chybaSouboru !== null && (
                <p role="alert" className="mt-1 min-w-0 break-words px-1 text-sm font-semibold text-red-800">
                  {chybaSouboru}
                </p>
              )}
              {zbyva <= 80 ? (
                <span
                  id={pocitadloId}
                  role="status"
                  className={`mt-1 block px-1 text-[12px] font-semibold tabular-nums ${
                    zbyva < 0 ? "text-red-800" : "text-inkoust/60"
                  }`}
                >
                  {zbyva < 0
                    ? `O ${Math.abs(zbyva)} znaků přes limit`
                    : `Zbývá ${zbyva} z ${MAX_DELKA}`}
                </span>
              ) : null}
              {chybaOdeslani !== null && (
                <p
                  role="alert"
                  className="mt-2 text-sm font-semibold text-red-800"
                >
                  {chybaOdeslani}
                </p>
              )}
            </form>
          ) : (
            <p
              role="status"
              className="mt-3 min-w-0 break-words rounded-2xl bg-mech/10 p-3 text-center text-sm text-inkoust/70"
            >
              Diskuzi čte každý, psát můžou přihlášení — přihlas se a přidej
              vzkaz.
            </p>
          )}
        </>
      )}
      {lightroom.otevreno ? (
        <ChatLightroom
          nazev={nazevVypravy ?? "výprava"}
          fotky={lightroom.fotky}
          nacitaSe={lightroom.nacitaSe}
          chyba={lightroom.chyba}
          vybranaId={lightroom.vybranaId}
          onZavrit={lightroom.zavri}
        />
      ) : null}
    </div>
  );
}
