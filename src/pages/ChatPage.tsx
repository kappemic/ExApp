import { useEffect, useMemo, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import ConversationList, {
  prevedNaPolozky,
  seradKonverzace,
  type PolozkaSeznamu,
} from "../components/chat/ConversationList";
import KonverzaceDetail from "../components/chat/KonverzaceDetail";
import { useAuth } from "../hooks/useAuth";
import { klicSoukromehoChatu, partnerSoukromeho } from "../shared/soukromy-klic";
import type { UserListItem } from "../shared/api-types";
import { nactiCleny } from "../lib/admin-clenove";
import { getKonverzace } from "../lib/diskuze-api";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import { formatCasKratce } from "../lib/format-cas";
import type { ApiKonverzace, ApiZprava } from "../shared/api-types";

/** Jedna položka živé nástěnky — zpráva + kontext výpravy pro proklik. */
export interface PolozkaNastenky {
  zprava: ApiZprava;
  idVypravy: string;
  nazevVypravy: string;
}

type StavSeznamu = "nacitani" | "hotovo" | "chyba";
/** Partner for a draft private thread that is not in the list yet. */
type VybranyPartner = {
  id: string;
  jmeno: string;
};

/* ------------------------------------------------------------------ */
/* Legacy pomocníci bývalé živé nástěnky — ponecháno pro zpětnou        */
/* kompatibilitu test-importů (tests/diskuze-box.test.tsx). Nové UI     */
/* je seznam konverzací (pinned Důležité + General) + detail threadu.   */
/* @deprecated Nový kód používá ConversationList + KonverzaceDetail.    */
/* ------------------------------------------------------------------ */

/** Nejnovější první (created_at DESC, tie-break id). */
export function seradNastenkuSestupne(polozky: PolozkaNastenky[]): PolozkaNastenky[] {
  return [...polozky].sort((a, b) => {
    const cas: number =
      Date.parse(b.zprava.createdAt) - Date.parse(a.zprava.createdAt);
    if (cas !== 0) return cas;
    return a.zprava.id.localeCompare(b.zprava.id);
  });
}

/** Z každé výpravy vezme jen poslední (nejnovější) zprávy — vlákno je ASC. */
export function vezmiNejnovesi(
  zpravy: ApiZprava[],
  pocet: number,
): ApiZprava[] {
  if (pocet <= 0) return [];
  return zpravy.slice(-pocet);
}

/** Česká pluralizace počtu zpráv: 1 zpráva / 2–4 zprávy / 5+ zpráv. */
export function tvarZpravy(pocet: number): string {
  if (pocet === 1) return "zpráva";
  if (pocet >= 2 && pocet <= 4) return "zprávy";
  return "zpráv";
}

/** Česká pluralizace počtu výprav: 1 výprava / 2–4 výpravy / 0 a 5+ výprav. */
export function tvarVypravy(pocet: number): string {
  if (pocet === 1) return "výprava";
  if (pocet >= 2 && pocet <= 4) return "výpravy";
  return "výprav";
}

/**
 * Krátký český formát času položky nástěnky.
 * Re-export z `src/lib/format-cas.ts` pro zpětnou kompatibilitu
 * test-importů; jediná implementace žije ve `formatCasKratce`.
 */
export function formatCasNastenky(iso: string): string {
  return formatCasKratce(iso);
}

/* ------------------------------------------------------------------ */
/* Step 3 — pure pomocníci seznamu (export pro testy, bez fetch).       */
/* ------------------------------------------------------------------ */

const KONVERZACE_CACHE_KLIC = "exapp:konverzace-v1" as const;

/** Česká pluralizace konverzací: 1 konverzace / 2–4 konverzace / 0 a 5+ konverzací. */
export function tvarKonverzace(pocet: number): string {
  if (pocet === 1) return "konverzace";
  if (pocet >= 2 && pocet <= 4) return "konverzace";
  return "konverzací";
}

function jeApiKonverzacePole(hodnota: unknown): hodnota is ApiKonverzace[] {
  return Array.isArray(hodnota);
}

/** Best-effort snapshot pro offline (pravdou zůstává server). */
function ulozKonverzaceDoCache(konverzace: ApiKonverzace[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KONVERZACE_CACHE_KLIC, JSON.stringify(konverzace.slice(0, 30)));
  } catch {
    // Cache je nepovinná.
  }
}

