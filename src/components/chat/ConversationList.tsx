import Ikona from "../Ikona";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from "react";
import type { ApiKonverzace, KanalDiskuze, UserListItem } from "../../shared/api-types";
import { formatCasSeznamu } from "../../lib/format-cas";
import { KostraRadky } from "../StrankaKostra";
import AvatarKruh, { barvaAvataru } from "../AvatarKruh";
import PrazdnyStav from "../PrazdnyStav";
import { SEZNAM_KARTA_TRIDA } from "../SeznamKarta";
import { IkonaBublina, IkonaLupa } from "../SeznamIkony";

/**
 * Jedna řádka seznamu konverzací (Step 3).
 * `nazev` řeší klient z mapy výprav (globály mají pevné české názvy);
 * `lastMessage` + `unreadCount` jdou přímo z `GET /api/diskuze/konverzace`
 * — žádná konverzace se nikdy nestaví z jednotlivých zpráv
 * („každá zpráva = bublina konverzace" je zakázaný vzor).
 */
export interface PolozkaSeznamu {
  key: string;
  nazev: string;
  channel: KanalDiskuze;
  expeditionId: string | null;
  pinned: boolean;
  lastMessageNazev: string;
  lastMessageText: string;
  /** First attachment name when the latest message has files. */
  lastMessagePriloha?: string;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Druhý účastník soukromého chatu. U skupin chybí. */
  partnerId?: string | null;
}

export interface ConversationListProps {
  polozky: PolozkaSeznamu[];
  vybranyKey: string | null;
  onVybrat: (key: string) => void;
  stav: "nacitani" | "hotovo" | "chyba";
  chyba: string | null;
  onZkusitZnovu: () => void;
  /** Členové klubu pro vyhledání soukromého chatu. */
  clenove?: readonly UserListItem[];
  jaId?: string | null;
  onZacitSClenem?: (clen: UserListItem) => void;
  segment: SegmentChatu;
  onSegment: (segment: SegmentChatu) => void;
}

/* ------------------------------------------------------------------ */
/* Pure pomocníci — export pro tests/chat-konverzace-step3.test.ts.     */
/* ------------------------------------------------------------------ */

/** Pevné české názvy globálních kanálů (pinned nahoře). */
export function vyberNazevKonverzace(
  konverzace: ApiKonverzace,
  nazevVypravy: string | null,
): string {
  if (konverzace.channel === "dulezite") return "Důležité";
  if (konverzace.channel === "general") return "Obecný";
  if (konverzace.channel === "skupina") {
    const jmeno = (konverzace.nazev ?? "").trim();
    return jmeno.length > 0 ? jmeno : "Skupina";
  }
  if (konverzace.channel === "soukrome") {
    const jmeno = (konverzace.partnerJmeno ?? "").trim();
    return jmeno.length > 0 ? jmeno : "Soukromá zpráva";
  }
  const ciste: string = (nazevVypravy ?? "").trim().replace(/\s+/g, " ");
  if (ciste.length > 0) return ciste;
  if (konverzace.expeditionId !== null && konverzace.expeditionId.length > 0) {
    return konverzace.expeditionId;
  }
  return konverzace.key;
}

/** Pinned = the two global channels (Důležité, Obecný) — always on top. */
export function jePinnedKanal(channel: KanalDiskuze): boolean {
  return channel === "dulezite" || channel === "general";
}

/**
 * Převede `ApiKonverzace[]` na řádky seznamu s vyřešenými názvy.
 * Vstup se nemutuje; názvy výprav bere z mapy `expeditionId → nazev`.
 */
