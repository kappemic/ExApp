/**
 * Member directory and school-name contracts.
 */

import type { Clenstvi, Funkce, Role } from "../../config/roles";
import type { AuthRole, UserId } from "./spolecne";


/* 11) GET /api/users — seznam členů (každý přihlášený, Krok 4 + adresář) */
/* Implementováno v server/src/index.ts 1:1 dle kontraktu.              */
/* Adresář vidí USER i ADMIN (e-mail, škola, třída, Discord). Telefon   */
/* jen aktivní člen, rada, vedení, admin a superadmin. Úpravy a         */
/* mazání zůstávají PATCH/DELETE jen ADMIN. Bez session → 401           */
/* NEPRIHLASEN. Úspěch → 200 + `UsersListResponse`.                     */
/* Tvar je záměrně úzký `UserListItem { id, jmeno, email }` — nikdy      */
/* hesla ani hashe (stejně jako `ApiUser` nenosí `passwordHash`).        */
/* `jmeno` je složené z DB `users.jmeno + users.prijmeni` (trim +        */
/* collapse whitespace, fallback prázdné → email — stejný vzor jako      */
/* denormalizace v `nactiExpediciSDetailem`). Řazeno e-mailem vzestupně  */
/* (deterministický selektor, 5 reálných users — bez stránkování;        */
/* `pagination?: Strankovani` se přidá aditivně, až bude potřeba).       */
/* Chyby vždy jen `ApiErrorResponse` — nikdy jiný tvar. Validace na      */
/* hranici není potřeba (GET bez query/body); vnitřní kód typům věří.    */
/* Idempotence: čisté GET, opakovatelné bez vedlejších účinků.           */
/* ------------------------------------------------------------------ */

export const USERS_PATH = "/api/users" as const;

/**
 * Úzký řádek pro admin selektor účastníků.
 * Na rozdíl od `ApiUser` nenese kontakty / stravaId / čas —
 * jen to, co selektor a správa členů potřebuje.
 * `role` je primární DB role (jedna hodnota dle users.role CHECK) —
 * aditivně přidáno pro AdminClenovePage (filtry tabů + editace).
 */
export interface UserListItem {
  id: UserId;
  /** Složené „Jméno Příjmení" z DB (fallback prázdné → email). */
  jmeno: string;
  email: string;
  /** Primární DB role — jediná hodnota z `Role` (users.role CHECK). */
  role: Role;
  /** 3D členství — aditivně optional. */
  clenstvi?: Clenstvi;
  /** 3D funkce — aditivně optional (null = bez funkce). */
  funkce?: Funkce;
  /** Ortogonální admin příznak — aditivně optional. */
  isAdmin?: boolean;
  /** Hlavní admin (DB `users.is_superadmin`). Server ho posílá vždy. */
  isSuperadmin: boolean;
  /** Škola — "" = nevyplněna (DB NOT NULL DEFAULT "", server mapuje s fallbackem ''). */
  skola: string;
  /** Třída — "" = nevyplněna (DB NOT NULL DEFAULT "", server mapuje s fallbackem ''). */
  trida: string;
  /** Discord nick — null = nevyplněn (DB `discord_nick` nullable, server mapuje string → string, jinak null). */
  discordNick: string | null;
  /** Telefon — null = nevyplněn (DB `telefon` nullable). */
  telefon: string | null;
  /** Živý avatar (`users.avatar_url`). null / chybí = iniciály. */
  avatarUrl?: string | null;
  /** Oblíbená barva — "" nebo chybí = nevyplněno. */
  oblibenaBarva?: string;
}

export interface UsersListResponse {
  users: UserListItem[];
}

/* ------------------------------------------------------------------ */
/* 12) PATCH /api/users/:id — úprava role uživatele (jen ADMIN)         */
/* Aditivně nad §11: seznam users už nese `role`, tenhle endpoint ji    */
/* umí změnit. `role` je jedna hodnota (ne pole — DB users.role je      */
/* TEXT s CHECK na 5 hodnot z roles.ts). Hranice: session s authRole     */
/* ADMIN, jinak 401 NEPRIHLASEN / 403 ZAKAZANO. Neznámé id → 404         */
/* NENALEZENO. Neznámá role → 422 VALIDATION_ERROR                      */
/* s `details` ve tvaru role: [česká hláška]. Úspěch → 200 +            */
/* `UpravitUzivateleResponse`. Idempotentní: opakovaný PATCH se stejnou */
/* rolí přepíše stejnou hodnotu. Chyby vždy jen `ApiErrorResponse`.     */
/* ------------------------------------------------------------------ */

export const USERS_DETAIL_VZOR = "/api/users/:id" as const;

/** Staví konkrétní URL detailu uživatele: `/api/users/uuid`. */
export function userDetailPath(id: string): `/api/users/${string}` {
  return `/api/users/${id}`;
}

/** Vstup editace role — právě jedna primární role.
 * @deprecated Starý tvar `{ role }` — ponechán pro zpětnou kompatibilitu.
 * Nové trio `clenstvi` / `funkce` / `isAdmin` (+ `skola` / `trida`)
 * validuje `validujUpravuUzivatele` (server/src/validace.ts).
 */
export interface UpravitUzivateleRequest {
  role: Role;
}

export interface UpravitUzivateleResponse {
  user: UserListItem;
}

/* ------------------------------------------------------------------ */
/* DELETE /api/users/:id — smazání přihlašovacího účtu (jen ADMIN).     */
/* Stejná cesta jako PATCH. Bez session 401 NEPRIHLASEN, ne-admin       */
/* 403 ZAKAZANO. Vlastní účet (session id === :id) → 403 ZAKAZANO.      */
/* Neznámé id → 404 NENALEZENO. Úspěch → 200 + SmazatUzivateleResponse. */
/* Související řádky řeší existující ON DELETE (CASCADE / SET NULL).    */
/* Řádek v `clenove` se nemaže. Opakovaný DELETE → 404.                  */
/* ------------------------------------------------------------------ */

export interface SmazatUzivateleResponse {
  ok: true;
}

/** Vzory cest uživatelského listu + detailu (odděleně jako Krok 2 / Krok 6). */
export type UsersCesta = typeof USERS_PATH | typeof USERS_DETAIL_VZOR;

/**
 * Čtení seznamu (`GET /api/users`) smí každý přihlášený.
 * Úprava a smazání na stejné cestě detailu zůstávají jen ADMIN
 * (metoda se do téhle matice nevejde — hlídá route).
 */
export const PRISTUP_USERS: Record<UsersCesta, AuthRole | "PUBLIC"> = {
  [USERS_PATH]: "USER",
  [USERS_DETAIL_VZOR]: "ADMIN",
} as const;

/* ------------------------------------------------------------------ */
/* 13) GET /api/meta/skoly-tridy — číselník škol a tříd (PUBLIC)        */
/* Vrací jen názvy (žádné osobní údaje — nikdy user_id / e-maily).      */
/* Aditivní, nic se nepřejmenovává.                                     */
/* ------------------------------------------------------------------ */

/** Cesta meta číselníku škol a tříd. */
export const META_SKOLY_TRIDY_PATH = "/api/meta/skoly-tridy" as const;

/** Odpověď číselníku — jen seznamy názvů, žádné osobní údaje. */
export interface SkolyTridyResponse {
  skoly: string[];
  tridy: string[];
}

/* ------------------------------------------------------------------ */
