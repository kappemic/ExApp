/**
 * server/src/diskuze.ts — mapování vláken diskuze + rate-limit POST.
 *
 * `toApiZprava` je fail-safe jako u schůzek/fotek: nevalidní DB řádek
 * → null (volající ho přeskočí). Text se vrací RAW (trimnutý, bez
 * escapování) — escapuje se až při renderu v klientovi
 * (`escapujHtml` v src/lib/diskuze-api.ts), aby XSS payload zůstal
 * v DB čitelný, ale v DOM se vykreslil jako text.
 * Rate-limit POST je 10/min/ip (in-memory, jeden proces — pro více
 * instancí by musel do sdíleného store; viz security-and-hardening).
 */

import type { Request } from "express";
import type { Zprava } from "../../drizzle/schema/zpravy";
import type {
  ApiKonverzace,
  ApiZprava,
  KanalDiskuze,
} from "../../src/shared/api-types";

/**
 * Fallback jména, když autor odešel a snapshot chybí.
 * Česky, bez PII (žádný e-mail ani nick se negeneruje).
 */
export const BYVALY_CLEN = "Bývalý člen" as const;

/** Vstup pro složení jména z JOINu `users` (vše raw z DB). */
export interface ProfilProJmeno {
  jmeno: string;
  prijmeni: string;
  discordNick: string | null;
  email: string;
}

/** Vstup pro guard zápisu (3D trio čtené čerstvě z DB, nikdy z tokenu). */
export interface ProfilProPravo {
  funkce: "vedeni" | "rada" | null;
  isAdmin: boolean;
}

/** Collapse whitespace (`Jan  Novák` → `Jan Novák`), trim. */
function uklidJmeno(hodnota: string): string {
  return hodnota.trim().replace(/\s+/g, " ");
}

/**
 * Živé zobrazované jméno z JOINu `users`:
 * `jmeno + prijmeni`, fallback `discordNick`, pak `email`.
 * Prázdné vstupy → "" (volající rozhodne o `Bývalý člen`).
 */
export function slozZobrazovaneJmeno(profil: ProfilProJmeno): string {
  const cele = uklidJmeno(`${profil.jmeno} ${profil.prijmeni}`);
  if (cele.length > 0) return cele;
  const nick: string = typeof profil.discordNick === "string" ? profil.discordNick.trim() : "";
  if (nick.length > 0) return nick;
  return profil.email.trim();
}

/**
 * `authorName` pro `ApiZprava` (Step 2, bez extra fetch z klienta).
 * Živý JOIN má přednost; `SET NULL` (profil null) drží snapshot
 * `autor_jmeno`; bez snapshotu → `Bývalý člen`.
 */
export function slozAuthorName(
  profil: ProfilProJmeno | null,
  snapshotJmeno: string,
): string {
  if (profil !== null) {
    const zive = slozZobrazovaneJmeno(profil);
    if (zive.length > 0) return zive;
  }
  const otisk: string = snapshotJmeno.trim().replace(/\s+/g, " ");
  return otisk.length > 0 ? otisk : BYVALY_CLEN;
}

/**
 * Guard zápisu podle kanálu (Step 2, hranice API ho volá před insertem).
 * `dulezite` jen vedení/rada/admin; `general` i `expedice` každý přihlášený
 * (přihlášení hlídá `vyzadujPrihlaseni`, tady jen kanálová nadstavba).
 */
export function smiPsatKanal(
  profil: ProfilProPravo,
  channel: KanalDiskuze,
): boolean {
  if (channel === "dulezite") {
    return profil.isAdmin || profil.funkce === "vedeni" || profil.funkce === "rada";
  }
  return true;
}

/** Klíč konverzace pro řádek (`dulezite`|`general`|`expedice:<slug>`). */
export function klicKonverzaceProRadek(
  channel: KanalDiskuze,
  expeditionId: string | null,
): string {
  if (channel === "expedice") return `expedice:${expeditionId ?? ""}`;
  return channel;
}

