import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import Ikona from "../components/Ikona";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import ConversationList, {
  prevedNaPolozky,
  seradKonverzace,
  viditelneSegmenty,
  zalozkaProKanal,
  type PolozkaSeznamu,
  type SegmentChatu,
} from "../components/chat/ConversationList";
import KonverzaceDetail from "../components/chat/KonverzaceDetail";
import NovyChatSheet from "../components/chat/NovyChatSheet";
import PrehledOpravneni from "../components/chat/PrehledOpravneni";
import SkupinaForm from "../components/chat/SkupinaForm";
import SpodniSheet from "../components/shell/SpodniSheet";
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
/** Counts for the Chat list subtitle (pen meta line). */
export function spocitejSouhrnChatu(polozky: readonly PolozkaSeznamu[]): {
  skupiny: number;
  soukrome: number;
} {
  let skupiny = 0;
  let soukrome = 0;
  for (const polozka of polozky) {
    if (polozka.channel === "soukrome") soukrome += 1;
    else if (zalozkaProKanal(polozka.channel) === "skupiny") skupiny += 1;
  }
  return { skupiny, soukrome };
}

export function popisekSouhrnuChatu(skupiny: number, soukrome: number): string {
  const casti: string[] = [];
  if (skupiny === 1) casti.push("1 skupina");
  else if (skupiny >= 2 && skupiny <= 4) casti.push(`${skupiny} skupiny`);
  else casti.push(`${skupiny} skupin`);
  if (soukrome === 1) casti.push("1 soukromá");
  else if (soukrome >= 2 && soukrome <= 4) casti.push(`${soukrome} soukromé`);
  else casti.push(`${soukrome} soukromých`);
  return casti.join(" · ");
}

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

