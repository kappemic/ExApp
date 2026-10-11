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

import {
  isKnownRole,
  type Clenstvi,
  type Funkce,
  type Role,
} from "../config/roles";
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
  if (
    typeof kandidat["id"] !== "string" ||
    typeof kandidat["jmeno"] !== "string" ||
    typeof kandidat["email"] !== "string" ||
    typeof kandidat["role"] !== "string" ||
    !isKnownRole(kandidat["role"])
  ) {
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
 * Vstup nového profilového PATCH (jen ADMIN, PATCH /api/users/:id).
 * Parciální — `JSON.stringify` nedefinovaná pole vynechá, server mění
 * jen poslaná (`Object.hasOwn`). `skola`/`trida` se posílají jen
 * vyplněné (seznam je nenese, prázdná by mazala).
 */
export interface UlozitProfilVstup {
  clenstvi?: Clenstvi;
  funkce?: Funkce;
  isAdmin?: boolean;
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
    const odpovedTelo: unknown = await ctiTelo(odpoved);
    if (odpoved.status === 200 && jeUpravitUzivateleResponse(odpovedTelo)) {
      return { ok: true, data: odpovedTelo.user };
    }
    return chybaZTela(odpovedTelo);
  } catch {
    return { ok: false, chyba: "Bez připojení uložit nejde. Zkus to později." };
  }
}

/**
 * Uložení 3D profilu člena (jen ADMIN, PATCH /api/users/:id).
 * Parciální trio `clenstvi?/funkce?/isAdmin?` + `skola?/trida?`;
 * kombinaci `clen` + funkce odmítne server (422, `chybaKombinace3D`).
 */
export async function ulozProfilClena(
  id: string,
  vstup: UlozitProfilVstup,
): Promise<ClenoveVysledek<UserListItem>> {
  const telo: Record<string, unknown> = {};
  if (vstup.clenstvi !== undefined) telo["clenstvi"] = vstup.clenstvi;
  if (vstup.funkce !== undefined) telo["funkce"] = vstup.funkce;
  if (vstup.isAdmin !== undefined) telo["isAdmin"] = vstup.isAdmin;
  if (vstup.skola !== undefined) telo["skola"] = vstup.skola;
  if (vstup.trida !== undefined) telo["trida"] = vstup.trida;
  return patchUzivatele(id, telo);
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
