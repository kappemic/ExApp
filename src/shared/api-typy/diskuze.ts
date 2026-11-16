import type { AuthRole } from "./spolecne";
import type { ExpediceMetoda } from "./expedice";

/**
 * Discussion and conversation contracts.
 */



/* 17) Fáze 5, Krok 4 — Diskuze k výpravě (vlákno zpráv, PRD §2.5)      */
/* Jedna tabulka `zpravy` (drizzle/schema/zpravy.ts, migrace 0009):     */
/* id UUID, expedice_id TEXT → expeditions(id) CASCADE, autor_id UUID   */
/* → users(id) SET NULL (odchod uživatele vlákno nemaže), text 1–1000   */
/* (SQL CHECK), created_at, smazano_at NULL = viditelná (soft-delete).  */
/* Matice: GET vlákna = PUBLIC (čte i anonym — modal ukazuje diskuzi    */
/* každému); POST = USER (přihlášený, rate-limit 10/min/ip); DELETE      */
/* detailu = autor NEBO dual-guard (ADMIN nebo aktivní člen — stejný     */
/* `vyzadujSpravceVyprav` jako výpravy; cizí mazání → 403 ZAKAZANO).     */
/* Mazání je soft-delete (UPDATE smazano_at, nikdy hard DELETE —         */
/* klubová paměť zůstává, GET filtruje smazano_at IS NULL). Smazání      */
/* výpravy maže celé vlákno (CASCADE v DB).                              */
/* Paginace: ?limit (default 50, cap 100) & cursor (opaque id poslední   */
/* zprávy), řazeno created_at ASC (+ id ASC jako tie-break). Odpověď     */
/* nese `nextCursor` (id poslední zprávy, nebo null = konec).            */
/* XSS: server ukládá raw (trimnutý) text bez escapování — escapuje se   */
/* až při renderu v klientovi (`escapujHtml` v src/lib/diskuze-api.ts).  */
/* Chyby vždy jen `ApiErrorResponse`. Aditivní, nic se nepřejmenovává.   */
/* ------------------------------------------------------------------ */

/** Vlákno zpráv výpravy (GET = PUBLIC). */
export const EXPEDICE_ZPRAVY_VZOR = "/api/expeditions/:id/zpravy" as const;
/** Jedna zpráva vlákna (DELETE = autor do 10 minut, nebo admin). */
export const EXPEDICE_ZPRAVA_DETAIL_VZOR =
  "/api/expeditions/:id/zpravy/:zpravaId" as const;

/** Staví URL vlákna: `/api/expeditions/xxx/zpravy`. */
export function zpravyPath(id: string): `/api/expeditions/${string}/zpravy` {
  return `/api/expeditions/${id}/zpravy`;
}

/** Staví URL jedné zprávy: `/api/expeditions/xxx/zpravy/yyy`. */
export function zpravaDetailPath(
  id: string,
  zpravaId: string,
): `/api/expeditions/${string}/zpravy/${string}` {
  return `/api/expeditions/${id}/zpravy/${zpravaId}`;
}

/**
 * Kanál diskuze (Step 2, kopie DB CHECK `zpravy_kanal_check` + `KANALY_ZPRAVY`).
 * `expedice` = vlákno výpravy (`expedice_id` NOT NULL), zbytek = globál (NULL).
 */
export type KanalDiskuze =
  | "expedice"
  | "dulezite"
  | "general"
  | "soukrome"
  | "skupina";

/** Guard kanálu (hranice API ho použije při validaci POST). */
export function jeKanalDiskuze(hodnota: unknown): hodnota is KanalDiskuze {
  return (
    hodnota === "expedice" ||
    hodnota === "dulezite" ||
    hodnota === "general" ||
    hodnota === "soukrome" ||
    hodnota === "skupina"
  );
}

/**
 * Příloha zprávy. Bez veřejné URL úložiště — stažení řeší pozdější endpoint.
 * `jeObrazek` říká UI, jestli smí ukázat náhled (png / jpeg / webp / gif).
 */
export interface ApiZpravaPriloha {
  id: string;
  nazev: string;
  bajty: number;
  contentType: string;
  jeObrazek: boolean;
}

