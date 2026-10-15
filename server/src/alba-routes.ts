/**
 * Album HTTP routes. Expedition albums read and write `photos`.
 * Extra albums read and write `alba` / `alba_fotky`.
 * Migration 0013 is not applied from here.
 */
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type {
  AlbaListResponse,
  AlbumFotkyResponse,
  ApiAlbumFotka,
  PridatAlbumFotkyResponse,
  SmazatAlbumFotkuResponse,
  SmazatAlbumResponse,
  VytvoritAlbumResponse,
} from "../../src/shared/api-types";
import { alba, albaFotky } from "../../drizzle/schema/alba";
import { expeditions } from "../../drizzle/schema/expeditions";
import { photos } from "../../drizzle/schema/photos";
import {
  albumKos,
  jeVypravaSViditelnymAlbem,
  rozhodniSmazaniAlba,
  sestavSeznamAlb,
  validujNazevAlba,
  type AlbumFotkaZdroj,
} from "./alba";
import {
  ctiVolitelnehoUzivatele,
  type AutentizovanyRequest,
  vyzadujAdmina,
  vyzadujPrihlaseni,
} from "./auth";
import { posliChybu } from "./chyby";
import { getDb } from "./db";
import { jeAlbumKos } from "../../src/shared/fotky-kos";
import {
  fotkaVlastniApi,
  fotkaVypravyApi,
  najdiFotkuVKosi,
  obnovFotku,
  purgeExpiredTrashPhotos,
  softSmazFotku,
  trvaleSmazFotku,
} from "./fotky-trash";
import {
  ALBUM_FOTEK_NAJEDNOU,
  ALBUM_NAHRANI_MAX_BAJTU,
  FOTKY_NEJSOU_NASTAVENE_ZPRAVA,
  contentTypeProPriponu,
  ctiR2Nastaveni,
  klicAlbaFotky,
  klicFotky,
  klicZVerejneUrl,
  nactiObjektR2,
  rozpoznajObrazek,
  rozdelMultipartSoubory,
  smazObjektR2,
  ulozFotkuDoR2,
  type ChybaSouboru,
  type ChybaSouboruAlba,
  type R2Nastaveni,
} from "./r2-fotky";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VYPRAVA_UZAVRENA_ZPRAVA =
  "Fotky jdou přidat až k proběhlé výpravě. Nejdřív ji uzavři s docházkou.";

function jeUuid(id: string): boolean {
  return UUID_RE.test(id);
}

function ctiParam(req: Request, klic: string): string {
  const surova: unknown = (req.params as Record<string, unknown>)[klic];
  return typeof surova === "string" ? surova.trim() : "";
}

function vnitrniChyba(res: Response): void {
  posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
}

const FOTKA_V_KOSI_NENALEZENA = "Fotka v koši není.";

/** Retention purge must not break album or trash listing. */
async function purgeKosBestEffort(db: ReturnType<typeof getDb>): Promise<void> {
  try {
    await purgeExpiredTrashPhotos(db, ctiR2Nastaveni(process.env));
  } catch {
    // R2 or DB errors during lazy purge should not block reads.
  }
}

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

function posliChybuSouboru(res: Response, duvod: ChybaSouboruAlba): void {
  if (duvod === "pocet") {
    posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
      soubor: [`Najednou jde nahrát nejvýš ${ALBUM_FOTEK_NAJEDNOU} fotek.`],
    });
    return;
  }
  const hlaska = hlaskaSouboru(duvod);
  posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
    [hlaska.pole]: [hlaska.text],
  });
}

function ctiSuroveTelo(req: Request, maxBajtu: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const kusy: Buffer[] = [];
    let nacteno = 0;
    req.on("data", (dil: Buffer) => {
      nacteno += dil.length;
      if (nacteno > maxBajtu) {
        reject(new Error("velikost"));
        req.destroy();
        return;
      }
      kusy.push(dil);
    });
    req.on("end", () => resolve(Buffer.concat(kusy)));
    req.on("error", () => reject(new Error("cteni")));
  });
}

function jeVnejsiHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.username.length === 0 && parsed.password.length === 0;
  } catch {
    return false;
  }
}

function zdrojVypravy(radek: {
  id: string;
  expeditionId: string;
  jeNahled: boolean;
  createdAt: Date;
}): AlbumFotkaZdroj {
  return {
    id: radek.id,
    parentId: radek.expeditionId,
    jeNahled: radek.jeNahled,
    createdAt: radek.createdAt,
  };
}

