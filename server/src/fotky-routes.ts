/**
 * Expedition photo HTTP routes. Albums stay in alba-routes.ts.
 */

import {
  and,
  asc,
  eq,
  isNull,
  ne,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import type {
  ApiFotka,
  FotkyListResponse,
  NastavitNahledResponse,
  PridatFotkuResponse,
  SmazatFotkuResponse,
} from "../../src/shared/api-types";
import {
  vyzadujAdmina,
  vyzadujPrihlaseni,
  type AutentizovanyRequest,
} from "./auth";
import {
  posliChybu,
  vnitrniChyba,
} from "./chyby";
import {
  FOTKA_TELO_MAX_BAJTU,
  FOTKY_NEJSOU_NASTAVENE_ZPRAVA,
  contentTypeProPriponu,
  ctiR2Nastaveni,
  klicFotky,
  klicZVerejneUrl,
  posliObrazekZKlice,
  pripravObrazekKUlozeni,
  rozpoznajObrazek,
  rozdelMultipart,
  smazObrazekR2Tise,
  ulozPripravenyObrazek,
  type ChybaSouboru,
} from "./r2-fotky";
import {
  chceNahled,
  maBezpecneRozmery,
  OBRAZEK_PRILIS_VELKY,
  rozmeryDoOdpovedi,
  rozmeryUlozenychBajtu,
} from "./obrazek-nahled";
import {
  getDb,
} from "./db";
import {
  validujFotku,
} from "./validace";
import {
  lzeDoplnitArchiv,
} from "./vyprava-termin";
import {
  expeditions,
} from "../../drizzle/schema/expeditions";
import {
  photos,
  type Photo,
} from "../../drizzle/schema/photos";
import {
  softSmazFotku,
} from "./fotky-trash";

import {
  ctiIdVypravy,
  ctiSuroveTelo,
} from "./bff-sdilene";
import { prostredi } from "./prostredi";


export function registrujFotkyVyprav(app: Express): void {
  /* ------------------------------------------------------------------ */
  /* Krok 6 — Fotky k uzavřené výpravě (minimum Fáze 2: URL režim).       */
  /* Storage rozhodnutí (src/config/storage.ts): žádný Cloudinary /       */
  /* Supabase klíč není → ukládá se jen veřejná https:// URL do `photos`  */
  /* (nikdy blob). Pozdější Neon Object Storage (bucket                    */
  /* `expedition-photos`, `public_read`) použije stejné endpointy —        */
  /* kontrakt se nemění. Matice: GET = PUBLIC (náhled v modalu/historii),  */
  /* POST = každý přihlášený (fotku může přidat kdokoliv z účastníků),     */
  /* DELETE = ADMIN. Zápis jen u `stav: "proběhlá"`, jinak 409               */
  /* VYPRAVA_UZAVRENA. Mazání výpravy maže i fotky (CASCADE v DB).         */
  /* ------------------------------------------------------------------ */

  /** DB řádek `photos` → veřejná `ApiFotka`. */
  function toApiFotka(radek: Photo): ApiFotka {
    return {
      id: radek.id,
      expeditionId: radek.expeditionId,
      url: radek.url,
      popis: radek.popis,
      createdAt: radek.createdAt.toISOString(),
      jeNahled: radek.jeNahled,
      ...rozmeryDoOdpovedi(radek.sirka, radek.vyska),
    };
  }

  /** `:fotkaId` z cesty — prázdné → volající vrátí 404 NENALEZENO. */
  function ctiIdFotky(req: Request): string {
    const surova: unknown = (req.params as Record<string, unknown>)["fotkaId"];
    return typeof surova === "string" ? surova.trim() : "";
  }

  /* GET /api/expeditions/:id/fotky — logged-in members only. */
  app.get("/api/expeditions/:id/fotky", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
      const id = ctiIdVypravy(req);
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
        return;
      }
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
        const radky = await db
          .select()
          .from(photos)
          .where(and(eq(photos.expeditionId, id), isNull(photos.smazanoAt)))
          .orderBy(asc(photos.createdAt));
        const telo: FotkyListResponse = { fotky: radky.map(toApiFotka) };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
      })();
      });
    })();
  });

  function hlaskaSouboru(duvod: ChybaSouboru): { pole: string; text: string } {
    switch (duvod) {
      case "velikost":
        return { pole: "soubor", text: "Fotka může mít nejvýš 8 MB." };
      case "format":
        return { pole: "soubor", text: "Vyber fotku ve formátu JPEG, PNG nebo WebP." };
      case "popis":
        return { pole: "popis", text: "Popis může mít nejvýš 500 znaků." };
      case "chybi":
        return { pole: "soubor", text: "Vyber fotku z telefonu nebo počítače." };
    }
  }

  /* POST /api/expeditions/:id/fotky — každý přihlášený, jen proběhlá. → 201. */
  /* multipart/form-data (pole `soubor` + volitelný `popis`) uloží soubor do R2. */
  /* JSON `{ url, popis }` zůstává pro starší klienty. */
  app.post("/api/expeditions/:id/fotky", (req: Request, res: Response) => {
    vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const contentType = req.header("content-type") ?? "";
        const jeSoubor = contentType.includes("multipart/form-data");
        let urlKUlozeni = "";
        let popisKUlozeni = "";
        let klicR2: string | null = null;
        let sirkaKUlozeni: number | null = null;
        let vyskaKUlozeni: number | null = null;
        const nastaveniR2 = ctiR2Nastaveni(prostredi());
        if (jeSoubor) {
          if (nastaveniR2 === null) {
            posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
            return;
          }
          let telo: Buffer;
          try {
            telo = await ctiSuroveTelo(req, FOTKA_TELO_MAX_BAJTU);
          } catch (chyba: unknown) {
            const velikost = chyba instanceof Error && chyba.message === "velikost";
            const hlaska = hlaskaSouboru(velikost ? "velikost" : "chybi");
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              [hlaska.pole]: [hlaska.text],
            });
            return;
          }
          const rozdelene = rozdelMultipart(telo, contentType);
          if (!rozdelene.ok) {
            const hlaska = hlaskaSouboru(rozdelene.duvod);
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              [hlaska.pole]: [hlaska.text],
            });
            return;
          }
          const pripona = rozpoznajObrazek(rozdelene.fotka.bajty);
          if (pripona === null) {
            const hlaska = hlaskaSouboru("format");
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              [hlaska.pole]: [hlaska.text],
            });
            return;
          }
          if (!(await maBezpecneRozmery(rozdelene.fotka.bajty))) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: [OBRAZEK_PRILIS_VELKY],
            });
            return;
          }
          popisKUlozeni = rozdelene.fotka.popis;
          const idProKlic = ctiIdVypravy(req);
          if (klicFotky(idProKlic, pripona) === null) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          let vyprava:
            | { stav: string; datum: string; datumDo: string | null }
            | undefined;
          try {
            const dbPred = getDb();
            const existuje = await dbPred
              .select({
                stav: expeditions.stav,
                datum: expeditions.datum,
                datumDo: expeditions.datumDo,
              })
              .from(expeditions)
              .where(eq(expeditions.id, idProKlic))
              .limit(1);
            vyprava = existuje[0];
          } catch {
            vnitrniChyba(res);
            return;
          }
          if (vyprava === undefined) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          if (!lzeDoplnitArchiv(vyprava)) {
            posliChybu(
              res,
              "VYPRAVA_UZAVRENA",
              "Fotky jdou přidat až po skončení výpravy.",
            );
            return;
          }
          try {
            const pripraveno = await pripravObrazekKUlozeni(
              rozdelene.fotka.bajty,
              contentTypeProPriponu(pripona),
              pripona,
              "plna",
              (ext) =>
                ext === "jpg" || ext === "png" || ext === "webp"
                  ? klicFotky(idProKlic, ext)
                  : null,
            );
            if (pripraveno === null) {
              posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
              return;
            }
            const rozmery = await rozmeryUlozenychBajtu(pripraveno.bajty);
            sirkaKUlozeni = rozmery?.sirka ?? null;
            vyskaKUlozeni = rozmery?.vyska ?? null;
            urlKUlozeni = await ulozPripravenyObrazek(nastaveniR2, pripraveno);
            klicR2 = pripraveno.klic;
          } catch {
            klicR2 = null;
            vnitrniChyba(res);
            return;
          }
        } else {
          const overeni = validujFotku(req.body as unknown);
          if (!overeni.uspech || overeni.data === null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
            return;
          }
          if (
            nastaveniR2 === null ||
            klicZVerejneUrl(overeni.data.url, nastaveniR2.publicBaseUrl) === null
          ) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              url: ["Odkaz musí vést na fotku uloženou v klubu."],
            });
            return;
          }
          urlKUlozeni = overeni.data.url;
          popisKUlozeni = overeni.data.popis;
        }
        const id = ctiIdVypravy(req);
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
          return;
        }
        try {
          const db = getDb();
          const nalezene = await db
            .select()
            .from(expeditions)
            .where(eq(expeditions.id, id))
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          if (
            !lzeDoplnitArchiv({
              stav: radek.stav,
              datum: radek.datum,
              datumDo: radek.datumDo,
            })
          ) {
            posliChybu(
              res,
              "VYPRAVA_UZAVRENA",
              "Fotky jdou přidat až po skončení výpravy.",
            );
            return;
          }
          const adminId = (req as AutentizovanyRequest).uzivatel.id;
          const vlozene = await db
            .insert(photos)
            .values({
              expeditionId: id,
              url: urlKUlozeni,
              popis: popisKUlozeni,
              uploadedBy: adminId,
              sirka: sirkaKUlozeni,
              vyska: vyskaKUlozeni,
            })
            .returning();
          const nove = vlozene[0];
          if (nove === undefined) throw new Error("prázdný returning");
          const telo: PridatFotkuResponse = { fotka: toApiFotka(nove) };
          res.status(201).json(telo);
        } catch {
          if (klicR2 !== null && nastaveniR2 !== null) {
            await smazObrazekR2Tise(nastaveniR2, klicR2);
          }
          vnitrniChyba(res);
        }
      })();
    });
  });

  /* DELETE /api/expeditions/:id/fotky/:fotkaId — jen ADMIN (soft-delete → Koš). */
  app.delete("/api/expeditions/:id/fotky/:fotkaId", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiIdVypravy(req);
        const fotkaId = ctiIdFotky(req);
        if (id.length === 0 || fotkaId.length === 0) {
          posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
          return;
        }
        try {
          const db = getDb();
          const nalezene = await db
            .select()
            .from(photos)
            .where(and(eq(photos.id, fotkaId), eq(photos.expeditionId, id)))
            .limit(1);
          const puvodni = nalezene[0];
          if (puvodni === undefined || puvodni.smazanoAt !== null) {
            posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
            return;
          }
          const uspech = await softSmazFotku(db, { druh: "vyprava", radek: puvodni });
          if (!uspech) {
            posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
            return;
          }
          const telo: SmazatFotkuResponse = { ok: true };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  /* GET /api/expeditions/:id/fotky/:fotkaId/soubor — logged-in members.
     Our R2 object is streamed with server credentials. Trash and a foreign
     URL are 404. Secrets and object keys are not logged. */
  app.get("/api/expeditions/:id/fotky/:fotkaId/soubor", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
      const id = ctiIdVypravy(req);
      const fotkaId = ctiIdFotky(req);
      if (id.length === 0 || fotkaId.length === 0) {
        posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
        return;
      }
      try {
        const db = getDb();
        const nalezene = await db
          .select({ url: photos.url })
          .from(photos)
          .where(and(eq(photos.id, fotkaId), eq(photos.expeditionId, id), isNull(photos.smazanoAt)))
          .limit(1);
        const radek = nalezene[0];
        if (radek === undefined) {
          posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
          return;
        }
        const nastaveniR2 = ctiR2Nastaveni(prostredi());
        const klic =
          nastaveniR2 === null ? null : klicZVerejneUrl(radek.url, nastaveniR2.publicBaseUrl);
        if (klic === null || nastaveniR2 === null) {
          posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
          return;
        }
        await posliObrazekZKlice(res, nastaveniR2, klic, chceNahled(req));
      } catch {
        vnitrniChyba(res);
      }
      })();
      });
    })();
  });

  /* POST /api/expeditions/:id/fotky/:fotkaId/nahled — jen ADMIN, jen proběhlá.
     Sets this photo, then clears every other highlight of the same expedition. */
  app.post("/api/expeditions/:id/fotky/:fotkaId/nahled", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiIdVypravy(req);
        const fotkaId = ctiIdFotky(req);
        if (id.length === 0 || fotkaId.length === 0) {
          posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
          return;
        }
        try {
          const db = getDb();
          const vypravy = await db
            .select({
              id: expeditions.id,
              stav: expeditions.stav,
              datum: expeditions.datum,
              datumDo: expeditions.datumDo,
            })
            .from(expeditions)
            .where(eq(expeditions.id, id))
            .limit(1);
          const vyprava = vypravy[0];
          if (vyprava === undefined) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          if (!lzeDoplnitArchiv(vyprava)) {
            posliChybu(
              res,
              "VYPRAVA_UZAVRENA",
              "Náhled jde vybrat až po skončení výpravy.",
            );
            return;
          }
          const existuje = await db
            .select({ id: photos.id })
            .from(photos)
            .where(and(eq(photos.id, fotkaId), eq(photos.expeditionId, id)))
            .limit(1);
          if (existuje.length === 0) {
            posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
            return;
          }
          const nastavene = await db
            .update(photos)
            .set({ jeNahled: true })
            .where(and(eq(photos.id, fotkaId), eq(photos.expeditionId, id)))
            .returning({ id: photos.id });
          if (nastavene.length === 0) {
            posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
            return;
          }
          await db
            .update(photos)
            .set({ jeNahled: false })
            .where(and(eq(photos.expeditionId, id), ne(photos.id, fotkaId)));
          const radky = await db
            .select()
            .from(photos)
            .where(eq(photos.expeditionId, id))
            .orderBy(asc(photos.createdAt));
          const telo: NastavitNahledResponse = {
            fotkaId,
            fotky: radky.map(toApiFotka),
          };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });
}
