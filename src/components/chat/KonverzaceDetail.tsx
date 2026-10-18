import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
} from "react";
import type { ApiKonverzace, ApiZprava } from "../../shared/api-types";
import {
  getGlobalZpravy,
  getSoukromeZpravy,
  getZpravy,
  markAsRead,
  oznacKonverzaciJakoPrectenou,
  posliGlobalZpravu,
  posliSoukromouZpravu,
  posliZpravu,
  smazZpravu,
} from "../../lib/diskuze-api";
import { partnerSoukromeho } from "../../shared/soukromy-klic";
import { vyberAutorPopisek } from "./DiskuzeBox";
import ZpravaBublina from "./ZpravaBublina";
import Composer from "./Composer";

export interface KonverzaceDetailProps {
  konverzace: ApiKonverzace;
  /** Vyřešený český název (Důležité / General / název výpravy). */
  nazev: string;
  /** Id přihlášeného (null = anonym — čte, nepíše). */
  currentUserId: string | null;
  /** Důležité smí psát jen vedení / rada / admin (guard hlídá i server 403). */
  muzePsatDulezite: boolean;
  /** Cizí zprávy mazat smí správce výprav (autor maže vždy vlastní). */
  muzeMazatCizi: boolean;
  /** Mobilní zpět na seznam (desktop ho nezobrazuje). */
  onZpet?: () => void;
  /** Rodič po úspěšném read zhasne badge v seznamu (unreadCount → 0). */
  onPrecteno?: (key: string) => void;
  /** Po úspěšném odeslání (seznam soukromých chatů se doplní). */
  onPoOdeslani?: () => void;
}

/* ------------------------------------------------------------------ */
/* Pure pomocníci — export pro tests/chat-konverzace-step3.test.ts.     */
/* ------------------------------------------------------------------ */

/** Stejný kalendářní den (místní čas) — hranice seskupení bublin. */
export function jeStejnyDen(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Český popisek dne pro oddělovač: „Dnes" / „Včera" / „1. 10. 2026".
 * Nevalidní ISO → prázdné (žádný NaN do UI).
 */
export function popisekDne(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const dnes = new Date();
  const vcera = new Date();
  vcera.setDate(dnes.getDate() - 1);
  const stejnyDen = (x: Date, y: Date): boolean =>
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate();
  if (stejnyDen(dt, dnes)) return "Dnes";
  if (stejnyDen(dt, vcera)) return "Včera";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).format(dt);
  } catch {
    return "";
  }
}

export interface BlokZprav {
  /** Klíč bloku pro React (`autorId + den + první id`). */
  key: string;
  autorId: string | null;
  denIso: string;
  zpravy: ApiZprava[];
}

/**
 * Seskupí vlákno (ASC) do bloků: nový blok = jiný autor NEBO jiný den.
 * Hlavičku (`authorName` + avatar) kreslí jen první bublina bloku —
 * zbytek jede v `skrytHlavicku` (žádná „každá zpráva = bublina konverzace").
 */
export function seskupZpravyDoBloku(zpravy: readonly ApiZprava[]): BlokZprav[] {
  const bloky: BlokZprav[] = [];
  for (const zprava of zpravy) {
    const posledni: BlokZprav | undefined = bloky[bloky.length - 1];
    const navazuje: boolean =
      posledni !== undefined &&
      posledni.autorId === zprava.autorId &&
      posledni.zpravy.length > 0 &&
      jeStejnyDen(
        posledni.zpravy[posledni.zpravy.length - 1]?.createdAt ?? "",
        zprava.createdAt,
      );
    if (navazuje && posledni !== undefined) {
      posledni.zpravy.push(zprava);
    } else {
      bloky.push({
        key: `${zprava.autorId ?? "smazan"}-${zprava.createdAt}-${zprava.id}`,
        autorId: zprava.autorId,
        denIso: zprava.createdAt,
        zpravy: [zprava],
      });
    }
  }
  return bloky;
}

