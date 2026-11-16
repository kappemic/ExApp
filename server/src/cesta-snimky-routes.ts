/**
 * Journey screenshots for an expedition: outbound (`tam`) and return (`zpet`).
 * Bytes go to R2. The expedition JSON create/update stays unchanged.
 */
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { expediceCestaSnimky } from "../../drizzle/schema/expedice_cesta_snimky";
import { expeditions } from "../../drizzle/schema/expeditions";
import type { ApiCestaSnimek } from "../../src/shared/api-types";
import { type AutentizovanyRequest, vyzadujSpravceVyprav } from "./auth";
import {
  chceNahled,
  maBezpecneRozmery,
  OBRAZEK_PRILIS_VELKY,
  rozmeryDoOdpovedi,
  rozmeryUlozenychBajtu,
} from "./obrazek-nahled";
import { posliChybu } from "./chyby";
import { getDb, type Db } from "./db";
import { ctiSuroveTelo } from "./zprava-prilohy";
import {
  CESTA_NAHRANI_MAX_BAJTU,
  CESTA_SNIMKU_NA_SMER,
  FOTKY_NEJSOU_NASTAVENE_ZPRAVA,
  contentTypeProPriponu,
  ctiR2Nastaveni,
  klicCestaSnimku,
  klicZVerejneUrl,
  posliObrazekZKlice,
  pripravObrazekKUlozeni,
  rozpoznajObrazek,
  rozdelMultipartCesta,
  smazObrazekR2Tise,
  ulozPripravenyObrazek,
  type SmerCestySnimku,
} from "./r2-fotky";
import { prostredi } from "./prostredi";


function ctiParam(req: Request, klic: string): string {
  const surova: unknown = (req.params as Record<string, unknown>)[klic];
  return typeof surova === "string" ? surova.trim() : "";
}

function naApi(
  expeditionId: string,
  radek: { id: string; sirka: number | null; vyska: number | null },
): ApiCestaSnimek {
  return {
    id: radek.id,
    url: `/api/expeditions/${expeditionId}/cesta-snimky/${radek.id}/soubor`,
    ...rozmeryDoOdpovedi(radek.sirka, radek.vyska),
  };
}

export async function nactiCestaSnimky(
  db: Db,
  expeditionId: string,
): Promise<{ cestaTam: ApiCestaSnimek[]; cestaZpet: ApiCestaSnimek[] }> {
  const radky = await db
    .select({
      id: expediceCestaSnimky.id,
      url: expediceCestaSnimky.url,
      smer: expediceCestaSnimky.smer,
      sirka: expediceCestaSnimky.sirka,
      vyska: expediceCestaSnimky.vyska,
    })
    .from(expediceCestaSnimky)
    .where(eq(expediceCestaSnimky.expeditionId, expeditionId))
    .orderBy(asc(expediceCestaSnimky.createdAt), asc(expediceCestaSnimky.id));
  const cestaTam: ApiCestaSnimek[] = [];
  const cestaZpet: ApiCestaSnimek[] = [];
  for (const radek of radky) {
    const api = naApi(expeditionId, radek);
    if (radek.smer === "zpet") cestaZpet.push(api);
    else if (radek.smer === "tam") cestaTam.push(api);
  }
  return { cestaTam, cestaZpet };
}

/** Best-effort R2 delete before the expedition row (and these rows) go away. */
export async function smazSnimkyVypravy(db: Db, expeditionId: string): Promise<void> {
  const radky = await db
    .select({ url: expediceCestaSnimky.url })
    .from(expediceCestaSnimky)
    .where(eq(expediceCestaSnimky.expeditionId, expeditionId));
  const nastaveni = ctiR2Nastaveni(prostredi());
  if (nastaveni === null) return;
  await Promise.all(
    radky.map(async (radek) => {
      const klic = klicZVerejneUrl(radek.url, nastaveni.publicBaseUrl);
      if (klic === null) return;
      await smazObrazekR2Tise(nastaveni, klic);
    }),
  );
}

function hlaska(duvod: string): string {
  if (duvod === "velikost") return "Snímek může mít nejvýš 8 MB.";
  if (duvod === "format") return "Snímek musí být JPG, PNG nebo WebP.";
  if (duvod === "pocet") return "Na jeden směr jde nahrát nejvýš 8 snímků.";
  if (duvod === "smer") return "Vyber cestu tam, nebo cestu zpátky.";
  return "Vyber aspoň jeden snímek.";
}

