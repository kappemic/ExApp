/**
 * Push subscription for the signed-in user. One endpoint belongs to one account.
 */
import { and, eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import type { PushOdberResponse, PushVerejnyKlicResponse } from "../../src/shared/api-typy/push";
import { PUSH_KLIC_PATH, PUSH_ODBER_PATH } from "../../src/shared/api-typy/push";
import { pushOdbery } from "../../drizzle/schema/push_odbery";
import { vyzadujPrihlaseni, type AutentizovanyRequest } from "./auth";
import { posliChybu, vnitrniChyba } from "./chyby";
import { getDb } from "./db";
import { verejnyKlicPush } from "./push";

function ctiOdber(telo: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (typeof telo !== "object" || telo === null) return null;
  const radek = telo as Record<string, unknown>;
  const endpoint = radek["endpoint"];
  const p256dh = radek["p256dh"];
  const auth = radek["auth"];
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return null;
  }
  const cisty = endpoint.trim();
  if (!cisty.startsWith("https://") || cisty.length > 2000) return null;
  if (p256dh.length === 0 || p256dh.length > 200 || auth.length === 0 || auth.length > 200) {
    return null;
  }
  return { endpoint: cisty, p256dh, auth };
}

export function registrujPush(app: Express): void {
  app.get(PUSH_KLIC_PATH, (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      const odpoved: PushVerejnyKlicResponse = { verejnyKlic: verejnyKlicPush() };
      res.json(odpoved);
    });
  });

  app.post(PUSH_ODBER_PATH, (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        if (verejnyKlicPush() === null) {
          posliChybu(res, "PUSH_NENI_NASTAVENY", "Oznámení na telefon teď nejsou zapnutá.");
          return;
        }
        const odber = ctiOdber(req.body);
        if (odber === null) {
          posliChybu(res, "VALIDATION_ERROR", "Odběr oznámení se nepodařilo uložit.", {
            endpoint: ["Prohlížeč poslal neúplný odběr."],
          });
          return;
        }
        const userId = (req as AutentizovanyRequest).uzivatel.id;
        try {
          await getDb()
            .insert(pushOdbery)
            .values({ userId, endpoint: odber.endpoint, p256dh: odber.p256dh, auth: odber.auth })
            .onConflictDoUpdate({
              target: pushOdbery.endpoint,
              set: { userId, p256dh: odber.p256dh, auth: odber.auth },
            });
          const odpoved: PushOdberResponse = { ok: true };
          res.status(201).json(odpoved);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  app.delete(PUSH_ODBER_PATH, (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const userId = (req as AutentizovanyRequest).uzivatel.id;
        try {
          await getDb().delete(pushOdbery).where(and(eq(pushOdbery.userId, userId)));
          res.json({ ok: true });
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });
}
