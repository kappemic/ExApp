import { useCallback, useEffect, useId, useRef, useState, type JSX, type ReactNode } from "react";
import type { ApiKonverzace, KanalDiskuze, UserListItem } from "../../shared/api-types";
import { formatCasKratce } from "../../lib/format-cas";
import type { PravoSkupiny } from "../../lib/skupiny-pristup";
import { KostraRadky } from "../StrankaKostra";
import AvatarKruh from "../AvatarKruh";
import NeprectenaTecka from "./NeprectenaTecka";
import SkupinaForm from "./SkupinaForm";

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
  zalozka: ZalozkaChatu;
  onZalozka: (zalozka: ZalozkaChatu) => void;
  /** Leadership may create, edit access, and delete custom groups. */
  muzeSpravovatSkupiny?: boolean;
  onNovaSkupina?: () => void;
  /** Create form, rendered directly under the new-group button. */
  novaSkupina?: ReactNode;
  onUpravitSkupinu?: (key: string) => void;
  /** Open access editor for one custom group; rendered under that row. */
  upravaSkupiny?: UpravaSkupinyVRadku | null;
}

export interface UpravaSkupinyVRadku {
  key: string;
  nazev: string;
  prava: readonly PravoSkupiny[];
  ukladaSe: boolean;
  chyba: string | null;
  onZrusit: () => void;
  onUlozit: (nazev: string, prava: PravoSkupiny[]) => void;
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
  if (konverzace.channel === "general") return "General";
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

/** Pinned = právě dva globály (Důležité, General) — vždy nahoře. */
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
  onUpravit?: (key: string) => void;
  uprava?: UpravaSkupinyVRadku | null;
  pristupOtevren?: boolean;
}

