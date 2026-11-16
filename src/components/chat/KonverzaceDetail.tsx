import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
} from "react";
import { KostraZpravy } from "../StrankaKostra";
import { useAuth } from "../../hooks/useAuth";
import type { ApiKonverzace, ApiZprava } from "../../shared/api-types";
import {
  getGlobalZpravy,
  getSkupinaZpravy,
  getSoukromeZpravy,
  getZpravy,
  markAsRead,
  oznacKonverzaciJakoPrectenou,
  posliGlobalZpravu,
  posliSkupinaZpravu,
  posliSoukromouZpravu,
  posliZpravu,
  smazGlobalZpravu,
  smazSkupinaZpravu,
  smazSoukromouZpravu,
  smazZpravu,
} from "../../lib/diskuze-api";
import { nactiCleny } from "../../lib/admin-clenove";
import { smiSmazatZpravu } from "../../shared/mazani-zprav";
import { oznamPrectenouKonverzaci } from "../../hooks/useKonverzacePrehled";
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
import { optimistickePrilohy } from "../../lib/prilohy-zpravy";
import { nactiFotkyVlakna, seskupRadkyVlakna } from "../../lib/chat-fotky";
import { idZeKliceSkupiny } from "../../lib/skupiny-pristup";
import { partnerSoukromeho } from "../../shared/soukromy-klic";
import {
  aplikujRollback,
  potvrdOptimistickouZpravu,
  vytvorOptimistickouZpravu,
  vyberAutorPopisek,
} from "./DiskuzeBox";
import ZpravaBublina from "./ZpravaBublina";
import ChatLightroom, { useChatLightroom } from "./ChatLightroom";
import Composer from "./Composer";