/** Vlákno řadí server ASC — klient pořadí drží (stabilní, bez přehazování). */
export function seradVlakno(zpravy: ApiZprava[]): ApiZprava[] {
  return [...zpravy].sort((a, b) => {
    const cas: number = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (cas !== 0) return cas;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Detail threadu konverzace (Step 3).
 *
 * - Bubliny seskupené po autorovi/dni (hlavička `authorName` jen na začátku
 *   bloku, „Ty" jen při `autorId === currentUserId`).
 * - Denní oddělovače (Dnes / Včera / datum), `role="log"` + `aria-live`.
 * - Composer: v Důležitém pro běžného USERa skrytý + read-only notice
 *   (guard 403 hlídá i server); anonym vidí výzvu k přihlášení.
 * - Mazání jen ve vlákně výpravy (autor / správce); globály mazání nemají.
 * - Offline-friendly: chyba čtení s retry, chyba zápisu bez ztráty textu
 *   (text drží Composer, rollback jen optimistickou bublinu).
 */
export default function KonverzaceDetail({
  konverzace,
  nazev,
  currentUserId,
  muzePsatDulezite,
  muzeMazatCizi,
  onZpet,
  onPrecteno,
  onPoOdeslani,
}: KonverzaceDetailProps): JSX.Element {
  const [stav, setStav] = useState<"nacitani" | "hotovo" | "chyba">("nacitani");
  const [zpravy, setZpravy] = useState<ApiZprava[]>([]);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState<boolean>(false);
  const [chybaOdeslani, setChybaOdeslani] = useState<string | null>(null);
  const [mazeId, setMazeId] = useState<string | null>(null);
  const [oznameni, setOznameni] = useState<string | null>(null);
  const nadpisRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /* chat-scroll-fix: the thread owns its scroll. Composer sticky bottom-0
     sticks here (flex-1 on phone, max-h 70dvh from lg), never the page. */
  const vlaknoRef = useRef<HTMLDivElement>(null);

  const jeSoukrome: boolean = konverzace.channel === "soukrome";
  const jeGlobal: boolean = konverzace.channel !== "expedice" && !jeSoukrome;
  const jeDulezite: boolean = konverzace.channel === "dulezite";
  const prihlasen: boolean = currentUserId !== null;
  const smiPsat: boolean = jeSoukrome ? prihlasen : !jeDulezite || muzePsatDulezite;
  const klic: string = konverzace.key;

  const nacti = useCallback(async (): Promise<void> => {
    setStav("nacitani");
    setChybaNacteni(null);
    const vysledek = jeSoukrome
      ? await getSoukromeZpravy(konverzace.key)
      : konverzace.channel === "expedice" && konverzace.expeditionId !== null
        ? await getZpravy(konverzace.expeditionId, { limit: 100 })
        : await getGlobalZpravy(konverzace.channel === "general" ? "general" : "dulezite", { limit: 100 });
    if (!vysledek.ok) {
      setStav("chyba");
      setChybaNacteni(vysledek.chyba);
      return;
    }
    setZpravy(seradVlakno(vysledek.data.zpravy));
    setStav("hotovo");
  }, [jeSoukrome, konverzace.channel, konverzace.expeditionId, konverzace.key]);

  /* Přepnutí threadu = nový load + focus nadpisu (čtečka ví, kde je). */
  useEffect(() => {
    setZpravy([]);
    setChybaOdeslani(null);
    setOznameni(null);
    void nacti();
  }, [nacti, klic]);

  useEffect(() => {
    if (stav === "hotovo") nadpisRef.current?.focus({ preventScroll: true });
  }, [stav, klic]);

  /* Přečtení: po úspěšném loadu označit (USER; anonym nemá co značit). */
  useEffect(() => {
    if (stav !== "hotovo") return;
    if (!prihlasen) return;
    let zive = true;
    void (async (): Promise<void> => {
      if (jeGlobal || jeSoukrome) {
        const vysledek = await oznacKonverzaciJakoPrectenou(klic);
        if (zive && vysledek.ok) onPrecteno?.(klic);
      } else if (konverzace.expeditionId !== null) {
        const vysledek = await markAsRead(konverzace.expeditionId);
        if (zive && vysledek.ok) onPrecteno?.(klic);
      }
    })();
    return () => {
      zive = false;
    };
  }, [stav, prihlasen, jeGlobal, jeSoukrome, klic, konverzace.expeditionId, onPrecteno]);

  /* Nová zpráva doscrolluje jen vlastní vlákno (thread-local scrollTop).
     `scrollIntoView` by bublalo do vnějšího scrollu stránky/detailu. */
  const pocetZprav: number = zpravy.length;
  useEffect(() => {
    const vlakno: HTMLDivElement | null = vlaknoRef.current;
    if (vlakno === null) return;
    vlakno.scrollTop = vlakno.scrollHeight;
  }, [pocetZprav]);

  async function naOdeslat(text: string): Promise<void> {
    if (odesilaSe) return;
    setOdesilaSe(true);
    setChybaOdeslani(null);
    setOznameni(null);
    if (jeSoukrome) {
      const partnerId = konverzace.partnerId ?? (currentUserId === null ? null : partnerSoukromeho(konverzace.key, currentUserId));
      if (partnerId === null) {
        setOdesilaSe(false);
        setChybaOdeslani("Soukromou zprávu se nepodařilo odeslat.");
        return;
      }
      const vysledek = await posliSoukromouZpravu(partnerId, text);
      setOdesilaSe(false);
      if (!vysledek.ok) {
        setChybaOdeslani(vysledek.chyba);
        return;
      }
      setZpravy((prev) => seradVlakno([...prev, vysledek.data.zprava]));
      onPoOdeslani?.();
    } else if (jeGlobal) {
      const vysledek = await posliGlobalZpravu(konverzace.channel === "general" ? "general" : "dulezite", text);
      setOdesilaSe(false);
      if (!vysledek.ok) {
        setChybaOdeslani(vysledek.chyba);
        return;
      }
      setZpravy((prev) => seradVlakno([...prev, vysledek.data.zprava]));
    } else if (konverzace.expeditionId !== null) {
      const vysledek = await posliZpravu(konverzace.expeditionId, text);
      setOdesilaSe(false);
      if (!vysledek.ok) {
        setChybaOdeslani(vysledek.chyba);
        return;
      }
      setZpravy((prev) => seradVlakno([...prev, vysledek.data.zprava]));
    } else {
      setOdesilaSe(false);
      return;
    }
    setOznameni("Zpráva odeslána.");
    onPrecteno?.(klic);
  }

  async function naSmazat(idZpravy: string): Promise<void> {
    if (mazeId !== null) return;
    if (jeGlobal) return;
    if (konverzace.expeditionId === null) return;
    setMazeId(idZpravy);
    const vysledek = await smazZpravu(konverzace.expeditionId, idZpravy);
    setMazeId(null);
    if (!vysledek.ok) {
      setChybaOdeslani(vysledek.chyba);
      return;
    }
    setZpravy((prev) => prev.filter((z) => z.id !== idZpravy));
    setOznameni("Zpráva smazána.");
  }

  const bloky: BlokZprav[] = seskupZpravyDoBloku(zpravy);
  let posledniDen: string | null = null;

  return (
    <section aria-label={`Konverzace ${nazev}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-w-0 items-center gap-2 border-b-2 border-inkoust pb-2 lg:pb-3">
        {onZpet !== undefined && (
          <button
            type="button"
            onClick={onZpet}
            aria-label="Zpět na seznam konverzací"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-inkoust bg-papir px-3 text-sm font-bold [touch-action:manipulation] lg:hidden"
          >
            ←
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2
            ref={nadpisRef}
            tabIndex={-1}
            title={nazev}
            className="min-w-0 truncate text-lg font-extrabold tracking-tight lg:text-xl"
            style={{ overflowWrap: "anywhere" }}
          >
            {nazev}
          </h2>
          <p className="mt-0.5 min-w-0 truncate text-[12px] font-semibold uppercase tracking-[0.12em] text-inkoust/60">
            {jeSoukrome
              ? "Soukromá zpráva · jen vy dva"
              : jeDulezite
                ? "Připnuté · důležitá oznámení"
                : konverzace.channel === "general"
                  ? "Připnuté · obecná domluva"
                  : "Vlákno výpravy"}
          </p>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3">
        {stav === "nacitani" && (
          <div className="space-y-2" aria-busy="true" aria-label={`Načítám konverzaci ${nazev}`}>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-inkoust/10 motion-reduce:animate-none"
              />
            ))}
            <p role="status" className="text-sm text-inkoust/70">
              Načítám zprávy…
            </p>
          </div>
        )}

        {stav === "chyba" && (
          <div className="rounded-2xl border-2 border-inkoust/20 bg-papir p-4 text-center">
            <p role="alert" className="text-sm font-semibold">
              {chybaNacteni ?? "Zprávy se nepodařilo načíst."}
            </p>
            <button
              type="button"
              onClick={() => void nacti()}
              className="mt-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-5 text-sm font-bold text-papir [touch-action:manipulation]"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {stav === "hotovo" && (
          <>
            {oznameni !== null && (
              <p role="status" className="rounded-xl border border-smrk/30 bg-smrk/10 px-3 py-2 text-sm font-semibold">
                {oznameni}
              </p>
            )}
            {/* chat-scroll-fix: the thread is its own scroll card. The composer
                stays under it so the page itself does not scroll. */}
            <div
              ref={vlaknoRef}
              data-vlakno-scroll="konverzace"
              className="mt-2 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-inkoust/15 bg-papir/60 p-2 lg:max-h-[70dvh] lg:flex-none lg:p-3"
            >
            {bloky.length === 0 ? (
              <p
                role="status"
                className="min-w-0 break-words rounded-xl border border-dashed border-inkoust/25 bg-papir/60 p-4 text-center text-sm text-inkoust/70"
              >
                Zatím tu není žádná zpráva — začni domluvu první vzkazem níže.
              </p>
            ) : (
              <ul
                ref={listRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label={`Vlákno ${nazev}`}
                className="min-w-0 space-y-3"
              >
                {bloky.map((blok) => {
                  const den: string = popisekDne(blok.denIso);
                  const ukázatDen: boolean = posledniDen !== den;
                  if (ukázatDen) posledniDen = den;
                  return (
                    <li key={blok.key} className="min-w-0">
                      {ukázatDen && den.length > 0 && (
                        <p
                          aria-label={den}
                          className="mb-2 text-center text-[11px] font-extrabold uppercase tracking-[0.16em] text-inkoust/50"
                        >
                          <span className="inline-block rounded-full border border-inkoust/20 bg-papir px-3 py-1">
                            {den}
                          </span>
                        </p>
                      )}
                      <ul className="min-w-0 space-y-1.5">
                        {blok.zpravy.map((zprava, index) => {
                          const jeMoje: boolean =
                            currentUserId !== null && zprava.autorId === currentUserId;
                          const muzeMazat: boolean =
                            !jeGlobal && (jeMoje || muzeMazatCizi) && !zprava.id.startsWith("optimistic-");
                          return (
                            <ZpravaBublina
                              key={zprava.id}
                              zprava={zprava}
                              autorPopisek={vyberAutorPopisek(zprava, currentUserId)}
                              jeMoje={jeMoje}
                              muzeMazat={muzeMazat}
                              mazeSe={mazeId === zprava.id}
                              onSmazat={(id) => void naSmazat(id)}
                              skrytHlavicku={index > 0}
                            />
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>

            {/* Composer sits under the thread so history can use the rest of the phone. */}
            <div
              className="mt-2 shrink-0"
              style={{ paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {!prihlasen ? (
                <p
                  role="status"
                  className="rounded-2xl bg-mech/10 p-3 text-center text-sm text-inkoust/70"
                >
                  Konverzaci čte každý, psát můžou přihlášení — přihlas se a
                  přidej vzkaz.
                </p>
              ) : !smiPsat ? (
                <p
                  role="status"
                  className="rounded-2xl border-2 border-jantar/50 bg-papir p-3 text-center text-sm text-inkoust/80 shadow-denik"
                >
                  Důležité čte každý, psát můžou jen vedení, rada nebo admin.
                  Obecnou domluvu piš do Generalu.
                </p>
              ) : (
                <Composer
                  popisek={
                    jeSoukrome
                      ? `Napsat soukromě ${nazev}`
                      : jeDulezite
                        ? "Napsat důležité oznámení"
                        : konverzace.channel === "general"
                          ? "Napsat do Generalu"
                          : `Napsat do ${nazev}`
                  }
                  placeholder={
                    jeDulezite
                      ? "Stručně a jasně pro všechny…"
                      : "Domluv sraz, odvoz, svačinu…"
                  }
                  odesilaSe={odesilaSe}
                  chyba={chybaOdeslani}
                  onOdeslat={(text) => void naOdeslat(text)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