/** Jedna zpráva vlákna — kopie řádku `zpravy` (text raw, bez escapování). */
export interface ApiZprava {
  id: string;
  /** NULL = globální kanál (`dulezite` / `general`), string = vlákno výpravy. */
  expeditionId: string | null;
  /** Autor zprávy; null = účet mezitím smazán (SET NULL, vlákno zůstává). */
  autorId: string | null;
  /**
   * Zobrazované jméno z JOINu `users` (Step 2, bez extra fetch z klienta).
   * `jmeno + prijmeni`, fallback `discordNick`, pak `email`, pak snapshot
   * `autor_jmeno`, jinak `Bývalý člen`. Vždy neprázdné.
   */
  authorName: string;
  /**
   * Živý avatar z JOINu `users.avatar_url`. null / chybí = iniciály
   * (smazaný účet, nebo účet bez fotky).
   */
  authorAvatarUrl?: string | null;
  /** Kanál zprávy (kopie DB CHECK `zpravy_kanal_check`). */
  channel: KanalDiskuze;
  /** Tělo zprávy raw (trimnuté, 0–1000 znaků) — escapuje až render. */
  text: string;
  /** Přílohy zprávy. Prázdné pole = zpráva bez souboru. */
  prilohy: ApiZpravaPriloha[];
  createdAt: string;
}

/** Query vlákna (`limit` default 50 / cap 100, `cursor` = id poslední zprávy). */
export interface ZpravyListQuery {
  limit?: number;
  cursor?: string;
  /** `true` = poslední `limit` zpráv (konec vlákna), ne první stránka. */
  tail?: boolean;
}

/** Staví URL vlákna s volitelnými query parametry (?limit&cursor&tail). */
export function zpravyListUrl(id: string, query: ZpravyListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.tail === true) params.set("tail", "1");
  const qs = params.toString();
  return qs.length > 0 ? `${zpravyPath(id)}?${qs}` : zpravyPath(id);
}

/** Seznam zpráv vlákna (PUBLIC — čte i anonym), řazeno created_at ASC. */
export interface ZpravyListResponse {
  zpravy: ApiZprava[];
  /** Id poslední zprávy stránky, nebo null = konec vlákna. */
  nextCursor: string | null;
}

/** Poslání zprávy (USER). `text` se na hranici trimuje (1–1000). */
export interface PosliZpravuRequest {
  text: string;
}

export interface PosliZpravuResponse {
  zprava: ApiZprava;
}

/** Smazání zprávy (autor do 10 minut, nebo admin; soft-delete). */
export interface SmazatZpravuResponse {
  ok: true;
}

/** Vzory cest diskuze pro matici oprávnění (odděleně jako Krok 2 / Krok 6). */
export type DiskuzeCesta =
  | typeof EXPEDICE_ZPRAVY_VZOR
  | typeof EXPEDICE_ZPRAVA_DETAIL_VZOR;

/** Hranice diskuze: čtení i zápis jen pro přihlášeného (DELETE hlídá autora). */
export const PRISTUP_DISKUZE: Record<DiskuzeCesta, AuthRole | "PUBLIC"> = {
  [EXPEDICE_ZPRAVY_VZOR]: "USER",
  [EXPEDICE_ZPRAVA_DETAIL_VZOR]: "USER",
} as const;

export interface MaticeRadekDiskuze {
  metoda: ExpediceMetoda;
  cesta: string;
  kdo: AuthRole | "PUBLIC";
  uspech: string;
}

/**
 * Matice oprávnění diskuze (metoda + cesta → kdo smí).
 * GET = USER; POST = USER (rate-limit 10/min/ip);
 * DELETE = autor NEBO dual-guard (ADMIN nebo aktivní člen — cizí → 403).
 */
export const MATICE_DISKUZE: readonly MaticeRadekDiskuze[] = [
  {
    metoda: "GET",
    cesta: EXPEDICE_ZPRAVY_VZOR,
    kdo: "USER",
    uspech: "200 + ZpravyListResponse (?limit default 50, cap 100 & cursor)",
  },
  {
    metoda: "POST",
    cesta: EXPEDICE_ZPRAVY_VZOR,
    kdo: "USER",
    uspech: "201 + PosliZpravuResponse (rate-limit 10/min/ip)",
  },
  {
    metoda: "DELETE",
    cesta: EXPEDICE_ZPRAVA_DETAIL_VZOR,
    kdo: "USER",
    uspech: "200 + SmazatZpravuResponse (autor nebo dual-guard, soft-delete)",
  },
] as const;

