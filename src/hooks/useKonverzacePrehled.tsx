/**
 * Shared conversation overview for the nav badge, chat tabs, and expedition dots.
 * One poll of GET /api/diskuze/konverzace (30s, pause while the tab is hidden)
 * so a new message lights the badge without opening /chat.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import {
  DISKUZE_PRECTENO_EVENT,
  MIN_UNREAD_POLLING_MS,
  VYCHOZI_UNREAD_POLLING_MS,
} from "./useUnreadExpeditions";
import { getKonverzace } from "../lib/diskuze-api";
import type { ApiKonverzace, KanalDiskuze } from "../shared/api-types";

export const KONVERZACE_CACHE_KLIC = "exapp:konverzace-v1" as const;
export const KONVERZACE_PRECTENO_EVENT = "exapp:konverzace-read" as const;

export interface KonverzacePrehledHodnota {
  konverzace: ApiKonverzace[];
  stav: "nacitani" | "hotovo" | "chyba";
  chyba: string | null;
  pocetNeprectenych: number;
  neprecteneVypravy: ReadonlyMap<string, boolean>;
  obnov: () => Promise<void>;
  vynulujNeprectene: (key: string) => void;
  /** Hide a row at once; a poll keeps it hidden until the server drops it. */
  skryjKonverzaci: (key: string) => void;
  /** Put a hidden row back when the server refused the change. */
  vratKonverzaci: (key: string) => void;
  /** Rewrite the list preview before the next poll. */
  nastavNahled: (key: string, zprava: ApiKonverzace["lastMessage"]) => void;
}

const Kontext = createContext<KonverzacePrehledHodnota | null>(null);

function jeApiKonverzacePole(hodnota: unknown): hodnota is ApiKonverzace[] {
  return Array.isArray(hodnota);
}

export function ctiKonverzaceZCache(): ApiKonverzace[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw: string | null = localStorage.getItem(KONVERZACE_CACHE_KLIC);
    if (raw === null || raw.trim().length === 0) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!jeApiKonverzacePole(parsed)) return [];
    return parsed.filter(
      (k): k is ApiKonverzace =>
        typeof k === "object" &&
        k !== null &&
        typeof (k as ApiKonverzace).key === "string",
    );
  } catch {
    return [];
  }
}

function ulozKonverzaceDoCache(konverzace: ApiKonverzace[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      KONVERZACE_CACHE_KLIC,
      JSON.stringify(konverzace.slice(0, 30)),
    );
  } catch {
    // Cache is optional.
  }
}

/** Threads with at least one unread message (nav dot). */
export function pocetVlakenSNeprectenymi(
  konverzace: readonly { unreadCount: number }[],
): number {
  let pocet = 0;
  for (const polozka of konverzace) {
    if (polozka.unreadCount > 0) pocet += 1;
  }
  return pocet;
}

/** Expedition id → unread, from the same conversation payload as the chat. */
export function mapaNeprectenychVyprav(
  konverzace: readonly {
    channel: KanalDiskuze;
    expeditionId: string | null;
    unreadCount: number;
  }[],
): Map<string, boolean> {
  const mapa = new Map<string, boolean>();
  for (const polozka of konverzace) {
    if (polozka.channel !== "expedice") continue;
    const id: string = (polozka.expeditionId ?? "").trim();
    if (id.length === 0) continue;
    mapa.set(id, polozka.unreadCount > 0);
  }
  return mapa;
}

function vynulujKlic(
  seznam: ApiKonverzace[],
  key: string,
): ApiKonverzace[] {
  let zmena = false;
  const dalsi: ApiKonverzace[] = seznam.map((polozka) => {
    const sedi: boolean =
      polozka.key === key ||
      (key.length > 0 && polozka.expeditionId === key) ||
      polozka.key === `expedice:${key}`;
    if (!sedi || polozka.unreadCount === 0) return polozka;
    zmena = true;
    return { ...polozka, unreadCount: 0 };
  });
  return zmena ? dalsi : seznam;
}

/** Optimistic clear so the nav dot and expedition marker drop without the next poll. */
export function oznamPrectenouKonverzaci(key: string): void {
  const cisty: string = key.trim();
  if (cisty.length === 0) return;
  try {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return;
    }
    window.dispatchEvent(
      new CustomEvent<{ key: string }>(KONVERZACE_PRECTENO_EVENT, {
        detail: { key: cisty },
      }),
    );
  } catch {
    // The next poll confirms the server.
  }
}

function jeKlicEvent(udalost: Event): udalost is CustomEvent<{ key: string }> {
  if (udalost.type !== KONVERZACE_PRECTENO_EVENT) return false;
  const detail = (udalost as CustomEvent<{ key?: unknown }>).detail;
  return (
    typeof detail === "object" &&
    detail !== null &&
    typeof detail.key === "string"
  );
}

function jeVypravaEvent(udalost: Event): udalost is CustomEvent<{ id: string }> {
  if (udalost.type !== DISKUZE_PRECTENO_EVENT) return false;
  const detail = (udalost as CustomEvent<{ id?: unknown }>).detail;
  return (
    typeof detail === "object" &&
    detail !== null &&
    typeof detail.id === "string"
  );
}