export function prevedNaPolozky(
  konverzace: readonly ApiKonverzace[],
  nazvyVyprav: ReadonlyMap<string, string>,
): PolozkaSeznamu[] {
  return konverzace.map((k) => ({
    key: k.key,
    nazev: vyberNazevKonverzace(k, k.expeditionId === null ? null : (nazvyVyprav.get(k.expeditionId) ?? null)),
    channel: k.channel,
    expeditionId: k.expeditionId,
    pinned: jePinnedKanal(k.channel),
    lastMessageNazev: k.lastMessage === null ? "" : k.lastMessage.authorName,
    lastMessageText: k.lastMessage === null ? "" : k.lastMessage.text,
    lastMessagePriloha:
      k.lastMessage === null || k.lastMessage.prilohy.length === 0
        ? ""
        : k.lastMessage.prilohy[0]?.nazev ?? "",
    lastMessageAt: k.lastMessage === null ? null : k.lastMessage.createdAt,
    unreadCount: k.unreadCount,
    partnerId: k.partnerId ?? null,
  }));
}

/**
 * Řazení seznamu: pinned první (Důležité, pak General),
 * za nimi výpravy podle poslední zprávy sestupně (prázdné dospod, tie-break key).
 */
export function seradKonverzace(polozky: PolozkaSeznamu[]): PolozkaSeznamu[] {
  const vahaPinned = (p: PolozkaSeznamu): number => {
    if (p.channel === "dulezite") return 0;
    if (p.channel === "general") return 1;
    return 2;
  };
  return [...polozky].sort((a, b) => {
    const pinned: number = vahaPinned(a) - vahaPinned(b);
    if (pinned !== 0) return pinned;
    if (a.lastMessageAt === null && b.lastMessageAt === null) {
      return a.key.localeCompare(b.key);
    }
    if (a.lastMessageAt === null) return 1;
    if (b.lastMessageAt === null) return -1;
    const cas: number = Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);
    if (cas !== 0) return cas;
    return a.key.localeCompare(b.key);
  });
}

export type ZalozkaChatu = "skupiny" | "vypravy" | "clenove";

/** Skupiny = Důležité a General, Výpravy = vlákna výprav, Členové = soukromé. */
export function zalozkaProKanal(channel: KanalDiskuze): ZalozkaChatu {
  if (channel === "expedice") return "vypravy";
  if (channel === "soukrome") return "clenove";
  return "skupiny";
}

export function filtrujPolozkyZalozky(
  polozky: readonly PolozkaSeznamu[],
  zalozka: ZalozkaChatu,
): PolozkaSeznamu[] {
  return polozky.filter((polozka) => zalozkaProKanal(polozka.channel) === zalozka);
}

export function maNeprecteneVZalozce(
  polozky: readonly PolozkaSeznamu[],
  zalozka: ZalozkaChatu,
): boolean {
  return filtrujPolozkyZalozky(polozky, zalozka).some(
    (polozka) => polozka.unreadCount > 0,
  );
}

/** Segments filter the list the API already returned. */
export type SegmentChatu = "vse" | "globalni" | "vypravy" | "soukrome" | "neprectene";

/** Case-insensitive filter on list rows (name + preview). */
export function filtrujPolozkyHledanim(
  polozky: readonly PolozkaSeznamu[],
  dotaz: string,
): PolozkaSeznamu[] {
  const q: string = normalizovanyDotaz(dotaz);
  if (q.length === 0) return [...polozky];
  return polozky.filter((polozka) => {
    const nahled = textNahleduKonverzace(polozka).toLowerCase();
    return polozka.nazev.toLowerCase().includes(q) || nahled.includes(q);
  });
}

export function filtrujPolozkySegmentu(
  polozky: readonly PolozkaSeznamu[],
  segment: SegmentChatu,
): PolozkaSeznamu[] {
  if (segment === "vse") return [...polozky];
  if (segment === "vypravy") return polozky.filter((polozka) => polozka.channel === "expedice");
  if (segment === "soukrome") return polozky.filter((polozka) => polozka.channel === "soukrome");
  if (segment === "neprectene") return polozky.filter((polozka) => polozka.unreadCount > 0);
  return polozky.filter(
    (polozka) =>
      polozka.channel === "dulezite" ||
      polozka.channel === "general" ||
      polozka.channel === "skupina",
  );
}