/**
 * Seskupí zprávy do tvaru GET konverzace (čistá funkce bez DB).
 * `precteni` = mapa `key → lastReadAt ISO` přihlášeného (anonym `{}` → 0).
 * `lastMessage` = MAX(createdAt); `unreadCount` = zprávy s časem > lastRead.
 */
export function seskupKonverzace(
  zpravySeznam: ReadonlyArray<ApiZprava>,
  precteni: Readonly<Record<string, string>>,
): ApiKonverzace[] {
  const skupiny = new Map<string, ApiKonverzace>();
  const serazene: ApiZprava[] = [...zpravySeznam].sort((a, b) =>
    a.createdAt > b.createdAt ? 1 : a.createdAt < b.createdAt ? -1 : 0,
  );
  for (const zprava of serazene) {
    const key = klicKonverzaceProRadek(zprava.channel, zprava.expeditionId);
    const stavajici = skupiny.get(key);
    if (stavajici === undefined) {
      skupiny.set(key, {
        key,
        expeditionId: zprava.expeditionId,
        channel: zprava.channel,
        lastMessage: zprava,
        unreadCount: 0,
      });
    } else {
      stavajici.lastMessage = zprava;
    }
  }
  // Druhý průchod počítá unread (odděleně kvůli čitelnosti, N je malé).
  for (const zprava of serazene) {
    const key = klicKonverzaceProRadek(zprava.channel, zprava.expeditionId);
    const konverzace = skupiny.get(key);
    if (konverzace === undefined) continue;
    const lastRead: string | undefined = precteni[key];
    if (lastRead === undefined || zprava.createdAt > lastRead) {
      konverzace.unreadCount += 1;
    }
  }
  return [...skupiny.values()].sort((a, b) => (a.key > b.key ? 1 : a.key < b.key ? -1 : 0));
}

