/**
 * Album HTTP routes. Expedition albums read and write `photos`.
 * Extra albums read and write `alba` / `alba_fotky`.
 * Migration 0013 is not applied from here.
 */
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, count, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
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
  albumNahledu,
  jeVypravaSViditelnymAlbem,
  rozhodniSmazaniAlba,
  sestavSeznamAlbZeShrnuti,
  validujNazevAlba,
} from "./alba";
import {
  ctiVolitelnehoUzivatele,
  type AutentizovanyRequest,
  vyzadujAdmina,
  vyzadujPrihlaseni,
} from "./auth";
import { posliChybu } from "./chyby";
import { lzeDoplnitArchiv } from "./vyprava-termin";
import { getDb, type Db } from "./db";
import { chceNahled, maBezpecneRozmery, OBRAZEK_PRILIS_VELKY, rozmeryUlozenychBajtu } from "./obrazek-nahled";
import { jeAlbumKos } from "../../src/shared/fotky-kos";
import {
  ALBUM_NAHLEDY_ID,
  ALBUM_NAHLEDY_NAZEV,
  jeAlbumNahledu,
} from "../../src/shared/fotky-nahledy";
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
  posliObrazekZKlice,
  pripravObrazekKUlozeni,
  rozpoznajObrazek,
  rozdelMultipartSoubory,
  smazObrazekR2,
  smazObrazekR2Tise,
  ulozPripravenyObrazek,
  type ChybaSouboru,
  type ChybaSouboruAlba,
  type R2Nastaveni,
} from "./r2-fotky";
import { prostredi } from "./prostredi";


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VYPRAVA_UZAVRENA_ZPRAVA =
  "Fotky jdou přidat až po skončení výpravy.";

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
    await purgeExpiredTrashPhotos(db, ctiR2Nastaveni(prostredi()));
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

function pocetZBunky(hodnota: unknown): number {
  if (typeof hodnota === "number" && Number.isFinite(hodnota)) return hodnota;
  if (typeof hodnota === "bigint") return Number(hodnota);
  if (typeof hodnota === "string") {
    const cislo = Number(hodnota);
    if (Number.isFinite(cislo)) return cislo;
  }
  return 0;
}

function datumZBunky(hodnota: unknown): Date | null {
  if (hodnota instanceof Date && !Number.isNaN(hodnota.getTime())) return hodnota;
  if (typeof hodnota === "string") {
    const datum = new Date(hodnota);
    if (!Number.isNaN(datum.getTime())) return datum;
  }
  return null;
}

/** Counts and cover ids. Cover matches `sestavMapuNahledu`: flagged, else oldest, else smaller id. */
async function nactiShrnutiFotek(
  db: Db,
  tabulka: "photos" | "alba_fotky",
): Promise<{ pocty: Map<string, number>; nahledy: Map<string, string> }> {
  const parent = tabulka === "photos" ? "expedition_id" : "album_id";
  const poctyVysledek = await db.execute(sql`
    SELECT ${sql.raw(parent)} AS parent_id, count(*)::int AS pocet
    FROM ${sql.raw(tabulka)}
    WHERE smazano_at IS NULL
    GROUP BY ${sql.raw(parent)}
  `);
  const nahledyVysledek = await db.execute(sql`
    SELECT DISTINCT ON (${sql.raw(parent)})
      ${sql.raw(parent)} AS parent_id,
      id::text AS id
    FROM ${sql.raw(tabulka)}
    WHERE smazano_at IS NULL
    ORDER BY ${sql.raw(parent)}, je_nahled DESC, created_at ASC, id ASC
  `);
  const pocty = new Map<string, number>();
  for (const surovy of poctyVysledek.rows) {
    const bunka = surovy as { parent_id?: unknown; pocet?: unknown };
    if (typeof bunka.parent_id !== "string") continue;
    pocty.set(bunka.parent_id, pocetZBunky(bunka.pocet));
  }
  const nahledy = new Map<string, string>();
  for (const surovy of nahledyVysledek.rows) {
    const bunka = surovy as { parent_id?: unknown; id?: unknown };
    if (typeof bunka.parent_id !== "string" || typeof bunka.id !== "string") continue;
    nahledy.set(bunka.parent_id, bunka.id);
  }
  return { pocty, nahledy };
}

