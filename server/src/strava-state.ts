/**
 * Strava OAuth `state` bound to the logged-in user.
 * The nonce travels in the authorize URL; the same nonce plus the user id
 * stays in an httpOnly cookie. The callback accepts the code only when both match.
 */

import { timingSafeEqual, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { jeProdukce } from "./prostredi";


export const STRAVA_STATE_COOKIE = "exapp_strava_state";
const STRAVA_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function vytvorStravaState(userId: string): { state: string; cookie: string } {
  const state = randomBytes(32).toString("hex");
  return { state, cookie: `${userId}.${state}` };
}

function volbyCookie(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: jeProdukce(),
    path: "/",
    maxAge: STRAVA_STATE_MAX_AGE_MS,
  };
}

export function nastavStravaStateCookie(res: Response, cookie: string): void {
  res.cookie(STRAVA_STATE_COOKIE, cookie, volbyCookie());
}

export function smazStravaStateCookie(res: Response): void {
  const volby = volbyCookie();
  res.clearCookie(STRAVA_STATE_COOKIE, {
    httpOnly: volby.httpOnly,
    sameSite: volby.sameSite,
    secure: volby.secure,
    path: volby.path,
  });
}

export function ctiStravaStateCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const hodnota = cookies?.[STRAVA_STATE_COOKIE];
  return typeof hodnota === "string" ? hodnota : undefined;
}

function stejnyText(a: string, b: string): boolean {
  const levy = Buffer.from(a);
  const pravy = Buffer.from(b);
  if (levy.length !== pravy.length) return false;
  return timingSafeEqual(levy, pravy);
}

/** True when the cookie was issued for this user and this authorize URL. */
export function sediStravaState(
  cookie: string | undefined,
  state: string,
  userId: string,
): boolean {
  if (cookie === undefined || state.length === 0 || userId.length === 0) return false;
  const tecka = cookie.indexOf(".");
  if (tecka <= 0 || tecka >= cookie.length - 1) return false;
  const cookieUser = cookie.slice(0, tecka);
  const cookieNonce = cookie.slice(tecka + 1);
  return stejnyText(cookieUser, userId) && stejnyText(cookieNonce, state);
}
