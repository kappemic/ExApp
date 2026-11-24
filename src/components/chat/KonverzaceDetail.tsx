import Ikona from "../Ikona";
import { useNavigate } from "react-router-dom";
import NavigacniRozbalovak from "../Navbar/NavigacniRozbalovak";
import { inicialyProAvatar } from "../../lib/storage/avatar";
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
  /** Resolved Czech title (Důležité / Obecný / expedition name). */
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
  /** Otevře formulář přístupu skupiny (admin). */
  onUpravitSkupinu?: () => void;
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

/** Tlačítka v hlavičce vlákna: telefon 44 px s linkou, počítač 32 px v šedé. */
const TLACITKO_HLAVICKY =
  "nahled-press size-11 items-center justify-center rounded-xl border border-linka bg-povrch text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:size-8 min-[90rem]:rounded-[9px] min-[90rem]:border-0 min-[90rem]:bg-povrch-2 min-[90rem]:text-mech";

function PolozkaMenu({
  popisek,
  onClick,
  nebezpecna = false,
  className = "",
}: {
  popisek: string;
  onClick: () => void;
  nebezpecna?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`bez-prejeti flex min-h-[44px] w-full items-center rounded-[9px] px-2.5 text-left text-[13px] font-medium hover:bg-povrch-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk min-[90rem]:min-h-9 ${
        nebezpecna ? "text-akcent" : "text-inkoust"
      } ${className}`}
    >
      {popisek}
    </button>
  );
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
/** Member count for the general channel. Zero means the directory did not load. */
function tvarClenu(pocet: number): string {
  if (pocet === 1) return "1 člen";
  if (pocet >= 2 && pocet <= 4) return `${pocet} členové`;
  return `${pocet} členů`;
}

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
  onUpravitSkupinu,
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
    jeSoukrome || jeSkupina || jeGlobal || (konverzace.channel === "expedice" && konverzace.expeditionId !== null);
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
  const navigate = useNavigate();
  const menuKotva = useRef<HTMLButtonElement>(null);
  const [menuOtevreno, setMenuOtevreno] = useState<boolean>(false);
  const [hledaVlakno, setHledaVlakno] = useState<boolean>(false);
  const [dotazVlakna, setDotazVlakna] = useState<string>("");
  const [pretazene, setPretazene] = useState<{ token: number; soubory: readonly File[] } | null>(null);
  const [nadVlaknem, setNadVlaknem] = useState<boolean>(false);

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

  /* Fotky a náhledy odkazů dorostou až po načtení. Kdo byl dole, dole zůstane. */
  const prazdneVlakno: boolean = zpravy.length === 0;
  useEffect(() => {
    const vlakno: HTMLDivElement | null = vlaknoRef.current;
    const seznam: HTMLUListElement | null = listRef.current;
    if (vlakno === null || seznam === null) return;
    let drzDole: boolean = jsemUDna(vlakno);
    const naPosun = (): void => {
      drzDole = jsemUDna(vlakno);
    };
    const pozorovani = new ResizeObserver(() => {
      if (drzDole) vlakno.scrollTop = vlakno.scrollHeight;
    });
    vlakno.addEventListener("scroll", naPosun, { passive: true });
    pozorovani.observe(seznam);
    // Delší rozepsaná zpráva a klávesnice vlákno zmenší, poslední zpráva má zůstat vidět.
    pozorovani.observe(vlakno);
    return () => {
      vlakno.removeEventListener("scroll", naPosun);
      pozorovani.disconnect();
    };
  }, [stav, prazdneVlakno, dotazVlakna]);

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

  const sirokaObrazovka: boolean =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 64rem)").matches;
  const hledany: string = hledaVlakno ? dotazVlakna.trim() : "";
  const nalezene: ApiZprava[] =
    hledany.length === 0
      ? zpravy
      : zpravy.filter((z) => z.text.toLocaleLowerCase("cs").includes(hledany.toLocaleLowerCase("cs")));
  const bloky: BlokZprav[] = seskupZpravyDoBloku(nalezene);
  function zavriHledani(): void {
    setHledaVlakno(false);
    setDotazVlakna("");
  }
  let posledniDen: string | null = null;

  return (
    <section
      aria-label={`Konverzace ${nazev}`}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onDragOver={(udalost) => {
        if (!smiPsat || !udalost.dataTransfer.types.includes("Files")) return;
        udalost.preventDefault();
        setNadVlaknem(true);
      }}
      onDragLeave={(udalost) => {
        if (!udalost.currentTarget.contains(udalost.relatedTarget as Node | null)) setNadVlaknem(false);
      }}
      onDrop={(udalost) => {
        setNadVlaknem(false);
        if (!smiPsat || udalost.dataTransfer.files.length === 0) return;
        udalost.preventDefault();
        setPretazene({ token: Date.now(), soubory: [...udalost.dataTransfer.files] });
      }}
    >
      {nadVlaknem ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-smrk bg-mlha/95 text-sm font-semibold text-smrk"
        >
          <Ikona nazev="upload" className="size-6" />
          Pusť soubory sem a přiloží se ke zprávě
        </div>
      ) : null}
      <header className="flex min-w-0 items-center gap-2.5 pb-3 lg:gap-[11px] lg:border-b lg:border-linka lg:px-5 lg:pt-3 min-[90rem]:h-[66px] min-[90rem]:py-0">
        {onZpet !== undefined && (
          <button
            type="button"
            onClick={onZpet}
            aria-label="Zpět na seznam konverzací"
            className="nahled-press inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-linka bg-povrch text-inkoust [touch-action:manipulation] lg:hidden"
          >
            <Ikona nazev="chevron-left" className="size-[18px]" />
          </button>
        )}
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-smrk text-sm font-semibold text-povrch min-[90rem]:size-9 min-[90rem]:bg-mlha min-[90rem]:text-[11.5px] min-[90rem]:text-smrk"
        >
          {jeSoukrome ? inicialyProAvatar(nazev) : Array.from(nazev.trim()).slice(0, 2).join("").toLocaleUpperCase("cs")}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 min-[90rem]:gap-px">
          <h2
            ref={nadpisRef}
            tabIndex={-1}
            title={nazev}
            className="min-w-0 truncate font-display text-[17px] font-bold text-inkoust focus:!outline-none focus-visible:!outline-none min-[90rem]:font-sans min-[90rem]:text-[14.5px] min-[90rem]:font-semibold min-[90rem]:tracking-normal"
            style={{ overflowWrap: "anywhere" }}
          >
            {nazev}
          </h2>
          <p className="min-w-0 truncate text-xs text-ink-3 min-[90rem]:text-[11.5px]">
            {jeSoukrome
              ? "Soukromá zpráva"
              : jeSkupina
                ? "Skupina · přístup podle rolí"
                : jeDulezite
                  ? "Důležitá oznámení"
                  : konverzace.channel === "general"
                    ? clenove.length > 0
                      ? tvarClenu(clenove.length)
                      : "Obecná domluva"
                    : "Vlákno výpravy"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Hledat ve vlákně"
            aria-expanded={hledaVlakno}
            onClick={() => {
              setHledaVlakno((pred) => !pred);
              setDotazVlakna("");
            }}
            className={`${TLACITKO_HLAVICKY} hidden min-[90rem]:inline-flex`}
          >
            <Ikona nazev="search" className="size-[15px]" />
          </button>
          <button
            type="button"
            aria-label="Nastavení oznámení"
            onClick={() => navigate("/profil")}
            className={`${TLACITKO_HLAVICKY} hidden min-[90rem]:inline-flex`}
          >
            <Ikona nazev="bell" className="size-[15px]" />
          </button>
          {jeSkupina && onUpravitSkupinu !== undefined ? (
            <button
              type="button"
              aria-label="Upravit oprávnění skupiny"
              title="Upravit oprávnění"
              onClick={onUpravitSkupinu}
              className={`${TLACITKO_HLAVICKY} hidden min-[90rem]:inline-flex`}
            >
              <Ikona nazev="lock" className="size-[15px]" />
            </button>
          ) : null}
          <button
            ref={menuKotva}
            type="button"
            aria-label="Další akce konverzace"
            aria-haspopup="menu"
            aria-expanded={menuOtevreno}
            onClick={() => setMenuOtevreno((pred) => !pred)}
            className={`${TLACITKO_HLAVICKY} inline-flex`}
          >
            <Ikona nazev="ellipsis" className="size-[18px] min-[90rem]:size-[15px]" />
          </button>
          <NavigacniRozbalovak
            otevreno={menuOtevreno}
            onZavrit={() => setMenuOtevreno(false)}
            kotvaRef={menuKotva}
            sirka={220}
            zarovnani="end"
            popisek="Akce konverzace"
          >
            {/* Na počítači je lupa přímo v hlavičce. */}
            <PolozkaMenu
              popisek="Hledat ve vlákně"
              className="min-[90rem]:hidden"
              onClick={() => {
                setMenuOtevreno(false);
                setHledaVlakno(true);
              }}
            />
            {maLightroom ? (
              <PolozkaMenu
                popisek="Fotky z konverzace"
                onClick={() => {
                  setMenuOtevreno(false);
                  void lightroom.otevri(null);
                }}
              />
            ) : null}
            {jeSkupina && onUpravitSkupinu !== undefined ? (
              <PolozkaMenu
                popisek="Upravit oprávnění"
                className="min-[90rem]:hidden"
                onClick={() => {
                  setMenuOtevreno(false);
                  onUpravitSkupinu();
                }}
              />
            ) : null}
            {jeSkupina && onSmazatSkupinu !== undefined ? (
              <PolozkaMenu
                popisek="Smazat skupinu…"
                nebezpecna
                onClick={() => {
                  setMenuOtevreno(false);
                  if (menuKotva.current !== null) onSmazatSkupinu(menuKotva.current);
                }}
              />
            ) : null}
          </NavigacniRozbalovak>
        </div>
      </header>

      {hledaVlakno ? (
        <div className="nabeh-dolu flex items-center gap-2 pb-3 lg:px-5 lg:pt-3">
          <div className="relative min-w-0 flex-1">
            <Ikona nazev="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3 min-[90rem]:left-[11px] min-[90rem]:size-[15px]" />
            <input
              type="search"
              value={dotazVlakna}
              onChange={(udalost) => setDotazVlakna(udalost.target.value)}
              onKeyDown={(udalost) => {
                if (udalost.key === "Escape") zavriHledani();
              }}
              aria-label="Hledat ve vlákně"
              placeholder="Hledat ve vlákně"
              autoFocus
              className="h-11 w-full rounded-xl border border-linka bg-povrch pl-10 pr-24 text-base text-inkoust placeholder:text-ink-4 focus:border-pole focus:outline-none min-[90rem]:h-[38px] min-[90rem]:rounded-[10px] min-[90rem]:border-transparent min-[90rem]:bg-povrch-2 min-[90rem]:pl-[34px] min-[90rem]:text-[12.5px]"
            />
            {hledany.length > 0 ? (
              <span role="status" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] font-medium text-ink-3">
                {nalezene.length === 1 ? "1 zpráva" : nalezene.length >= 2 && nalezene.length <= 4 ? `${nalezene.length} zprávy` : `${nalezene.length} zpráv`}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={zavriHledani}
            aria-label="Zavřít hledání"
            className={`${TLACITKO_HLAVICKY} inline-flex shrink-0`}
          >
            <Ikona nazev="x" className="size-[18px] min-[90rem]:size-[15px]" />
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {stav === "nacitani" && (
          <KostraZpravy popisek={`Načítám konverzaci ${nazev}`} />
        )}

        {stav === "chyba" && (
          <div className="m-4 rounded-2xl border border-linka bg-povrch p-4 text-center">
            <p role="alert" className="text-sm font-semibold">
              {chybaNacteni ?? "Zprávy se nepodařilo načíst."}
            </p>
            <button
              type="button"
              onClick={() => void nacti()}
              className="mt-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-smrk px-5 text-sm font-bold text-papir [touch-action:manipulation]"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {stav === "hotovo" && (
          <>
            {oznameni !== null && (
              <p role="status" className="sr-only">
                {oznameni}
              </p>
            )}
            {/* chat-scroll-fix: the thread is its own scroll card. The composer
                stays under it so the page itself does not scroll. */}
            <div
              ref={vlaknoRef}
              data-vlakno-scroll="konverzace"
              className="posuvnik min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-3 lg:px-5 lg:pb-6 lg:pt-5"
            >
            {bloky.length === 0 ? (
              <p
                role="status"
                className="min-w-0 break-words rounded-2xl bg-povrch-2/60 p-4 text-center text-[13px] text-ink-3"
              >
                {hledany.length > 0
                  ? `Nic s textem „${hledany}“ tu není.`
                  : "Zatím tu není žádná zpráva — začni domluvu prvním vzkazem níže."}
              </p>
            ) : (
              <ul
                ref={listRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label={`Vlákno ${nazev}`}
                className="m-0 min-w-0 list-none space-y-3 p-0 min-[90rem]:space-y-4"
              >
                {bloky
                  .map((blok) => {
                  const den: string = popisekDne(blok.denIso);
                  const ukázatDen: boolean = posledniDen !== den;
                  if (ukázatDen) posledniDen = den;
                  return (
                    <li key={blok.key} className="min-w-0">
                      {ukázatDen && den.length > 0 && (
                        <p
                          aria-label={den}
                          className="mb-3 text-center text-[10.5px] font-semibold tracking-[0.4px] text-ink-3 min-[90rem]:mb-4"
                        >
                          <span className="inline-block rounded-full bg-povrch-2 px-2.5 py-[3px] first-letter:uppercase">
                            {den}
                          </span>
                        </p>
                      )}
                      <ul className="m-0 min-w-0 list-none space-y-3 p-0 min-[90rem]:space-y-2">
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
                              hledat={hledany}
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
              className="shrink-0 pb-[env(safe-area-inset-bottom,0px)] lg:border-t lg:border-linka lg:px-5 lg:pb-4 lg:pt-3.5"
            >
              {!prihlasen ? (
                <p
                  role="status"
                  className="rounded-2xl bg-povrch-2 p-3 text-center text-[13px] text-mech"
                >
                  Konverzaci čte každý, psát můžou přihlášení — přihlas se a
                  přidej vzkaz.
                </p>
              ) : !smiPsat ? (
                <p
                  role="status"
                  className="rounded-2xl border border-linka bg-povrch-2 p-3 text-center text-sm text-mech"
                >
                  {jeSkupina
                    ? "Do téhle skupiny smíš jen číst. Psát může role, které to vedení povolilo."
                    : "Důležité čte každý, psát můžou jen vedení, rada nebo admin. Obecnou domluvu piš do Obecného."}
                </p>
              ) : (
                <Composer
                  popisek={
                    jeSoukrome
                      ? `Napsat soukromě ${nazev}`
                      : jeDulezite
                        ? "Napsat důležité oznámení"
                        : jeSkupina || konverzace.channel === "general"
                          ? `Napsat do ${konverzace.channel === "general" ? "Obecného" : nazev}`
                          : `Napsat do ${nazev}`
                  }
                  placeholder={
                    // Telefon: jedno krátké znění, kam se píše, je v hlavičce.
                    !sirokaObrazovka
                      ? jeDulezite
                        ? "Napsat oznámení…"
                        : "Napsat zprávu…"
                      : jeDulezite
                        ? "Stručně a jasně pro všechny…"
                        : `Napsat zprávu${jeSoukrome ? "" : ` do ${konverzace.channel === "general" ? "Obecného" : nazev}`}…`
                  }
                  odesilaSe={odesilaSe}
                  chyba={chybaOdeslani}
                  navratTextu={navratTextu}
                  onOdeslat={(text, soubory) => void naOdeslat(text, soubory)}
                  zminky={jeGlobal}
                  clenove={clenove}
                  pretazene={pretazene}
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
