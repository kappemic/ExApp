/**
 * server/src/auth.ts — hash hesel, JWT session a auth middleware.
 *
 * - Hesla se hashují POUZE na serveru (bcryptjs, cost 10 — čistě JS
 *   implementace, vyšší cost by zbytečně brzdil UX).
 * - Session je JWT v httpOnly cookie `exapp_session` (primárně),
 *   fallback `Authorization: Bearer` pro nativní klienty.
 * - `ApiUser` nikdy nenese hash — mapuje ho `toApiUser`.
 * - Admin se pozná POUZE podle čerstvého `is_admin` z DB (sloupec
 *   `users.is_admin`, migrace 0005). Staré `role === 'admin'` se pro
 *   guardy nečte — `role` je jen dual-write mirror (trioNaRoli).
 * - `vyzadujSpravceVyprav` je dual-guard pro mutující expedice-routy:
 *   projde `is_admin` NEBO `smiNaVypravy` z tria čteného čerstvě z DB.
 */

import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { isKnownRole, smiNaVypravy } from "../../src/config/roles";
import type {
  ClenskyProfil,
  Clenstvi,
  Funkce,
  Role,
} from "../../src/config/roles";
import type { ApiUser, AuthRole, UserId } from "../../src/shared/api-types";
import { posliChybu } from "./chyby";
import { getDb } from "./db";
import { users } from "../../drizzle/schema/users";

export const COOKIE_NAME = "exapp_session";
const BCRYPT_COST = 10;
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface TokenPayload {
  sub: string;
}

export interface SessionUzivatel {
  id: string;
  email: string;
  role: Role;
  authRole: AuthRole;
  /** 3D trio čtené čerstvě z DB (guards ho nečtou z tokenu). */
  clenstvi: Clenstvi;
  funkce: Funkce;
  isAdmin: boolean;
}

export interface AutentizovanyRequest extends Request {
  uzivatel: SessionUzivatel;
}

type DbUserRow = typeof users.$inferSelect;

function jwtSecret(): string {
  const secret = process.env["AUTH_JWT_SECRET"];
  if (secret === undefined || secret.length < 32) {
    throw new Error(
      "Chybí AUTH_JWT_SECRET (aspoň 32 znaků). Nastav ho v .env.local — nikdy do klienta.",
    );
  }
  return secret;
}

/** Bcrypt hash hesla — server-only, nikdy se neposílá klientovi. */
export async function hashHesla(heslo: string): Promise<string> {
  return bcrypt.hash(heslo, BCRYPT_COST);
}

/** Porovná plaintext heslo s hashem. Prázdný hash = legacy řádek → false. */
export async function overHeslo(heslo: string, hash: string): Promise<boolean> {
  if (hash.length === 0) return false;
  try {
    return await bcrypt.compare(heslo, hash);
  } catch {
    return false;
  }
}

/** Podepíše krátký JWT (jen sub). Roli si middleware vždy čte čerstvě z DB. */
export function podepisToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, jwtSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

function overToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      algorithms: ["HS256"],
    }) as Partial<TokenPayload>;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function ctiTokenZRequestu(req: Request): string | null {
  const cookies = req.cookies as unknown;
  if (typeof cookies === "object" && cookies !== null) {
    const kandidat = (cookies as Record<string, unknown>)[COOKIE_NAME];
    if (typeof kandidat === "string" && kandidat.length > 0) return kandidat;
  }
  const hlavicka = req.headers.authorization;
  if (typeof hlavicka === "string" && hlavicka.startsWith("Bearer ")) {
    const token = hlavicka.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

/** DB řádek → veřejný ApiUser. Hash se záměrně nikdy nekopíruje. */
export function toApiUser(radek: DbUserRow): ApiUser {
  const role: Role = isKnownRole(radek.role) ? radek.role : "clen";
  const authRole: AuthRole = radek.isAdmin ? "ADMIN" : "USER";
  const trio = ctiTrioZRadku(radek);
  return {
    id: radek.id as UserId,
    email: radek.email,
    jmeno: radek.jmeno,
    prijmeni: radek.prijmeni.trim().length > 0 ? radek.prijmeni : undefined,
    telefon: radek.telefon,
    discordNick: radek.discordNick,
    role,
    authRole,
    clenstvi: trio.clenstvi,
    funkce: trio.funkce,
    isAdmin: trio.isAdmin,
    stravaId: radek.stravaId,
    createdAt: radek.createdAt.toISOString(),
    updatedAt: radek.updatedAt.toISOString(),
  };
}

/**
 * Dual-write mirror: 3D trio → stará `role` (jediná hodnota).
 * Pořadí je normativní: isAdmin → 'admin'; aktivní + vedení → 'vedeni';
 * aktivní + rada → 'clen-rady'; aktivní → 'aktivni-clen'; jinak 'clen'.
 * Čistá funkce bez DB — používá ji registr + PATCH users atomicky
 * v témže UPDATE (trio + mirror role najednou, nikdy odděleně).
 */
export function trioNaRoli(profil: ClenskyProfil): Role {
  if (profil.isAdmin) return "admin";
  if (profil.clenstvi === "aktivni_clen" && profil.funkce === "vedeni")
    return "vedeni";
  if (profil.clenstvi === "aktivni_clen" && profil.funkce === "rada")
    return "clen-rady";
  if (profil.clenstvi === "aktivni_clen") return "aktivni-clen";
  return "clen";
}

/** Bezpečné čtení 3D tria z DB řádku (neznámé hodnoty → bezpečný default). */
function ctiTrioZRadku(radek: DbUserRow): ClenskyProfil {
  const clenstvi: Clenstvi =
    radek.clenstvi === "aktivni_clen" ? "aktivni_clen" : "clen";
  const funkce: Funkce =
    radek.funkce === "vedeni" || radek.funkce === "rada"
      ? radek.funkce
      : null;
  return { clenstvi, funkce, isAdmin: radek.isAdmin };
}

/** True, když v systému ještě není žádný ADMIN (prvotní nastavení). */
export async function jeSystemBezAdmina(): Promise<boolean> {
  const db = getDb();
  const admini = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.isAdmin} = TRUE`)
    .limit(1);
  return admini.length === 0;
}

async function najdiUzivatelePodleId(id: string): Promise<DbUserRow | null> {
  const db = getDb();
  const nalezeni = await db.select().from(users).where(sql`${users.id} = ${id}::uuid`).limit(1);
  const prvni = nalezeni[0];
  return prvni === undefined ? null : prvni;
}

/**
 * Middleware: vyžaduje platnou session (cookie nebo Bearer).
 * Bez session → 401 NEPRIHLASEN. Roli čte čerstvě z DB.
 */
export async function vyzadujPrihlaseni(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = ctiTokenZRequestu(req);
  if (token === null) {
    posliChybu(res, "NEPRIHLASEN", "Nejsi přihlášený. Přihlas se a zkus to znovu.");
    return;
  }
  const userId = overToken(token);
  if (userId === null) {
    posliChybu(res, "NEPRIHLASEN", "Přihlášení vypršelo. Přihlas se znovu.");
    return;
  }
  let radek: DbUserRow | null;
  try {
    radek = await najdiUzivatelePodleId(userId);
  } catch {
    posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
    return;
  }
  if (radek === null) {
    posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
    return;
  }
  const role: Role = isKnownRole(radek.role) ? radek.role : "clen";
  const trio = ctiTrioZRadku(radek);
  (req as AutentizovanyRequest).uzivatel = {
    id: radek.id,
    email: radek.email,
    role,
    authRole: trio.isAdmin ? "ADMIN" : "USER",
    clenstvi: trio.clenstvi,
    funkce: trio.funkce,
    isAdmin: trio.isAdmin,
  };
  next();
}

/**
 * Middleware: vyžaduje session s čerstvým `is_admin = TRUE` z DB.
 * Bez session → 401 NEPRIHLASEN, přihlášený bez admin příznaku → 403 ZAKAZANO.
 */
export function vyzadujAdmina(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void (async (): Promise<void> => {
    await vyzadujPrihlaseni(req, res, () => {
      const uzivatel = (req as AutentizovanyRequest).uzivatel;
      if (!uzivatel.isAdmin) {
        posliChybu(res, "ZAKAZANO", "Tuhle akci může jen admin.");
        return;
      }
      next();
    });
  })();
}

/**
 * Middleware: dual-guard pro mutující expedice-routy.
 * Projde `is_admin` NEBO `smiNaVypravy` z tria čteného čerstvě z DB
 * (vyzadujPrihlaseni ho vždy načítá z řádku, nikdy z tokenu).
 * Bez session → 401 NEPRIHLASEN, jinak bez práva → 403 ZAKAZANO.
 */
export function vyzadujSpravceVyprav(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void (async (): Promise<void> => {
    await vyzadujPrihlaseni(req, res, () => {
      const uzivatel = (req as AutentizovanyRequest).uzivatel;
      const profil: ClenskyProfil = {
        clenstvi: uzivatel.clenstvi,
        funkce: uzivatel.funkce,
        isAdmin: uzivatel.isAdmin,
      };
      if (!uzivatel.isAdmin && !smiNaVypravy(profil)) {
        posliChybu(res, "ZAKAZANO", "Tuhle akci může jen admin nebo aktivní člen.");
        return;
      }
      next();
    });
  })();
}

/** Nastaví httpOnly session cookie (JWT). */
export function nastavSessionCookie(res: Response, token: string): void {
  const jeProdukce = process.env["NODE_ENV"] === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: jeProdukce,
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/** Smaže session cookie (odhlášení). */
export function smazSessionCookie(res: Response): void {
  const jeProdukce = process.env["NODE_ENV"] === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: jeProdukce,
    path: "/",
  });
}