async function nactiHlavuKose(
  db: Db,
  tabulka: "photos" | "alba_fotky",
): Promise<{ pocet: number; id: string | null; smazanoAt: Date | null }> {
  const zdroj = tabulka === "photos" ? photos : albaFotky;
  const pocetRadku = await db
    .select({ hodnota: count() })
    .from(zdroj)
    .where(isNotNull(zdroj.smazanoAt));
  const hlava = await db
    .select({ id: zdroj.id, smazanoAt: zdroj.smazanoAt })
    .from(zdroj)
    .where(isNotNull(zdroj.smazanoAt))
    .orderBy(desc(zdroj.smazanoAt))
    .limit(1);
  const radek = hlava[0];
  return {
    pocet: pocetZBunky(pocetRadku[0]?.hodnota),
    id: radek === undefined ? null : radek.id,
    smazanoAt: radek === undefined ? null : datumZBunky(radek.smazanoAt),
  };
}

/** The cover album has a fixed id, so its row can be added with the first photo. */
async function zajistiAlbumNahledu(db: Db): Promise<void> {
  await db
    .insert(alba)
    .values({ id: ALBUM_NAHLEDY_ID, nazev: ALBUM_NAHLEDY_NAZEV })
    .onConflictDoNothing({ target: alba.id });
}

type CilNahrani =
  | { druh: "vyprava"; id: string }
  | { druh: "vlastni"; id: string };

async function uklidR2(nastaveni: R2Nastaveni, klice: readonly string[]): Promise<void> {
  for (const klic of klice) {
    await smazObrazekR2Tise(nastaveni, klic);
  }
}