/** Height animation for the access editor under a group row. */
function Vysunuti({ otevreno, children }: { otevreno: boolean; children: ReactNode }): JSX.Element | null {
  const [drzet, setDrzet] = useState<boolean>(otevreno);
  const [vysunuto, setVysunuto] = useState<boolean>(false);

  useEffect(() => {
    if (otevreno) {
      setDrzet(true);
      const ramecek = requestAnimationFrame(() => {
        setVysunuto(true);
      });
      return () => cancelAnimationFrame(ramecek);
    }
    setVysunuto(false);
    const cas = window.setTimeout(() => setDrzet(false), 280);
    return () => window.clearTimeout(cas);
  }, [otevreno]);

  if (!drzet) return null;

  return (
    <div
      className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none ${
        vysunuto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={`pt-2 motion-safe:transition-[transform,opacity] motion-safe:duration-300 motion-safe:ease-out motion-reduce:transition-none ${
            vysunuto ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** One conversation row: channel badge, or avatar when the partner is known. */
function RadekKonverzace({
  polozka,
  vybrana,
  onVybrat,
  clen,
  onUpravit,
  uprava,
  pristupOtevren = false,
}: RadekKonverzaceProps): JSX.Element {
  const znacka = znackaKanalu(polozka.channel);
  const cas: string =
    polozka.lastMessageAt === null ? "" : formatCasKratce(polozka.lastMessageAt);
  const maNeprectene: boolean = polozka.unreadCount > 0;
  const nahled: string = textNahleduKonverzace(polozka);
  const panelId: string = useId();

  return (
    <li className="min-w-0">
      <div className="relative min-w-0">
      <button
        type="button"
        role="option"
        aria-selected={vybrana}
        aria-label={`${polozka.nazev} — ${maNeprectene ? popisekNeprectenychKonverzace(polozka.unreadCount) : "přečteno"}`}
        title={polozka.nazev}
        onClick={() => onVybrat(polozka.key)}
        className={`flex min-h-[64px] w-full min-w-0 items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left shadow-denik [touch-action:pan-y] motion-safe:transition-colors ${
          onUpravit !== undefined ? "pr-12" : ""
        } ${
          vybrana
            ? "border-inkoust bg-smrk text-papir"
            : "border-inkoust bg-papir text-inkoust motion-safe:hover:bg-linka/50"
        }`}
      >
        {clen !== null ? (
          <span className="shrink-0">
            <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} />
          </span>
        ) : (
          <span
            aria-hidden="true"
            title={znacka.popis}
            className={`flex h-10 w-10 shrink-0 grow-0 basis-10 select-none items-center justify-center rounded-full border-2 text-base font-extrabold ${
              vybrana
                ? "border-papir bg-papir text-inkoust"
                : polozka.channel === "dulezite"
                  ? "border-inkoust bg-jantar text-papir"
                  : "border-inkoust bg-linka/70 text-inkoust"
            }`}
          >
            {znacka.znak}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <NeprectenaTecka viditelna={maNeprectene} velikost="nadpis" nazevVypravy={polozka.nazev} />
            <span
              title={polozka.nazev}
              className="min-w-0 flex-1 truncate text-[14px] font-extrabold"
              style={{ overflowWrap: "anywhere" }}
            >
              {polozka.nazev}
            </span>
            {cas.length > 0 && (
              <time
                dateTime={polozka.lastMessageAt ?? undefined}
                className={`shrink-0 whitespace-nowrap text-[11px] tabular-nums ${
                  vybrana ? "text-papir/80" : "text-inkoust/55"
                }`}
              >
                {cas}
              </time>
            )}
          </span>
          <span
            title={nahled}
            className={`mt-0.5 block min-w-0 break-words text-[13px] leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden ${
              vybrana ? "text-papir/85" : "text-inkoust/70"
            }`}
            style={{ overflowWrap: "anywhere" }}
          >
            {nahled}
          </span>
        </span>
        {maNeprectene && (
          <span
            role="status"
            aria-label={popisekNeprectenychKonverzace(polozka.unreadCount)}
            title={popisekNeprectenychKonverzace(polozka.unreadCount)}
            className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full border-2 px-2 text-[12px] font-extrabold tabular-nums ${
              vybrana
                ? "border-papir bg-papir text-inkoust"
                : "border-inkoust bg-red-800 text-papir"
            }`}
          >
            {polozka.unreadCount > 99 ? "99+" : String(polozka.unreadCount)}
          </span>
        )}
      </button>
      {onUpravit !== undefined && (
        <button
          type="button"
          aria-expanded={pristupOtevren}
          aria-controls={panelId}
          aria-label={`Upravit přístup skupiny ${polozka.nazev}`}
          onClick={() => onUpravit(polozka.key)}
          className={`bez-prejeti nahled-press absolute top-1/2 right-1.5 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full [touch-action:pan-y] ${
            vybrana ? "text-papir" : "text-inkoust"
          }`}
        >
          <span aria-hidden="true" className="flex flex-col items-center gap-[3px]">
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
          </span>
        </button>
      )}
      </div>
      {uprava !== null && uprava !== undefined && (
        <Vysunuti otevreno={pristupOtevren}>
          <div id={panelId}>
            <SkupinaForm
              key={uprava.key}
              nazev={uprava.nazev}
              prava={uprava.prava}
              ukladaSe={uprava.ukladaSe}
              chyba={uprava.chyba}
              onZrusit={uprava.onZrusit}
              onUlozit={uprava.onUlozit}
            />
          </div>
        </Vysunuti>
      )}
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
        className="flex min-h-[64px] w-full min-w-0 items-center gap-3 rounded-2xl border-2 border-inkoust bg-papir px-3 py-2 text-left text-inkoust shadow-denik [touch-action:pan-y] motion-safe:transition-colors motion-safe:hover:bg-linka/50"
      >
        <span className="shrink-0">
          <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            title={clen.jmeno}
            className="block min-w-0 truncate text-[14px] font-extrabold"
            style={{ overflowWrap: "anywhere" }}
          >
            {clen.jmeno}
          </span>
          <span
            title={nahled}
            className="mt-0.5 block min-w-0 break-words text-[13px] leading-snug text-inkoust/70 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
            style={{ overflowWrap: "anywhere" }}
          >
            {nahled}
          </span>
        </span>
      </button>
    </li>
  );
}