/** Guard jedné přílohy (bez URL úložiště). */
export function jeApiZpravaPriloha(hodnota: unknown): hodnota is ApiZpravaPriloha {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["id"] !== "string" || zaznam["id"].length === 0) return false;
  if (typeof zaznam["nazev"] !== "string" || zaznam["nazev"].length === 0) return false;
  if (zaznam["nazev"].length > 120) return false;
  const bajty: unknown = zaznam["bajty"];
  if (typeof bajty !== "number" || !Number.isInteger(bajty) || bajty < 0) return false;
  if (typeof zaznam["contentType"] !== "string" || zaznam["contentType"].length === 0) {
    return false;
  }
  if (typeof zaznam["jeObrazek"] !== "boolean") return false;
  return true;
}

/** Guard jedné zprávy (text raw — escapuje až render v klientovi). */
export function jeApiZprava(hodnota: unknown): hodnota is ApiZprava {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["id"] !== "string" || zaznam["id"].length === 0) {
    return false;
  }
  const expeditionId: unknown = zaznam["expeditionId"];
  if (typeof expeditionId !== "string" && expeditionId !== null) return false;
  if (typeof expeditionId === "string" && expeditionId.length === 0) return false;
  const autorId: unknown = zaznam["autorId"];
  if (typeof autorId !== "string" && autorId !== null) return false;
  if (typeof zaznam["authorName"] !== "string" || zaznam["authorName"].length === 0) {
    return false;
  }
  const authorAvatarUrl: unknown = zaznam["authorAvatarUrl"];
  if (
    authorAvatarUrl !== undefined &&
    authorAvatarUrl !== null &&
    typeof authorAvatarUrl !== "string"
  ) {
    return false;
  }
  if (!jeKanalDiskuze(zaznam["channel"])) return false;
  // Vazba kanál ↔ expedice (kopie DB CHECK zpravy_kanal_expedice_check).
  const channel: KanalDiskuze = zaznam["channel"] as KanalDiskuze;
  if (channel === "expedice" && expeditionId === null) return false;
  if (channel !== "expedice" && expeditionId !== null) return false;
  if (typeof zaznam["text"] !== "string") return false;
  const prilohy: unknown = zaznam["prilohy"];
  if (!Array.isArray(prilohy)) return false;
  for (const polozka of prilohy) {
    if (!jeApiZpravaPriloha(polozka)) return false;
  }
  if (typeof zaznam["createdAt"] !== "string") return false;
  return true;
}

/** Guard seznamu vlákna (prázdné vlákno je platné). */
export function jeZpravyOdpoved(
  hodnota: unknown,
): hodnota is ZpravyListResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const zpravy: unknown = zaznam["zpravy"];
  if (!Array.isArray(zpravy)) return false;
  for (const polozka of zpravy) {
    if (!jeApiZprava(polozka)) return false;
  }
  const nextCursor: unknown = zaznam["nextCursor"];
  if (typeof nextCursor !== "string" && nextCursor !== null) return false;
  return true;
}

/** Guard odpovědi po odeslání zprávy. */
export function jePosliZpravuOdpoved(
  hodnota: unknown,
): hodnota is PosliZpravuResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  return jeApiZprava(zaznam["zprava"]);
}

/* ------------------------------------------------------------------ */
/* 18) Step 1 — Diskuze unread (meta + read, HANDOFF §10, Step 0).       */
/* Nová tabulka `diskuze_precteni` (migrace 0010,                         */
/* drizzle/schema/diskuze_precteni.ts): per-user značka                   */
/* `(user_id, expedice_id) → last_read_at`, PK dvojice, obě FK CASCADE.  */
/* Smazání zprávy lastReadAt nemění; smazání usera/výpravy maže značky.  */
/* Matice: GET meta = PUBLIC (anonym: lastReadAt null, unread false —     */
/* tečka se nepersonalizuje); POST read = USER (idempotentní upsert,      */
/* userId VŽDY ze session, nikdy z body/query — jinak by šlo falšovat    */
/* cizí přečtení). Neznámá expedice → 404 NENALEZENO. Odpovědi nesou jen  */
/* ISO časy + boolean — žádný secret (stejný zákaz jako §15/§17).         */
/* latestMessageAt = MAX(created_at) viditelných zpráv (NULL = prázdné).  */
/* unread = latest !== null && (lastRead === null || latest > lastRead).  */
/* Klient: localStorage `exapp:discussion-lastRead-v1` je jen optimistic  */
/* cache, pravdou je vždy server (reload čte meta). Aditivní.             */
/* ------------------------------------------------------------------ */

