/**
 * useUnreadExpeditions — badge nepřečtené diskuze (Fáze 5, Krok 2).
 *
 * Zdrojem pravdy je vždy server (`GET discussion/meta`, viz Step 1 +
 * `src/lib/diskuze-api.ts`). Pravidlo: unread = latestMessageAt > lastReadAt
 * (prázdné vlákno nikdy nesvítí, anonym vždy false — viz `jeNeprectene`).
 *
 * Chování hooku:
 * - fetch meta při načtení + jeden sdílený polling (výchozí 30 s) pro všechna
 *   id najednou (`Promise.all`), takže API se nezahltí (žádný timer na id).
 * - pauza při skryté záložce (`document.hidden` + `visibilitychange`),
 *   refetch při návratu a při `focus`.
 * - minimum intervalu 10 s (nižší hodnota se zvedne — ochrana API).
 * - okamžitý render po reloadu ze snapshot cache
 *   (`exapp:discussion-unread-v1`), vždy následně revalidace serverem.
 * - okamžité zhasnutí tečky po `oznacVlaknoJakoPrectene` přes window event
 *   (bez čekání na další polling), server stav potvrdí při příštím fetchi.
 *
 * Určeno pro seznam výprav (badge s tečkou). `DiskuzeBox` volá
 * `oznacVlaknoJakoPrectene(id)` při zobrazení vlákna a po úspěšném odeslání
 * zprávy. Žádný secret v klientovi, chyby se tiše ignorují (badge zůstává
 * na poslední známé hodnotě). Strict TypeScript, žádný `any`, česky.
 *
 * Příklad:
 * ```tsx
 * const neprectene = useUnreadExpeditions(idsVyprav);
 * // ...
 * {neprectene.get(vyprava.id) === true && (
 *   <span role="status" aria-label="Nové zprávy v diskuzi" className="tecka" />
 * )}
 * ```
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDiscussionMeta,
  markAsRead,
} from "../lib/diskuze-api";

/** Výchozí polling 30 s (zadání kroku). */
export const VYCHOZI_UNREAD_POLLING_MS = 30_000 as const;
/** Minimum intervalu — ochrana API před zahlcením. */
export const MIN_UNREAD_POLLING_MS = 10_000 as const;
/** Snapshot cache pro okamžitý render (pravdou zůstává server). */
export const UNREAD_CACHE_KLIC = "exapp:discussion-unread-v1" as const;
/** Event pro okamžité zhasnutí tečky po POST read (Box → hook). */
export const DISKUZE_PRECTENO_EVENT = "exapp:discussion-read" as const;
/** Oddělovač id ve stabilním klíči seznamu (id výpravy ho neobsahuje). */
const ODDELOVAC_SEZNAMU = "|";

export interface UseUnreadVolby {
  /** Polling v ms (výchozí 30 000; méně než 10 000 se zvedne na minimum). */
  pollingMs?: number;
  /** Vypínač fetch + pollingu (výchozí true). */
  povoleno?: boolean;
}

/** Normalizuje seznam id: trim, prázdné pryč, deduplikace, stabilní řazení. */
export function normalizujSeznamId(ids: readonly string[]): string[] {
  const ciste: string[] = [];
  for (const id of ids) {
    const otrimovane: string = id.trim();
    if (otrimovane.length === 0) continue;
    if (!ciste.includes(otrimovane)) ciste.push(otrimovane);
  }
  ciste.sort();
  return ciste;
}

/**
 * Součet badge pro Navbar: kolik vláken z mapy právě svítí.
 * Čistá funkce vedle `jeNeprectene` — jediný způsob, jak z
 * `Map<id, boolean>` spočítat číslo pro tečku v navigaci.
 * Chybějící klíč se nepočítá (volající drží úplnou mapu z hooku).
 */
export function spocitejNeprectene(
  mapa: ReadonlyMap<string, boolean>,
): number {
  let pocet = 0;
  for (const sviti of mapa.values()) {
    if (sviti === true) pocet += 1;
  }
  return pocet;
}

