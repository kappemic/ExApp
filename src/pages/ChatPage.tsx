import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import ConversationList, {
  prevedNaPolozky,
  seradKonverzace,
  type PolozkaSeznamu,
  type ZalozkaChatu,
} from "../components/chat/ConversationList";
import KonverzaceDetail from "../components/chat/KonverzaceDetail";
import SkupinaForm from "../components/chat/SkupinaForm";
import { useAuth } from "../hooks/useAuth";
import { useKonverzacePrehled } from "../hooks/useKonverzacePrehled";
import { klicSoukromehoChatu, partnerSoukromeho } from "../shared/soukromy-klic";
import type { UserListItem } from "../shared/api-types";
import { nactiCleny } from "../lib/admin-clenove";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import { getSkupiny, smazSkupinu, ulozSkupinu } from "../lib/diskuze-api";
import {
  idZeKliceSkupiny,
  klicSkupiny,
  type ApiChatSkupina,
  type PravoSkupiny,
} from "../lib/skupiny-pristup";
import type { ApiKonverzace, ApiZprava } from "../shared/api-types";

/** Jedna položka živé nástěnky — zpráva + kontext výpravy pro proklik. */
export interface PolozkaNastenky {
  zprava: ApiZprava;
  idVypravy: string;
  nazevVypravy: string;
}

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

/* ------------------------------------------------------------------ */
/* Step 3 — pure pomocníci seznamu (export pro testy, bez fetch).       */
/* ------------------------------------------------------------------ */

/** Snapshot key shared with the conversation poller (`exapp:konverzace-v1`). */
export const KONVERZACE_CACHE_KLIC = "exapp:konverzace-v1" as const;