export function registrujCestaSnimky(app: Express): void {
  app.get("/api/expeditions/:id/cesta-snimky/:snimekId/soubor", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const id = ctiParam(req, "id");
      const snimekId = ctiParam(req, "snimekId");
      if (id.length === 0 || snimekId.length === 0) {
        posliChybu(res, "NENALEZENO", "Snímek nenalezen.");
        return;
      }
      try {
        const db = getDb();
        const nalezene = await db
          .select({ url: expediceCestaSnimky.url })
          .from(expediceCestaSnimky)
          .where(and(eq(expediceCestaSnimky.id, snimekId), eq(expediceCestaSnimky.expeditionId, id)))
          .limit(1);
        const radek = nalezene[0];
        const nastaveni = ctiR2Nastaveni(prostredi());
        const klic =
          radek === undefined || nastaveni === null
            ? null
            : klicZVerejneUrl(radek.url, nastaveni.publicBaseUrl);
        if (klic === null || nastaveni === null) {
          posliChybu(res, "NENALEZENO", "Snímek nenalezen.");
          return;
        }
        await posliObrazekZKlice(res, nastaveni, klic, chceNahled(req));
      } catch {
        if (!res.headersSent) posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
      }
    })();
  });

  app.post("/api/expeditions/:id/cesta-snimky", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
          return;
        }
        const contentType = req.header("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            soubor: ["Vyber aspoň jeden snímek."],
          });
          return;
        }
        const nastaveni = ctiR2Nastaveni(prostredi());
        if (nastaveni === null) {
          posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
          return;
        }
        let telo: Buffer;
        try {
          telo = await ctiSuroveTelo(req, CESTA_NAHRANI_MAX_BAJTU);
        } catch {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            soubor: ["Snímek může mít nejvýš 8 MB."],
          });
          return;
        }
        const rozdelene = rozdelMultipartCesta(telo, contentType);
        if (!rozdelene.ok) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            soubor: [hlaska(rozdelene.duvod)],
          });
          return;
        }
        const smer: SmerCestySnimku = rozdelene.smer;
        try {
          const db = getDb();
          const vyprava = await db
            .select({ id: expeditions.id })
            .from(expeditions)
            .where(eq(expeditions.id, id))
            .limit(1);
          if (vyprava.length === 0) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          const ulozene = await db
            .select({ id: expediceCestaSnimky.id })
            .from(expediceCestaSnimky)
            .where(
              and(eq(expediceCestaSnimky.expeditionId, id), eq(expediceCestaSnimky.smer, smer)),
            );
          if (ulozene.length + rozdelene.fotky.length > CESTA_SNIMKU_NA_SMER) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: ["Na jeden směr jde nahrát nejvýš 8 snímků."],
            });
            return;
          }
          for (const fotka of rozdelene.fotky) {
            if (!(await maBezpecneRozmery(fotka.bajty))) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                soubor: [OBRAZEK_PRILIS_VELKY],
              });
              return;
            }
          }
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          const nahrane: string[] = [];
          const vlozene: string[] = [];
          try {
            for (const fotka of rozdelene.fotky) {
              const pripona = rozpoznajObrazek(fotka.bajty);
              if (pripona === null) throw new Error("format");
              const idSouboru = randomUUID();
              const pripraveno = await pripravObrazekKUlozeni(
                fotka.bajty,
                contentTypeProPriponu(pripona),
                pripona,
                "plna",
                (ext) =>
                  ext === "jpg" || ext === "png" || ext === "webp"
                    ? klicCestaSnimku(id, smer, ext, idSouboru)
                    : null,
              );
              if (pripraveno === null) throw new Error("klic");
              const rozmery = await rozmeryUlozenychBajtu(pripraveno.bajty);
              const url = await ulozPripravenyObrazek(nastaveni, pripraveno);
              nahrane.push(pripraveno.klic);
              const radky = await db
                .insert(expediceCestaSnimky)
                .values({
                  expeditionId: id,
                  smer,
                  url,
                  uploadedBy: uzivatel.id,
                  sirka: rozmery?.sirka ?? null,
                  vyska: rozmery?.vyska ?? null,
                })
                .returning({ id: expediceCestaSnimky.id });
              const novy = radky[0];
              if (novy !== undefined) vlozene.push(novy.id);
            }
          } catch (chyba) {
            await Promise.all(nahrane.map((klic) => smazObrazekR2Tise(nastaveni, klic)));
            if (vlozene.length > 0) {
              await db
                .delete(expediceCestaSnimky)
                .where(inArray(expediceCestaSnimky.id, vlozene))
                .catch(() => undefined);
            }
            throw chyba;
          }
          const prehled = await nactiCestaSnimky(db, id);
          res.status(201).json(smer === "tam" ? { snimky: prehled.cestaTam } : { snimky: prehled.cestaZpet });
        } catch {
          posliChybu(res, "VNITRNI_CHYBA", "Snímky se nepodařilo uložit. Zkus to znovu.");
        }
      })();
    });
  });

  app.delete("/api/expeditions/:id/cesta-snimky/:snimekId", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        const snimekId = ctiParam(req, "snimekId");
        if (id.length === 0 || snimekId.length === 0) {
          posliChybu(res, "NENALEZENO", "Snímek nenalezen.");
          return;
        }
        try {
          const db = getDb();
          const nalezene = await db
            .select()
            .from(expediceCestaSnimky)
            .where(
              and(eq(expediceCestaSnimky.id, snimekId), eq(expediceCestaSnimky.expeditionId, id)),
            )
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined) {
            posliChybu(res, "NENALEZENO", "Snímek nenalezen.");
            return;
          }
          const nastaveni = ctiR2Nastaveni(prostredi());
          if (nastaveni !== null) {
            const klic = klicZVerejneUrl(radek.url, nastaveni.publicBaseUrl);
            if (klic !== null) await smazObrazekR2Tise(nastaveni, klic);
          }
          await db.delete(expediceCestaSnimky).where(eq(expediceCestaSnimky.id, radek.id));
          res.json({ ok: true });
        } catch {
          posliChybu(res, "VNITRNI_CHYBA", "Snímek se nepodařilo smazat. Zkus to znovu.");
        }
      })();
    });
  });
}
