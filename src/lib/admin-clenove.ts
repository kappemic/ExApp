import { apiBase } from "./api-base";
import { chybaZApiTela, ctiJsonTelo } from "./api-odpoved";
/**
 * src/lib/admin-clenove.ts — klient správy členů nad živými users.
 *
 * Tenký BFF fetch-first: `VITE_API_BASE_URL` + kontrakt
 * `src/shared/api-types.ts` (§11 GET /api/users, §12 PATCH /api/users/:id,
 * DELETE /api/users/:id).
 * DB `clenove` je prázdná — zdrojem je `users` (5 reálných).
 * `role` je jedna hodnota (users.role CHECK), ne pole.
 * Žádný secret v klientovi (jen `VITE_*`). Chyby česky, nikdy nevyhazuje
 * síťovou výjimku ven — vrací `{ ok: false, chyba }`.
 */

import {
  isKnownRole,
  type Clenstvi,
  type Funkce,
  type Role,
} from "../config/roles";
import {
  USERS_PATH,
  userDetailPath,
  type ApiErrorCode,
  type UserListItem,
  type UsersListResponse,
  type SmazatUzivateleResponse,
  type UpravitUzivateleResponse,
} from "../shared/api-types";

/** Sjednocený výsledek — úspěch nese data, chyba českou hlášku. */
export type ClenoveVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode };

function jeUserListItem(hodnota: unknown): hodnota is UserListItem {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const kandidat = hodnota as Record<string, unknown>;
  if (
    typeof kandidat["id"] !== "string" ||
    typeof kandidat["jmeno"] !== "string" ||
    typeof kandidat["email"] !== "string" ||
    typeof kandidat["role"] !== "string" ||
    !isKnownRole(kandidat["role"])
  ) {
    return false;
  }
  // Škola/třída nese server vždy (DB NOT NULL DEFAULT "", fallback '').
  // Chybějící / ne-string tvar odpověď odmítne (špatný tvar).
  if (
    typeof kandidat["skola"] !== "string" ||
    typeof kandidat["trida"] !== "string"
  ) {
    return false;
  }
  // Discord nick nese server vždy (DB `discord_nick` nullable → string | null).
  // Platný string i null projdou, chybějící / jiný tvar odpověď odmítne.
  const discordNick: unknown = kandidat["discordNick"];
  if (discordNick !== null && typeof discordNick !== "string") {
    return false;
  }
  const telefon: unknown = kandidat["telefon"];
  if (telefon !== null && typeof telefon !== "string") {
    return false;
  }
  const avatarUrl: unknown = kandidat["avatarUrl"];
  if (
    avatarUrl !== undefined &&
    avatarUrl !== null &&
    typeof avatarUrl !== "string"
  ) {
    return false;
  }
  const oblibenaBarva: unknown = kandidat["oblibenaBarva"];
  if (oblibenaBarva !== undefined && typeof oblibenaBarva !== "string") {
    return false;
  }
  // 3D trio je v kontraktu aditivně optional (fallback mirror ze starého role).
  const clenstvi: unknown = kandidat["clenstvi"];
  if (
    clenstvi !== undefined &&
    clenstvi !== "clen" &&
    clenstvi !== "aktivni_clen"
  ) {
    return false;
  }
  const funkce: unknown = kandidat["funkce"];
  if (
    funkce !== undefined &&
    funkce !== null &&
    funkce !== "vedeni" &&
    funkce !== "rada"
  ) {
    return false;
  }
  const adminPriznak: unknown = kandidat["isAdmin"];
  if (adminPriznak !== undefined && typeof adminPriznak !== "boolean") {
    return false;
  }
  if (typeof kandidat["isSuperadmin"] !== "boolean") {
    return false;
  }
  return true;
}

function jeUsersListResponse(telo: unknown): telo is UsersListResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  if (!Array.isArray(kandidat["users"])) return false;
  return (kandidat["users"] as unknown[]).every(jeUserListItem);
}

function jeUpravitUzivateleResponse(
  telo: unknown,
): telo is UpravitUzivateleResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  return jeUserListItem(kandidat["user"]);
}

