import { useId, useState, type JSX } from "react";
import type { ApiKonverzace, KanalDiskuze, UserListItem } from "../../shared/api-types";
import { formatCasKratce } from "../../lib/format-cas";
import AvatarKruh from "../AvatarKruh";
import NeprectenaTecka from "./NeprectenaTecka";

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
}

/** One conversation row: channel badge, or avatar when the partner is known. */
function RadekKonverzace({
  polozka,
  vybrana,
  onVybrat,
  clen,
}: RadekKonverzaceProps): JSX.Element {
  const znacka = znackaKanalu(polozka.channel);
  const cas: string =
    polozka.lastMessageAt === null ? "" : formatCasKratce(polozka.lastMessageAt);
  const maNeprectene: boolean = polozka.unreadCount > 0;
  const nahled: string =
    polozka.lastMessageText.length > 0
      ? polozka.lastMessageNazev.length > 0
        ? `${polozka.lastMessageNazev}: ${polozka.lastMessageText}`
        : polozka.lastMessageText
      : "Zatím bez zpráv — začni první vzkazem.";

  return (
    <li className="min-w-0">
      <button
        type="button"
        role="option"
        aria-selected={vybrana}
        aria-label={`${polozka.nazev} — ${maNeprectene ? popisekNeprectenychKonverzace(polozka.unreadCount) : "přečteno"}`}
        title={polozka.nazev}
        onClick={() => onVybrat(polozka.key)}
        className={`flex min-h-[64px] w-full min-w-0 items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left shadow-denik [touch-action:manipulation] motion-safe:transition-colors ${
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
        className="flex min-h-[64px] w-full min-w-0 items-center gap-3 rounded-2xl border-2 border-inkoust bg-papir px-3 py-2 text-left text-inkoust shadow-denik [touch-action:manipulation] motion-safe:transition-colors motion-safe:hover:bg-linka/50"
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

interface HlavickaSekceProps {
  nazev: string;
  otevreno: boolean;
  panelId: string;
  onPrepnout: () => void;
}

function HlavickaSekce({
  nazev,
  otevreno,
  panelId,
  onPrepnout,
}: HlavickaSekceProps): JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={otevreno}
      aria-controls={panelId}
      onClick={onPrepnout}
      className="flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded-xl px-1 text-left text-xs font-extrabold uppercase tracking-wider text-inkoust/80 [touch-action:manipulation]"
    >
      <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-base">
        {otevreno ? "▾" : "▸"}
      </span>
      <span className="min-w-0 truncate">{nazev}</span>
    </button>
  );
}

/**
 * Seznam konverzací — master sloupec.
 *
 * Dvě sbalitelné sekce (obě ve výchozím stavu otevřené):
 * skupiny (vše kromě soukromých) a členové (soukromá vlákna + hledání).
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
}: ConversationListProps): JSX.Element {
  const skupinyPanelId: string = useId();
  const clenovePanelId: string = useId();
  const [skupinyOtevreno, setSkupinyOtevreno] = useState<boolean>(true);
  const [clenoveOtevreno, setClenoveOtevreno] = useState<boolean>(true);
  const [dotaz, setDotaz] = useState<string>("");

  if (stav === "nacitani") {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Načítám konverzace">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl bg-inkoust/10 motion-reduce:animate-none"
          />
        ))}
        <p role="status" className="text-sm text-inkoust/70">
          Načítám konverzace…
        </p>
      </div>
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
          className="mt-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-6 text-sm font-bold text-papir [touch-action:manipulation]"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  const skupiny: PolozkaSeznamu[] = seradKonverzace(
    polozky.filter((polozka) => polozka.channel !== "soukrome"),
  );
  const soukrome: PolozkaSeznamu[] = seradKonverzace(
    polozky.filter((polozka) => polozka.channel === "soukrome"),
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

  return (
    <div className="min-w-0 space-y-4">
      <section className="min-w-0">
        <HlavickaSekce
          nazev="Skupiny"
          otevreno={skupinyOtevreno}
          panelId={skupinyPanelId}
          onPrepnout={() => setSkupinyOtevreno((otevreno) => !otevreno)}
        />
        <div id={skupinyPanelId} hidden={!skupinyOtevreno} className="min-w-0">
          {skupiny.length === 0 ? (
            <p className="min-w-0 break-words px-2 py-2 text-sm text-inkoust/70">
              Zatím žádná skupina.
            </p>
          ) : (
            <ul role="listbox" aria-label="Skupiny" className="min-w-0 space-y-2">
              {skupiny.map((polozka) => (
                <RadekKonverzace
                  key={polozka.key}
                  polozka={polozka}
                  vybrana={polozka.key === vybranyKey}
                  onVybrat={onVybrat}
                  clen={null}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="min-w-0">
        <HlavickaSekce
          nazev="Členové"
          otevreno={clenoveOtevreno}
          panelId={clenovePanelId}
          onPrepnout={() => setClenoveOtevreno((otevreno) => !otevreno)}
        />
        <div id={clenovePanelId} hidden={!clenoveOtevreno} className="min-w-0 space-y-2">
          <input
            type="search"
            value={dotaz}
            onChange={(udalost) => setDotaz(udalost.target.value)}
            aria-label="Najít člena"
            placeholder="Najít člena"
            autoComplete="off"
            className="w-full min-h-[44px] rounded-xl border-2 border-inkoust bg-papir px-3 text-base text-inkoust outline-none placeholder:text-inkoust/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          />
          {clenovePrazdni ? (
            <p className="min-w-0 break-words px-2 py-2 text-sm text-inkoust/70">
              {hleda
                ? "Nikdo takový v klubu není."
                : "Ještě sis s nikým nepsal. Najdi člena výše."}
            </p>
          ) : (
            <ul role="listbox" aria-label="Členové" className="min-w-0 space-y-2">
              {viditelnaVlakna.map((polozka) => (
                <RadekKonverzace
                  key={polozka.key}
                  polozka={polozka}
                  vybrana={polozka.key === vybranyKey}
                  onVybrat={onVybrat}
                  clen={clenVlakna(polozka, clenove)}
                />
              ))}
              {noviClenove.map((clen) => (
                <RadekNovehoClena key={clen.id} clen={clen} onZacit={onZacitSClenem} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