/**
 * Český popisek počtu pro dynamický `aria-label` navigace.
 * 1 → „1 nepřečtená zpráva“, 2–4 → „2 nepřečtené zprávy“,
 * 5+ → „5 nepřečtených zpráv“. Nula a zápor = „žádné nepřečtené zprávy“.
 */
export function popisekNeprectenych(pocet: number): string {
  const cele: number = Number.isFinite(pocet) ? Math.max(0, Math.floor(pocet)) : 0;
  if (cele === 0) return "žádné nepřečtené zprávy";
  if (cele === 1) return "1 nepřečtená zpráva";
  if (cele >= 2 && cele <= 4) return `${cele} nepřečtené zprávy`;
  return `${cele} nepřečtených zpráv`;
}

/**
 * Čisté pravidlo unread: latestMessageAt > lastReadAt.
 * Prázdné vlákno (latest null) nikdy nesvítí; nikdy nečetl (lastRead null)
 * + neprázdné vlákno svítí. Nevalidní časy = nesvítí (bezpečný default).
 */
export function jeNeprectene(
  latestMessageAt: string | null,
  lastReadAt: string | null,
): boolean {
  if (latestMessageAt === null) return false;
  const latestCas: number = Date.parse(latestMessageAt);
  if (Number.isNaN(latestCas)) return false;
  if (lastReadAt === null) return true;
  const readCas: number = Date.parse(lastReadAt);
  if (Number.isNaN(readCas)) return true;
  return latestCas > readCas;
}

/** Přečte snapshot cache; nevalidní záznam → prázdný objekt. */
export function ctiUnreadZCache(): Record<string, boolean> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw: string | null = localStorage.getItem(UNREAD_CACHE_KLIC);
    if (raw === null || raw.trim().length === 0) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const vysledek: Record<string, boolean> = {};
    for (const [klic, hodnota] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof hodnota === "boolean") vysledek[klic] = hodnota;
    }
    return vysledek;
  } catch {
    return {};
  }
}

/** Zapíše snapshot cache (best-effort, pád úložiště nesmí shodit UI). */
export function ulozUnreadDoCache(mapa: ReadonlyMap<string, boolean>): void {
  try {
    if (typeof localStorage === "undefined") return;
    const zaznam: Record<string, boolean> = {};
    for (const [klic, hodnota] of mapa) zaznam[klic] = hodnota;
    localStorage.setItem(UNREAD_CACHE_KLIC, JSON.stringify(zaznam));
  } catch {
    // Cache je nepovinná.
  }
}

/**
 * Označení vlákna jako přečteného pro `DiskuzeBox`:
 * volat při zobrazení vlákna (visible) a po úspěšném odeslání zprávy.
 * Po úspěchu zapíše čas i do lastRead cache (`diskuze-api`) a pošle
 * window event, aby hook okamžitě zhasnul tečku bez čekání na polling.
 * Vrací true při úspěchu, jinak false (401/404/offline).
 */
export async function oznacVlaknoJakoPrectene(
  idVypravy: string,
): Promise<boolean> {
  const id: string = idVypravy.trim();
  if (id.length === 0) return false;
  const vysledek = await markAsRead(id);
  if (!vysledek.ok) return false;
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent<{ id: string }>(DISKUZE_PRECTENO_EVENT, {
          detail: { id },
        }),
      );
    }
  } catch {
    // Event je jen optimistic — neúspěch nevadí, polling stav dožene.
  }
  return true;
}

function jePrectenoEvent(udalos: Event): udalos is CustomEvent<{ id: string }> {
  if (udalos.type !== DISKUZE_PRECTENO_EVENT) return false;
  if (typeof (udalos as CustomEvent<unknown>).detail !== "object") return false;
  const detail = (udalos as CustomEvent<{ id?: unknown }>).detail;
  return detail !== null && typeof detail.id === "string";
}

/**
 * Badge nepřečtené diskuze pro seznam výprav.
 * Vrací `Map<expeditionId, boolean>` (chybějící klíč = false = přečteno).
 */