export function registrujAlba(app: Express): void {
  app.get("/api/alba", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
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
          .from(alba)
          .where(ne(alba.id, ALBUM_NAHLEDY_ID));
        const [vypravyShrnuti, vlastniShrnuti] = await Promise.all([
          nactiShrnutiFotek(db, "photos"),
          nactiShrnutiFotek(db, "alba_fotky"),
        ]);
        let seznam = sestavSeznamAlbZeShrnuti(
          vypravy,
          vlastni,
          vypravyShrnuti.pocty,
          vypravyShrnuti.nahledy,
          vlastniShrnuti.pocty,
          vlastniShrnuti.nahledy,
        );
        seznam = [
          ...seznam,
          albumNahledu(
            vlastniShrnuti.pocty.get(ALBUM_NAHLEDY_ID) ?? 0,
            vlastniShrnuti.nahledy.get(ALBUM_NAHLEDY_ID) ?? null,
          ),
        ];
        if (session?.isAdmin === true) {
          await purgeKosBestEffort(db);
          const [kosVyprav, kosVlastni] = await Promise.all([
            nactiHlavuKose(db, "photos"),
            nactiHlavuKose(db, "alba_fotky"),
          ]);
          const nahledKos =
            kosVlastni.smazanoAt !== null &&
            (kosVyprav.smazanoAt === null ||
              kosVlastni.smazanoAt.getTime() > kosVyprav.smazanoAt.getTime())
              ? kosVlastni.id
              : kosVyprav.id;
          seznam = [...seznam, albumKos(kosVyprav.pocet + kosVlastni.pocet, nahledKos)];
        }
        const telo: AlbaListResponse = { alba: seznam };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
      })();
      });
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
          const nastaveniR2 = ctiR2Nastaveni(prostredi());
          if (nastaveniR2 !== null) {
            for (const fotka of fotky) {
              const klic = klicZVerejneUrl(fotka.url, nastaveniR2.publicBaseUrl);
              if (klic !== null) await smazObrazekR2(nastaveniR2, klic);
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
          const nastaveniR2 = ctiR2Nastaveni(prostredi());
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
      await vyzadujPrihlaseni(req, res, () => {
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
          .where(and(eq(albaFotky.id, fotkaId), eq(albaFotky.albumId, id), isNull(albaFotky.smazanoAt)))
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

  app.get("/api/alba/:id/fotky", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
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
        if (album.length === 0 && !jeAlbumNahledu(id)) {
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
          if (vyprava !== undefined) {
            if (!lzeDoplnitArchiv(vyprava)) {
              posliChybu(res, "VYPRAVA_UZAVRENA", VYPRAVA_UZAVRENA_ZPRAVA);
              return;
            }
            cil = { druh: "vyprava", id: vyprava.id };
          } else if (!jeUuid(id)) {
            posliChybu(res, "NENALEZENO", "Album nenalezeno.");
            return;
          } else if (jeAlbumNahledu(id)) {
            cil = { druh: "vlastni", id: ALBUM_NAHLEDY_ID };
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
        const nastaveniR2 = ctiR2Nastaveni(prostredi());
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
        const plan: {
          idSouboru: string;
          pripona: "jpg" | "png" | "webp";
          bajty: Buffer;
          contentType: string;
          popis: string;
        }[] = [];
        for (const fotka of rozdelene.fotky) {
          const pripona = rozpoznajObrazek(fotka.bajty);
          if (pripona === null) {
            posliChybuSouboru(res, "format");
            return;
          }
          if (!(await maBezpecneRozmery(fotka.bajty))) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: [OBRAZEK_PRILIS_VELKY],
            });
            return;
          }
          const idSouboru = randomUUID();
          const klic =
            cil.druh === "vyprava"
              ? klicFotky(id, pripona, idSouboru)
              : klicAlbaFotky(id, pripona, idSouboru);
          if (klic === null) {
            posliChybu(res, "NENALEZENO", cil.druh === "vyprava" ? "Výprava nenalezena." : "Album nenalezeno.");
            return;
          }
          plan.push({
            idSouboru,
            pripona,
            bajty: fotka.bajty,
            contentType: contentTypeProPriponu(pripona),
            popis: fotka.popis,
          });
        }
        const nahrane: {
          klic: string;
          url: string;
          popis: string;
          sirka: number | null;
          vyska: number | null;
        }[] = [];
        try {
          for (const polozka of plan) {
            const pripraveno = await pripravObrazekKUlozeni(
              polozka.bajty,
              polozka.contentType,
              polozka.pripona,
              "plna",
              (ext) => {
                if (ext !== "jpg" && ext !== "png" && ext !== "webp") return null;
                return cil.druh === "vyprava"
                  ? klicFotky(id, ext, polozka.idSouboru)
                  : klicAlbaFotky(id, ext, polozka.idSouboru);
              },
            );
            if (pripraveno === null) throw new Error("klic");
            const rozmery = await rozmeryUlozenychBajtu(pripraveno.bajty);
            const url = await ulozPripravenyObrazek(nastaveniR2, pripraveno);
            nahrane.push({
              klic: pripraveno.klic,
              url,
              popis: polozka.popis,
              sirka: rozmery?.sirka ?? null,
              vyska: rozmery?.vyska ?? null,
            });
          }
        } catch {
          await uklidR2(
            nastaveniR2,
            nahrane.map((polozka) => polozka.klic),
          );
          vnitrniChyba(res);
          return;
        }
        try {
          const db = getDb();
          const userId = (req as AutentizovanyRequest).uzivatel.id;
          if (cil.druh === "vyprava") {
            const znovu = await db
              .select({
                stav: expeditions.stav,
                datum: expeditions.datum,
                datumDo: expeditions.datumDo,
              })
              .from(expeditions)
              .where(eq(expeditions.id, id))
              .limit(1);
            const radek = znovu[0];
            if (radek === undefined) {
              await uklidR2(nastaveniR2, nahrane.map((polozka) => polozka.klic));
              posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
              return;
            }
            if (!lzeDoplnitArchiv(radek)) {
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
                  sirka: polozka.sirka,
                  vyska: polozka.vyska,
                })),
              )
              .returning();
            const telo: PridatAlbumFotkyResponse = { fotky: vlozene.map(fotkaVypravyApi) };
            res.status(201).json(telo);
            return;
          }
          if (jeAlbumNahledu(id)) await zajistiAlbumNahledu(db);
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
                sirka: polozka.sirka,
                vyska: polozka.vyska,
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
