/** GET /api/nahled-odkazu?url=… — náhled odkazu pro přihlášené. */
import type { Express, Request, Response } from "express";
import { NAHLED_ODKAZU_PATH, type NahledOdkazuResponse } from "../../src/shared/api-typy/odkazy";
import { bezpecnaUrl } from "../../src/shared/odkazy";
import { vyzadujPrihlaseni, type AutentizovanyRequest } from "./auth";
import { posliChybu, vnitrniChyba } from "./chyby";
import { nahledOdkazu, smiNahled } from "./nahled-odkazu";

const MAX_DELKA_URL = 2000;

export function registrujNahledyOdkazu(app: Express): void {
  app.get(NAHLED_ODKAZU_PATH, (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const surova: unknown = req.query["url"];
        const url = typeof surova === "string" && surova.length <= MAX_DELKA_URL ? bezpecnaUrl(surova) : null;
        if (url === null) {
          posliChybu(res, "VALIDATION_ERROR", "Adresa odkazu není platná.");
          return;
        }
        if (!smiNahled((req as AutentizovanyRequest).uzivatel.id)) {
          posliChybu(res, "MOC_POZADAVKU", "Moc náhledů najednou. Zkus to za chvíli.");
          return;
        }
        try {
          const odpoved: NahledOdkazuResponse = { nahled: await nahledOdkazu(url) };
          res.setHeader("Cache-Control", "private, max-age=3600");
          res.json(odpoved);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });
}