function ctiKonverzaceZCache(): ApiKonverzace[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw: string | null = localStorage.getItem(KONVERZACE_CACHE_KLIC);
    if (raw === null || raw.trim().length === 0) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!jeApiKonverzacePole(parsed)) return [];
    return parsed.filter(
      (k): k is ApiKonverzace =>
        typeof k === "object" && k !== null && typeof (k as ApiKonverzace).key === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Worst-case fixture for layout tests: long names, emoji, unread badges.
 * Reálné hodnoty z katalogu: dlouhé jméno, dlouhý e-mail, emoji-first,
 * jednopísmenné jméno, 0 zpráv, 1284 nepřečtených, 120znakový název.
 */
export function vytvorWorstCaseKonverzace(): ApiKonverzace[] {
  const zaklad = (cast: Partial<ApiKonverzace> & { key: string }): ApiKonverzace => ({
    expeditionId: null,
    channel: "general",
    lastMessage: null,
    unreadCount: 0,
    ...cast,
  });
  const zprava = (cast: Partial<ApiZprava> & { id: string }): ApiZprava => ({
    expeditionId: null,
    autorId: "autor-1",
    authorName: "Jan Novák",
    channel: "general",
    text: "Ahoj",
    createdAt: "2026-10-14T10:00:00.000Z",
    ...cast,
  });
  return [
    zaklad({
      key: "dulezite",
      channel: "dulezite",
      unreadCount: 1284,
      lastMessage: zprava({
        id: "w-dulezite",
        channel: "dulezite",
        autorId: "vedeni-1",
        authorName: "Aleksandra Wiśniewska-Kowalczyk-Nováková Svobodová",
        text: "🏕️🔥 Zítra sraz v 7:40 u klubovny — nezapomeňte pláštěnku, svačinu a nabitý telefon! Podrobnosti v e-mailu.",
        createdAt: "2026-10-15T07:40:00.000Z",
      }),
    }),
    zaklad({
      key: "general",
      channel: "general",
      unreadCount: 1,
      lastMessage: zprava({
        id: "w-general",
        channel: "general",
        autorId: "cizi-dlouhe-id-123",
        authorName:
          "bartholomew.fitzgerald.vyborny.turista@northwind-industries-holdings.example.com",
        text: "Kdo bere buzolu? Moje zůstala v klubovně ve skříni číslo tři vedle lékárničky.",
        createdAt: "2026-10-15T08:10:00.000Z",
      }),
    }),
    zaklad({
      key: "expedice:sumava-trizdrojova-slat-2026-nejdelsi-nazev-vypravy-aby-se-otestovalo-zalamovani-do-dvou-radku-v-seznamu",
      expeditionId: "sumava-trizdrojova-slat-2026-nejdelsi-nazev-vypravy-aby-se-otestovalo-zalamovani-do-dvou-radku-v-seznamu",
      channel: "expedice",
      unreadCount: 3,
      lastMessage: zprava({
        id: "w-expedice-1",
        expeditionId: "sumava-trizdrojova-slat-2026",
        channel: "expedice",
        autorId: "emoji-autor",
        authorName: "🏕️ Vedoucí Šumava",
        text: "Trasa je v mapě — sraz platí!",
        createdAt: "2026-10-15T08:30:00.000Z",
      }),
    }),
    zaklad({
      key: "expedice:brdy-2026",
      expeditionId: "brdy-2026",
      channel: "expedice",
      unreadCount: 0,
      lastMessage: null,
    }),
    zaklad({
      key: "expedice:jizerske-hory-2026",
      expeditionId: "jizerske-hory-2026",
      channel: "expedice",
      unreadCount: 0,
      lastMessage: zprava({
        id: "w-expedice-2",
        expeditionId: "jizerske-hory-2026",
        channel: "expedice",
        autorId: "jo-id",
        authorName: "Jo",
        text: "Jdu!",
        createdAt: "2026-10-13T18:00:00.000Z",
      }),
    }),
  ];
}

/** Názvy výprav pro worst-case (jinak by padaly na holé id). */
export function vytvorWorstCaseNazvy(): Map<string, string> {
  return new Map([
    [
      "sumava-trizdrojova-slat-2026-nejdelsi-nazev-vypravy-aby-se-otestovalo-zalamovani-do-dvou-radku-v-seznamu",
      "Šumava – Tříjezerní slať (nejdelší název výpravy pro test zalamování do dvou řádků v seznamu, max 120 znaků)",
    ],
    ["brdy-2026", "Brdy – Jindrova skála"],
    ["jizerske-hory-2026", "Jizerské hory"],
  ]);
}

/**
 * Nástěnka konverzací (Step 3) — seznam + detail threadu.
 *
 * - Seznam: pinned Důležité + General nahoře, za nimi výpravy; každý řádek
 *   nese poslední zprávu (`authorName` z JOINu, žádný extra fetch) + badge
 *   nepřečtených. Klik → detail (`?konverzace=<key>`, sdílitelné v URL).
 * - Detail: bubliny seskupené po autorovi/dni, hlavička `authorName`,
 *   „Ty" jen pro `currentUserId`; composer skrytý v Důležitém pro USER
 *   (read-only notice). Mobile-first: mobil = seznam NEBO detail se Zpět,
 *   desktop = vedle sebe. Offline-friendly: snapshot cache + retry.
 * - Deníkové tokeny (border-inkoust, bg-papir, shadow-denik), 44px cíle,
 *   360px bez horizontálního scrollu, viditelný focus, reduced-motion.
 */
export default function ChatPage(): JSX.Element {
  const { user, muzeSpravovatVypravy } = useAuth();
  const [params, setParams] = useSearchParams();
  const [stav, setStav] = useState<StavSeznamu>("nacitani");
  const [konverzace, setKonverzace] = useState<ApiKonverzace[]>(() =>
    ctiKonverzaceZCache(),
  );
  const [nazvyVyprav, setNazvyVyprav] = useState<Map<string, string>>(new Map());
  const [chyba, setChyba] = useState<string | null>(null);
  const [clenove, setClenove] = useState<UserListItem[]>([]);
  const [vybranyPartner, setVybranyPartner] = useState<VybranyPartner | null>(null);

  const currentUserId: string | null = user?.id ?? null;
  const muzePsatDulezite: boolean =
    (user?.isAdmin ?? false) ||
    user?.funkce === "vedeni" ||
    user?.funkce === "rada";

  const vybranyKey: string | null = params.get("konverzace");

  const nacti = async (): Promise<void> => {
    setStav("nacitani");
    setChyba(null);
    /* Názvy výprav: synchronní snapshot hned, živý BFF jako upgrade. */
    const mapa = new Map<string, string>();
    for (const v of getExpeditionsSync().data) mapa.set(v.id, v.nazev);
    try {
      const cerstve = await getExpeditions();
      if (cerstve.source === "db" && cerstve.data.length > 0) {
        mapa.clear();
        for (const v of cerstve.data) mapa.set(v.id, v.nazev);
      }
    } catch {
      /* Offline — zůstanou snapshot/mocky. */
    }
    setNazvyVyprav(mapa);
    const vysledek = await getKonverzace();
    if (!vysledek.ok) {
      const cache: ApiKonverzace[] = ctiKonverzaceZCache();
      if (cache.length > 0) {
        setKonverzace(cache);
        setStav("hotovo");
        return;
      }
      setStav("chyba");
      setChyba(vysledek.chyba);
      return;
    }
    ulozKonverzaceDoCache(vysledek.data.konverzace);
    setKonverzace(vysledek.data.konverzace);
    setStav("hotovo");
  };

  useEffect(() => {
    void nacti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Members load beside the conversation list — a slow directory must not block threads. */
  useEffect(() => {
    if (currentUserId === null) {
      setClenove([]);
      return;
    }
    let aktivni = true;
    void nactiCleny().then((vysledek) => {
      if (!aktivni || !vysledek.ok) return;
      setClenove(vysledek.data);
    });
    return () => {
      aktivni = false;
    };
  }, [currentUserId]);

  const polozky: PolozkaSeznamu[] = useMemo(
    () => seradKonverzace(prevedNaPolozky(konverzace, nazvyVyprav)),
    [konverzace, nazvyVyprav],
  );

  const vybrana: ApiKonverzace | null = useMemo(() => {
    if (vybranyKey === null) return null;
    const zSeznamu = konverzace.find((k) => k.key === vybranyKey);
    if (zSeznamu !== undefined) return zSeznamu;
    if (currentUserId === null) return null;
    const partnerId = partnerSoukromeho(vybranyKey, currentUserId);
    if (partnerId === null) return null;
    const jmeno =
      vybranyPartner !== null && vybranyPartner.id.toLowerCase() === partnerId
        ? vybranyPartner.jmeno
        : "Člen";
    return {
      key: vybranyKey,
      expeditionId: null,
      channel: "soukrome",
      partnerId,
      partnerJmeno: jmeno,
      lastMessage: null,
      unreadCount: 0,
    };
  }, [konverzace, vybranyKey, currentUserId, vybranyPartner]);

  function zacitSClenem(clen: UserListItem): void {
    if (currentUserId === null) return;
    const klic = klicSoukromehoChatu(currentUserId, clen.id);
    if (klic === null) return;
    setVybranyPartner({ id: clen.id, jmeno: clen.jmeno });
    vyberKonverzaci(klic);
  }

  function vyberKonverzaci(key: string): void {
    setParams((prev) => {
      const dalsi = new URLSearchParams(prev);
      dalsi.set("konverzace", key);
      return dalsi;
    });
  }

  function zpetNaSeznam(): void {
    setParams((prev) => {
      const dalsi = new URLSearchParams(prev);
      dalsi.delete("konverzace");
      return dalsi;
    });
  }

  function naPrecteno(key: string): void {
    setKonverzace((prev) =>
      prev.map((k) => (k.key === key ? { ...k, unreadCount: 0 } : k)),
    );
  }

  const vybranyNazev: string =
    vybrana === null
      ? ""
      : vybrana.channel === "soukrome"
        ? (vybrana.partnerJmeno ?? "Soukromá zpráva")
        : vybrana.channel === "dulezite"
        ? "Důležité"
        : vybrana.channel === "general"
          ? "General"
          : (vybrana.expeditionId !== null &&
              nazvyVyprav.get(vybrana.expeditionId)) ||
            vybrana.expeditionId ||
            vybrana.key;

  const pocetNeprectenych: number = polozky.reduce(
    (soucet, p) => soucet + (p.unreadCount > 0 ? 1 : 0),
    0,
  );

  const vlaknoOtevrene: boolean = vybranyKey !== null;

  return (
    <main
      className={
        vlaknoOtevrene
          ? "mx-auto flex h-[calc(100dvh-4rem-3.5rem-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-4rem-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 w-full max-w-6xl min-w-0 flex-col overflow-hidden px-2 pb-2 pt-2 lg:block lg:h-auto lg:max-h-none lg:overflow-visible lg:px-6 lg:pb-16 lg:pt-12"
          : "mx-auto w-full max-w-6xl min-w-0 px-4 pb-16 pt-8 sm:px-6 sm:pt-12"
      }
    >
      <header className={`border-b-2 border-inkoust pb-5${vlaknoOtevrene ? " hidden lg:block" : ""}`}>
        <p className="text-sm font-medium text-mech">Školní expediční klub</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
            Nástěnka
          </h1>
          <span className="inline-flex shrink-0 -rotate-3 items-center whitespace-nowrap rounded border-2 border-inkoust bg-smrk px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-papir shadow-razitko tabular-nums">
            {stav === "hotovo"
              ? `${polozky.length} ${tvarKonverzace(polozky.length)}`
              : "Živě"}
          </span>
          {pocetNeprectenych > 0 && (
            <span
              role="status"
              aria-label={`${pocetNeprectenych} ${pocetNeprectenych === 1 ? "konverzace má" : pocetNeprectenych >= 2 && pocetNeprectenych <= 4 ? "konverzace mají" : "konverzací má"} nepřečtené zprávy`}
              className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full border-2 border-inkoust bg-red-800 px-2 text-[12px] font-extrabold text-papir tabular-nums"
            >
              {pocetNeprectenych}
            </span>
          )}
        </div>
        <p className="mt-2 max-w-2xl min-w-0 break-words text-base text-inkoust/75">
          Domluva na jednom místě — Důležité a General připnuté nahoře, pod
          nimi vlákna výprav. Klikni na řádek a čti i piš v threadu. Soukromé
          zprávy jsou v seznamu pod Členové.
        </p>
      </header>

      <div
        className={`min-w-0 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6 lg:pt-6${
          vlaknoOtevrene ? " flex min-h-0 flex-1 flex-col pt-2" : " pt-6"
        }`}
      >
        {/* Mobil: seznam NEBO detail. Desktop: vždy vedle sebe. */}
        <div className={`min-w-0 ${vybranyKey !== null ? "hidden lg:block" : "block"}`}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-inkoust/60">
            Konverzace
          </h2>
          <ConversationList
            polozky={polozky}
            vybranyKey={vybranyKey}
            onVybrat={vyberKonverzaci}
            stav={stav}
            chyba={chyba}
            onZkusitZnovu={() => void nacti()}
            clenove={clenove}
            jaId={currentUserId}
            onZacitSClenem={zacitSClenem}
          />
        </div>

        <div
          className={`min-w-0 ${
            vybranyKey === null ? "hidden lg:block" : "flex min-h-0 flex-1 flex-col"
          }`}
        >
          {vybrana === null ? (
            <div
              role="status"
              className="rounded-2xl border-2 border-dashed border-inkoust/30 bg-white/60 px-6 py-14 text-center shadow-denik"
            >
              <p className="min-w-0 break-words text-lg font-bold tracking-tight">
                Vyber konverzaci
              </p>
              <p className="mx-auto mt-1.5 max-w-sm min-w-0 break-words text-sm leading-relaxed text-inkoust/70">
                Vlevo je seznam vláken s náhledem poslední zprávy. Klikni na
                řádek a thread se otevře tady — se seskupenými bublinami po
                autorovi a dni.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border-2 border-inkoust bg-papir p-2 shadow-denik lg:p-4">
              <KonverzaceDetail
                key={vybrana.key}
                konverzace={vybrana}
                nazev={vybranyNazev}
                currentUserId={currentUserId}
                muzePsatDulezite={muzePsatDulezite}
                muzeMazatCizi={muzeSpravovatVypravy}
                onZpet={zpetNaSeznam}
                onPrecteno={naPrecteno}
                onPoOdeslani={() => {
                  void getKonverzace().then((vysledek) => {
                    if (vysledek.ok) setKonverzace(vysledek.data.konverzace);
                  });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