/** Vlákno diskuze — meta pro badge (GET = PUBLIC). */
export const DISKUZE_META_VZOR = "/api/expeditions/:id/discussion/meta" as const;
/** Značka přečtení vlákna (POST = USER, idempotentní). */
export const DISKUZE_READ_VZOR = "/api/expeditions/:id/discussion/read" as const;

/** Staví URL meta: `/api/expeditions/xxx/discussion/meta`. */
export function diskuzeMetaPath(id: string): `/api/expeditions/${string}/discussion/meta` {
  return `/api/expeditions/${id}/discussion/meta`;
}

/** Staví URL read: `/api/expeditions/xxx/discussion/read`. */
export function diskuzeReadPath(id: string): `/api/expeditions/${string}/discussion/read` {
  return `/api/expeditions/${id}/discussion/read`;
}

/** Meta vlákna — jen ISO časy + boolean, nikdy secret. */
export interface DiskuzeMetaResponse {
  /** MAX(created_at) viditelných zpráv; null = prázdné vlákno. */
  latestMessageAt: string | null;
  /** Značka přihlášeného pro expedici; null = nikdy nečetl / anonym. */
  lastReadAt: string | null;
  /** True = cizí (i vlastní) nová zpráva po lastReadAt; anonym vždy false. */
  unread: boolean;
}

/** POST read přijímá prázdné tělo (budoucí rozšíření aditivně optional). */
export interface OznacPrecteniRequest {
  /** Rezerva — server ho ignoruje, čas razí vždy sám. */
  lastReadAt?: string;
}

/** Odpověď POST read — serverový čas zápisu (ISO). */
export interface OznacPrecteniResponse {
  lastReadAt: string;
}

/** Vzory cest unread pro matici oprávnění (odděleně jako §17). */
export type DiskuzePrecteniCesta =
  | typeof DISKUZE_META_VZOR
  | typeof DISKUZE_READ_VZOR;

/** Hranice unread: meta PUBLIC, read přihlášený. */
export const PRISTUP_DISKUZE_PRECTENI: Record<DiskuzePrecteniCesta, AuthRole | "PUBLIC"> = {
  [DISKUZE_META_VZOR]: "PUBLIC",
  [DISKUZE_READ_VZOR]: "USER",
} as const;

export interface MaticeRadekDiskuzePrecteni {
  metoda: ExpediceMetoda;
  cesta: string;
  kdo: AuthRole | "PUBLIC";
  uspech: string;
}

/**
 * Matice oprávnění unread (metoda + cesta → kdo smí).
 * GET meta = PUBLIC (anonym unread false); POST read = USER (upsert, vždy 200).
 */
export const MATICE_DISKUZE_PRECTENI: readonly MaticeRadekDiskuzePrecteni[] = [
  {
    metoda: "GET",
    cesta: DISKUZE_META_VZOR,
    kdo: "PUBLIC",
    uspech: "200 + DiskuzeMetaResponse (anonym: lastReadAt null, unread false)",
  },
  {
    metoda: "POST",
    cesta: DISKUZE_READ_VZOR,
    kdo: "USER",
    uspech: "200 + OznacPrecteniResponse (idempotentní upsert last_read_at)",
  },
] as const;

function jeIsoNeboNull(hodnota: unknown): boolean {
  return typeof hodnota === "string" || hodnota === null;
}

/** Guard meta (právě 3 klíče, žádné secrety). */
export function jeDiskuzeMetaOdpoved(
  hodnota: unknown,
): hodnota is DiskuzeMetaResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const klice = Object.keys(zaznam).sort();
  if (klice.length !== 3) return false;
  if (
    klice[0] !== "lastReadAt" ||
    klice[1] !== "latestMessageAt" ||
    klice[2] !== "unread"
  ) {
    return false;
  }
  if (!jeIsoNeboNull(zaznam["latestMessageAt"])) return false;
  if (!jeIsoNeboNull(zaznam["lastReadAt"])) return false;
  if (typeof zaznam["unread"] !== "boolean") return false;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
    "passwordHash",
    "email",
  ]) {
    if (klic in zaznam) return false;
  }
  return true;
}