/** Česká pluralizace konverzací: 1 konverzace / 2–4 konverzace / 0 a 5+ konverzací. */
export function tvarKonverzace(pocet: number): string {
  if (pocet === 1) return "konverzace";
  if (pocet >= 2 && pocet <= 4) return "konverzace";
  return "konverzací";
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
    prilohy: [],
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
  const { user, isAdmin } = useAuth();
  const {
    konverzace,
    stav,
    chyba,
    obnov,
    vynulujNeprectene,
    skryjKonverzaci,
    vratKonverzaci,
    nastavNahled,
  } = useKonverzacePrehled();
  const [params, setParams] = useSearchParams();
  const [nazvyVyprav, setNazvyVyprav] = useState<Map<string, string>>(new Map());
  const [organizatoriVyprav, setOrganizatoriVyprav] = useState<
    Map<string, string | null>
  >(new Map());
  const [clenove, setClenove] = useState<UserListItem[]>([]);
  const [vybranyPartner, setVybranyPartner] = useState<VybranyPartner | null>(null);
  const [zalozka, setZalozka] = useState<ZalozkaChatu>("skupiny");
  const [muzeSpravovatSkupiny, setMuzeSpravovatSkupiny] = useState<boolean>(false);
  const [katalogSkupin, setKatalogSkupin] = useState<ApiChatSkupina[]>([]);
  const [formular, setFormular] = useState<
    | null
    | { id: string | null; nazev: string; prava: PravoSkupiny[] }
  >(null);
  const [ukladaSkupinu, setUkladaSkupinu] = useState<boolean>(false);
  const [chybaSkupiny, setChybaSkupiny] = useState<string | null>(null);
  const [keSmazaniSkupiny, setKeSmazaniSkupiny] = useState<{
    id: string;
    key: string;
    nazev: string;
  } | null>(null);
  const [mazeSkupinu, setMazeSkupinu] = useState<boolean>(false);
  const [chybaMazaniSkupiny, setChybaMazaniSkupiny] = useState<string | null>(null);
  const navratPoSmazaniSkupinyRef = useRef<HTMLElement | null>(null);

  const currentUserId: string | null = user?.id ?? null;
  const muzePsatDulezite: boolean =
    (user?.isAdmin ?? false) ||
    user?.isSuperadmin === true ||
    user?.funkce === "vedeni" ||
    user?.funkce === "rada";

  const vybranyKey: string | null = params.get("konverzace");

  const nactiNazvy = async (): Promise<void> => {
    const mapa = new Map<string, string>();
    const organizatori = new Map<string, string | null>();
    const zapis = (id: string, nazev: string, organizatorId: string | null | undefined): void => {
      mapa.set(id, nazev);
      organizatori.set(id, organizatorId ?? null);
    };
    for (const v of getExpeditionsSync().data) zapis(v.id, v.nazev, v.organizatorId);
    try {
      const cerstve = await getExpeditions();
      if (cerstve.source === "db" && cerstve.data.length > 0) {
        mapa.clear();
        organizatori.clear();
        for (const v of cerstve.data) zapis(v.id, v.nazev, v.organizatorId);
      }
    } catch {
      /* Offline — zůstanou snapshot/mocky. */
    }
    setNazvyVyprav(mapa);
    setOrganizatoriVyprav(organizatori);
  };

  useEffect(() => {
    void nactiNazvy();
  }, []);

  const nactiSkupiny = async (): Promise<void> => {
    const vysledek = await getSkupiny();
    if (!vysledek.ok) return;
    setMuzeSpravovatSkupiny(vysledek.data.muzeSpravovat);
    setKatalogSkupin(vysledek.data.skupiny);
  };

  useEffect(() => {
    void nactiSkupiny();
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

  async function ulozFormularSkupiny(nazev: string, prava: PravoSkupiny[]): Promise<void> {
    if (formular === null) return;
    setUkladaSkupinu(true);
    setChybaSkupiny(null);
    const vysledek = await ulozSkupinu(formular.id, nazev, prava);
    setUkladaSkupinu(false);
    if (!vysledek.ok) {
      setChybaSkupiny(vysledek.chyba);
      return;
    }
    setFormular(null);
    await nactiSkupiny();
    await obnov();
  }

  function otevriUpravuSkupiny(key: string): void {
    const id = idZeKliceSkupiny(key);
    if (id === null) return;
    if (formular?.id === id) {
      setFormular(null);
      setChybaSkupiny(null);
      return;
    }
    const skupina = katalogSkupin.find((polozka) => polozka.id === id);
    if (skupina === undefined) return;
    setChybaSkupiny(null);
    setFormular({ id, nazev: skupina.nazev, prava: skupina.prava });
    setZalozka("skupiny");
  }

  function otevriSmazaniSkupiny(spoustec: HTMLElement): void {
    if (vybrana === null || vybrana.channel !== "skupina") return;
    const id = idZeKliceSkupiny(vybrana.key);
    if (id === null) return;
    navratPoSmazaniSkupinyRef.current = spoustec;
    setChybaMazaniSkupiny(null);
    setKeSmazaniSkupiny({ id, key: vybrana.key, nazev: vybranyNazev });
  }

  async function potvrdSmazaniSkupiny(): Promise<void> {
    if (keSmazaniSkupiny === null || mazeSkupinu) return;
    const cil = keSmazaniSkupiny;
    const katalogPred = katalogSkupin;
    const bylOtevreny: boolean = vybranyKey === cil.key;
    setMazeSkupinu(true);
    setChybaMazaniSkupiny(null);
    skryjKonverzaci(cil.key);
    setKatalogSkupin((prev) => prev.filter((skupina) => skupina.id !== cil.id));
    if (bylOtevreny) zpetNaSeznam();
    setKeSmazaniSkupiny(null);
    setFormular(null);
    const vysledek = await smazSkupinu(cil.id);
    setMazeSkupinu(false);
    if (!vysledek.ok) {
      vratKonverzaci(cil.key);
      setKatalogSkupin(katalogPred);
      setKeSmazaniSkupiny(cil);
      setChybaMazaniSkupiny(vysledek.chyba);
      if (bylOtevreny) vyberKonverzaci(cil.key);
      return;
    }
    void nactiSkupiny();
    void obnov();
  }

  function zpetNaSeznam(): void {
    setParams((prev) => {
      const dalsi = new URLSearchParams(prev);
      dalsi.delete("konverzace");
      return dalsi;
    });
  }

  useEffect(() => {
    if (vybranyKey === null) return;
    if (vybranyKey.startsWith("expedice:")) {
      setZalozka("vypravy");
      return;
    }
    if (vybranyKey.startsWith("soukrome:")) {
      setZalozka("clenove");
      return;
    }
    if (
      vybranyKey === "dulezite" ||
      vybranyKey === "general" ||
      vybranyKey.startsWith("skupina:")
    ) {
      setZalozka("skupiny");
    }
  }, [vybranyKey]);

  const vybranyNazev: string =
    vybrana === null
      ? ""
      : vybrana.channel === "soukrome"
        ? (vybrana.partnerJmeno ?? "Soukromá zpráva")
        : vybrana.channel === "dulezite"
        ? "Důležité"
        : vybrana.channel === "general"
          ? "General"
          : vybrana.channel === "skupina"
            ? (vybrana.nazev ?? "Skupina")
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
          ? "mx-auto flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-4rem-env(safe-area-inset-bottom,0px))] max-h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-4rem-env(safe-area-inset-bottom,0px))] min-h-0 w-full min-w-0 flex-col overflow-hidden px-2 pb-2 pt-2 lg:h-[calc(100dvh-4rem-2rem)] lg:max-h-[calc(100dvh-4rem-2rem)] lg:px-8 lg:pb-2 lg:pt-4 xl:px-12"
          : "mx-auto w-full min-w-0 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8 xl:px-12"
      }
    >
      <header className={`border-b-2 border-inkoust pb-5${vlaknoOtevrene ? " hidden lg:block" : ""}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">
            Chaty
          </h1>
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
      </header>

      <div
        className={
          vlaknoOtevrene
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-2 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]"
            : "min-w-0 pt-6 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6 lg:pt-6 xl:grid-cols-[24rem_minmax(0,1fr)]"
        }
      >
        {/* Mobil: seznam NEBO detail. Desktop: vždy vedle sebe. */}
        <div className={`min-w-0 ${vybranyKey !== null ? "hidden lg:block lg:min-h-0 lg:overflow-y-auto" : "block"}`}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-inkoust/60">
            Konverzace
          </h2>
          <ConversationList
            polozky={polozky}
            vybranyKey={vybranyKey}
            onVybrat={vyberKonverzaci}
            stav={stav}
            chyba={chyba}
            onZkusitZnovu={() => void obnov()}
            clenove={clenove}
            jaId={currentUserId}
            onZacitSClenem={zacitSClenem}
            zalozka={zalozka}
            onZalozka={setZalozka}
            muzeSpravovatSkupiny={muzeSpravovatSkupiny}
            onNovaSkupina={() => {
              setChybaSkupiny(null);
              setFormular({ id: null, nazev: "", prava: [] });
              setZalozka("skupiny");
            }}
            novaSkupina={
              formular !== null && formular.id === null ? (
                <SkupinaForm
                  key="nova"
                  nazev={formular.nazev}
                  prava={formular.prava}
                  ukladaSe={ukladaSkupinu}
                  chyba={chybaSkupiny}
                  onZrusit={() => {
                    setFormular(null);
                    setChybaSkupiny(null);
                  }}
                  onUlozit={(nazev, prava) => {
                    void ulozFormularSkupiny(nazev, prava);
                  }}
                />
              ) : null
            }
            onUpravitSkupinu={isAdmin ? otevriUpravuSkupiny : undefined}
            upravaSkupiny={
              formular !== null && formular.id !== null
                ? {
                    key: klicSkupiny(formular.id),
                    nazev: formular.nazev,
                    prava: formular.prava,
                    ukladaSe: ukladaSkupinu,
                    chyba: chybaSkupiny,
                    onZrusit: () => {
                      setFormular(null);
                      setChybaSkupiny(null);
                    },
                    onUlozit: (nazev, prava) => {
                      void ulozFormularSkupiny(nazev, prava);
                    },
                  }
                : null
            }
          />
        </div>

        <div
          className={`min-w-0 ${
            vybranyKey === null ? "hidden lg:block" : "flex min-h-0 flex-1 flex-col overflow-hidden"
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
                organizatorId={
                  vybrana.channel === "expedice" && vybrana.expeditionId !== null
                    ? (organizatoriVyprav.get(vybrana.expeditionId) ?? null)
                    : null
                }
                currentUserId={currentUserId}
                muzePsatDulezite={muzePsatDulezite}
                onZpet={zpetNaSeznam}
                onPrecteno={vynulujNeprectene}
                onPoOdeslani={() => {
                  void obnov();
                }}
                onNahled={(zprava) => nastavNahled(vybrana.key, zprava)}
                onSmazatSkupinu={
                  muzeSpravovatSkupiny && vybrana.channel === "skupina"
                    ? otevriSmazaniSkupiny
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>
      {keSmazaniSkupiny !== null && (
        <ConfirmDialog
          otevreno
          nadpis={`Smazat skupinu „${keSmazaniSkupiny.nazev}"?`}
          popis="Zprávy v této skupině budou trvale smazané. Akci nejde vrátit — pokračuj jen pokud jsi si jistý."
          potvrditPopisek="Ano, smazat skupinu"
          navratElement={navratPoSmazaniSkupinyRef.current}
          zrusitPopisek="Ponechat"
          probiha={mazeSkupinu}
          probihaPopisek="Mažu…"
          chyba={chybaMazaniSkupiny}
          onPotvrdit={() => {
            void potvrdSmazaniSkupiny();
          }}
          onZrusit={() => {
            if (mazeSkupinu) return;
            setKeSmazaniSkupiny(null);
            setChybaMazaniSkupiny(null);
          }}
        />
      )}
    </main>
  );
}