export function maNeprecteneVSegmentu(
  polozky: readonly PolozkaSeznamu[],
  segment: SegmentChatu,
): boolean {
  return filtrujPolozkySegmentu(polozky, segment).some((polozka) => polozka.unreadCount > 0);
}

/**
 * Subtitle of a conversation row. A file-only message shows the file name.
 * The empty-thread sentence is only for a thread with no message at all.
 */
export function textNahleduKonverzace(
  polozka: Pick<PolozkaSeznamu, "lastMessageNazev" | "lastMessageText" | "lastMessagePriloha">,
): string {
  const soubor: string = polozka.lastMessagePriloha ?? "";
  const obsah: string = polozka.lastMessageText.length > 0 ? polozka.lastMessageText : soubor;
  if (obsah.length === 0) return "Zatím bez zpráv — začni první vzkazem.";
  if (polozka.lastMessageNazev.length > 0) return `${polozka.lastMessageNazev}: ${obsah}`;
  return obsah;
}

/** Česká pluralizace nepřečtených: 1 nepřečtená / 2–4 nepřečtené / 5+ nepřečtených. */
export function popisekNeprectenychKonverzace(pocet: number): string {
  const cele: number = Number.isFinite(pocet) ? Math.max(0, Math.floor(pocet)) : 0;
  if (cele === 1) return "1 nepřečtená zpráva";
  if (cele >= 2 && cele <= 4) return `${cele} nepřečtené zprávy`;
  if (cele >= 5) return `${cele} nepřečtených zpráv`;
  return "žádné nepřečtené zprávy";
}

/** Ikona kanálu — textová značka, ne emoji (čtečka ji přečte česky). */
function znackaKanalu(channel: KanalDiskuze): { znak: string; popis: string } {
  if (channel === "dulezite") return { znak: "!", popis: "Důležité oznámení" };
  if (channel === "general") return { znak: "#", popis: "Obecná diskuze" };
  if (channel === "soukrome") return { znak: "@", popis: "Soukromý chat" };
  if (channel === "skupina") return { znak: "G", popis: "Skupina" };
  return { znak: "▲", popis: "Výprava" };
}

/** „Obecný“ → „OB“, „Vedení klubu“ → „VE“ (první dvě písmena, jak je má návrh). */
function dvePismena(nazev: string): string {
  const cisty = nazev.replace(/^výprava\s+/i, "").trim();
  return Array.from(cisty).slice(0, 2).join("").toLocaleUpperCase("cs");
}

/** Náhled s křestním jménem: „Tereza: Sraz v 7:40“, v soukromé zprávě bez jména. */
function kratkyNahled(polozka: PolozkaSeznamu): string {
  const jmeno = polozka.lastMessageNazev.trim().split(/\s+/)[0] ?? "";
  return textNahleduKonverzace({
    ...polozka,
    lastMessageNazev: polozka.channel === "soukrome" ? "" : jmeno,
  });
}

function klicUzivatele(id: string | null | undefined): string {
  return (id ?? "").trim().toLowerCase();
}

/** Club member linked to a private thread, matched by partner id. */
function clenVlakna(
  polozka: PolozkaSeznamu,
  clenove: readonly UserListItem[],
): UserListItem | null {
  if (polozka.channel !== "soukrome") return null;
  const klic: string = klicUzivatele(polozka.partnerId);
  if (klic.length === 0) return null;
  return clenove.find((clen) => klicUzivatele(clen.id) === klic) ?? null;
}

function jePrihlaseny(clenId: string, jaId: string | null | undefined): boolean {
  const ja: string = klicUzivatele(jaId);
  if (ja.length === 0) return false;
  return klicUzivatele(clenId) === ja;
}

function normalizovanyDotaz(dotaz: string): string {
  return dotaz.trim().toLowerCase();
}

/** Case-insensitive match against display name and e-mail. */
function clenOdpovidaHledani(clen: UserListItem, dotaz: string): boolean {
  const q: string = normalizovanyDotaz(dotaz);
  if (q.length === 0) return false;
  return clen.jmeno.toLowerCase().includes(q) || clen.email.toLowerCase().includes(q);
}

