/**
 * Songbook HTTP API. Published songs are the book. Proposals stay in the queue.
 * Rejection deletes the row and sends no message.
 */
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { zpevnikPisne } from "../../drizzle/schema/zpevnik_pisne";
import {
  seradPisne,
  type ApiZpevnikNavrh,
  type ApiZpevnikPisen,
  type ProblemPisne,
  type TeloPisne,
  overVstupPisne,
  navrhZeStranky,
} from "../../src/shared/zpevnik";
import { type AutentizovanyRequest, vyzadujPrihlaseni } from "./auth";
import { posliChybu } from "./chyby";
import { getDb } from "./db";
import {
  ctiR2Nastaveni,
  FOTKY_NEJSOU_NASTAVENE_ZPRAVA,
  klicZVerejneUrl,
  pripravObrazekKUlozeni,
  rozpoznajObrazek,
  smazObrazekR2Tise,
  ulozPripravenyObrazek,
} from "./r2-fotky";
import { maBezpecneRozmery, OBRAZEK_PRILIS_VELKY } from "./obrazek-nahled";
import { jePdf, FOTKA_NAHRANI_MAX_BAJTU, PDF_MAX_BAJTU, textyZPdf, textZFotky } from "./zpevnik-import";
import { ctiSuroveTelo } from "./zprava-prilohy";
import {
  hlaskyVstupu,
  jeKolizeVydane,
  smiSmazatVydanou,
  smiSchvalit,
  smiUpravitNavrh,
  smiUpravitVydanou,
  vidiNavrh,
  type UcetZpevniku,
} from "./zpevnik-pristup";
import { prostredi } from "./prostredi";


const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROBLEMY: readonly ProblemPisne[] = [
  "chybi_autor",
  "chybi_text",
  "spatne_akordy",
  "duplicita",
];

type RadekPisne = typeof zpevnikPisne.$inferSelect;

function ctiParam(req: Request, klic: string): string {
  const surova: unknown = (req.params as Record<string, unknown>)[klic];
  return typeof surova === "string" ? surova.trim() : "";
}

function ucetZ(req: Request): UcetZpevniku {
  const uzivatel = (req as AutentizovanyRequest).uzivatel;
  return {
    id: uzivatel.id,
    isAdmin: uzivatel.isAdmin,
    isSuperadmin: uzivatel.isSuperadmin,
    funkce: uzivatel.funkce,
  };
}

function jeUuid(hodnota: string): boolean {
  return UUID.test(hodnota);
}

function jeUnikatniKolize(chyba: unknown): boolean {
  if (typeof chyba !== "object" || chyba === null) return false;
  const zaznam = chyba as { code?: unknown; cause?: unknown };
  if (zaznam.code === "23505") return true;
  const pricina: unknown = zaznam.cause;
  if (typeof pricina === "object" && pricina !== null) {
    return (pricina as { code?: unknown }).code === "23505";
  }
  return false;
}

function problemZ(hodnota: string | null): ProblemPisne | null {
  if (hodnota === null) return null;
  for (const problem of PROBLEMY) {
    if (problem === hodnota) return problem;
  }
  return null;
}

function naVerejnou(radek: RadekPisne): ApiZpevnikPisen {
  return {
    id: radek.id,
    nazev: radek.nazev,
    autor: radek.autor,
    telo: radek.telo,
    schvalenoAt: radek.schvalenoAt === null ? null : radek.schvalenoAt.toISOString(),
  };
}

function naNavrh(radek: RadekPisne): ApiZpevnikNavrh {
  return {
    id: radek.id,
    nazev: radek.nazev,
    autor: radek.autor,
    telo: radek.telo,
    problem: problemZ(radek.problem),
    nahledUrl: radek.nahledUrl,
    navrhovatelId: radek.navrhovatelId,
    createdAt: radek.createdAt.toISOString(),
    updatedAt: radek.updatedAt.toISOString(),
  };
}

async function vydaneKlice(): Promise<{ id: string; parKlic: string }[]> {
  const db = getDb();
  return db
    .select({ id: zpevnikPisne.id, parKlic: zpevnikPisne.parKlic })
    .from(zpevnikPisne)
    .where(eq(zpevnikPisne.stav, "schvalena"));
}

function posliValidaci(res: Response, duvod: Parameters<typeof hlaskyVstupu>[0]): void {
  posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", hlaskyVstupu(duvod));
}

function vnitrni(res: Response): void {
  if (!res.headersSent) {
    posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
  }
}

async function smazNahled(url: string | null): Promise<void> {
  if (url === null || url.length === 0) return;
  const nastaveni = ctiR2Nastaveni(prostredi());
  if (nastaveni === null) return;
  const klic = klicZVerejneUrl(url, nastaveni.publicBaseUrl);
  if (klic === null) return;
  await smazObrazekR2Tise(nastaveni, klic);
}