export interface KonverzaceDetailProps {
  konverzace: ApiKonverzace;
  /** Vyřešený český název (Důležité / General / název výpravy). */
  nazev: string;
  /** Organizer of this expedition thread. Ignored for other channels. */
  organizatorId?: string | null;
  /** Id přihlášeného (null = anonym — čte, nepíše). */
  currentUserId: string | null;
  /** Důležité smí psát jen vedení / rada / admin (guard hlídá i server 403). */
  muzePsatDulezite: boolean;
  /** Mobilní zpět na seznam (desktop ho nezobrazuje). */
  onZpet?: () => void;
  /** Rodič po úspěšném read zhasne badge v seznamu (unreadCount → 0). */
  onPrecteno?: (key: string) => void;
  /** Po úspěšném odeslání (seznam soukromých chatů se doplní). */
  onPoOdeslani?: () => void;
  /** Náhled poslední zprávy v seznamu, ještě před potvrzením serveru. */
  onNahled?: (zprava: ApiZprava | null) => void;
  /** Vlastní skupina: otevře potvrzení smazání (jen správce). */
  onSmazatSkupinu?: (spoustec: HTMLElement) => void;
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
 * - Mazání: vlastní zpráva do 10 minut, admin kteroukoli (všechny kanály).
 * - Offline-friendly: chyba čtení s retry, chyba zápisu bez ztráty textu
 *   (text drží Composer, rollback jen optimistickou bublinu).
 */
export default function KonverzaceDetail({
  konverzace,
  nazev,
  organizatorId = null,
  currentUserId,
  muzePsatDulezite,
  onZpet,
  onPrecteno,
  onPoOdeslani,
  onNahled,
  onSmazatSkupinu,
}: KonverzaceDetailProps): JSX.Element {
  const { isAdmin } = useAuth();
  const [stav, setStav] = useState<"nacitani" | "hotovo" | "chyba">("nacitani");
  const [tedMs, setTedMs] = useState<number>(() => Date.now());
  const [zpravy, setZpravy] = useState<ApiZprava[]>([]);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState<boolean>(false);
  const [chybaOdeslani, setChybaOdeslani] = useState<string | null>(null);
  const [mazeId, setMazeId] = useState<string | null>(null);
  const [oznameni, setOznameni] = useState<string | null>(null);
  const [navratTextu, setNavratTextu] = useState<{
    token: number;
    text: string;
    soubory?: readonly File[];
  } | null>(null);
  const nadpisRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /* The thread owns its scroll. The composer stays at the bottom of the
     viewport column, including when the history is long. */
  const vlaknoRef = useRef<HTMLDivElement>(null);
  const generaceRef = useRef<number>(0);
  const probihaObnovaRef = useRef<boolean>(false);
  const drzetRef = useRef<Map<string, ApiZprava>>(new Map());
  const skrytRef = useRef<Set<string>>(new Set());
  const odchodRef = useRef<Map<string, number>>(new Map());
  const [odchazejici, setOdchazejici] = useState<ReadonlySet<string>>(new Set());
  const [clenove, setClenove] = useState<readonly { id: string; jmeno: string }[]>([]);
  const scrollNaKonecRef = useRef<boolean>(true);
  const onPrectenoRef = useRef(onPrecteno);
  const onPoOdeslaniRef = useRef(onPoOdeslani);
  onPrectenoRef.current = onPrecteno;
  onPoOdeslaniRef.current = onPoOdeslani;

  useEffect(() => {
    if (konverzace.channel !== "general" && konverzace.channel !== "dulezite") return;
    let zive = true;
    void nactiCleny().then((vysledek) => {
      if (!zive || !vysledek.ok) return;
      setClenove(vysledek.data.map((clovek) => ({ id: clovek.id, jmeno: clovek.jmeno })));
    });
    return () => {
      zive = false;
    };
  }, [konverzace.channel]);

  const jeSoukrome: boolean = konverzace.channel === "soukrome";
  const jeSkupina: boolean = konverzace.channel === "skupina";
  const jeGlobal: boolean = konverzace.channel !== "expedice" && !jeSoukrome && !jeSkupina;
  const jeDulezite: boolean = konverzace.channel === "dulezite";
  const prihlasen: boolean = currentUserId !== null;
  const smiPsat: boolean = jeSkupina
    ? prihlasen && konverzace.muzePsat === true
    : jeSoukrome
      ? prihlasen
      : !jeDulezite || muzePsatDulezite;
  const klic: string = konverzace.key;
  const jmena: Record<string, string> = {};
  for (const clovek of clenove) jmena[clovek.id.toLowerCase()] = clovek.jmeno;
  const maLightroom: boolean =
    jeSoukrome || jeSkupina || (konverzace.channel === "expedice" && konverzace.expeditionId !== null);
  const nactiFotkyVlaknaTeto = useCallback(() => {
    return nactiFotkyVlakna((cursor) => {
      const idSkupiny = idZeKliceSkupiny(konverzace.key);
      if (jeSoukrome) return getSoukromeZpravy(konverzace.key);
      if (jeSkupina) {
        if (idSkupiny === null) {
          return Promise.resolve({ ok: false as const, chyba: "Skupinu se nepodařilo otevřít." });
        }
        return getSkupinaZpravy(idSkupiny);
      }
      if (konverzace.expeditionId !== null) {
        return getZpravy(konverzace.expeditionId, { limit: 100, cursor });
      }
      return getGlobalZpravy(konverzace.channel === "general" ? "general" : "dulezite", {
        limit: 100,
        cursor,
      });
    });
  }, [jeSoukrome, jeSkupina, konverzace.channel, konverzace.expeditionId, konverzace.key]);
  const lightroom = useChatLightroom(nactiFotkyVlaknaTeto);

  /* Hide the author's delete button once the 10 minute window closes. */
  useEffect(() => {
    const timer: number = window.setInterval(() => setTedMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const nactiZeServeru = useCallback(async () => {
    const idSkupiny = idZeKliceSkupiny(konverzace.key);
    if (jeSoukrome) return getSoukromeZpravy(konverzace.key);
    if (jeSkupina && idSkupiny !== null) return getSkupinaZpravy(idSkupiny);
    if (konverzace.channel === "expedice" && konverzace.expeditionId !== null) {
      return getZpravy(konverzace.expeditionId, { limit: 100, tail: true });
    }
    return getGlobalZpravy(konverzace.channel === "general" ? "general" : "dulezite", {
      limit: 100,
      tail: true,
    });
  }, [jeSoukrome, jeSkupina, konverzace.channel, konverzace.expeditionId, konverzace.key]);

  const nacti = useCallback(async (): Promise<void> => {
    const generace: number = generaceRef.current;
    setStav("nacitani");
    setChybaNacteni(null);
    const vysledek = await nactiZeServeru();
    if (generace !== generaceRef.current) return;
    if (!vysledek.ok) {
      setStav("chyba");
      setChybaNacteni(vysledek.chyba);
      return;
    }
    scrollNaKonecRef.current = true;
    setZpravy(seradVlakno(vysledek.data.zpravy));
    setStav("hotovo");
  }, [nactiZeServeru]);

  /* Quiet refresh: keep the thread on screen, merge by id, ignore errors. */
  const obnovTise = useCallback(async (): Promise<void> => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (probihaObnovaRef.current) return;
    const generace: number = generaceRef.current;
    probihaObnovaRef.current = true;
    try {
      const vysledek = await nactiZeServeru();
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
        if (maScrollovatNaNove(uDna, nove, currentUserId)) {
          scrollNaKonecRef.current = true;
        }
        return dalsi.zpravy;
      });
      const slouceni: VysledekSlouceni | null = schranka.slouceni;
      if (slouceni === null || !slouceni.zmenilaSeSada) return;
      if (slouceni.novaId.length > 0 && prihlasen) {
        if (jeGlobal || jeSoukrome || jeSkupina) {
          const precteni = await oznacKonverzaciJakoPrectenou(klic);
          if (generace === generaceRef.current && precteni.ok) {
            oznamPrectenouKonverzaci(klic);
            onPrectenoRef.current?.(klic);
          }
        } else if (konverzace.expeditionId !== null) {
          const precteni = await markAsRead(konverzace.expeditionId);
          if (generace === generaceRef.current && precteni.ok) {
            oznamPrectenouKonverzaci(klic);
            onPrectenoRef.current?.(klic);
          }
        }
      }
      onPoOdeslaniRef.current?.();
    } finally {
      probihaObnovaRef.current = false;
    }
  }, [
    nactiZeServeru,
    currentUserId,
    prihlasen,
    jeGlobal,
    jeSoukrome,
    jeSkupina,
    klic,
    konverzace.expeditionId,
  ]);

  /* Přepnutí threadu = nový load + focus nadpisu (čtečka ví, kde je). */
  useEffect(() => {
    generaceRef.current += 1;
    drzetRef.current = new Map();
    skrytRef.current = new Set();
    scrollNaKonecRef.current = true;
    setZpravy([]);
    setChybaOdeslani(null);
    setOznameni(null);
    void nacti();
  }, [nacti, klic]);

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

  useEffect(() => {
    if (stav === "hotovo") nadpisRef.current?.focus({ preventScroll: true });
  }, [stav, klic]);

  /* Přečtení: po úspěšném loadu označit (USER; anonym nemá co značit). */
  useEffect(() => {
    if (stav !== "hotovo") return;
    if (!prihlasen) return;
    let zive = true;
    void (async (): Promise<void> => {
      if (jeGlobal || jeSoukrome || jeSkupina) {
        const vysledek = await oznacKonverzaciJakoPrectenou(klic);
        if (zive && vysledek.ok) {
          oznamPrectenouKonverzaci(klic);
          onPrecteno?.(klic);
        }
      } else if (konverzace.expeditionId !== null) {
        const vysledek = await markAsRead(konverzace.expeditionId);
        if (zive && vysledek.ok) {
          oznamPrectenouKonverzaci(klic);
          onPrecteno?.(klic);
        }
      }
    })();
    return () => {
      zive = false;
    };
  }, [stav, prihlasen, jeGlobal, jeSoukrome, jeSkupina, klic, konverzace.expeditionId, onPrecteno]);

  /* Scroll the thread itself only when the reader is at the bottom, or the
     new row is theirs. `scrollIntoView` would move the outer page. */
  useEffect(() => {
    if (!scrollNaKonecRef.current) return;
    const vlakno: HTMLDivElement | null = vlaknoRef.current;
    if (vlakno === null) return;
    scrollNaKonecRef.current = false;
    vlakno.scrollTop = vlakno.scrollHeight;
  }, [zpravy, stav]);

  async function naOdeslat(text: string, soubory: readonly File[]): Promise<void> {
    if (odesilaSe) return;
    const vybrane: File[] = [...soubory];
    const docasna: ApiZprava = {
      ...vytvorOptimistickouZpravu(
        konverzace.expeditionId ?? konverzace.key,
        currentUserId,
        text,
      ),
      channel: konverzace.channel,
      prilohy: optimistickePrilohy(vybrane),
    };
    const nahledPred: ApiZprava | null = seradVlakno(zpravy).at(-1) ?? null;
    scrollNaKonecRef.current = true;
    setZpravy((prev) => seradVlakno([...prev, docasna]));
    onNahled?.(docasna);
    setOdesilaSe(true);
    setChybaOdeslani(null);
    setOznameni(null);
    const vysledek = await odesliPodleKanalu(text, vybrane);
    setOdesilaSe(false);
    if (!vysledek.ok) {
      setZpravy((prev) => aplikujRollback(prev, docasna.id));
      onNahled?.(nahledPred);
      setNavratTextu({ token: Date.now(), text, soubory: vybrane });
      setChybaOdeslani(vysledek.chyba);
      return;
    }
    drzetRef.current.set(vysledek.data.zprava.id, vysledek.data.zprava);
    scrollNaKonecRef.current = true;
    setZpravy((prev) =>
      potvrdOptimistickouZpravu(prev, docasna.id, vysledek.data.zprava),
    );
    onNahled?.(vysledek.data.zprava);
    setOznameni("Zpráva odeslána.");
    onPrecteno?.(klic);
    onPoOdeslani?.();
  }

  function odesliPodleKanalu(
    text: string,
    soubory: readonly File[],
  ): Promise<{ ok: true; data: { zprava: ApiZprava } } | { ok: false; chyba: string }> {
    if (jeSkupina) {
      const idSkupiny = idZeKliceSkupiny(konverzace.key);
      if (idSkupiny === null) {
        return Promise.resolve({ ok: false, chyba: "Zprávu se nepodařilo odeslat." });
      }
      return posliSkupinaZpravu(idSkupiny, text, soubory);
    }
    if (jeSoukrome) {
      const partnerId =
        konverzace.partnerId ??
        (currentUserId === null ? null : partnerSoukromeho(konverzace.key, currentUserId));
      if (partnerId === null) {
        return Promise.resolve({
          ok: false,
          chyba: "Soukromou zprávu se nepodařilo odeslat.",
        });
      }
      return posliSoukromouZpravu(partnerId, text, soubory);
    }
    if (jeGlobal) {
      return posliGlobalZpravu(
        konverzace.channel === "general" ? "general" : "dulezite",
        text,
        soubory,
      );
    }
    if (konverzace.expeditionId !== null) {
      return posliZpravu(konverzace.expeditionId, text, soubory);
    }
    return Promise.resolve({ ok: false, chyba: "Zprávu se nepodařilo odeslat." });
  }

  useEffect(() => {
    const casovace: Map<string, number> = odchodRef.current;
    return () => {
      for (const casovac of casovace.values()) window.clearTimeout(casovac);
      casovace.clear();
    };
  }, []);

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
    const idSkupiny = idZeKliceSkupiny(konverzace.key);
    const bezZpravy: ApiZprava[] = odeberZpravu(zpravy, idZpravy);
    setMazeId(idZpravy);
    skrytRef.current.add(idZpravy);
    drzetRef.current.delete(idZpravy);
    setChybaOdeslani(null);
    setOznameni(null);
    oznacOdchod(idZpravy);
    onNahled?.(seradVlakno(bezZpravy).at(-1) ?? null);
    const vysledek = jeSkupina && idSkupiny !== null
      ? await smazSkupinaZpravu(idSkupiny, idZpravy)
      : jeSoukrome
        ? await smazSoukromouZpravu(idZpravy)
        : jeGlobal
          ? await smazGlobalZpravu(idZpravy)
          : konverzace.expeditionId !== null
            ? await smazZpravu(konverzace.expeditionId, idZpravy)
            : { ok: false as const, chyba: "Zprávu se nepodařilo smazat." };
    setMazeId(null);
    if (!vysledek.ok) {
      skrytRef.current.delete(idZpravy);
      zrusOdchod(idZpravy);
      const vracene: ApiZprava[] = vratZpravu(bezZpravy, puvodni);
      setZpravy((prev) => vratZpravu(prev, puvodni));
      onNahled?.(seradVlakno(vracene).at(-1) ?? null);
      setChybaOdeslani(vysledek.chyba);
      return;
    }
    setOznameni("Zpráva smazána.");
    onPoOdeslani?.();
  }