interface RadekKonverzaceProps {
  polozka: PolozkaSeznamu;
  vybrana: boolean;
  onVybrat: (key: string) => void;
  clen: UserListItem | null;
}

/** One conversation row podle ExApp.pen: dvě písmena, název, náhled, vpravo čas a počet. */
function RadekKonverzace({
  polozka,
  vybrana,
  onVybrat,
  clen,
}: RadekKonverzaceProps): JSX.Element {
  const znacka = znackaKanalu(polozka.channel);
  const cas: string = polozka.lastMessageAt === null ? "" : formatCasSeznamu(polozka.lastMessageAt);
  const maNeprectene: boolean = polozka.unreadCount > 0;
  const nahled: string = kratkyNahled(polozka);
  const soukroma: boolean = polozka.channel === "soukrome";
  const pismena: string = dvePismena(polozka.nazev);

  return (
    <li className="min-w-0">
      <button
        type="button"
        role="option"
        aria-selected={vybrana}
        aria-label={`${polozka.nazev} — ${maNeprectene ? popisekNeprectenychKonverzace(polozka.unreadCount) : "přečteno"}`}
        title={polozka.nazev}
        onClick={() => onVybrat(polozka.key)}
        className={`bez-prejeti flex min-h-[44px] w-full min-w-0 items-center gap-3 px-3.5 py-3 text-left text-inkoust [touch-action:pan-y] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-[62px] min-[90rem]:gap-2.5 min-[90rem]:px-5 min-[90rem]:py-0 ${
          vybrana ? "bg-zahlavi" : "hover:bg-povrch-2/50"
        }`}
      >
        {clen !== null ? (
          <>
            <span className="shrink-0 [&_.avatar-kruh]:!text-xs [&_.avatar-kruh]:!font-bold min-[90rem]:hidden">
              <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} ton="barevny" velikost={44} />
            </span>
            <span className="hidden shrink-0 min-[90rem]:block">
              <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} ton="barevny" velikost={36} />
            </span>
          </>
        ) : (
          <span
            aria-hidden="true"
            title={znacka.popis}
            className={`flex size-11 shrink-0 select-none items-center justify-center text-xs font-bold text-povrch ${
              soukroma ? "rounded-full" : "rounded-[14px]"
            } ${barvaAvataru(polozka.nazev)} min-[90rem]:size-9 min-[90rem]:rounded-full min-[90rem]:text-[11.5px] min-[90rem]:font-semibold min-[90rem]:tracking-[0.2px] ${
              vybrana ? "min-[90rem]:bg-mlha min-[90rem]:text-smrk" : "min-[90rem]:bg-povrch-2 min-[90rem]:text-mech"
            }`}
          >
            {pismena}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-[3px] min-[90rem]:gap-0.5">
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span
              title={polozka.nazev}
              className={`min-w-0 truncate text-[14.5px] min-[90rem]:text-[13.5px] ${maNeprectene ? "font-semibold min-[90rem]:font-bold" : "font-semibold"}`}
              style={{ overflowWrap: "anywhere" }}
            >
              {polozka.nazev}
            </span>
            {cas.length > 0 && (
              <time dateTime={polozka.lastMessageAt ?? undefined} className="shrink-0 text-[11.5px] text-ink-3 min-[90rem]:hidden">
                {cas}
              </time>
            )}
          </span>
          <span title={nahled} className="block min-w-0 truncate text-[12.5px] text-ink-3 min-[90rem]:text-[11.5px] min-[90rem]:leading-[15px]">
            {nahled}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 min-[90rem]:w-9">
          {cas.length > 0 && (
            <time
              dateTime={polozka.lastMessageAt ?? undefined}
              aria-hidden="true"
              className="hidden whitespace-nowrap text-[10px] font-medium text-ink-5 min-[90rem]:block"
            >
              {cas}
            </time>
          )}
          {maNeprectene && (
            <span
              role="status"
              aria-label={popisekNeprectenychKonverzace(polozka.unreadCount)}
              title={popisekNeprectenychKonverzace(polozka.unreadCount)}
              className="inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-akcent px-1.5 text-[11px] font-bold text-povrch min-[90rem]:h-[18px] min-[90rem]:min-w-[18px] min-[90rem]:px-1 min-[90rem]:text-[10px]"
            >
              {polozka.unreadCount > 99 ? "99+" : String(polozka.unreadCount)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

interface RadekNovehoClenaProps {
  clen: UserListItem;
  onZacit: ((clen: UserListItem) => void) | undefined;
}

/** Member who matches search and has no private thread yet. */
function RadekNovehoClena({ clen, onZacit }: RadekNovehoClenaProps): JSX.Element {
  const nahled: string =
    clen.email.trim().length > 0 ? clen.email : "Klepnutím začneš soukromý chat.";
  return (
    <li className="min-w-0">
      <button
        type="button"
        role="option"
        aria-selected={false}
        aria-label={`${clen.jmeno} — začít soukromý chat`}
        title={clen.jmeno}
        onClick={() => {
          if (onZacit !== undefined) onZacit(clen);
        }}
        className="bez-prejeti flex min-h-[64px] w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-left text-inkoust [touch-action:pan-y] hover:bg-povrch-2/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk min-[90rem]:gap-2.5 min-[90rem]:px-5"
      >
        <span className="shrink-0">
          <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            title={clen.jmeno}
            className="block min-w-0 truncate text-[14.5px] font-semibold min-[90rem]:text-[13.5px]"
            style={{ overflowWrap: "anywhere" }}
          >
            {clen.jmeno}
          </span>
          <span
            title={nahled}
            className="mt-0.5 block min-w-0 break-words text-xs text-ink-3 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
            style={{ overflowWrap: "anywhere" }}
          >
            {nahled}
          </span>
        </span>
      </button>
    </li>
  );
}

interface SekceSeznamuProps {
  nadpis: string;
  radky: PolozkaSeznamu[];
  vybranyKey: string | null;
  onVybrat: (key: string) => void;
  clenove: readonly UserListItem[];
  seznamRef?: RefObject<HTMLUListElement | null>;
  onScroll?: () => void;
  scrolluje?: boolean;
}

/** Pen section headers (SKUPINY / K VÝPRAVÁM / SOUKROMÉ) under segment Vše. */
function SekceSeznamu({
  nadpis,
  radky,
  vybranyKey,
  onVybrat,
  clenove,
  seznamRef,
  onScroll,
  scrolluje = false,
}: SekceSeznamuProps): JSX.Element | null {
  if (radky.length === 0) return null;
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-linka bg-povrch shadow-jemny min-[90rem]:overflow-visible min-[90rem]:rounded-none min-[90rem]:border-0 min-[90rem]:bg-transparent min-[90rem]:shadow-none">
      <h3 className="px-4 pb-2 pt-3.5 font-sans text-[11px] font-semibold uppercase tracking-[0.8px] text-ink-3 min-[90rem]:px-5 min-[90rem]:pb-2.5 min-[90rem]:text-[10px] min-[90rem]:font-bold min-[90rem]:tracking-[1.2px]">
        {nadpis}
      </h3>
      <ul
        ref={seznamRef}
        role="listbox"
        aria-label={nadpis}
        onScroll={onScroll}
        className={`seznam-scroll m-0 min-w-0 list-none divide-y divide-linka p-0 min-[90rem]:divide-y-0 ${
          scrolluje ? "seznam-scrolluje" : ""
        }`}
      >
        {radky.map((polozka) => {
          return (
            <RadekKonverzace
              key={polozka.key}
              polozka={polozka}
              vybrana={polozka.key === vybranyKey}
              onVybrat={onVybrat}
              clen={polozka.channel === "soukrome" ? clenVlakna(polozka, clenove) : null}
            />
          );
        })}
      </ul>
    </section>
  );
}

export const SEGMENTY: readonly { id: SegmentChatu; nazev: string }[] = [
  { id: "vse", nazev: "Vše" },
  { id: "globalni", nazev: "Globální" },
  { id: "vypravy", nazev: "K výpravám" },
  { id: "soukrome", nazev: "Soukromé" },
  { id: "neprectene", nazev: "Nepřečtené" },
];

/** „Nepřečtené“ se nabízí, jen když nějaké jsou (nebo je zrovna vybrané). */
export function viditelneSegmenty(
  polozky: readonly PolozkaSeznamu[],
  vybrany: SegmentChatu,
): readonly { id: SegmentChatu; nazev: string }[] {
  return SEGMENTY.filter(
    (polozka) => polozka.id !== "neprectene" || vybrany === "neprectene" || maNeprecteneVSegmentu(polozky, "vse"),
  );
}

/**
 * Seznam konverzací — master sloupec.
 *
 * Segmenty filtrují už vrácený seznam. Řádek zůstává jedna konverzace.
 */
export default function ConversationList({
  polozky,
  vybranyKey,
  onVybrat,
  stav,
  chyba,
  onZkusitZnovu,
  clenove = [],
  jaId = null,
  onZacitSClenem,
  segment,
  onSegment,
}: ConversationListProps): JSX.Element {
  const panelId: string = useId();
  const [dotaz, setDotaz] = useState<string>("");
  const seznamRef = useRef<HTMLUListElement>(null);
  const scrollujeCasRef = useRef<number | null>(null);
  const [scrolluje, setScrolluje] = useState<boolean>(false);
  const [okrajSeznamu, setOkrajSeznamu] = useState<{ nahoru: boolean; dolu: boolean }>({
    nahoru: false,
    dolu: false,
  });

  const zmerSeznam = useCallback((): void => {
    const seznam: HTMLUListElement | null = seznamRef.current;
    if (seznam === null) {
      setOkrajSeznamu((pred) =>
        pred.nahoru || pred.dolu ? { nahoru: false, dolu: false } : pred,
      );
      return;
    }
    const dolu: boolean = seznam.scrollTop + seznam.clientHeight < seznam.scrollHeight - 4;
    const nahoru: boolean = seznam.scrollTop > 4;
    setOkrajSeznamu((pred) =>
      pred.nahoru === nahoru && pred.dolu === dolu ? pred : { nahoru, dolu },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (scrollujeCasRef.current !== null) window.clearTimeout(scrollujeCasRef.current);
    };
  }, []);

  function naScrollSeznamu(): void {
    zmerSeznam();
    setScrolluje(true);
    if (scrollujeCasRef.current !== null) window.clearTimeout(scrollujeCasRef.current);
    scrollujeCasRef.current = window.setTimeout(() => {
      scrollujeCasRef.current = null;
      setScrolluje(false);
    }, 700);
  }

  useEffect(() => {
    const seznam: HTMLUListElement | null = seznamRef.current;
    if (seznam !== null) seznam.scrollTop = 0;
    zmerSeznam();
  }, [segment, zmerSeznam]);

  useEffect(() => {
    zmerSeznam();
    const seznam: HTMLUListElement | null = seznamRef.current;
    if (seznam === null) return;
    const pozorovani = new ResizeObserver(() => zmerSeznam());
    pozorovani.observe(seznam);
    return () => pozorovani.disconnect();
  }, [zmerSeznam, stav, polozky]);

  if (stav === "nacitani") {
    return (
      <KostraRadky pocet={4} popisek="Načítám konverzace" sAvatarem />
    );
  }

  if (stav === "chyba") {
    return (
      <div className="rounded-2xl border border-linka bg-povrch p-6 text-center min-[90rem]:m-4">
        <p role="alert" className="text-sm font-semibold">
          {chyba ?? "Konverzace se nepodařilo načíst."}
        </p>
        <button
          type="button"
          onClick={onZkusitZnovu}
          className="mt-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-smrk px-6 text-sm font-bold text-papir [touch-action:manipulation]"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  // Právě otevřené vlákno z Nepřečtených nezmizí, i když už je přečtené.
  const vSegmentu: PolozkaSeznamu[] = seradKonverzace(
    segment === "neprectene"
      ? polozky.filter((polozka) => polozka.unreadCount > 0 || polozka.key === vybranyKey)
      : filtrujPolozkySegmentu(polozky, segment),
  );
  const q: string = normalizovanyDotaz(dotaz);
  const hleda: boolean = q.length > 0;
  const partneriSVlakenem = new Set<string>(
    filtrujPolozkySegmentu(polozky, "soukrome")
      .map((polozka) => klicUzivatele(polozka.partnerId))
      .filter((klic) => klic.length > 0),
  );
  // Hledání najde i člena, se kterým ještě chat není.
  const noviClenove: UserListItem[] =
    hleda && (segment === "vse" || segment === "soukrome")
      ? clenove
          .filter((clen) => !jePrihlaseny(clen.id, jaId))
          .filter((clen) => !partneriSVlakenem.has(klicUzivatele(clen.id)))
          .filter((clen) => clenOdpovidaHledani(clen, dotaz))
          .slice()
          .sort((a, b) => a.jmeno.localeCompare(b.jmeno, "cs"))
      : [];
  const radkyZalozky: PolozkaSeznamu[] = filtrujPolozkyHledanim(vSegmentu, dotaz);
  const skupinyVse: PolozkaSeznamu[] =
    segment === "vse" && q.length === 0
      ? radkyZalozky.filter((p) => zalozkaProKanal(p.channel) === "skupiny")
      : [];
  const vypravyVse: PolozkaSeznamu[] =
    segment === "vse" && q.length === 0
      ? radkyZalozky.filter((p) => p.channel === "expedice")
      : [];
  const soukromeVse: PolozkaSeznamu[] =
    segment === "vse" && q.length === 0
      ? radkyZalozky.filter((p) => p.channel === "soukrome")
      : [];
  const zobrazSekce: boolean =
    segment === "vse" && q.length === 0 && radkyZalozky.length > 0;
  const prazdnyText: string = hleda
    ? "Nic jsme nenašli"
    : segment === "vypravy"
      ? "Zatím žádný chat výpravy"
      : segment === "soukrome"
        ? "Zatím si s nikým nepíšeš"
        : segment === "globalni"
          ? "Zatím žádný obecný chat"
          : segment === "neprectene"
            ? "Všechno přečteno"
            : "Zatím žádná konverzace";
  const seznamPrazdny: boolean = radkyZalozky.length === 0 && noviClenove.length === 0;

  return (
    <div className="min-w-0 space-y-[18px] min-[90rem]:space-y-0">
      <div className="relative min-[90rem]:mx-4 min-[90rem]:mb-3.5">
        <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 min-[90rem]:left-[11px]">
          <Ikona nazev="search" className="size-4 min-[90rem]:size-[15px]" />
        </span>
        <input
          type="search"
          value={dotaz}
          onChange={(udalost) => setDotaz(udalost.target.value)}
          aria-label="Hledat v konverzacích"
          placeholder="Hledat v konverzacích"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-linka bg-povrch pl-10 pr-3.5 text-base text-inkoust outline-none placeholder:text-ink-4 focus:border-pole focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-[38px] min-[90rem]:rounded-[10px] min-[90rem]:border-transparent min-[90rem]:bg-povrch-2 min-[90rem]:pl-[34px] min-[90rem]:text-[12.5px] min-[90rem]:placeholder:text-ink-3"
        />
      </div>
      <div role="tablist" aria-label="Druh konverzací" className="-mx-1 -mt-1 mb-[14px] flex gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[90rem]:hidden">
        {viditelneSegmenty(polozky, segment).map((polozka) => {
          const vybrana: boolean = segment === polozka.id;
          return (
            <button
              key={polozka.id}
              type="button"
              role="tab"
              id={`zalozka-${polozka.id}`}
              aria-selected={vybrana}
              aria-controls={panelId}
              onClick={() => onSegment(polozka.id)}
              className={`bez-prejeti inline-flex h-8 shrink-0 whitespace-nowrap touch-manipulation items-center justify-center gap-1.5 rounded-full border px-[11px] text-[13px] select-none transition-colors motion-reduce:transition-none min-[90rem]:h-auto min-[90rem]:rounded-lg min-[90rem]:border-0 min-[90rem]:px-2.5 min-[90rem]:py-1.5 min-[90rem]:text-xs ${
                vybrana
                  ? "border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-povrch-2 min-[90rem]:text-inkoust"
                  : "border-linka bg-povrch font-medium text-mech hover:bg-povrch-2 min-[90rem]:bg-transparent min-[90rem]:text-ink-3"
              }`}
            >
              <span>{polozka.nazev}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`zalozka-${segment}`}
        className="min-w-0 space-y-2 min-[90rem]:pb-4"
      >
        {seznamPrazdny ? (
          <PrazdnyStav
            ikona={hleda ? <IkonaLupa /> : <IkonaBublina />}
            nadpis={prazdnyText}
            text={
              hleda
                ? `Pro „${dotaz.trim()}“ tu není konverzace ani člen.`
                : segment === "soukrome"
                  ? "Začni přes Napsat, vybereš člena a pošleš první zprávu."
                  : undefined
            }
            akce={
              q.length > 0
                ? { popisek: "Zrušit hledání", onClick: () => setDotaz(""), varianta: "vedlejsi" }
                : undefined
            }
          />
        ) : zobrazSekce ? (
          <div className="space-y-4 min-[90rem]:space-y-2.5 min-[90rem]:divide-y min-[90rem]:divide-linka">
            <SekceSeznamu
              nadpis="SKUPINY"
              radky={skupinyVse}
              seznamRef={seznamRef}
              onScroll={naScrollSeznamu}
              scrolluje={scrolluje}
              vybranyKey={vybranyKey}
              onVybrat={onVybrat}
              clenove={clenove}
            />
            <SekceSeznamu
              nadpis="K VÝPRAVÁM"
              radky={vypravyVse}
              vybranyKey={vybranyKey}
              onVybrat={onVybrat}
              clenove={clenove}
            />
            <SekceSeznamu
              nadpis="SOUKROMÉ"
              radky={soukromeVse}
              vybranyKey={vybranyKey}
              onVybrat={onVybrat}
              clenove={clenove}
            />
          </div>
        ) : (
          <div className="relative">
          <ul
            ref={seznamRef}
            role="listbox"
            aria-label={SEGMENTY.find((z) => z.id === segment)?.nazev}
            onScroll={naScrollSeznamu}
            className={`seznam-scroll ${SEZNAM_KARTA_TRIDA} max-lg:overflow-visible min-[90rem]:divide-y-0 min-[90rem]:rounded-none min-[90rem]:border-0 min-[90rem]:bg-transparent min-[90rem]:shadow-none ${
              scrolluje ? "seznam-scrolluje" : ""
            }`}
          >
            {radkyZalozky.map((polozka) => {
              return (
              <RadekKonverzace
                key={polozka.key}
                polozka={polozka}
                vybrana={polozka.key === vybranyKey}
                onVybrat={onVybrat}
                clen={polozka.channel === "soukrome" ? clenVlakna(polozka, clenove) : null}
              />
              );
            })}
            {noviClenove.length > 0 ? (
              <li role="presentation" className="bg-zahlavi px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-ink-3 min-[90rem]:px-5 min-[90rem]:text-[10px]">
                Začít nový chat
              </li>
            ) : null}
            {noviClenove.map((clen) => (
              <RadekNovehoClena key={clen.id} clen={clen} onZacit={onZacitSClenem} />
            ))}
          </ul>
          {okrajSeznamu.nahoru && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-papir to-transparent"
            />
          )}
          {okrajSeznamu.dolu && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-papir to-transparent"
            />
          )}
          </div>
        )}
      </div>
    </div>
  );
}