const OBSAH_OBRAZKU = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export function registrujZpevnik(app: Express): void {
  app.post("/api/zpevnik/import", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        if (!smiSchvalit(ucetZ(req))) {
          posliChybu(res, "ZAKAZANO", "Soubor může nahrát jen vedení nebo admin.");
          return;
        }
        let bajty: Buffer;
        try {
          bajty = await ctiSuroveTelo(req, PDF_MAX_BAJTU);
        } catch {
          posliChybu(res, "VALIDATION_ERROR", "PDF může mít nejvýš 40 MB.", {
            soubor: ["PDF může mít nejvýš 40 MB."],
          });
          return;
        }
        if (bajty.length === 0) {
          posliChybu(res, "VALIDATION_ERROR", "Soubor dorazil prázdný. Zkus ho nahrát znovu.", {
            soubor: ["Soubor dorazil prázdný. Zkus ho nahrát znovu."],
          });
          return;
        }
        const pdf = jePdf(bajty);
        const obrazek = pdf ? null : rozpoznajObrazek(bajty);
        if (obrazek === null && !pdf) {
          posliChybu(res, "VALIDATION_ERROR", "Nahraj PDF nebo fotku JPG, PNG či WebP.", {
            soubor: ["Nahraj PDF nebo fotku JPG, PNG či WebP."],
          });
          return;
        }
        if (!pdf && bajty.length > FOTKA_NAHRANI_MAX_BAJTU) {
          posliChybu(res, "VALIDATION_ERROR", "Fotka může mít nejvýš 20 MB.", {
            soubor: ["Fotka může mít nejvýš 20 MB."],
          });
          return;
        }
        if (obrazek !== null && !(await maBezpecneRozmery(bajty))) {
          posliChybu(res, "VALIDATION_ERROR", OBRAZEK_PRILIS_VELKY, {
            soubor: [OBRAZEK_PRILIS_VELKY],
          });
          return;
        }
        const nastaveni = ctiR2Nastaveni(prostredi());
        if (obrazek !== null && nastaveni === null) {
          posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
          return;
        }
        let texty: string[];
        if (pdf) {
          try {
            texty = await textyZPdf(bajty);
          } catch (chyba: unknown) {
            const zprava = chyba instanceof Error ? chyba.message : "";
            console.error("zpevnik import pdf:", zprava);
            posliChybu(res, "VALIDATION_ERROR", "PDF se nepodařilo přečíst.", {
              soubor: ["PDF se nepodařilo přečíst."],
            });
            return;
          }
        } else {
          try {
            texty = [await textZFotky(bajty)];
          } catch (chyba: unknown) {
            const zprava = chyba instanceof Error ? chyba.message : "";
            console.error("zpevnik import fotka:", zprava);
            texty = [""];
          }
        }
        if (texty.length === 0) {
          posliChybu(res, "VALIDATION_ERROR", "V souboru není žádná stránka.", {
            soubor: ["V souboru není žádná stránka."],
          });
          return;
        }
        try {
          const ucet = ucetZ(req);
          const db = getDb();
          const vydane = (await vydaneKlice()).map((radek) => radek.parKlic);
          const navrhy: ApiZpevnikNavrh[] = [];
          for (const textStranky of texty) {
            const navrh = navrhZeStranky(textStranky, vydane);
            const id = randomUUID();
            let nahledUrl: string | null = null;
            if (obrazek !== null && nastaveni !== null) {
              const pripraveno = await pripravObrazekKUlozeni(
                bajty,
                OBSAH_OBRAZKU[obrazek],
                obrazek,
                "zpevnik",
                (ext) =>
                  ext === "jpg" || ext === "png" || ext === "webp"
                    ? `zpevnik/navrhy/${id}.${ext}`
                    : null,
              );
              if (pripraveno === null) throw new Error("klic");
              nahledUrl = await ulozPripravenyObrazek(nastaveni, pripraveno);
            }
            const vlozene = await db
              .insert(zpevnikPisne)
              .values({
                id,
                nazev: navrh.nazev,
                autor: navrh.autor,
                parKlic: navrh.parKlic,
                telo: navrh.telo,
                stav: "navrh",
                navrhovatelId: ucet.id,
                nahledUrl,
                problem: navrh.problem,
              })
              .returning();
            const radek = vlozene[0];
            if (radek !== undefined) navrhy.push(naNavrh(radek));
          }
          res.status(201).json({ navrhy });
        } catch (chyba: unknown) {
          const zprava = chyba instanceof Error ? chyba.message : "neznama";
          console.error("zpevnik import ulozeni:", zprava);
          vnitrni(res);
        }
      })();
    });
  });

  app.get("/api/zpevnik", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        try {
          const db = getDb();
          const radky = await db
            .select({
              id: zpevnikPisne.id,
              nazev: zpevnikPisne.nazev,
              autor: zpevnikPisne.autor,
              telo: zpevnikPisne.telo,
              schvalenoAt: zpevnikPisne.schvalenoAt,
            })
            .from(zpevnikPisne)
            .where(eq(zpevnikPisne.stav, "schvalena"));
          const pisne = seradPisne(
            radky.map((radek) => ({
              id: radek.id,
              nazev: radek.nazev,
              autor: radek.autor,
              telo: radek.telo,
              schvalenoAt:
                radek.schvalenoAt === null ? null : radek.schvalenoAt.toISOString(),
            })),
          );
          res.json({ pisne });
        } catch {
          vnitrni(res);
        }
      })();
    });
  });

  app.get("/api/zpevnik/navrhy", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        try {
          const ucet = ucetZ(req);
          const db = getDb();
          const radky = await db
            .select()
            .from(zpevnikPisne)
            .where(eq(zpevnikPisne.stav, "navrh"))
            .orderBy(desc(zpevnikPisne.createdAt));
          const navrhy = radky
            .filter((radek) => vidiNavrh(ucet, radek.navrhovatelId))
            .map(naNavrh);
          res.json({ navrhy });
        } catch {
          vnitrni(res);
        }
      })();
    });
  });

  app.get("/api/zpevnik/navrhy/:id", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
          return;
        }
        try {
          const ucet = ucetZ(req);
          const db = getDb();
          const nalezene = await db
            .select()
            .from(zpevnikPisne)
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "navrh")))
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined || !vidiNavrh(ucet, radek.navrhovatelId)) {
            posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
            return;
          }
          res.json({ navrh: naNavrh(radek) });
        } catch {
          vnitrni(res);
        }
      })();
    });
  });

  app.post("/api/zpevnik/navrhy", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const vstup = overVstupPisne(req.body);
        if (!vstup.ok) {
          posliValidaci(res, vstup.duvod);
          return;
        }
        try {
          const ucet = ucetZ(req);
          const vydane = await vydaneKlice();
          if (jeKolizeVydane(vstup.hodnota.parKlic, vydane)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          const db = getDb();
          const vlozene = await db
            .insert(zpevnikPisne)
            .values({
              nazev: vstup.hodnota.nazev,
              autor: vstup.hodnota.autor,
              parKlic: vstup.hodnota.parKlic,
              telo: vstup.hodnota.telo,
              stav: "navrh",
              navrhovatelId: ucet.id,
              problem: null,
            })
            .returning();
          const radek = vlozene[0];
          if (radek === undefined) {
            vnitrni(res);
            return;
          }
          res.status(201).json({ navrh: naNavrh(radek) });
        } catch (chyba: unknown) {
          if (jeUnikatniKolize(chyba)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          vnitrni(res);
        }
      })();
    });
  });

  app.patch("/api/zpevnik/navrhy/:id", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
          return;
        }
        const vstup = overVstupPisne(req.body);
        if (!vstup.ok) {
          posliValidaci(res, vstup.duvod);
          return;
        }
        try {
          const ucet = ucetZ(req);
          const db = getDb();
          const nalezene = await db
            .select()
            .from(zpevnikPisne)
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "navrh")))
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined || !smiUpravitNavrh(ucet, radek.navrhovatelId)) {
            posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
            return;
          }
          const vydane = await vydaneKlice();
          if (jeKolizeVydane(vstup.hodnota.parKlic, vydane)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          const ulozene = await db
            .update(zpevnikPisne)
            .set({
              nazev: vstup.hodnota.nazev,
              autor: vstup.hodnota.autor,
              parKlic: vstup.hodnota.parKlic,
              telo: vstup.hodnota.telo,
              problem: null,
              updatedAt: new Date(),
            })
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "navrh")))
            .returning();
          const novy = ulozene[0];
          if (novy === undefined) {
            posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
            return;
          }
          res.json({ navrh: naNavrh(novy) });
        } catch (chyba: unknown) {
          if (jeUnikatniKolize(chyba)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          vnitrni(res);
        }
      })();
    });
  });

  app.delete("/api/zpevnik/navrhy/:id", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
          return;
        }
        try {
          const ucet = ucetZ(req);
          const db = getDb();
          const nalezene = await db
            .select()
            .from(zpevnikPisne)
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "navrh")))
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined || !vidiNavrh(ucet, radek.navrhovatelId)) {
            posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
            return;
          }
          await smazNahled(radek.nahledUrl);
          await db
            .delete(zpevnikPisne)
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "navrh")));
          res.json({ ok: true });
        } catch {
          vnitrni(res);
        }
      })();
    });
  });

  app.post("/api/zpevnik/navrhy/:id/schvalit", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
          return;
        }
        const ucet = ucetZ(req);
        if (!smiSchvalit(ucet)) {
          posliChybu(res, "ZAKAZANO", "Návrh může zveřejnit jen vedení nebo admin.");
          return;
        }
        try {
          const db = getDb();
          const nalezene = await db
            .select()
            .from(zpevnikPisne)
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "navrh")))
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined) {
            posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
            return;
          }
          const kontrola = overVstupPisne({
            nazev: radek.nazev,
            autor: radek.autor,
            telo: radek.telo,
          });
          if (!kontrola.ok || radek.problem !== null) {
            posliChybu(res, "VALIDATION_ERROR", "Píseň ještě nejde zveřejnit.", {
              telo: ["Doplň název, autora a text, ať jdou akordy přečíst."],
            });
            return;
          }
          const vydane = await vydaneKlice();
          if (jeKolizeVydane(kontrola.hodnota.parKlic, vydane)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          await smazNahled(radek.nahledUrl);
          const ulozene = await db
            .update(zpevnikPisne)
            .set({
              stav: "schvalena",
              schvalilId: ucet.id,
              schvalenoAt: new Date(),
              problem: null,
              nahledUrl: null,
              nazev: kontrola.hodnota.nazev,
              autor: kontrola.hodnota.autor,
              parKlic: kontrola.hodnota.parKlic,
              telo: kontrola.hodnota.telo,
              updatedAt: new Date(),
            })
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "navrh")))
            .returning();
          const nova = ulozene[0];
          if (nova === undefined) {
            posliChybu(res, "NENALEZENO", "Návrh nenalezen.");
            return;
          }
          res.json({ pisen: naVerejnou(nova) });
        } catch (chyba: unknown) {
          if (jeUnikatniKolize(chyba)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          vnitrni(res);
        }
      })();
    });
  });

  app.get("/api/zpevnik/:id", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Píseň nenalezena.");
          return;
        }
        try {
          const db = getDb();
          const nalezene = await db
            .select()
            .from(zpevnikPisne)
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "schvalena")))
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined) {
            posliChybu(res, "NENALEZENO", "Píseň nenalezena.");
            return;
          }
          const pisen: ApiZpevnikPisen = naVerejnou(radek);
          res.json({ pisen });
        } catch {
          vnitrni(res);
        }
      })();
    });
  });

  app.patch("/api/zpevnik/:id", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const ucet = ucetZ(req);
        if (!smiUpravitVydanou(ucet)) {
          posliChybu(res, "ZAKAZANO", "Vydanou píseň může upravit jen vedení nebo admin.");
          return;
        }
        const id = ctiParam(req, "id");
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Píseň nenalezena.");
          return;
        }
        const vstup = overVstupPisne(req.body);
        if (!vstup.ok) {
          posliValidaci(res, vstup.duvod);
          return;
        }
        try {
          const vydane = await vydaneKlice();
          if (jeKolizeVydane(vstup.hodnota.parKlic, vydane, id)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          const db = getDb();
          const ulozene = await db
            .update(zpevnikPisne)
            .set({
              nazev: vstup.hodnota.nazev,
              autor: vstup.hodnota.autor,
              parKlic: vstup.hodnota.parKlic,
              telo: vstup.hodnota.telo,
              updatedAt: new Date(),
            })
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "schvalena")))
            .returning();
          const radek = ulozene[0];
          if (radek === undefined) {
            posliChybu(res, "NENALEZENO", "Píseň nenalezena.");
            return;
          }
          res.json({ pisen: naVerejnou(radek) });
        } catch (chyba: unknown) {
          if (jeUnikatniKolize(chyba)) {
            posliChybu(res, "PISEN_UZ_JE", "Tahle píseň už ve zpěvníku je.");
            return;
          }
          vnitrni(res);
        }
      })();
    });
  });

  app.delete("/api/zpevnik/:id", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const ucet = ucetZ(req);
        if (!smiSmazatVydanou(ucet)) {
          posliChybu(res, "ZAKAZANO", "Vydanou píseň může smazat jen vedení nebo admin.");
          return;
        }
        const id = ctiParam(req, "id");
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Píseň nenalezena.");
          return;
        }
        try {
          const db = getDb();
          const smazane = await db
            .delete(zpevnikPisne)
            .where(and(eq(zpevnikPisne.id, id), eq(zpevnikPisne.stav, "schvalena")))
            .returning({ id: zpevnikPisne.id });
          if (smazane.length === 0) {
            posliChybu(res, "NENALEZENO", "Píseň nenalezena.");
            return;
          }
          res.json({ ok: true });
        } catch {
          vnitrni(res);
        }
      })();
    });
  });
}

export type { TeloPisne };