/** Guard odpovědi read (právě `{ lastReadAt: ISO }`, bez secretů). */
export function jeOznacPrecteniOdpoved(
  hodnota: unknown,
): hodnota is OznacPrecteniResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (Object.keys(zaznam).length !== 1) return false;
  if (typeof zaznam["lastReadAt"] !== "string") return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* 19) Step 2 — Jména + seskupení + guard (kanály dulezite/general).    */
/* Jedna tabulka `zpravy` (kanal + expedice_id NULL = globál +           */
/* autor_jmeno snapshot, migrace 0011) + `konverzace_precteni`           */
/* (user_id, conversation_key, last_read_at, migrace 0011).              */
/* - GET diskuze JOIN `users` → `authorName` (jmeno+prijmeni, fallback    */
/*   discordNick/email/Bývalý člen; SET NULL drží `autor_jmeno`).        */
/*   Klient jména nefetchuje zvlášť — jsou v `ApiZprava` (§17).          */
/* - GET konverzace `[{key, expeditionId, channel, lastMessage,           */
/*   unreadCount}]` (PUBLIC; anonym unreadCount vždy 0). Klíč:            */
/*   `dulezite` | `general` | `expedice:<slug>`.                         */
/* - POST globálu: `dulezite` jen vedení/rada/admin (funkce               */
/*   `vedeni`|`rada` NEBO `isAdmin`), jinak 403 ZAKAZANO; `general`       */
/*   každý přihlášený (USER). Čtení PUBLIC.                              */
/* - POST read: per-user upsert `konverzace_precteni`, čas razí server,  */
/*   userId VŽDY ze session. Chyby jen `ApiErrorResponse`. Aditivní.      */
/* ------------------------------------------------------------------ */

/** Seznam konverzací (GET = PUBLIC, anonym unreadCount 0). */
export const KONVERZACE_PATH = "/api/diskuze/konverzace" as const;
/** Značka přečtení konverzace (POST = USER, idempotentní upsert). */
export const KONVERZACE_READ_PATH = "/api/diskuze/konverzace/read" as const;
/** Globální zprávy (GET = PUBLIC, POST = USER + guard kanálu). */
export const GLOBALNI_ZPRAVY_PATH = "/api/diskuze/zpravy" as const;

/** Staví URL read konverzace (bez parametru — key je v body). */
export function konverzaceReadPath(): typeof KONVERZACE_READ_PATH {
  return KONVERZACE_READ_PATH;
}

/** Staví URL globálních zpráv s volitelným `?channel=` filtrem. */
export function globalniZpravyUrl(channel?: KanalDiskuze): string {
  if (channel === undefined) return GLOBALNI_ZPRAVY_PATH;
  const params = new URLSearchParams();
  params.set("channel", channel);
  return `${GLOBALNI_ZPRAVY_PATH}?${params.toString()}`;
}

/** Jedna konverzace v přehledu (klíč + poslední zpráva + počet nepřečtených). */
export interface ApiKonverzace {
  /** `dulezite` | `general` | `expedice:<slug>` | `soukrome:<uuid>:<uuid>`. */
  key: string;
  /** NULL = globál nebo soukromý chat, string = vlákno výpravy. */
  expeditionId: string | null;
  channel: KanalDiskuze;
  /** Druhý účastník soukromého chatu. Jinde chybí. */
  partnerId?: string | null;
  /** Jméno druhého účastníka. Jinde chybí. */
  partnerJmeno?: string | null;
  /** Název vlastní skupiny. U ostatních kanálů chybí. */
  nazev?: string | null;
  /** Vlastní skupina: smí číst zprávy. Jinde chybí (= ano). */
  muzeCist?: boolean;
  /** Vlastní skupina: smí psát. Jinde chybí (= podle kanálu). */
  muzePsat?: boolean;
  /** Poslední viditelná zpráva (MAX created_at); null = prázdný globál. */
  lastMessage: ApiZprava | null;
  /** Počet zpráv po lastReadAt (anonym vždy 0, nikdy záporné). */
  unreadCount: number;
}