/** DB řádek `zpravy` + JOIN `users` → veřejná `ApiZprava`; nevalidní → null. */
export function toApiZprava(
  radek: Zprava,
  autor: ProfilProJmeno | null = null,
): ApiZprava | null {
  if (typeof radek.id !== "string" || radek.id.length === 0) return null;
  const surovyKanal: unknown = (radek as { kanal?: unknown }).kanal;
  const channel: KanalDiskuze =
    surovyKanal === undefined
      ? "expedice"
      : surovyKanal === "expedice" ||
          surovyKanal === "dulezite" ||
          surovyKanal === "general"
        ? surovyKanal
        : (null as unknown as KanalDiskuze);
  if (channel === (null as unknown as KanalDiskuze)) return null;
  const expediceId: unknown = radek.expediceId;
  if (typeof expediceId !== "string" && expediceId !== null) return null;
  if (typeof expediceId === "string" && expediceId.length === 0) return null;
  // Vazba kanál ↔ expedice (kopie DB CHECK zpravy_kanal_expedice_check).
  if (channel === "expedice" && expediceId === null) return null;
  if (channel !== "expedice" && expediceId !== null) return null;
  if (
    radek.autorId !== null &&
    radek.autorId !== undefined &&
    typeof radek.autorId !== "string"
  ) {
    return null;
  }
  if (typeof radek.text !== "string") return null;
  if (!(radek.createdAt instanceof Date) || Number.isNaN(radek.createdAt.getTime())) {
    return null;
  }
  const surovySnapshot: unknown = (radek as { autorJmeno?: unknown }).autorJmeno;
  const snapshot: string = typeof surovySnapshot === "string" ? surovySnapshot : "";
  return {
    id: radek.id,
    expeditionId: (expediceId as string | null) ?? null,
    autorId: radek.autorId ?? null,
    authorName: slozAuthorName(autor, snapshot),
    channel,
    text: radek.text,
    createdAt: radek.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Rate-limit POST /api/expeditions/:id/zpravy — 10/min/ip.              */
/* In-memory okno (jeden proces). Čisté funkce s injektovaným časem      */
/* kvůli jednotkovým testům bez čekání.                                  */
/* ------------------------------------------------------------------ */

export const DISKUZE_LIMIT_ZA_MINUTU = 10;
export const DISKUZE_OKNO_MS = 60_000;

const odeslaneZaIp = new Map<string, number[]>();

/** Vymaže in-memory čítače (testy + dlouhý běh bez leaků). */
export function resetDiskuzeLimitu(): void {
  odeslaneZaIp.clear();
}

/**
 * True = zpráva smí projít (a čas se zapíše); false = limit vyčerpán.
 * Starší záznamy než okno se při každém volání promažou.
 */
export function smiPoslatZpravu(ip: string, ted: number = Date.now()): boolean {
  const klic = ip.trim().length > 0 ? ip : "neznama";
  const minule = odeslaneZaIp.get(klic) ?? [];
  const cerstve = minule.filter((cas) => ted - cas <= DISKUZE_OKNO_MS);
  if (cerstve.length >= DISKUZE_LIMIT_ZA_MINUTU) {
    odeslaneZaIp.set(klic, cerstve);
    return false;
  }
  cerstve.push(ted);
  odeslaneZaIp.set(klic, cerstve);
  return true;
}

/** IP klienta pro rate-limit (X-Forwarded-For má přednost za proxy). */
export function ctiIpZRequestu(req: Request): string {
  const hlavicka: unknown = req.headers["x-forwarded-for"];
  if (typeof hlavicka === "string" && hlavicka.trim().length > 0) {
    const prvni = hlavicka.split(",")[0];
    if (prvni !== undefined && prvni.trim().length > 0) return prvni.trim();
  }
  if (typeof req.ip === "string" && req.ip.trim().length > 0) return req.ip.trim();
  return "neznama";
}

/* ------------------------------------------------------------------ */
/* Step 1 — unread meta (HANDOFF §10, kontrakt §18).                      */
/* Čisté funkce bez DB — pravidla pro badge tečky:                       */
/* - latest = MAX(created_at) viditelných zpráv (null = prázdné vlákno). */
/* - unread = latest !== null && (lastRead === null || latest > lastRead)*/
/* - anonym (bez session) se nepersonalizuje: unread vždy false.         */
/* Porovnání ISO řetězců je bezpečné — server je razí v UTC (`toISOString`).*/
/* ------------------------------------------------------------------ */

/**
 * True = ve vlákně je pro uživatele něco nového.
 * Prázdné vlákno (latest null) nikdy nesvítí; rovnost časů = přečteno
 * (POST read razí čas až po MAX zprávy, vlastní zpráva tečku zhasne).
 */
export function jeVlaknoNeprectene(
  latestMessageAt: string | null,
  lastReadAt: string | null,
): boolean {
  if (latestMessageAt === null) return false;
  if (lastReadAt === null) return true;
  return latestMessageAt > lastReadAt;
}

/** Anonymní meta — lastReadAt null, unread vždy false (bez personalizace). */
export function anonymniDiskuzeMeta(latestMessageAt: string | null): {
  latestMessageAt: string | null;
  lastReadAt: null;
  unread: false;
} {
  return { latestMessageAt, lastReadAt: null, unread: false };
}

/**
 * MAX(created_at) z viditelných ApiZprav — klientský protějšek serverového
 * MAX v meta (prázdné vlákno → null). Fail-safe: nevalidní čas přeskočí.
 */
export function spocitejLatestZVlakna(
  zpravy: ReadonlyArray<{ createdAt: string }>,
): string | null {
  let latest: string | null = null;
  for (const zprava of zpravy) {
    const cas: string = zprava.createdAt;
    if (Number.isNaN(Date.parse(cas))) continue;
    if (latest === null || cas > latest) latest = cas;
  }
  return latest;
}