/**
 * Seznam uživatelů pro adresář členů (přihlášený USER i ADMIN, GET /api/users).
 * Bez backendu / při pádu sítě česká offline hláška.
 */
export async function nactiCleny(): Promise<ClenoveVysledek<UserListItem[]>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Seznam členů je bez připojení nedostupný." };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${USERS_PATH}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.status === 200 && jeUsersListResponse(telo)) {
      return { ok: true, data: telo.users };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: "Seznam členů je bez připojení nedostupný." };
  }
}

/**
 * Vstup nového profilového PATCH (jen ADMIN, PATCH /api/users/:id).
 * Parciální — `JSON.stringify` nedefinovaná pole vynechá, server mění
 * jen poslaná (`Object.hasOwn`). `skola`/`trida` se posílají jen
 * vyplněné (prázdná by mazala).
 */
export interface UlozitProfilVstup {
  clenstvi?: Clenstvi;
  funkce?: Funkce;
  isAdmin?: boolean;
  /** Hlavní admin. `true` v payloadu vynutí i `isAdmin: true`. */
  isSuperadmin?: boolean;
  skola?: string;
  trida?: string;
}

async function patchUzivatele(
  id: string,
  telo: Record<string, unknown>,
): Promise<ClenoveVysledek<UserListItem>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení uložit nejde. Zkus to později." };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${userDetailPath(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(telo),
    });
    const odpovedTelo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.status === 200 && jeUpravitUzivateleResponse(odpovedTelo)) {
      return { ok: true, data: odpovedTelo.user };
    }
    return chybaZApiTela(odpovedTelo);
  } catch {
    return { ok: false, chyba: "Bez připojení uložit nejde. Zkus to později." };
  }
}

/**
 * Uložení 3D profilu člena (jen ADMIN, PATCH /api/users/:id).
 * Parciální trio `clenstvi?/funkce?/isAdmin?/isSuperadmin?` + `skola?/trida?`;
 * kombinaci `clen` + funkce odmítne server (422, `chybaKombinace3D`).
 * Zapnutý hlavní admin vždy pošle i `isAdmin: true`.
 */
export async function ulozProfilClena(
  id: string,
  vstup: UlozitProfilVstup,
): Promise<ClenoveVysledek<UserListItem>> {
  const telo: Record<string, unknown> = {};
  if (vstup.clenstvi !== undefined) telo["clenstvi"] = vstup.clenstvi;
  if (vstup.funkce !== undefined) telo["funkce"] = vstup.funkce;
  if (vstup.isAdmin !== undefined) telo["isAdmin"] = vstup.isAdmin;
  if (vstup.isSuperadmin !== undefined) {
    telo["isSuperadmin"] = vstup.isSuperadmin;
  }
  if (vstup.isSuperadmin === true) telo["isAdmin"] = true;
  if (vstup.skola !== undefined) telo["skola"] = vstup.skola;
  if (vstup.trida !== undefined) telo["trida"] = vstup.trida;
  return patchUzivatele(id, telo);
}

function jeSmazatUzivateleResponse(
  telo: unknown,
): telo is SmazatUzivateleResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  return kandidat["ok"] === true;
}

/**
 * Smazání přihlašovacího účtu (jen ADMIN, DELETE /api/users/:id).
 * Vlastní účet server odmítne (403). Úspěch jen při 200 a `{ ok: true }`.
 */
export async function smazClena(
  id: string,
): Promise<ClenoveVysledek<SmazatUzivateleResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení účet smazat nejde. Zkus to později." };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${userDetailPath(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.status === 200 && jeSmazatUzivateleResponse(telo)) {
      return { ok: true, data: telo };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: "Bez připojení účet smazat nejde. Zkus to později." };
  }
}

/**
 * Změna primární role uživatele (jen ADMIN, PATCH /api/users/:id).
 * `role` je jedna hodnota z `Role` — kombinace se neřeší.
 *
 * @deprecated Starý tvar `{ role }` — nové UI ukládá trio přes
 * `ulozProfilClena`. Ponecháno pro zpětnou kompatibilitu.
 */
export async function ulozRoliClena(
  id: string,
  role: Role,
): Promise<ClenoveVysledek<UserListItem>> {
  return patchUzivatele(id, { role });
}