/** Seznam konverzací (PUBLIC — čte i anonym). */
export interface KonverzaceListResponse {
  konverzace: ApiKonverzace[];
}

/** Zápis do globálu (USER + guard kanálu na serveru). */
export interface PosliGlobalZpravuRequest {
  channel: "dulezite" | "general";
  text: string;
}

/** Odpověď zápisu do globálu → 201. */
export interface PosliGlobalZpravuResponse {
  zprava: ApiZprava;
}

/** Označení konverzace jako přečtené (USER, key v body). */
export interface OznacKonverzaciRequest {
  key: string;
}

/** Vzory cest Step 2 pro matici oprávnění. */
export type KonverzaceCesta =
  | typeof KONVERZACE_PATH
  | typeof KONVERZACE_READ_PATH
  | typeof GLOBALNI_ZPRAVY_PATH;

/** Hranice Step 2: čtení i zápis jen pro přihlášeného (Důležité hlídá guard). */
export const PRISTUP_KONVERZACE: Record<KonverzaceCesta, AuthRole | "PUBLIC"> = {
  [KONVERZACE_PATH]: "USER",
  [KONVERZACE_READ_PATH]: "USER",
  [GLOBALNI_ZPRAVY_PATH]: "USER",
} as const;

export interface MaticeRadekKonverzace {
  metoda: ExpediceMetoda;
  cesta: string;
  kdo: AuthRole | "PUBLIC";
  uspech: string;
}

/**
 * Matice oprávnění Step 2 (metoda + cesta → kdo smí).
 * GET konverzace i globálu = USER; POST globálu = USER
 * (Důležité navíc vedení/rada/admin, jinak 403); POST read = USER.
 */
export const MATICE_KONVERZACE: readonly MaticeRadekKonverzace[] = [
  {
    metoda: "GET",
    cesta: KONVERZACE_PATH,
    kdo: "USER",
    uspech: "200 + KonverzaceListResponse",
  },
  {
    metoda: "GET",
    cesta: GLOBALNI_ZPRAVY_PATH,
    kdo: "USER",
    uspech: "200 + ZpravyListResponse (authorName z JOINu)",
  },
  {
    metoda: "POST",
    cesta: GLOBALNI_ZPRAVY_PATH,
    kdo: "USER",
    uspech: "201 + PosliGlobalZpravuResponse (dulezite jen vedeni/rada/admin, jinak 403)",
  },
  {
    metoda: "POST",
    cesta: KONVERZACE_READ_PATH,
    kdo: "USER",
    uspech: "200 + OznacPrecteniResponse (upsert last_read_at ze session)",
  },
] as const;

/** Guard jedné konverzace (unreadCount nikdy záporné, vazba kanál ↔ expedice). */
export function jeApiKonverzace(hodnota: unknown): hodnota is ApiKonverzace {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["key"] !== "string" || zaznam["key"].length === 0) {
    return false;
  }
  const expeditionId: unknown = zaznam["expeditionId"];
  if (typeof expeditionId !== "string" && expeditionId !== null) return false;
  if (!jeKanalDiskuze(zaznam["channel"])) return false;
  const channel: KanalDiskuze = zaznam["channel"] as KanalDiskuze;
  if (channel === "expedice" && expeditionId === null) return false;
  if (channel !== "expedice" && expeditionId !== null) return false;
  const lastMessage: unknown = zaznam["lastMessage"];
  if (lastMessage !== null && !jeApiZprava(lastMessage)) return false;
  if (typeof zaznam["unreadCount"] !== "number") return false;
  const unread: number = zaznam["unreadCount"] as number;
  if (!Number.isInteger(unread) || unread < 0) return false;
  return true;
}

/** Guard seznamu konverzací (prázdný seznam je platný). */
export function jeKonverzaceOdpoved(
  hodnota: unknown,
): hodnota is KonverzaceListResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const konverzace: unknown = zaznam["konverzace"];
  if (!Array.isArray(konverzace)) return false;
  for (const polozka of konverzace) {
    if (!jeApiKonverzace(polozka)) return false;
  }
  return true;
}

/** Guard odpovědi zápisu do globálu. */
export function jePosliGlobalZpravuOdpoved(
  hodnota: unknown,
): hodnota is PosliGlobalZpravuResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  return jeApiZprava(zaznam["zprava"]);
}

/* ------------------------------------------------------------------ */