/** Obsah panelu se vyměnil na místě, focus musí zůstat uvnitř. */
function zaostriObsah(prvek: HTMLElement | null): void {
  prvek?.focus({ preventScroll: true });
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
 * - Tokeny 12f (border-linka, bg-papir, shadow-denik), 44px cíle,
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
  const [segment, setSegment] = useState<SegmentChatu>("vse");
  const [muzeSpravovatSkupiny, setMuzeSpravovatSkupiny] = useState<boolean>(false);
  const [katalogSkupin, setKatalogSkupin] = useState<ApiChatSkupina[]>([]);
  const [formular, setFormular] = useState<
    | null
    | { id: string; nazev: string; prava: PravoSkupiny[] }
  >(null);
  /** Přehled oprávnění skupin (admin). Formulář otevřený z něj se vrací sem. */
  const [prehledOpravneni, setPrehledOpravneni] = useState<boolean>(false);
  const [novyChat, setNovyChat] = useState<boolean>(false);
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
    setNovyChat(false);
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

  async function ulozFormularSkupiny(id: string | null, nazev: string, prava: PravoSkupiny[]): Promise<void> {
    setUkladaSkupinu(true);
    setChybaSkupiny(null);
    const vysledek = await ulozSkupinu(id, nazev, prava);
    setUkladaSkupinu(false);
    if (!vysledek.ok) {
      setChybaSkupiny(vysledek.chyba);
      return;
    }
    setFormular(null);
    setNovyChat(false);
    await nactiSkupiny();
    await obnov();
    // Nová skupina se rovnou otevře.
    if (id === null) vyberKonverzaci(klicSkupiny(vysledek.data.id));
  }

  function otevriFormularSkupiny(skupina: ApiChatSkupina): void {
    setChybaSkupiny(null);
    setFormular({ id: skupina.id, nazev: skupina.nazev, prava: skupina.prava });
  }

  function otevriUpravuSkupiny(key: string): void {
    const id = idZeKliceSkupiny(key);
    if (id === null) return;
    const skupina = katalogSkupin.find((polozka) => polozka.id === id);
    if (skupina === undefined) return;
    otevriFormularSkupiny(skupina);
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
    setSegment((pred) => {
      if (pred === "vse" || pred === "neprectene") return pred;
      if (vybranyKey.startsWith("expedice:")) return "vypravy";
      if (vybranyKey.startsWith("soukrome:")) return "soukrome";
      return "globalni";
    });
  }, [vybranyKey]);

  const vybranyNazev: string =
    vybrana === null
      ? ""
      : vybrana.channel === "soukrome"
        ? (vybrana.partnerJmeno ?? "Soukromá zpráva")
        : vybrana.channel === "dulezite"
        ? "Důležité"
        : vybrana.channel === "general"
          ? "Obecný"
          : vybrana.channel === "skupina"
            ? (vybrana.nazev ?? "Skupina")
          : (vybrana.expeditionId !== null &&
              nazvyVyprav.get(vybrana.expeditionId)) ||
            vybrana.expeditionId ||
            vybrana.key;

  const partneri = useMemo(
    () =>
      new Set(
        polozky
          .filter((polozka) => polozka.channel === "soukrome")
          .map((polozka) => (polozka.partnerId ?? "").toLowerCase())
          .filter((id) => id.length > 0),
      ),
    [polozky],
  );
  const souhrn = spocitejSouhrnChatu(polozky);
  const vlaknoOtevrene: boolean = vybranyKey !== null;

  return (
    <main
      className={
        vlaknoOtevrene
          ? "nocturne mx-auto flex h-[calc(100dvh-76px-env(safe-area-inset-bottom,0px)-var(--horni-okraj))] max-h-[calc(100dvh-76px-env(safe-area-inset-bottom,0px)-var(--horni-okraj))] min-h-0 w-full min-w-0 max-w-[46rem] flex-col overflow-hidden px-5 pb-3 pt-3 lg:h-[calc(100dvh-4rem-2rem-var(--horni-okraj))] lg:max-h-[calc(100dvh-4rem-2rem-var(--horni-okraj))] lg:max-w-none lg:px-8 lg:pb-2 lg:pt-4 min-[90rem]:h-[calc(100dvh-76px)] min-[90rem]:max-h-[calc(100dvh-76px)] min-[90rem]:px-10 min-[90rem]:pb-10 min-[90rem]:pt-11"
          : "nocturne mx-auto w-full min-w-0 max-w-[46rem] px-5 pb-6 pt-4 sm:px-6 sm:pt-8 lg:max-w-none lg:px-8 min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11"
      }
    >
      <header className={`${vlaknoOtevrene ? " hidden lg:block" : ""} mb-4 min-[90rem]:mb-0`}>
        <div className="flex min-w-0 items-center justify-between gap-3 min-[90rem]:items-end">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
              Chat
            </h1>
            <p className="text-xs text-ink-3 min-[90rem]:hidden">
              {popisekSouhrnuChatu(souhrn.skupiny, souhrn.soukrome)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 min-[90rem]:gap-2.5">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setPrehledOpravneni(true);
                void nactiSkupiny();
              }}
              aria-label="Oprávnění skupin"
              className="nahled-press inline-flex size-11 items-center justify-center gap-2 rounded-xl border border-linka bg-povrch text-sm font-semibold text-inkoust hover:bg-povrch-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-[46px] min-[90rem]:w-auto min-[90rem]:px-[18px]"
            >
              <Ikona nazev="lock" className="size-[18px] min-[90rem]:size-4" />
              <span className="hidden min-[90rem]:inline">Oprávnění</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setChybaSkupiny(null);
              setNovyChat(true);
            }}
            className="nahled-press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-smrk px-3.5 text-[13.5px] font-semibold text-papir hover:opacity-90 min-[90rem]:h-[46px] min-[90rem]:gap-2 min-[90rem]:px-[18px] min-[90rem]:text-sm"
          >
            <Ikona nazev="square-pen" className="size-4 min-[90rem]:hidden" />
            <Ikona nazev="pen-line" className="hidden size-4 min-[90rem]:block" />
            Napsat
          </button>
          </div>
        </div>
        <div className="mt-8 hidden items-center justify-between border-b border-linka pb-5 pt-1 min-[90rem]:flex">
          <div role="group" aria-label="Druh konverzací" className="flex items-center gap-2.5">
            {viditelneSegmenty(polozky, segment).map((polozka) => (
              <button
                key={polozka.id}
                type="button"
                aria-pressed={segment === polozka.id}
                onClick={() => setSegment(polozka.id)}
                className={`nahled-press inline-flex items-center rounded-full border px-3.5 py-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk ${
                  segment === polozka.id
                    ? "border-transparent bg-inkoust font-semibold text-povrch"
                    : "border-linka font-medium text-mech hover:bg-povrch-2"
                }`}
              >
                {polozka.nazev}
              </button>
            ))}
          </div>
          <p className="text-[13px] font-medium text-ink-3">{popisekSouhrnuChatu(souhrn.skupiny, souhrn.soukrome)}</p>
        </div>
      </header>

      <div
        className={
          vlaknoOtevrene
            ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-6 min-[90rem]:grid-cols-[360px_minmax(0,1fr)] min-[90rem]:gap-7 min-[90rem]:pt-8"
            : "min-w-0 pt-2 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6 lg:pt-6 min-[90rem]:grid-cols-[360px_minmax(0,1fr)] min-[90rem]:gap-7 min-[90rem]:pt-8"
        }
      >
        {/* Mobil: seznam NEBO detail. Desktop: vždy vedle sebe. */}
        <div className={`min-w-0 ${vybranyKey !== null ? "hidden lg:block lg:min-h-0 lg:overflow-x-hidden lg:overflow-y-auto" : "block"} posuvnik min-[90rem]:self-start min-[90rem]:overflow-y-auto min-[90rem]:max-h-full min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:shadow-denik`}>
          <h2 className="sr-only px-4 pb-2 pt-4 font-display text-base font-bold tracking-[-0.2px] text-inkoust min-[90rem]:not-sr-only min-[90rem]:!px-5 min-[90rem]:!pb-3 min-[90rem]:!pt-4">
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
            segment={segment}
            onSegment={setSegment}
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
              className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-linka bg-povrch px-6 py-14 text-center shadow-denik"
            >
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-povrch-2 text-ink-3">
                <Ikona nazev="message-circle" className="size-[18px]" />
              </span>
              <p className="min-w-0 break-words text-[15px] font-semibold text-inkoust">
                Vyber konverzaci
              </p>
              <p className="mx-auto max-w-sm min-w-0 break-words text-[13px] leading-snug text-ink-3">
                Vlevo jsou všechny chaty, nahoře nový založíš přes Napsat.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:h-full lg:rounded-2xl lg:border lg:border-linka lg:bg-povrch lg:shadow-denik">
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
                onUpravitSkupinu={
                  isAdmin && vybrana.channel === "skupina"
                    ? () => {
                        otevriUpravuSkupiny(vybrana.key);
                      }
                    : undefined
                }
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
      <NovyChatSheet
        otevreno={novyChat}
        clenove={clenove}
        jaId={currentUserId}
        partneri={partneri}
        muzeSkupinu={muzeSpravovatSkupiny}
        ukladaSe={ukladaSkupinu}
        chyba={chybaSkupiny}
        onZavrit={() => {
          setNovyChat(false);
          setChybaSkupiny(null);
        }}
        onClen={zacitSClenem}
        onVytvoritSkupinu={(nazev, prava) => {
          void ulozFormularSkupiny(null, nazev, prava);
        }}
      />
      <SpodniSheet
        otevreno={formular !== null || prehledOpravneni}
        titulek={formular !== null ? "Upravit skupinu" : "Oprávnění skupin"}
        podtitul={formular !== null ? formular.nazev : "Kdo smí skupiny číst a kdo do nich psát."}
        sirka={480}
        onZavrit={() => {
          setFormular(null);
          setPrehledOpravneni(false);
          setChybaSkupiny(null);
        }}
      >
        {formular !== null ? (
          <div key={formular.id} ref={prehledOpravneni ? zaostriObsah : undefined} tabIndex={-1} style={{ outline: "none" }}>
          <SkupinaForm
            zrusit={prehledOpravneni ? "Zpět" : "Zrušit"}
            nazev={formular.nazev}
            prava={formular.prava}
            ukladaSe={ukladaSkupinu}
            chyba={chybaSkupiny}
            onZrusit={() => {
              setFormular(null);
              setChybaSkupiny(null);
            }}
            onUlozit={(nazev, prava) => {
              void ulozFormularSkupiny(formular.id, nazev, prava);
            }}
          />
          </div>
        ) : prehledOpravneni ? (
          <PrehledOpravneni
            skupiny={katalogSkupin}
            onVybrat={otevriFormularSkupiny}
            onZavrit={() => setPrehledOpravneni(false)}
          />
        ) : null}
      </SpodniSheet>
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
