/**
 * src/lib/admin-clenove.ts — klient správy členů nad živými users.
 *
 * Tenký BFF fetch-first: `VITE_API_BASE_URL` + kontrakt
 * `src/shared/api-types.ts` (§11 GET /api/users, §12 PATCH /api/users/:id).
 * DB `clenove` je prázdná — zdrojem je `users` (5 reálných).
 * `role` je jedna hodnota (users.role CHECK), ne pole.
 * Žádný secret v klientovi (jen `VITE_*`). Chyby česky, nikdy nevyhazuje
 * síťovou výjimku ven — vrací `{ ok: false, chyba }`.
 */

import { isKnownRole, type Role } from "../config/roles";
import {
  USERS_PATH,
  jeApiChyba,
  userDetailPath,
  type ApiErrorCode,
  type UserListItem,
  type UsersListResponse,
  type UpravitUzivateleResponse,
} from "../shared/api-types";

/** Sjednocený výsledek — úspěch nese data, chyba českou hlášku. */
export type ClenoveVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode };

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

/** Bezpečné čtení JSON — prázdné / ne-JSON tělo → null. */
async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

function chybaZTela(telo: unknown): ClenoveVysledek<never> {
  if (jeApiChyba(telo)) {
    return { ok: false, chyba: telo.error.message, kod: telo.error.code };
  }
  return { ok: false, chyba: OBECNA_CHYBA };
}

function jeUserListItem(hodnota: unknown): hodnota is UserListItem {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const kandidat = hodnota as Record<string, unknown>;
  return (
    typeof kandidat["id"] === "string" &&
    typeof kandidat["jmeno"] === "string" &&
    typeof kandidat["email"] === "string" &&
    typeof kandidat["role"] === "string" &&
    isKnownRole(kandidat["role"])
  );
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
 * Seznam uživatelů pro správu členů (jen ADMIN, GET /api/users).
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
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.status === 200 && jeUsersListResponse(telo)) {
      return { ok: true, data: telo.users };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: "Seznam členů je bez připojení nedostupný." };
  }
}

/**
 * Změna primární role uživatele (jen ADMIN, PATCH /api/users/:id).
 * `role` je jedna hodnota z `Role` — kombinace se neřeší.
 */
export async function ulozRoliClena(
  id: string,
  role: Role,
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
      body: JSON.stringify({ role }),
    });
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.status === 200 && jeUpravitUzivateleResponse(telo)) {
      return { ok: true, data: telo.user };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: "Bez připojení uložit nejde. Zkus to později." };
  }
}
