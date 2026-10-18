import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import { useAuth } from "../../hooks/useAuth";
import { oznacVlaknoJakoPrectene } from "../../hooks/useUnreadExpeditions";
import {
  getZpravy,
  posliZpravu,
  smazZpravu,
  type ApiZprava,
} from "../../lib/diskuze-api";
import { VALIDACE } from "../../shared/api-types";
import ZpravaBublina from "./ZpravaBublina";

export interface DiskuzeBoxProps {
  idVypravy: string;
  /** Volitelné jméno výpravy pro aria-label vlákna. */
  nazevVypravy?: string;
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

/** Composer jde odeslat jen s neprázdným textem do 1000 znaků a mimo běh. */
export function muzeOdeslat(text: string, odesilaSe: boolean): boolean {
  if (odesilaSe) return false;
  const delka: number = Array.from(text.trim()).length;
  return delka >= 1 && delka <= MAX_DELKA;
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
}: DiskuzeBoxProps): JSX.Element {
  const { user, muzeSpravovatVypravy } = useAuth();
  const nadpisId: string = useId();
  const composerId: string = useId();
  const pocitadloId: string = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const poleRef = useRef<HTMLTextAreaElement>(null);
  const obalRef = useRef<HTMLDivElement>(null);
  /* Messages scroll here. The composer is a sibling below this node. */
  const vlaknoRef = useRef<HTMLDivElement>(null);
  const oznacenoRef = useRef<string | null>(null);

  const [stav, setStav] = useState<StavVlakna>("nacitani");
  const [zpravy, setZpravy] = useState<ApiZprava[]>([]);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [text, setText] = useState<string>("");
  const [odesilaSe, setOdesilaSe] = useState<boolean>(false);
  const [chybaOdeslani, setChybaOdeslani] = useState<string | null>(null);
  const [mazeId, setMazeId] = useState<string | null>(null);
  const [chybaMazani, setChybaMazani] = useState<string | null>(null);
  const [oznameni, setOznamenie] = useState<string | null>(null);

  useEffect(() => {
    const pole = poleRef.current;
    if (pole !== null) prizpusobVysku(pole);
  }, [text]);

  const mojeId: string | null = user?.id ?? null;
  const prihlasen: boolean = user !== null;

  const nacti = useCallback(async (): Promise<void> => {
    setStav("nacitani");
    setChybaNacteni(null);
    const vysledek = await getZpravy(idVypravy, { limit: 50 });
    if (!vysledek.ok) {
      setStav("chyba");
      setChybaNacteni(vysledek.chyba);
      return;
    }
    setZpravy(seradZpravy(vysledek.data.zpravy));
    setStav("hotovo");
  }, [idVypravy]);

  useEffect(() => {
    setText("");
    setChybaOdeslani(null);
    setChybaMazani(null);
    setOznamenie(null);
    void nacti();
  }, [nacti]);

  /* Nová zpráva doscrolluje jen vlastní vlákno (thread-local scrollTop).
     `scrollIntoView` na poslední bublině by bublalo do scrollu celého
     modalu a tahalo detail za chatem — proto saháme jen na vlaknoRef. */
  const pocetZprav: number = zpravy.length;
  useEffect(() => {
    const vlakno: HTMLDivElement | null = vlaknoRef.current;
    if (vlakno === null) return;
    vlakno.scrollTop = vlakno.scrollHeight;
  }, [pocetZprav]);

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

  async function naOdeslat(udalost: FormEvent<HTMLFormElement>): Promise<void> {
    udalost.preventDefault();
    if (!muzeOdeslat(text, odesilaSe)) return;
    const docasna: ApiZprava = vytvorOptimistickouZpravu(
      idVypravy,
      mojeId,
      text,
    );
    setZpravy((prev) => aplikujOptimistickyInsert(prev, docasna));
    setText("");
    setChybaOdeslani(null);
    setOznamenie(null);
    setOdesilaSe(true);
    const vysledek = await posliZpravu(idVypravy, docasna.text);
    setOdesilaSe(false);
    if (!vysledek.ok) {
      setZpravy((prev) => aplikujRollback(prev, docasna.id));
      setChybaOdeslani(vysledek.chyba);
      return;
    }
    setZpravy((prev) =>
      potvrdOptimistickouZpravu(prev, docasna.id, vysledek.data.zprava),
    );
    setOznamenie("Zpráva odeslána.");
    /* Krok 3 — trigger onSend: vlastní zpráva vlákno rovnou přečte. */
    oznacenoRef.current = idVypravy;
    void oznacVlaknoJakoPrectene(idVypravy);
  }

  async function naSmazat(idZpravy: string): Promise<void> {
    if (mazeId !== null) return;
    setMazeId(idZpravy);
    setChybaMazani(null);
    setOznamenie(null);
    const vysledek = await smazZpravu(idVypravy, idZpravy);
    setMazeId(null);
    if (!vysledek.ok) {
      setChybaMazani(vysledek.chyba);
      return;
    }
    setZpravy((prev) => prev.filter((z) => z.id !== idZpravy));
    setOznamenie("Zpráva smazána.");
  }

  const zbyva: number = spocitejZbyvajiciZnaky(text);
  const muzePsat: boolean = prihlasen;
  const popisVlakna: string =
    nazevVypravy !== undefined && nazevVypravy.trim().length > 0
      ? `Diskuze k výpravě ${nazevVypravy}`
      : "Diskuze k výpravě";

  return (
    <div ref={obalRef} className="min-w-0">
      <h3
        id={nadpisId}
        className="text-sm font-bold uppercase tracking-[0.14em] text-inkoust/60"
      >
        Diskuze
      </h3>

      {stav === "nacitani" && (
        <div
          className="mt-2 space-y-2"
          aria-busy="true"
          aria-label="Načítám diskuzi"
        >
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-2xl bg-inkoust/10 motion-reduce:animate-none"
            />
          ))}
          <p role="status" className="text-sm text-inkoust/70">
            Načítám diskuzi…
          </p>
        </div>
      )}

      {stav === "chyba" && (
        <div className="mt-2 rounded-2xl border-2 border-inkoust/20 bg-papir p-4 text-center">
          <p role="alert" className="text-sm font-semibold">
            {chybaNacteni ?? "Diskuzi se nepodařilo načíst."}
          </p>
          <button
            type="button"
            onClick={() => void nacti()}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-5 text-sm font-bold text-papir [touch-action:manipulation]"
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
              so typing does not move the messages. */}
          <div
            ref={vlaknoRef}
            data-vlakno-scroll="diskuze"
            className="mt-2 max-h-80 min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-inkoust/15 bg-papir/60 p-3"
          >
          {zpravy.length === 0 ? (
            <p
              role="status"
              className="min-w-0 break-words rounded-xl border border-dashed border-inkoust/25 bg-papir/60 p-4 text-center text-sm text-inkoust/70"
            >
              Zatím tu není žádná zpráva — začni domluvu první vzkazem níže.
            </p>
          ) : (
            <>
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
                className="min-w-0 space-y-3"
              >
              {zpravy.map((zprava) => {
                const jeMoje: boolean =
                  mojeId !== null && zprava.autorId === mojeId;
                const muzeMazat: boolean =
                  jeMoje || muzeSpravovatVypravy;
                return (
                  <ZpravaBublina
                    key={zprava.id}
                    zprava={zprava}
                    autorPopisek={vyberAutorPopisek(zprava, mojeId)}
                    jeMoje={jeMoje}
                    muzeMazat={muzeMazat && !zprava.id.startsWith("optimistic-")}
                    mazeSe={mazeId === zprava.id}
                    onSmazat={(id) => void naSmazat(id)}
                  />
                );
              })}
              </ul>
            </>
          )}

          {chybaMazani !== null && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
              {chybaMazani}
            </p>
          )}
          </div>

          {muzePsat ? (
            <form
              onSubmit={(e) => void naOdeslat(e)}
              /* One line under the thread. Safe-area keeps it above the keyboard.
                 Not sticky inside the message scroller, so focus does not jump. */
              className="mt-2 rounded-2xl border-2 border-inkoust bg-papir p-1 shadow-denik"
              style={{
                paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <label htmlFor={composerId} className="sr-only">
                Napsat vzkaz
              </label>
              <div className="flex min-w-0 items-start gap-1">
                <textarea
                  ref={poleRef}
                  id={composerId}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    prizpusobVysku(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) return;
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }}
                  rows={1}
                  enterKeyHint="send"
                  maxLength={MAX_DELKA + 50}
                  placeholder="Vzkaz…"
                  autoComplete="off"
                  aria-describedby={zbyva <= 80 ? pocitadloId : undefined}
                  className="block h-11 min-h-[44px] min-w-0 flex-1 resize-none overflow-hidden rounded-xl border-2 border-inkoust/25 bg-papir px-3 py-2.5 text-base leading-5 placeholder:text-inkoust/40"
                />
                <button
                  type="submit"
                  disabled={!muzeOdeslat(text, odesilaSe)}
                  aria-label={
                    odesilaSe ? "Odesílání probíhá…" : "Poslat zprávu do diskuze"
                  }
                  title={
                    odesilaSe ? "Odesílání probíhá…" : "Poslat zprávu do diskuze"
                  }
                  className="nahled-poslat inline-flex h-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-3 text-sm font-bold text-papir [touch-action:manipulation] motion-safe:hover:bg-inkoust disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {odesilaSe ? "…" : "Poslat"}
                </button>
              </div>
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
    </div>
  );
}
