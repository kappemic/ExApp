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
import { and, asc, desc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { users } from "../../drizzle/schema/users";
import { zpravy, type Zprava } from "../../drizzle/schema/zpravy";
import type { Db } from "./db";
import { nactiMapuPriloh } from "./zprava-prilohy";
import type {
  ApiKonverzace,
  ApiZprava,
  ApiZpravaPriloha,
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
  /** Živý avatar z `users.avatar_url`. Chybí = bez fotky. */
  avatarUrl?: string | null;
}

/** Jen veřejná https URL. Cokoli jiného (prázdné, http, data) → null. */
export function verejnyAvatarUrl(hodnota: string | null | undefined): string | null {
  if (typeof hodnota !== "string") return null;
  const cisty = hodnota.trim();
  return cisty.startsWith("https://") ? cisty : null;
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
  return "Člen";
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

/**
 * Page of an ASC thread. `konec` keeps the latest `limit` rows so a live
 * poll sees new messages instead of the oldest page.
 */
export function orezStrankuZprav(
  vlakno: readonly ApiZprava[],
  limit: number,
  cursor: string | null,
  konec: boolean,
): { zpravy: ApiZprava[]; nextCursor: string | null } {
  if (konec) {
    const zpravy: ApiZprava[] = vlakno.slice(Math.max(0, vlakno.length - limit));
    return { zpravy, nextCursor: null };
  }
  let start = 0;
  if (cursor !== null) {
    const idx: number = vlakno.findIndex((zprava) => zprava.id === cursor);
    start = idx === -1 ? 0 : idx + 1;
  }
  const zpravy: ApiZprava[] = vlakno.slice(start, start + limit);
  const zbyva: boolean = start + limit < vlakno.length;
  return {
    zpravy,
    nextCursor: zbyva && zpravy.length > 0 ? (zpravy[zpravy.length - 1]?.id ?? null) : null,
  };
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
 * A message is unread when it is newer than the last read mark.
 * With no mark, everything counts — except messages at or before the
 * account was created (`ucetOd`). Those were never "new" for this user.
 */
export function jeZpravaNeprectena(
  createdAt: string,
  lastReadAt: string | null | undefined,
  ucetOd: string | null | undefined = null,
  autorId: string | null | undefined = null,
  viewerId: string | null | undefined = null,
): boolean {
  if (
    viewerId !== undefined &&
    viewerId !== null &&
    viewerId.length > 0 &&
    autorId !== undefined &&
    autorId !== null &&
    autorId.toLowerCase() === viewerId.toLowerCase()
  ) {
    return false;
  }
  if (ucetOd !== undefined && ucetOd !== null && createdAt <= ucetOd) return false;
  if (lastReadAt === undefined || lastReadAt === null) return true;
  return createdAt > lastReadAt;
}

/**
 * Seskupí zprávy do tvaru GET konverzace (čistá funkce bez DB).
 * `precteni` = mapa `key → lastReadAt ISO` přihlášeného (anonym `{}` → 0).
 * `lastMessage` = MAX(createdAt); `unreadCount` = zprávy po lastRead a po vzniku účtu.
 */
export function seskupKonverzace(
  zpravySeznam: ReadonlyArray<ApiZprava>,
  precteni: Readonly<Record<string, string>>,
  ucetOd: string | null = null,
  viewerId: string | null = null,
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
    if (jeZpravaNeprectena(zprava.createdAt, precteni[key], ucetOd, zprava.autorId, viewerId)) {
      konverzace.unreadCount += 1;
    }
  }
  return [...skupiny.values()].sort((a, b) => (a.key > b.key ? 1 : a.key < b.key ? -1 : 0));
}

const UUID_ZPRAVY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One page of a thread. `konec` returns the latest `limit` rows in ASC order.
 * An unknown cursor starts at the beginning, matching `orezStrankuZprav`.
 */
export async function nactiStrankuZprav(
  db: Db,
  filtr: SQL,
  limit: number,
  cursor: string | null,
  konec: boolean,
): Promise<{ radky: Zprava[]; nextCursor: string | null }> {
  if (konec) {
    const nejnovejsi = await db
      .select()
      .from(zpravy)
      .where(filtr)
      .orderBy(desc(zpravy.createdAt), desc(zpravy.id))
      .limit(limit);
    return { radky: nejnovejsi.reverse(), nextCursor: null };
  }
  let where: SQL = filtr;
  if (cursor !== null && UUID_ZPRAVY.test(cursor)) {
    const kotva = await db
      .select({ id: zpravy.id, createdAt: zpravy.createdAt })
      .from(zpravy)
      .where(and(filtr, eq(zpravy.id, cursor)))
      .limit(1);
    const radek = kotva[0];
    if (radek !== undefined) {
      const poKotve = or(
        gt(zpravy.createdAt, radek.createdAt),
        and(eq(zpravy.createdAt, radek.createdAt), gt(zpravy.id, radek.id)),
      );
      const slozene = and(filtr, poKotve);
      if (slozene !== undefined) where = slozene;
    }
  }
  const nactene = await db
    .select()
    .from(zpravy)
    .where(where)
    .orderBy(asc(zpravy.createdAt), asc(zpravy.id))
    .limit(limit + 1);
  const zbyva = nactene.length > limit;
  const radky = zbyva ? nactene.slice(0, limit) : nactene;
  const posledni = radky[radky.length - 1];
  return {
    radky,
    nextCursor: zbyva && posledni !== undefined ? posledni.id : null,
  };
}

/** Read marks as a SQL relation `(key, last_read)`. Empty input yields no rows. */
export function poddotazPrecteni(precteni: Readonly<Record<string, string>>): SQL {
  const radky: SQL[] = [];
  for (const [key, iso] of Object.entries(precteni)) {
    if (iso.trim().length === 0) continue;
    const datum = new Date(iso);
    if (Number.isNaN(datum.getTime())) continue;
    radky.push(sql`(${key}, ${datum.toISOString()}::timestamptz)`);
  }
  if (radky.length === 0) {
    return sql`(SELECT NULL::text AS key, NULL::timestamptz AS last_read WHERE false)`;
  }
  return sql`(SELECT v.key, v.last_read FROM (VALUES ${sql.join(radky, sql`, `)}) AS v(key, last_read))`;
}

function datumZBunky(hodnota: unknown): Date | null {
  if (hodnota instanceof Date && !Number.isNaN(hodnota.getTime())) return hodnota;
  if (typeof hodnota === "string" || typeof hodnota === "number") {
    const datum = new Date(hodnota);
    if (!Number.isNaN(datum.getTime())) return datum;
  }
  return null;
}

function textZBunky(hodnota: unknown): string | null {
  return typeof hodnota === "string" && hodnota.length > 0 ? hodnota : null;
}

function pocetZBunky(hodnota: unknown): number {
  if (typeof hodnota === "number" && Number.isFinite(hodnota)) return hodnota;
  if (typeof hodnota === "bigint") return Number(hodnota);
  if (typeof hodnota === "string") {
    const cislo = Number(hodnota);
    if (Number.isFinite(cislo)) return cislo;
  }
  return 0;
}

/**
 * Last message and unread count per channel, without loading the thread.
 * Same rules as `seskupKonverzace` plus `jeZpravaNeprectena`.
 */
export async function nactiPrehledZprav(
  db: Db,
  viewerId: string | null,
  precteni: Readonly<Record<string, string>>,
  ucetOd: string | null,
): Promise<ApiKonverzace[]> {
  const posledni = await db.execute(sql`
    SELECT DISTINCT ON (klic)
      klic, id, expedice_id, kanal, autor_id, autor_jmeno, text, created_at
    FROM (
      SELECT
        CASE
          WHEN kanal = 'expedice' THEN 'expedice:' || expedice_id
          ELSE kanal
        END AS klic,
        id,
        expedice_id,
        kanal,
        autor_id::text AS autor_id,
        autor_jmeno,
        text,
        created_at
      FROM zpravy
      WHERE smazano_at IS NULL
    ) AS vlakno
    ORDER BY klic, created_at DESC, id DESC
  `);
  const pocty = await db.execute(sql`
    SELECT z.klic, count(*)::int AS pocet
    FROM (
      SELECT
        CASE
          WHEN kanal = 'expedice' THEN 'expedice:' || expedice_id
          ELSE kanal
        END AS klic,
        created_at,
        autor_id
      FROM zpravy
      WHERE smazano_at IS NULL
    ) AS z
    LEFT JOIN ${poddotazPrecteni(precteni)} AS p ON p.key = z.klic
    WHERE (
      ${viewerId}::text IS NULL
      OR z.autor_id IS NULL
      OR lower(z.autor_id::text) <> lower(${viewerId}::text)
    )
      AND (${ucetOd}::timestamptz IS NULL OR z.created_at > ${ucetOd}::timestamptz)
      AND (p.last_read IS NULL OR z.created_at > p.last_read)
    GROUP BY z.klic
  `);
  const neprectene = new Map<string, number>();
  for (const radek of pocty.rows) {
    const bunka = radek as { klic?: unknown; pocet?: unknown };
    const klic = textZBunky(bunka.klic);
    if (klic === null) continue;
    neprectene.set(klic, pocetZBunky(bunka.pocet));
  }
  const radky: {
    klic: string;
    id: string;
    expediceId: string | null;
    kanal: string;
    autorId: string | null;
    autorJmeno: string;
    text: string;
    createdAt: Date;
  }[] = [];
  for (const surovy of posledni.rows) {
    const bunka = surovy as {
      klic?: unknown;
      id?: unknown;
      expedice_id?: unknown;
      kanal?: unknown;
      autor_id?: unknown;
      autor_jmeno?: unknown;
      text?: unknown;
      created_at?: unknown;
    };
    const klic = textZBunky(bunka.klic);
    const id = textZBunky(bunka.id);
    const kanal = textZBunky(bunka.kanal);
    const createdAt = datumZBunky(bunka.created_at);
    if (klic === null || id === null || kanal === null || createdAt === null) continue;
    if (typeof bunka.text !== "string") continue;
    radky.push({
      klic,
      id,
      expediceId: typeof bunka.expedice_id === "string" ? bunka.expedice_id : null,
      kanal,
      autorId: typeof bunka.autor_id === "string" ? bunka.autor_id : null,
      autorJmeno: typeof bunka.autor_jmeno === "string" ? bunka.autor_jmeno : "",
      text: bunka.text,
      createdAt,
    });
  }
  const autori = [...new Set(radky.flatMap((radek) => (radek.autorId === null ? [] : [radek.autorId])))];
  const jmena = new Map<string, ProfilProJmeno>();
  if (autori.length > 0) {
    const profily = await db
      .select({
        id: users.id,
        jmeno: users.jmeno,
        prijmeni: users.prijmeni,
        discordNick: users.discordNick,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, autori));
    for (const profil of profily) {
      jmena.set(profil.id, {
        jmeno: profil.jmeno,
        prijmeni: profil.prijmeni,
        discordNick: profil.discordNick,
        email: profil.email,
        avatarUrl: profil.avatarUrl,
      });
    }
  }
  const prilohy = await nactiMapuPriloh(
    db,
    "zprava",
    radky.map((radek) => radek.id),
  );
  const konverzace: ApiKonverzace[] = [];
  for (const radek of radky) {
    const api = toApiZprava(
      {
        id: radek.id,
        expediceId: radek.expediceId,
        kanal: radek.kanal,
        autorId: radek.autorId,
        autorJmeno: radek.autorJmeno,
        text: radek.text,
        createdAt: radek.createdAt,
        smazanoAt: null,
      },
      radek.autorId === null ? null : (jmena.get(radek.autorId) ?? null),
      prilohy.get(radek.id) ?? [],
    );
    if (api === null) continue;
    konverzace.push({
      key: radek.klic,
      expeditionId: api.expeditionId,
      channel: api.channel,
      lastMessage: api,
      unreadCount: neprectene.get(radek.klic) ?? 0,
    });
  }
  return konverzace;
}

/** DB řádek `zpravy` + JOIN `users` → veřejná `ApiZprava`; nevalidní → null. */
export function toApiZprava(
  radek: Zprava,
  autor: ProfilProJmeno | null = null,
  prilohy: readonly ApiZpravaPriloha[] = [],
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
    authorAvatarUrl: verejnyAvatarUrl(autor?.avatarUrl),
    channel,
    text: radek.text,
    prilohy: prilohy.map((priloha) => ({ ...priloha })),
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

/**
 * Client IP for rate limits. Express `trust proxy` already resolved `req.ip`.
 * The raw X-Forwarded-For header is not read, so a caller cannot pick the bucket.
 */
export function ctiIpZRequestu(req: Request): string {
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
  ucetOd: string | null = null,
): boolean {
  if (latestMessageAt === null) return false;
  return jeZpravaNeprectena(latestMessageAt, lastReadAt, ucetOd);
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
