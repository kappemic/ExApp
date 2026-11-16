/**
 * Meeting HTTP routes and the public school/class list.
 */

import {
  asc,
  count,
  eq,
  inArray,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import type {
  ApiSchuzka,
  SchuzkaDetailResponse,
  SchuzkyListResponse,
  SmazatSchuzkuResponse,
  SmazatVyskytSchuzkyResponse,
  UpravitSchuzkuResponse,
  VytvoritSchuzkuResponse,
} from "../../src/shared/api-types";
import {
  VALIDACNI_ZPRAVY,
  jeSkolyTridyOdpoved,
} from "../../src/shared/api-types";
import {
  vyzadujSpravceVyprav,
  type AutentizovanyRequest,
} from "./auth";
import {
  posliChybu,
  vnitrniChyba,
} from "./chyby";
import {
  getDb,
  type Db,
} from "./db";
import {
  jeRozvrhemVyskyt,
  smiSmazatVyskyt,
} from "./schuzky";
import {
  DATUM_REGEX,
  jeRealneDatum,
  validujUpravuSchuzky,
  validujVytvoreniSchuzky,
} from "./validace";
import {
  SKOLY,
  TRIDY,
} from "../../src/shared/skoly-tridy-seznam";
import {
  meetings,
} from "../../drizzle/schema/meetings";
import {
  meetingExceptions,
} from "../../drizzle/schema/meetings";
import {
  toApiSchuzka,
} from "./schuzky";

import {
  ctiCeleCisloQuery,
} from "./bff-sdilene";

export function registrujSchuzky(app: Express): void {
  /* ------------------------------------------------------------------ */
  /* GET /api/meta/skoly-tridy — PUBLIC pevný seznam, ne řádky uživatelů.  */
  /* Tvar hlídá jeSkolyTridyOdpoved.                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Trim + neprázdné + řazení podle lowercase + case-insensitive dedup
   * (první originál vítězí). Řazení i dedup v TS, protože Postgres
   * u `SELECT DISTINCT` vyžaduje ORDER BY výraz v select listu —
   * `ORDER BY LOWER(col)` by padalo; v SQL je proto DISTINCT + ORDER BY
   * sloupce a case-insensitive pořadí dorovnává tohle.
   */
  function normalizujNazvy(hodnoty: readonly string[]): string[] {
    const ciste: string[] = [];
    for (const surova of hodnoty) {
      const otrimovana = surova.trim();
      if (otrimovana.length > 0) ciste.push(otrimovana);
    }
    ciste.sort((a, b) => {
      const ma = a.toLowerCase();
      const mb = b.toLowerCase();
      if (ma < mb) return -1;
      if (ma > mb) return 1;
      return 0;
    });
    const videne = new Set<string>();
    const vysledek: string[] = [];
    for (const nazev of ciste) {
      const klic = nazev.toLowerCase();
      if (videne.has(klic)) continue;
      videne.add(klic);
      vysledek.push(nazev);
    }
    return vysledek;
  }

  app.get("/api/meta/skoly-tridy", (_req: Request, res: Response) => {
    void (async (): Promise<void> => {
      try {
        const telo = {
          skoly: normalizujNazvy(SKOLY),
          tridy: normalizujNazvy(TRIDY),
        };
        if (!jeSkolyTridyOdpoved(telo)) {
          vnitrniChyba(res);
          return;
        }
        res.setHeader("Cache-Control", "public, max-age=60");
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });

  /* ------------------------------------------------------------------ */
  /* Fáze 3 — Schůzky CRUD (kontrakt api-types §14).                     */
  /* GET seznam i detail = PUBLIC (kalendář čte každý);                  */
  /* POST + PATCH + DELETE = dual-guard (ADMIN nebo aktivní člen —        */
  /* stejný `vyzadujSpravceVyprav` jako výpravy). Řazeno datem vzestupně. */
  /* Nevalidní DB řádek se přeskočí (fail-safe jako u výprav). Chyby      */
  /* vždy jen ApiErrorResponse (posliChybu).                              */
  /* ------------------------------------------------------------------ */

  /** `:id` z cesty schůzky — prázdné → volající vrátí 404 NENALEZENO. */
  function ctiIdSchuzky(req: Request): string {
    const surova: unknown = (req.params as Record<string, unknown>)["id"];
    return typeof surova === "string" ? surova.trim() : "";
  }

  /* GET /api/meetings — PUBLIC seznam pro kalendář. Volitelné ?page&pageSize (B5). */
  app.get("/api/meetings", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      try {
        const dotaz = req.query as {
          page?: unknown;
          pageSize?: unknown;
        };
        let page: number | undefined;
        let pageSize: number | undefined;
        if (dotaz.page !== undefined || dotaz.pageSize !== undefined) {
          const cistePage =
            dotaz.page === undefined ? 1 : ctiCeleCisloQuery(dotaz.page);
          const cistePageSize =
            dotaz.pageSize === undefined
              ? 20
              : ctiCeleCisloQuery(dotaz.pageSize);
          if (
            cistePage === null ||
            cistePageSize === null ||
            cistePage < 1 ||
            cistePageSize < 1 ||
            cistePageSize > 100
          ) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              page: ["Stránkování musí být kladná čísla (pageSize nejvýš 100)."],
            });
            return;
          }
          page = cistePage;
          pageSize = cistePageSize;
        }

        const db = getDb();
        let radky;
        let totalItemsSql: number | null = null;
        if (page !== undefined && pageSize !== undefined) {
          const pocet = await db.select({ hodnota: count() }).from(meetings);
          const surovy = pocet[0]?.hodnota ?? 0;
          totalItemsSql = typeof surovy === "number" ? surovy : Number(surovy);
          radky = await db
            .select()
            .from(meetings)
            .orderBy(asc(meetings.datum))
            .limit(pageSize)
            .offset((page - 1) * pageSize);
        } else {
          radky = await db.select().from(meetings).orderBy(asc(meetings.datum));
        }
        const vyjimky = await nactiVyjimky(db, radky);
        const schuzky: SchuzkyListResponse["schuzky"] = [];
        for (const radek of radky) {
          const api = toApiSchuzka(radek);
          if (api === null) continue;
          // B4 — filtr výjimek: vynechávané data pro týdenní řady.
          const vynechene =
            radek.opakovani === "tydenni" ? (vyjimky.get(radek.id) ?? []) : [];
          const sVyjimkami: ApiSchuzka =
            vynechene.length > 0 ? { ...api, vynecheneVyskyty: vynechene } : api;
          schuzky.push(sVyjimkami);
        }
        if (page === undefined || pageSize === undefined) {
          const telo: SchuzkyListResponse = { schuzky };
          res.json(telo);
          return;
        }
        const totalItems = totalItemsSql ?? schuzky.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const telo: SchuzkyListResponse = {
          schuzky,
          pagination: { page, pageSize, totalItems, totalPages },
        };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });

  /* GET /api/meetings/:id — PUBLIC detail pro unified modal. */
  app.get("/api/meetings/:id", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const id = ctiIdSchuzky(req);
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
        return;
      }
      try {
        const db = getDb();
        const nalezene = await db
          .select()
          .from(meetings)
          .where(eq(meetings.id, id))
          .limit(1);
        const radek = nalezene[0];
        if (radek === undefined) {
          posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
          return;
        }
        const schuzka = toApiSchuzka(
          radek,
          await nactiOccurrence(db, radek.id, radek.opakovani),
        );
        if (schuzka === null) {
          vnitrniChyba(res);
          return;
        }
        const telo: SchuzkaDetailResponse = { schuzka };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });

  /* POST /api/meetings — dual-guard (admin nebo aktivní člen). → 201. */
  app.post("/api/meetings", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const overeni = validujVytvoreniSchuzky(req.body as unknown);
        if (!overeni.uspech || overeni.data === null) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
          return;
        }
        const vstup = overeni.data;
        try {
          const db = getDb();
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          const vlozene = await db
            .insert(meetings)
            .values({
              nazev: vstup.nazev,
              datum: vstup.datum,
              cas: vstup.cas,
              mistnost: vstup.mistnost,
              popis: vstup.popis,
              opakovani: vstup.opakovani,
              createdBy: uzivatel.id,
            })
            .returning();
          const radek = vlozene[0];
          if (radek === undefined) throw new Error("prázdný returning");
          const schuzka = toApiSchuzka(radek);
          if (schuzka === null) throw new Error("nevalidní řádek po insertu");
          const telo: VytvoritSchuzkuResponse = { schuzka };
          res.status(201).json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  /* PATCH /api/meetings/:id — dual-guard, parciální. */
  app.patch("/api/meetings/:id", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const overeni = validujUpravuSchuzky(req.body as unknown);
        if (!overeni.uspech || overeni.data === null) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
          return;
        }
        const id = ctiIdSchuzky(req);
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
          return;
        }
        const vstup = overeni.data;
        try {
          const db = getDb();
          const nalezene = await db
            .select()
            .from(meetings)
            .where(eq(meetings.id, id))
            .limit(1);
          if (nalezene[0] === undefined) {
            posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
            return;
          }
          const zmeny: {
            nazev?: string;
            datum?: string;
            cas?: string | null;
            mistnost?: string | null;
            popis?: string;
            opakovani?: string;
          } = {};
          if (vstup.nazev !== undefined) zmeny.nazev = vstup.nazev;
          if (vstup.datum !== undefined) zmeny.datum = vstup.datum;
          if (vstup.cas !== undefined) zmeny.cas = vstup.cas;
          if (vstup.mistnost !== undefined) zmeny.mistnost = vstup.mistnost;
          if (vstup.popis !== undefined) zmeny.popis = vstup.popis;
          if (vstup.opakovani !== undefined) zmeny.opakovani = vstup.opakovani;
          let radek = nalezene[0];
          if (Object.keys(zmeny).length > 0) {
            const aktualizovane = await db
              .update(meetings)
              .set(zmeny)
              .where(eq(meetings.id, id))
              .returning();
            const novy = aktualizovane[0];
            if (novy === undefined) {
              posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
              return;
            }
            radek = novy;
          }
          const schuzka = toApiSchuzka(
            radek,
            await nactiOccurrence(db, radek.id, radek.opakovani),
          );
          if (schuzka === null) {
            vnitrniChyba(res);
            return;
          }
          const telo: UpravitSchuzkuResponse = { schuzka };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  /* DELETE /api/meetings/:id — dual-guard. Maže celou řadu. Opakovaný DELETE → 404. */
  app.delete("/api/meetings/:id", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiIdSchuzky(req);
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
          return;
        }
        try {
          const db = getDb();
          // Výjimky PŘED řadou — aby pád nenechal parciální stav
          // (FK má i ON DELETE CASCADE jako pojistku).
          await db
            .delete(meetingExceptions)
            .where(eq(meetingExceptions.seriesId, id));
          const smazane = await db
            .delete(meetings)
            .where(eq(meetings.id, id))
            .returning({ id: meetings.id });
          if (smazane.length === 0) {
            posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
            return;
          }
          const telo: SmazatSchuzkuResponse = { ok: true };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  /* DELETE /api/meetings/:id/occurrence — dual-guard. Vynechání jednoho výskytu týdenní řady (B4). */
  app.delete("/api/meetings/:id/occurrence", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiIdSchuzky(req);
        const datum = ctiDatumSchuzky(req);
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
          return;
        }
        if (datum === null) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            datum: [VALIDACNI_ZPRAVY.schuzkaDatumNeplatne],
          });
          return;
        }
        const surovaRozvrhem: unknown = req.query["rozvrhem"];
        if (!jeRozvrhemVyskyt(surovaRozvrhem)) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            rozvrhem: ["Pro smazání jednoho výskytu zadej rozvrhem=vyskyt."],
          });
          return;
        }
        try {
          const db = getDb();
          const nalezene = await db
            .select()
            .from(meetings)
            .where(eq(meetings.id, id))
            .limit(1);
          const radek = nalezene[0];
          if (radek === undefined) {
            posliChybu(res, "NENALEZENO", "Schůzka nenalezena.");
            return;
          }

          if (!smiSmazatVyskyt(radek.opakovani)) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              rozvrhem: ["Jeden výskyt jde odebrat jen u týdenní schůzky."],
            });
            return;
          }

          // Jen "vyskyt" — vlož výjimku, řada zůstává.
          await db
            .insert(meetingExceptions)
            .values({ seriesId: id, occurrenceDate: datum, createdBy: (req as AutentizovanyRequest).uzivatel.id })
            .onConflictDoNothing();
          const telo: SmazatVyskytSchuzkyResponse = { ok: true };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  /** `:datum` z query (YMD) pro výjimky výskytů. */
  function ctiDatumSchuzky(req: Request): string | null {
    const surova: unknown = req.query["datum"];
    if (typeof surova !== "string") return null;
    const ciste = surova.trim();
    if (!DATUM_REGEX.test(ciste)) return null;
    const rok = Number(ciste.slice(0, 4));
    const mesic = Number(ciste.slice(5, 7));
    const den = Number(ciste.slice(8, 10));
    if (!jeRealneDatum(rok, mesic, den)) return null;
    return ciste;
  }

  /** Weekly exceptions for the rows on this page, one query. */
  async function nactiVyjimky(
    db: Db,
    radky: readonly { id: string; opakovani: string }[],
  ): Promise<Map<string, string[]>> {
    const mapa = new Map<string, string[]>();
    const idRad = radky.filter((radek) => radek.opakovani === "tydenni").map((radek) => radek.id);
    if (idRad.length === 0) return mapa;
    const vyjimky = await db
      .select({
        seriesId: meetingExceptions.seriesId,
        occurrenceDate: meetingExceptions.occurrenceDate,
      })
      .from(meetingExceptions)
      .where(inArray(meetingExceptions.seriesId, idRad));
    for (const vyjimka of vyjimky) {
      const seznam = mapa.get(vyjimka.seriesId) ?? [];
      seznam.push(vyjimka.occurrenceDate);
      mapa.set(vyjimka.seriesId, seznam);
    }
    return mapa;
  }

  /** Výjimky pro schůzku (B4) — jen pro `tydenni`, jinak []. */
  async function nactiOccurrence(
    db: Db,
    seriesId: string,
    opakovani: string,
  ): Promise<string[]> {
    if (opakovani !== "tydenni") return [];
    const radky = await db
      .select({ occurrenceDate: meetingExceptions.occurrenceDate })
      .from(meetingExceptions)
      .where(eq(meetingExceptions.seriesId, seriesId));
    return radky.map((r) => r.occurrenceDate);
  }
}