const ZALOZKY: readonly { id: ZalozkaChatu; nazev: string }[] = [
  { id: "skupiny", nazev: "Skupiny" },
  { id: "vypravy", nazev: "Výpravy" },
  { id: "clenove", nazev: "Členové" },
];

/**
 * Seznam konverzací — master sloupec.
 *
 * Tři záložky: Skupiny (Důležité, General), Výpravy, Členové.
 * Řádek zůstává jedna konverzace, nikdy jedna zpráva.
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
  zalozka,
  onZalozka,
  muzeSpravovatSkupiny = false,
  onNovaSkupina,
  novaSkupina = null,
  onUpravitSkupinu,
  upravaSkupiny = null,
}: ConversationListProps): JSX.Element {
  const panelId: string = useId();
  const [dotaz, setDotaz] = useState<string>("");
  const [drzenaUprava, setDrzenaUprava] = useState<UpravaSkupinyVRadku | null>(upravaSkupiny);
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
    if (upravaSkupiny !== null) {
      setDrzenaUprava(upravaSkupiny);
      return;
    }
    const cas = window.setTimeout(() => setDrzenaUprava(null), 280);
    return () => window.clearTimeout(cas);
  }, [upravaSkupiny]);

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
  }, [zalozka, zmerSeznam]);

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
      <div className="rounded-2xl border-2 border-inkoust bg-papir p-6 text-center shadow-denik">
        <p role="alert" className="text-sm font-semibold">
          {chyba ?? "Konverzace se nepodařilo načíst."}
        </p>
        <button
          type="button"
          onClick={onZkusitZnovu}
          className="mt-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border-2 border-inkoust bg-inkoust px-6 text-sm font-bold text-papir [touch-action:manipulation]"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  const skupiny: PolozkaSeznamu[] = seradKonverzace(
    filtrujPolozkyZalozky(polozky, "skupiny"),
  );
  const vypravy: PolozkaSeznamu[] = seradKonverzace(
    filtrujPolozkyZalozky(polozky, "vypravy"),
  );
  const soukrome: PolozkaSeznamu[] = seradKonverzace(
    filtrujPolozkyZalozky(polozky, "clenove"),
  );
  const q: string = normalizovanyDotaz(dotaz);
  const hleda: boolean = q.length > 0;
  const partneriSVlakenem = new Set<string>(
    soukrome
      .map((polozka) => klicUzivatele(polozka.partnerId))
      .filter((klic) => klic.length > 0),
  );
  const viditelnaVlakna: PolozkaSeznamu[] = hleda
    ? soukrome.filter((polozka) => polozka.nazev.toLowerCase().includes(q))
    : soukrome;
  const noviClenove: UserListItem[] = hleda
    ? clenove
        .filter((clen) => !jePrihlaseny(clen.id, jaId))
        .filter((clen) => !partneriSVlakenem.has(klicUzivatele(clen.id)))
        .filter((clen) => clenOdpovidaHledani(clen, dotaz))
        .slice()
        .sort((a, b) => a.jmeno.localeCompare(b.jmeno, "cs"))
    : [];
  const clenovePrazdni: boolean = viditelnaVlakna.length === 0 && noviClenove.length === 0;

  const radkyZalozky: PolozkaSeznamu[] =
    zalozka === "skupiny" ? skupiny : zalozka === "vypravy" ? vypravy : viditelnaVlakna;
  const prazdnyText: string =
    zalozka === "skupiny"
      ? "Zatím žádná skupina."
      : zalozka === "vypravy"
        ? "Zatím žádný chat výpravy."
        : hleda
          ? "Nikdo takový v klubu není."
          : "Ještě sis s nikým nepsal. Najdi člena výše.";
  const seznamPrazdny: boolean =
    zalozka === "clenove" ? clenovePrazdni : radkyZalozky.length === 0;

  return (
    <div className="min-w-0 space-y-3">
      <div role="tablist" aria-label="Druh konverzací" className="grid grid-cols-3 gap-1">
        {ZALOZKY.map((polozka) => {
          const vybrana: boolean = zalozka === polozka.id;
          const maNeprectene: boolean = maNeprecteneVZalozce(polozky, polozka.id);
          return (
            <button
              key={polozka.id}
              type="button"
              role="tab"
              id={`zalozka-${polozka.id}`}
              aria-selected={vybrana}
              aria-controls={panelId}
              onClick={() => onZalozka(polozka.id)}
              className={`bez-prejeti inline-flex min-h-[44px] min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-xs font-extrabold select-none transition-colors motion-reduce:transition-none ${
                vybrana
                  ? "border-inkoust bg-inkoust text-papir"
                  : "border-inkoust bg-papir text-inkoust hover:bg-linka/60"
              }`}
            >
              <span className="truncate">{polozka.nazev}</span>
              <span className="relative z-10">
                <NeprectenaTecka
                  viditelna={maNeprectene}
                  velikost="nadpis"
                  nazevVypravy={polozka.nazev}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`zalozka-${zalozka}`}
        className="min-w-0 space-y-2"
      >
        {zalozka === "skupiny" && muzeSpravovatSkupiny && onNovaSkupina !== undefined && (
          <button
            type="button"
            onClick={onNovaSkupina}
            className="nahled-prejeti relative inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-inkoust bg-papir px-3 text-sm font-extrabold text-inkoust [touch-action:manipulation] motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-denik"
          >
            <span className="relative z-10">
              Nová skupina
            </span>
          </button>
        )}
        {zalozka === "skupiny" && novaSkupina}
        {zalozka === "clenove" && (
          <input
            type="search"
            value={dotaz}
            onChange={(udalost) => setDotaz(udalost.target.value)}
            aria-label="Najít člena"
            placeholder="Najít člena"
            autoComplete="off"
            className="w-full min-h-[44px] rounded-xl border-2 border-inkoust bg-papir px-3 text-base text-inkoust outline-none placeholder:text-inkoust/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          />
        )}
        {seznamPrazdny ? (
          <p className="min-w-0 break-words px-2 py-2 text-sm text-inkoust/70">{prazdnyText}</p>
        ) : (
          <div className="relative">
          <ul
            ref={seznamRef}
            role="listbox"
            aria-label={ZALOZKY.find((z) => z.id === zalozka)?.nazev}
            onScroll={naScrollSeznamu}
            className={`seznam-scroll min-w-0 space-y-2 max-lg:overflow-visible lg:max-h-96 lg:overflow-y-auto lg:overscroll-contain ${
              scrolluje ? "seznam-scrolluje" : ""
            }`}
          >
            {radkyZalozky.map((polozka) => {
              const obsahUpravy =
                upravaSkupiny?.key === polozka.key
                  ? upravaSkupiny
                  : drzenaUprava?.key === polozka.key
                    ? drzenaUprava
                    : null;
              return (
              <RadekKonverzace
                key={polozka.key}
                polozka={polozka}
                vybrana={polozka.key === vybranyKey}
                onVybrat={onVybrat}
                clen={zalozka === "clenove" ? clenVlakna(polozka, clenove) : null}
                onUpravit={
                  zalozka === "skupiny" &&
                  polozka.channel === "skupina" &&
                  onUpravitSkupinu !== undefined
                    ? onUpravitSkupinu
                    : undefined
                }
                uprava={obsahUpravy}
                pristupOtevren={upravaSkupiny?.key === polozka.key}
              />
              );
            })}
            {zalozka === "clenove" &&
              noviClenove.map((clen) => (
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
