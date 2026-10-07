/**
 * server/src/chyby.ts — jednotné chyby dle kontraktu src/shared/api-types.ts.
 *
 * Jediný povolený tvar chybové odpovědi je `{ error: { code, message } }`,
 * případně s `details` u VALIDATION_ERROR. HTTP mapování kopíruje kontrakt:
 * - 400 poškozený požadavek, 401 nepřihlášen / špatné heslo / neplatný kód,
 * - 403 bez práva, 404 nenalezeno, 409 e-mail obsazen / duplicitní přihláška /
 *   plná kapacita / akce na proběhlé výpravě, 410 kód expiroval,
 * - 422 nevalidní vstup, 500 neočekávaná chyba (bez interních detailů).
 */

import type { Response } from "express";
import type { ApiErrorCode, ApiErrorResponse } from "../../src/shared/api-types";

const HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  BAD_REQUEST: 400,
  NEPRIHLASEN: 401,
  ZAKAZANO: 403,
  NENALEZENO: 404,
  EMAIL_OBSAZEN: 409,
  KOD_NEPLATNY: 401,
  KOD_EXPIROVANY: 410,
  SPATNE_HESLO: 401,
  UZ_PRIHLASEN: 409,
  KAPACITA_PLNA: 409,
  VYPRAVA_UZAVRENA: 409,
  VNITRNI_CHYBA: 500,
};

export function httpStatusProKod(code: ApiErrorCode): number {
  return HTTP_STATUS[code];
}

export function chyboveTelo(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string[]>,
): ApiErrorResponse {
  if (details === undefined) return { error: { code, message } };
  return { error: { code, message, details } };
}

/** Odešle jednotnou chybovou odpověď (stav se odvozuje z kódu). */
export function posliChybu(
  res: Response,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string[]>,
): void {
  res.status(httpStatusProKod(code)).json(chyboveTelo(code, message, details));
}
