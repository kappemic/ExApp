/**
 * server/src/auth.ts — hash hesel, JWT session a auth middleware.
 *
 * - Hesla se hashují POUZE na serveru (bcryptjs, cost 10 — čistě JS
 *   implementace, vyšší cost by zbytečně brzdil UX).
 * - Session je JWT v httpOnly cookie `exapp_session` (primárně),
 *   fallback `Authorization: Bearer` pro nativní klienty.
 * - `ApiUser` nikdy nenese hash — mapuje ho `toApiUser`.
 * - Binární auth role: `admin` → ADMIN, jinak USER (ROLE_DOC.md).
 */

import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { isKnownRole } from "../../src/config/roles";
import type { Role } from "../../src/config/roles";
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
  const authRole: AuthRole = role === "admin" ? "ADMIN" : "USER";
  return {
    id: radek.id as UserId,
    email: radek.email,
    jmeno: radek.jmeno,
    prijmeni: radek.prijmeni.trim().length > 0 ? radek.prijmeni : undefined,
    telefon: radek.telefon,
    discordNick: radek.discordNick,
    role,
    authRole,
    stravaId: radek.stravaId,
    createdAt: radek.createdAt.toISOString(),
    updatedAt: radek.updatedAt.toISOString(),
  };
}

/** True, když v systému ještě není žádný ADMIN (prvotní nastavení). */
export async function jeSystemBezAdmina(): Promise<boolean> {
  const db = getDb();
  const admini = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.role} = 'admin'`)
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
  (req as AutentizovanyRequest).uzivatel = {
    id: radek.id,
    email: radek.email,
    role,
    authRole: role === "admin" ? "ADMIN" : "USER",
  };
  next();
}

/**
 * Middleware: vyžaduje session s authRole ADMIN.
 * Bez session → 401 NEPRIHLASEN, přihlášený USER → 403 ZAKAZANO.
 */
export function vyzadujAdmina(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void (async (): Promise<void> => {
    await vyzadujPrihlaseni(req, res, () => {
      const uzivatel = (req as AutentizovanyRequest).uzivatel;
      if (uzivatel.authRole !== "ADMIN") {
        posliChybu(res, "ZAKAZANO", "Tuhle akci může jen admin.");
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
