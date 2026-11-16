/**
 * CSRF guard: writes from a browser must come from an allowed origin.
 * CORS alone does not stop a multipart POST, which runs without a preflight.
 *
 * Requests without an Origin header pass (smoke scripts, native clients, GET
 * navigations such as the Strava callback); browsers send it on every write.
 * Bearer-only requests pass because another site cannot attach that header
 * without a successful preflight.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { jeBearerBezSessionCookie } from "./auth";
import { posliChybu } from "./chyby";
import { normalizujPuvod } from "./cors";

const BEZPECNE_METODY: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export interface PozadavekNaPuvod {
  metoda: string;
  origin: string | undefined;
  bearerBezCookie: boolean;
  /** Public origin this request reached (scheme + host), so one-origin hosting works. */
  vlastniPuvod: string;
}

/** Pure decision, first match wins. */
export function smiPuvod(
  pozadavek: PozadavekNaPuvod,
  povolene: ReadonlySet<string>,
): boolean {
  if (BEZPECNE_METODY.has(pozadavek.metoda.toUpperCase())) return true;
  if (pozadavek.bearerBezCookie) return true;
  if (pozadavek.origin === undefined) return true;
  const puvod = normalizujPuvod(pozadavek.origin);
  if (puvod === null) return false;
  return povolene.has(puvod) || puvod === normalizujPuvod(pozadavek.vlastniPuvod);
}

/** Middleware for `/api`. Reads headers only and leaves the body to the handlers. */
export function vytvorOriginKontrolu(povolene: readonly string[]): RequestHandler {
  const mnozina = new Set(
    povolene
      .map((puvod) => normalizujPuvod(puvod))
      .filter((puvod): puvod is string => puvod !== null),
  );
  return (req: Request, res: Response, next: NextFunction): void => {
    const povoleno = smiPuvod(
      {
        metoda: req.method,
        origin: req.headers.origin,
        bearerBezCookie: jeBearerBezSessionCookie(req),
        vlastniPuvod: `${req.protocol}://${req.host}`,
      },
      mnozina,
    );
    if (!povoleno) {
      posliChybu(res, "ZAKAZANO", "Požadavek z téhle adresy není povolený.");
      return;
    }
    next();
  };
}