  const bloky: BlokZprav[] = seskupZpravyDoBloku(zpravy);
  let posledniDen: string | null = null;

  return (
    <section aria-label={`Konverzace ${nazev}`} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex min-w-0 items-center gap-2 border-b-2 border-inkoust pb-2 lg:pb-3">
        {onZpet !== undefined && (
          <button
            type="button"
            onClick={onZpet}
            aria-label="Zpět na seznam konverzací"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border-2 border-inkoust bg-papir px-3 text-sm font-bold [touch-action:manipulation] lg:hidden"
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
              : jeSkupina
                ? "Skupina · přístup podle rolí"
              : jeDulezite
                ? "Připnuté · důležitá oznámení"
                : konverzace.channel === "general"
                  ? "Připnuté · obecná domluva"
                  : "Vlákno výpravy"}
          </p>
        </div>
        {jeSkupina && onSmazatSkupinu !== undefined && (
          <button
            type="button"
            data-smazat-skupinu
            aria-label={`Smazat skupinu ${nazev}`}
            onClick={(e) => onSmazatSkupinu(e.currentTarget)}
            className="inline-flex min-h-[44px] max-w-[11rem] shrink-0 items-center truncate rounded-md px-2 text-left text-xs font-semibold text-inkoust/45 underline decoration-inkoust/25 underline-offset-[3px] transition-[opacity,color,decoration-color] duration-[160ms] ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:text-jantar [@media(hover:hover)_and_(pointer:fine)]:hover:decoration-jantar/50 [touch-action:manipulation]"
          >
            {`Smazat skupinu „${nazev}"…`}
          </button>
        )}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3">
        {stav === "nacitani" && (
          <KostraZpravy popisek={`Načítám konverzaci ${nazev}`} />
        )}

        {stav === "chyba" && (
          <div className="rounded-2xl border-2 border-inkoust/20 bg-papir p-4 text-center">
            <p role="alert" className="text-sm font-semibold">
              {chybaNacteni ?? "Zprávy se nepodařilo načíst."}
            </p>
            <button
              type="button"
              onClick={() => void nacti()}
              className="mt-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border-2 border-inkoust bg-inkoust px-5 text-sm font-bold text-papir [touch-action:manipulation]"
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
              className="mt-2 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-inkoust/15 bg-papir/60 p-2 lg:p-3"
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
                        {seskupRadkyVlakna(blok.zpravy).map((radek, index) => {
                          const zprava = radek.druh === "zprava" ? radek.zprava : radek.zpravy[0];
                          if (zprava === undefined) return null;
                          const dalsi = radek.druh === "davka" ? radek.zpravy.slice(1) : [];
                          const jeMoje: boolean =
                            currentUserId !== null && zprava.autorId === currentUserId;
                          const muzeMazat: boolean =
                            smiSmazatZpravu({
                              jeAdmin: isAdmin,
                              jeAutor: jeMoje,
                              createdAt: zprava.createdAt,
                              ted: new Date(tedMs),
                            }) && !zprava.id.startsWith("optimistic-");
                          return (
                            <ZpravaBublina
                              key={zprava.id}
                              zprava={zprava}
                              dalsiZpravy={dalsi}
                              autorPopisek={vyberAutorPopisek(zprava, currentUserId)}
                              jeOrganizator={
                                konverzace.channel === "expedice" &&
                                konverzace.expeditionId !== null &&
                                organizatorId !== null &&
                                zprava.autorId === organizatorId
                              }
                              jeMoje={jeMoje}
                              ukazZminky={jeGlobal}
                              jmena={jmena}
                              muzeMazat={muzeMazat}
                              lzeSmazat={(id) => {
                                const cil = (radek.druh === "davka" ? radek.zpravy : [zprava]).find(
                                  (polozka) => polozka.id === id,
                                );
                                if (cil === undefined || cil.id.startsWith("optimistic-")) return false;
                                return smiSmazatZpravu({
                                  jeAdmin: isAdmin,
                                  jeAutor: currentUserId !== null && cil.autorId === currentUserId,
                                  createdAt: cil.createdAt,
                                  ted: new Date(tedMs),
                                });
                              }}
                              mazeSe={mazeId === zprava.id}
                              mazeId={mazeId}
                              odchazi={odchazejici.has(zprava.id)}
                              onSmazat={(id) => void naSmazat(id)}
                              onOtevriObrazek={
                                maLightroom ? (prilohaId) => void lightroom.otevri(prilohaId) : undefined
                              }
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
                  {jeSkupina
                    ? "Do téhle skupiny smíš jen číst. Psát může role, které to vedení povolilo."
                    : "Důležité čte každý, psát můžou jen vedení, rada nebo admin. Obecnou domluvu piš do Generalu."}
                </p>
              ) : (
                <Composer
                  popisek={
                    jeSoukrome
                      ? `Napsat soukromě ${nazev}`
                      : jeDulezite
                        ? "Napsat důležité oznámení"
                        : jeSkupina || konverzace.channel === "general"
                          ? `Napsat do ${konverzace.channel === "general" ? "Generalu" : nazev}`
                          : `Napsat do ${nazev}`
                  }
                  placeholder={
                    jeDulezite
                      ? "Stručně a jasně pro všechny…"
                      : "Napiš něco…"
                  }
                  odesilaSe={odesilaSe}
                  chyba={chybaOdeslani}
                  navratTextu={navratTextu}
                  onOdeslat={(text, soubory) => void naOdeslat(text, soubory)}
                  zminky={jeGlobal}
                  clenove={clenove}
                />
              )}
            </div>
          </>
        )}
      </div>
      {maLightroom && lightroom.otevreno ? (
        <ChatLightroom
          nazev={nazev}
          fotky={lightroom.fotky}
          nacitaSe={lightroom.nacitaSe}
          chyba={lightroom.chyba}
          vybranaId={lightroom.vybranaId}
          onZavrit={lightroom.zavri}
        />
      ) : null}
    </section>
  );
}