export function useUnreadExpeditions(
  ids: readonly string[],
  volby: UseUnreadVolby = {},
): Map<string, boolean> {
  const pollingMs: number = volby.pollingMs ?? VYCHOZI_UNREAD_POLLING_MS;
  const povoleno: boolean = volby.povoleno ?? true;
  const efektivniInterval: number = Number.isFinite(pollingMs)
    ? Math.max(Math.floor(pollingMs), MIN_UNREAD_POLLING_MS)
    : VYCHOZI_UNREAD_POLLING_MS;

  const klicSeznamu: string = normalizujSeznamId(ids).join(ODDELOVAC_SEZNAMU);
  const seznam: string[] = useMemo(
    () =>
      klicSeznamu.length === 0
        ? []
        : klicSeznamu.split(ODDELOVAC_SEZNAMU),
    [klicSeznamu],
  );

  const [neprectene, setNeprectene] = useState<Map<string, boolean>>(() => {
    const cache: Record<string, boolean> = ctiUnreadZCache();
    const start: Map<string, boolean> = new Map();
    for (const id of normalizujSeznamId(ids)) {
      start.set(id, cache[id] === true);
    }
    return start;
  });

  const probihaRef = useRef<boolean>(false);

  // Sladění mapy se seznamem id (nová id → cache/false, odebraná pryč).
  useEffect(() => {
    setNeprectene((predchozi: Map<string, boolean>) => {
      const cache: Record<string, boolean> = ctiUnreadZCache();
      const dalsi: Map<string, boolean> = new Map();
      for (const id of seznam) {
        const stara: boolean | undefined = predchozi.get(id);
        dalsi.set(id, stara ?? cache[id] === true);
      }
      return dalsi;
    });
  }, [seznam]);

  // Perzistence snapshotu pro okamžitý render po reloadu.
  useEffect(() => {
    ulozUnreadDoCache(neprectene);
  }, [neprectene]);

  // Počáteční fetch + jeden sdílený polling; pauza při skrytém tabu.
  useEffect(() => {
    if (!povoleno || seznam.length === 0) return;
    let zruseno = false;

    const nacti = async (): Promise<void> => {
      if (zruseno || probihaRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      probihaRef.current = true;
      try {
        const vysledky = await Promise.all(
          seznam.map((id: string) => getDiscussionMeta(id)),
        );
        if (zruseno) return;
        setNeprectene((predchozi: Map<string, boolean>) => {
          const dalsi: Map<string, boolean> = new Map(predchozi);
          for (let i = 0; i < seznam.length; i++) {
            const id: string | undefined = seznam[i];
            const vysledek = vysledky[i];
            if (id === undefined || vysledek === undefined) continue;
            if (vysledek.ok) dalsi.set(id, vysledek.data.unread === true);
          }
          return dalsi;
        });
      } finally {
        probihaRef.current = false;
      }
    };

    void nacti();
    const timer: number = window.setInterval(() => {
      void nacti();
    }, efektivniInterval);

    const naViditelnost = (): void => {
      if (!document.hidden) void nacti();
    };
    const naFocus = (): void => {
      void nacti();
    };
    const naPrecteno = (udalos: Event): void => {
      if (!jePrectenoEvent(udalos)) return;
      const id: string = udalos.detail.id;
      setNeprectene((predchozi: Map<string, boolean>) => {
        if (!predchozi.has(id)) return predchozi;
        const dalsi: Map<string, boolean> = new Map(predchozi);
        dalsi.set(id, false);
        return dalsi;
      });
    };

    document.addEventListener("visibilitychange", naViditelnost);
    window.addEventListener("focus", naFocus);
    window.addEventListener(DISKUZE_PRECTENO_EVENT, naPrecteno);
    return () => {
      zruseno = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", naViditelnost);
      window.removeEventListener("focus", naFocus);
      window.removeEventListener(DISKUZE_PRECTENO_EVENT, naPrecteno);
    };
  }, [seznam, efektivniInterval, povoleno]);

  return neprectene;
}