function zdrojVlastni(radek: {
  id: string;
  albumId: string;
  jeNahled: boolean;
  createdAt: Date;
}): AlbumFotkaZdroj {
  return {
    id: radek.id,
    parentId: radek.albumId,
    jeNahled: radek.jeNahled,
    createdAt: radek.createdAt,
  };
}

type CilNahrani =
  | { druh: "vyprava"; id: string }
  | { druh: "vlastni"; id: string };

async function uklidR2(nastaveni: R2Nastaveni, klice: readonly string[]): Promise<void> {
  for (const klic of klice) {
    try {
      await smazObjektR2(nastaveni, klic);
    } catch {
      // A leftover object is preferable to hiding the original failure.
    }
  }
}

export function registrujAlba(app: Express): void {
  app.get("/api/alba", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      try {
        const db = getDb();
        const session = await ctiVolitelnehoUzivatele(req);
        const vypravy = await db
          .select({
            id: expeditions.id,
            nazev: expeditions.nazev,
            datum: expeditions.datum,
            stav: expeditions.stav,
          })
          .from(expeditions)
          .where(eq(expeditions.stav, "proběhlá"));
        const vlastni = await db
          .select({ id: alba.id, nazev: alba.nazev, createdAt: alba.createdAt })
          .from(alba);
        const fotkyVyprav = await db
          .select({
            id: photos.id,
            expeditionId: photos.expeditionId,
            jeNahled: photos.jeNahled,
            createdAt: photos.createdAt,
          })
          .from(photos)
          .where(isNull(photos.smazanoAt));
        const fotkyVlastnich = await db
          .select({
            id: albaFotky.id,
            albumId: albaFotky.albumId,
            jeNahled: albaFotky.jeNahled,
            createdAt: albaFotky.createdAt,
          })
          .from(albaFotky)
          .where(isNull(albaFotky.smazanoAt));
        let seznam = sestavSeznamAlb(
          vypravy,
          vlastni,
          fotkyVyprav.map(zdrojVypravy),
          fotkyVlastnich.map(zdrojVlastni),
        );
        if (session?.isAdmin === true) {
          await purgeKosBestEffort(db);
          const vKosiVypravy = await db
            .select({
              id: photos.id,
              createdAt: photos.createdAt,
              smazanoAt: photos.smazanoAt,
            })
            .from(photos)
            .where(isNotNull(photos.smazanoAt))
            .orderBy(desc(photos.smazanoAt));
          const vKosiVlastni = await db
            .select({
              id: albaFotky.id,
              createdAt: albaFotky.createdAt,
              smazanoAt: albaFotky.smazanoAt,
            })
            .from(albaFotky)
            .where(isNotNull(albaFotky.smazanoAt))
            .orderBy(desc(albaFotky.smazanoAt));
          const vseVKosi = [...vKosiVypravy, ...vKosiVlastni].sort((a, b) => {
            const casA = a.smazanoAt?.getTime() ?? 0;
            const casB = b.smazanoAt?.getTime() ?? 0;
            return casB - casA;
          });
          seznam = [...seznam, albumKos(vseVKosi.length, vseVKosi[0]?.id ?? null)];
        }
        const telo: AlbaListResponse = { alba: seznam };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });

  app.delete("/api/alba/:id", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Album nenalezeno.");
          return;
        }
        try {
          const db = getDb();
          const vypravy = await db
            .select({ id: expeditions.id })
            .from(expeditions)
            .where(eq(expeditions.id, id))
            .limit(1);
          const vlastni =
            vypravy.length === 0 && jeUuid(id)
              ? await db.select({ id: alba.id }).from(alba).where(eq(alba.id, id)).limit(1)
              : [];
          if (
            rozhodniSmazaniAlba(
              id,
              vypravy.map((radek) => radek.id),
              vlastni.map((radek) => radek.id),
            ) !== "smazat"
          ) {
            posliChybu(res, "NENALEZENO", "Album nenalezeno.");
            return;
          }
          const fotky = await db
            .select({ url: albaFotky.url })
            .from(albaFotky)
            .where(eq(albaFotky.albumId, id));
          const nastaveniR2 = ctiR2Nastaveni(process.env);
          if (nastaveniR2 !== null) {
            for (const fotka of fotky) {
              const klic = klicZVerejneUrl(fotka.url, nastaveniR2.publicBaseUrl);
              if (klic !== null) await smazObjektR2(nastaveniR2, klic);
            }
          }
          const smazane = await db.delete(alba).where(eq(alba.id, id)).returning({ id: alba.id });
          if (smazane.length === 0) {
            posliChybu(res, "NENALEZENO", "Album nenalezeno.");
            return;
          }
          const telo: SmazatAlbumResponse = { ok: true };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  app.post("/api/alba", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        const overeni = validujNazevAlba(req.body);
        if (!overeni.ok) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            nazev: [overeni.zprava],
          });
          return;
        }
        try {
          const db = getDb();
          const adminId = (req as AutentizovanyRequest).uzivatel.id;
          const vlozene = await db
            .insert(alba)
            .values({ nazev: overeni.nazev, createdBy: adminId })
            .returning();
          const radek = vlozene[0];
          if (radek === undefined) throw new Error("empty returning");
          const telo: VytvoritAlbumResponse = {
            album: {
              id: radek.id,
              nazev: radek.nazev,
              druh: "vlastni",
              expeditionId: null,
              pocetFotek: 0,
              nahledFotkaId: null,
            },
          };
          res.status(201).json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  app.post("/api/alba/kos/fotky/:fotkaId/obnovit", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        const fotkaId = ctiParam(req, "fotkaId");
        if (!jeUuid(fotkaId)) {
          posliChybu(res, "NENALEZENO", FOTKA_V_KOSI_NENALEZENA);
          return;
        }
        try {
          const db = getDb();
          const nalezena = await najdiFotkuVKosi(db, fotkaId);
          if (nalezena === null) {
            posliChybu(res, "NENALEZENO", FOTKA_V_KOSI_NENALEZENA);
            return;
          }
          const uspech = await obnovFotku(db, nalezena);
          if (!uspech) {
            posliChybu(res, "NENALEZENO", FOTKA_V_KOSI_NENALEZENA);
            return;
          }
          res.json({ ok: true as const });
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  app.delete("/api/alba/kos/fotky/:fotkaId", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        const fotkaId = ctiParam(req, "fotkaId");
        if (!jeUuid(fotkaId)) {
          posliChybu(res, "NENALEZENO", FOTKA_V_KOSI_NENALEZENA);
          return;
        }
        try {
          const db = getDb();
          const nalezena = await najdiFotkuVKosi(db, fotkaId);
          if (nalezena === null) {
            posliChybu(res, "NENALEZENO", FOTKA_V_KOSI_NENALEZENA);
            return;
          }
          const nastaveniR2 = ctiR2Nastaveni(process.env);
          const uspech = await trvaleSmazFotku(db, nalezena, nastaveniR2);
          if (!uspech) {
            posliChybu(res, "NENALEZENO", FOTKA_V_KOSI_NENALEZENA);
            return;
          }
          res.json({ ok: true as const });
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  app.delete("/api/alba/:id/fotky/:fotkaId", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        const fotkaId = ctiParam(req, "fotkaId");
        if (jeAlbumKos(id)) {
          posliChybu(res, "NENALEZENO", FOTKA_V_KOSI_NENALEZENA);
          return;
        }
        if (!jeUuid(id) || !jeUuid(fotkaId)) {
          posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
          return;
        }
        try {
          const db = getDb();
          const album = await db.select({ id: alba.id }).from(alba).where(eq(alba.id, id)).limit(1);
          if (album.length === 0) {
            posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
            return;
          }
          const nalezene = await db
            .select()
            .from(albaFotky)
            .where(and(eq(albaFotky.id, fotkaId), eq(albaFotky.albumId, id)))
            .limit(1);
          const puvodni = nalezene[0];
          if (puvodni === undefined || puvodni.smazanoAt !== null) {
            posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
            return;
          }
          const uspech = await softSmazFotku(db, { druh: "vlastni", radek: puvodni });
          if (!uspech) {
            posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
            return;
          }
          const telo: SmazatAlbumFotkuResponse = { ok: true };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  app.get("/api/alba/:id/fotky/:fotkaId/soubor", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const id = ctiParam(req, "id");
      const fotkaId = ctiParam(req, "fotkaId");
      if (!jeUuid(id) || !jeUuid(fotkaId)) {
        posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
        return;
      }
      try {
        const db = getDb();
        const nalezene = await db
          .select({ url: albaFotky.url })
          .from(albaFotky)
          .where(and(eq(albaFotky.id, fotkaId), eq(albaFotky.albumId, id)))
          .limit(1);
        const radek = nalezene[0];
        if (radek === undefined) {
          posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
          return;
        }
        const nastaveniR2 = ctiR2Nastaveni(process.env);
        const klic =
          nastaveniR2 === null ? null : klicZVerejneUrl(radek.url, nastaveniR2.publicBaseUrl);
        if (klic === null || nastaveniR2 === null) {
          if (jeVnejsiHttps(radek.url)) {
            res.redirect(302, radek.url);
            return;
          }
          posliChybu(res, "NENALEZENO", "Fotka nenalezena.");
          return;
        }
        const objekt = await nactiObjektR2(nastaveniR2, klic);
        res.status(200);
        res.setHeader("Content-Type", objekt.contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Content-Length", objekt.bajty.length);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(objekt.bajty);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });

  app.get("/api/alba/:id/fotky", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const id = ctiParam(req, "id");
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Album nenalezeno.");
        return;
      }
      try {
        const db = getDb();
        if (jeAlbumKos(id)) {
          const session = await ctiVolitelnehoUzivatele(req);
          if (session?.isAdmin !== true) {
            posliChybu(res, "NENALEZENO", "Album nenalezeno.");
            return;
          }
          await purgeKosBestEffort(db);
          const zVyprav = await db
            .select()
            .from(photos)
            .where(isNotNull(photos.smazanoAt))
            .orderBy(desc(photos.smazanoAt));
          const zVlastnich = await db
            .select()
            .from(albaFotky)
            .where(isNotNull(albaFotky.smazanoAt))
            .orderBy(desc(albaFotky.smazanoAt));
          const fotky: ApiAlbumFotka[] = [
            ...zVyprav.map(fotkaVypravyApi),
            ...zVlastnich.map(fotkaVlastniApi),
          ].sort((a, b) => {
            const casA = a.smazanoAt ?? "";
            const casB = b.smazanoAt ?? "";
            return casB.localeCompare(casA);
          });
          const telo: AlbumFotkyResponse = { fotky };
          res.json(telo);
          return;
        }
        const vyprava = await db
          .select({ id: expeditions.id, stav: expeditions.stav })
          .from(expeditions)
          .where(eq(expeditions.id, id))
          .limit(1);
        const nalezenaVyprava = vyprava[0];
        if (nalezenaVyprava !== undefined) {
          if (!jeVypravaSViditelnymAlbem(nalezenaVyprava.stav)) {
            posliChybu(res, "NENALEZENO", "Album nenalezeno.");
            return;
          }
          const radky = await db
            .select()
            .from(photos)
            .where(and(eq(photos.expeditionId, id), isNull(photos.smazanoAt)))
            .orderBy(asc(photos.createdAt));
          const telo: AlbumFotkyResponse = { fotky: radky.map(fotkaVypravyApi) };
          res.json(telo);
          return;
        }
        if (!jeUuid(id)) {
          posliChybu(res, "NENALEZENO", "Album nenalezeno.");
          return;
        }
        const album = await db.select({ id: alba.id }).from(alba).where(eq(alba.id, id)).limit(1);
        if (album.length === 0) {
          posliChybu(res, "NENALEZENO", "Album nenalezeno.");
          return;
        }
        const radky = await db
          .select()
          .from(albaFotky)
          .where(and(eq(albaFotky.albumId, id), isNull(albaFotky.smazanoAt)))
          .orderBy(asc(albaFotky.createdAt));
        const telo: AlbumFotkyResponse = { fotky: radky.map(fotkaVlastniApi) };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });

  app.post("/api/alba/:id/fotky", (req: Request, res: Response) => {
    vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiParam(req, "id");
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Album nenalezeno.");
          return;
        }
        let cil: CilNahrani;
        try {
          const dbPred = getDb();
          const vypravy = await dbPred
            .select({ id: expeditions.id, stav: expeditions.stav })
            .from(expeditions)
            .where(eq(expeditions.id, id))
            .limit(1);
          const vyprava = vypravy[0];
          if (vyprava !== undefined) {
            if (vyprava.stav !== "proběhlá") {
              posliChybu(res, "VYPRAVA_UZAVRENA", VYPRAVA_UZAVRENA_ZPRAVA);
              return;
            }
            cil = { druh: "vyprava", id: vyprava.id };
          } else if (!jeUuid(id)) {
            posliChybu(res, "NENALEZENO", "Album nenalezeno.");
            return;
          } else {
            const nalezene = await dbPred
              .select({ id: alba.id })
              .from(alba)
              .where(eq(alba.id, id))
              .limit(1);
            const album = nalezene[0];
            if (album === undefined) {
              posliChybu(res, "NENALEZENO", "Album nenalezeno.");
              return;
            }
            cil = { druh: "vlastni", id: album.id };
          }
        } catch {
          vnitrniChyba(res);
          return;
        }
        const contentType = req.header("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
          posliChybuSouboru(res, "chybi");
          return;
        }
        const nastaveniR2 = ctiR2Nastaveni(process.env);
        if (nastaveniR2 === null) {
          posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
          return;
        }
        let telo: Buffer;
        try {
          telo = await ctiSuroveTelo(req, ALBUM_NAHRANI_MAX_BAJTU);
        } catch (chyba: unknown) {
          const velikost = chyba instanceof Error && chyba.message === "velikost";
          posliChybuSouboru(res, velikost ? "velikost" : "chybi");
          return;
        }
        const rozdelene = rozdelMultipartSoubory(telo, contentType);
        if (!rozdelene.ok) {
          posliChybuSouboru(res, rozdelene.duvod);
          return;
        }
        const plan: { klic: string; bajty: Buffer; contentType: string; popis: string }[] = [];
        for (const fotka of rozdelene.fotky) {
          const pripona = rozpoznajObrazek(fotka.bajty);
          if (pripona === null) {
            posliChybuSouboru(res, "format");
            return;
          }
          const klic =
            cil.druh === "vyprava" ? klicFotky(id, pripona) : klicAlbaFotky(id, pripona);
          if (klic === null) {
            posliChybu(res, "NENALEZENO", cil.druh === "vyprava" ? "Výprava nenalezena." : "Album nenalezeno.");
            return;
          }
          plan.push({
            klic,
            bajty: fotka.bajty,
            contentType: contentTypeProPriponu(pripona),
            popis: fotka.popis,
          });
        }
        const nahrane: { klic: string; url: string; popis: string }[] = [];
        try {
          for (const polozka of plan) {
            const url = await ulozFotkuDoR2(nastaveniR2, polozka.klic, polozka.bajty, polozka.contentType);
            nahrane.push({ klic: polozka.klic, url, popis: polozka.popis });
          }
        } catch {
          await uklidR2(nastaveniR2, plan.map((polozka) => polozka.klic));
          vnitrniChyba(res);
          return;
        }
        try {
          const db = getDb();
          const userId = (req as AutentizovanyRequest).uzivatel.id;
          if (cil.druh === "vyprava") {
            const znovu = await db
              .select({ stav: expeditions.stav })
              .from(expeditions)
              .where(eq(expeditions.id, id))
              .limit(1);
            const stav = znovu[0]?.stav;
            if (stav === undefined) {
              await uklidR2(nastaveniR2, nahrane.map((polozka) => polozka.klic));
              posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
              return;
            }
            if (stav !== "proběhlá") {
              await uklidR2(nastaveniR2, nahrane.map((polozka) => polozka.klic));
              posliChybu(res, "VYPRAVA_UZAVRENA", VYPRAVA_UZAVRENA_ZPRAVA);
              return;
            }
            const vlozene = await db
              .insert(photos)
              .values(
                nahrane.map((polozka) => ({
                  expeditionId: id,
                  url: polozka.url,
                  popis: polozka.popis,
                  uploadedBy: userId,
                })),
              )
              .returning();
            const telo: PridatAlbumFotkyResponse = { fotky: vlozene.map(fotkaVypravyApi) };
            res.status(201).json(telo);
            return;
          }
          const album = await db.select({ id: alba.id }).from(alba).where(eq(alba.id, id)).limit(1);
          if (album.length === 0) {
            await uklidR2(nastaveniR2, nahrane.map((polozka) => polozka.klic));
            posliChybu(res, "NENALEZENO", "Album nenalezeno.");
            return;
          }
          const vlozene = await db
            .insert(albaFotky)
            .values(
              nahrane.map((polozka) => ({
                albumId: id,
                url: polozka.url,
                uploadedBy: userId,
              })),
            )
            .returning();
          const odpoved: PridatAlbumFotkyResponse = { fotky: vlozene.map(fotkaVlastniApi) };
          res.status(201).json(odpoved);
        } catch {
          await uklidR2(nastaveniR2, nahrane.map((polozka) => polozka.klic));
          vnitrniChyba(res);
        }
      })();
    });
  });
}