export function KonverzacePrehledProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { user, isLoading } = useAuth();
  const povoleno: boolean = !isLoading && user !== null;
  const idUctu: string | null = user?.id ?? null;
  const [konverzace, setKonverzace] = useState<ApiKonverzace[]>([]);
  const [stav, setStav] = useState<"nacitani" | "hotovo" | "chyba">("nacitani");
  const [chyba, setChyba] = useState<string | null>(null);
  const probihaRef = useRef<boolean>(false);
  const generaceRef = useRef<number>(0);
  const maDataRef = useRef<boolean>(false);
  const skryteRef = useRef<Map<string, ApiKonverzace>>(new Map());

  /* Přehled patří účtu. Kopie z telefonu se bere, až je jasné čí je. */
  useEffect(() => {
    generaceRef.current += 1;
    skryteRef.current.clear();
    const kopie: ApiKonverzace[] = idUctu === null ? [] : ctiKonverzaceZCache();
    maDataRef.current = kopie.length > 0;
    setKonverzace(kopie);
    setStav(kopie.length > 0 ? "hotovo" : "nacitani");
    setChyba(null);
  }, [idUctu]);

  const bezSkrytych = useCallback((seznam: ApiKonverzace[]): ApiKonverzace[] => {
    if (skryteRef.current.size === 0) return seznam;
    return seznam.filter((polozka) => !skryteRef.current.has(polozka.key));
  }, []);

  const obnov = useCallback(async (): Promise<void> => {
    if (probihaRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const generace: number = generaceRef.current;
    if (!maDataRef.current) setStav("nacitani");
    setChyba(null);
    probihaRef.current = true;
    try {
      const vysledek = await getKonverzace();
      if (generace !== generaceRef.current) return;
      if (!vysledek.ok) {
        const cache: ApiKonverzace[] = ctiKonverzaceZCache();
        if (cache.length > 0) {
          setKonverzace(bezSkrytych(cache));
          maDataRef.current = true;
          setStav("hotovo");
          return;
        }
        setStav("chyba");
        setChyba(vysledek.chyba);
        return;
      }
      ulozKonverzaceDoCache(vysledek.data.konverzace);
      for (const key of [...skryteRef.current.keys()]) {
        const zustava: boolean = vysledek.data.konverzace.some(
          (polozka) => polozka.key === key,
        );
        if (!zustava) skryteRef.current.delete(key);
      }
      maDataRef.current = true;
      setKonverzace(bezSkrytych(vysledek.data.konverzace));
      setStav("hotovo");
    } finally {
      probihaRef.current = false;
    }
  }, [bezSkrytych]);

  const vynulujNeprectene = useCallback((key: string): void => {
    generaceRef.current += 1;
    setKonverzace((predchozi) => vynulujKlic(predchozi, key));
  }, []);

  const skryjKonverzaci = useCallback((key: string): void => {
    setKonverzace((predchozi) => {
      const nalezena: ApiKonverzace | undefined = predchozi.find(
        (polozka) => polozka.key === key,
      );
      if (nalezena !== undefined) skryteRef.current.set(key, nalezena);
      return predchozi.filter((polozka) => polozka.key !== key);
    });
  }, []);

  const vratKonverzaci = useCallback((key: string): void => {
    const vracena: ApiKonverzace | undefined = skryteRef.current.get(key);
    skryteRef.current.delete(key);
    if (vracena === undefined) return;
    setKonverzace((predchozi) =>
      predchozi.some((polozka) => polozka.key === key)
        ? predchozi
        : [...predchozi, vracena],
    );
  }, []);

  const nastavNahled = useCallback(
    (key: string, zprava: ApiKonverzace["lastMessage"]): void => {
      setKonverzace((predchozi) =>
        predchozi.map((polozka) =>
          polozka.key === key ? { ...polozka, lastMessage: zprava } : polozka,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    if (!povoleno) return;
    let zruseno = false;
    const nacti = (): void => {
      if (zruseno) return;
      void obnov();
    };
    nacti();
    const timer: number = window.setInterval(nacti, VYCHOZI_UNREAD_POLLING_MS);
    const naViditelnost = (): void => {
      if (!document.hidden) nacti();
    };
    const naPrecteno = (udalost: Event): void => {
      if (jeKlicEvent(udalost)) {
        vynulujNeprectene(udalost.detail.key);
        return;
      }
      if (jeVypravaEvent(udalost)) {
        vynulujNeprectene(udalost.detail.id);
      }
    };
    document.addEventListener("visibilitychange", naViditelnost);
    window.addEventListener("focus", nacti);
    window.addEventListener(KONVERZACE_PRECTENO_EVENT, naPrecteno);
    window.addEventListener(DISKUZE_PRECTENO_EVENT, naPrecteno);
    return () => {
      zruseno = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", naViditelnost);
      window.removeEventListener("focus", nacti);
      window.removeEventListener(KONVERZACE_PRECTENO_EVENT, naPrecteno);
      window.removeEventListener(DISKUZE_PRECTENO_EVENT, naPrecteno);
    };
  }, [povoleno, obnov, vynulujNeprectene]);

  const hodnota: KonverzacePrehledHodnota = useMemo(
    () => ({
      konverzace,
      stav,
      chyba,
      pocetNeprectenych: pocetVlakenSNeprectenymi(konverzace),
      neprecteneVypravy: mapaNeprectenychVyprav(konverzace),
      obnov,
      vynulujNeprectene,
      skryjKonverzaci,
      vratKonverzaci,
      nastavNahled,
    }),
    [
      konverzace,
      stav,
      chyba,
      obnov,
      vynulujNeprectene,
      skryjKonverzaci,
      vratKonverzaci,
      nastavNahled,
    ],
  );

  return <Kontext.Provider value={hodnota}>{children}</Kontext.Provider>;
}

export function useKonverzacePrehled(): KonverzacePrehledHodnota {
  const kontext = useContext(Kontext);
  if (kontext === null) {
    throw new Error(
      "useKonverzacePrehled musí být uvnitř KonverzacePrehledProvider.",
    );
  }
  return kontext;
}

/** Re-export so callers can share the same floor as the expedition poller. */
export const MIN_KONVERZACE_POLLING_MS: number = MIN_UNREAD_POLLING_MS;
