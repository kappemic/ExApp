/**
 * Personal stats and leaderboard HTTP routes.
 */

import {
  and,
  desc,
  eq,
  gte,
  lt,
  sql,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import {
  vyzadujPrihlaseni,
  type AutentizovanyRequest,
} from "./auth";
import {
  posliChybu,
  vnitrniChyba,
} from "./chyby";
import {
  getDb,
} from "./db";
import {
  expeditions,
} from "../../drizzle/schema/expeditions";
import {
  participants,
} from "../../drizzle/schema/participants";
import {
  users,
} from "../../drizzle/schema/users";
import {
  agregujStatistiky,
  type StatistikaRadek,
} from "./statistiky";

export function registrujStatistiky(app: Express): void {
  /* ------------------------------------------------------------------ */
  /* Krok 3 Fáze 4 — GET /api/statistiky/moje (USER, session-scoped).     */
  /* Agregace z DB bez live Stravy: jeden JOIN                            */
  /* `participants(status=ucastnil_se, user_id=moje) ⋈ expeditions`,       */
  /* O(N) bez N+1. `vypravy` = COUNT účastí, `kmCelkem` = SUM km,          */
  /* `prevyseniCelkem` = SUM prevyseni_m, `aktivity` = seznam navštívených */
  /* ve tvaru `ApiAktivita` (sčítá `agregujStatistiky`). Nováček → nuly +  */
  /* [] (profil ukazuje prázdný stav). Bez session → 401 NEPRIHLASEN.      */
  /* Žádné secrety v odpovědi (jen čísla + veřejné sloupce expeditions).   */
  /* ------------------------------------------------------------------ */

  app.get("/api/statistiky/moje", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          try {
            const db = getDb();
            const id = (req as AutentizovanyRequest).uzivatel.id;
            const ucty = await db
              .select()
              .from(users)
              .where(eq(users.id, id))
              .limit(1);
            const ucet = ucty[0];
            if (ucet === undefined) {
              posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
              return;
            }
            const celeJmeno =
              `${ucet.jmeno} ${ucet.prijmeni}`.trim().replace(/\s+/g, " ") ||
              ucet.email;
            const radky = await db
                  .select({
                    expeditionId: participants.expeditionId,
                    status: participants.status,
                    km: expeditions.km,
                    prevyseniM: expeditions.prevyseniM,
                    stravaActivityId: expeditions.stravaActivityId,
                    trasaPolyline: expeditions.trasaPolyline,
                    nazev: expeditions.nazev,
                    datum: expeditions.datum,
                  })
              .from(participants)
              .innerJoin(
                expeditions,
                eq(participants.expeditionId, expeditions.id),
              )
                  .where(
                    and(
                      eq(participants.userId, id),
                      eq(participants.status, "ucastnil_se"),
                    ),
                  )
              .orderBy(desc(expeditions.datum));
              const vstup: StatistikaRadek[] = radky.map((radek) => ({
                expeditionId: radek.expeditionId,
                status:
                  radek.status === "ucastnil_se" ||
                  radek.status === "prihlasen" ||
                  radek.status === "omluven"
                    ? radek.status
                    : undefined,
                km: typeof radek.km === "number" ? radek.km : null,
              prevyseniM:
                typeof radek.prevyseniM === "number" ? radek.prevyseniM : null,
              stravaActivityId:
                typeof radek.stravaActivityId === "string"
                  ? radek.stravaActivityId
                  : null,
              trasaPolyline:
                typeof radek.trasaPolyline === "string"
                  ? radek.trasaPolyline
                  : null,
              nazev: radek.nazev,
              datum:
                typeof radek.datum === "string"
                  ? radek.datum.slice(0, 10)
                  : undefined,
            }));
            const agregace = agregujStatistiky(vstup);
            const telo: import("../../src/shared/api-types").StatistikyResponse = {
              userId: id as import("../../src/shared/api-types").UserId,
              jmeno: celeJmeno,
                vypravy: agregace.vypravy,
                kmCelkem: agregace.kmCelkem,
              prevyseniCelkem: agregace.prevyseniCelkem,
              aktivity: agregace.aktivity,
            };
            res.json(telo);
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* ------------------------------------------------------------------ */
  /* Krok 5 Fáze 4 — GET /api/zebricky?obdobi=celkem|YYYY (USER).          */
  /* Jeden GROUP BY dotaz (bez N+1):                                       */
  /* `participants(status=ucastnil_se) ⋈ users ⋈ expeditions`,              */
  /* `vypravy` = COUNT účastí, `km` = SUM km (null → 0, na 1 desetinné).    */
  /* Řazení účast DESC > km DESC, tie-break jmeno ASC (deterministické),   */
  /* LIMIT 50. `obdobi=celkem` = vše; `obdobi=YYYY` = jen datum daného      */
  /* roku (rozsah `datum >= YYYY-01-01 AND datum < YYYY+1` — použije        */
  /* index `expeditions(datum)`). Bez PII kromě `jmeno` (žádný e-mail /    */
  /* telefon / secrety — vrací jen userId/jmeno/vypravy/km). Nevalidní      */
  /* obdobi → 422 VALIDATION_ERROR. Bez session → 401 NEPRIHLASEN.         */
  /* ------------------------------------------------------------------ */

  app.get("/api/zebricky", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          try {
        const dotaz = req.query as { obdobi?: unknown };
        const surove: unknown = dotaz.obdobi;
        let obdobi = "celkem";
        if (surove !== undefined) {
          if (typeof surove !== "string") {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              obdobi: ["Období musí být „celkem“, nebo rok ve tvaru RRRR."],
            });
            return;
          }
          const ciste = surove.trim();
          if (ciste === "celkem" || ciste.length === 0) {
            obdobi = "celkem";
          } else if (/^\d{4}$/.test(ciste)) {
            const rok = Number(ciste);
            if (!Number.isInteger(rok) || rok < 2000 || rok > 2100) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                obdobi: ["Období musí být „celkem“, nebo rok ve tvaru RRRR."],
              });
              return;
            }
            obdobi = ciste;
          } else {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              obdobi: ["Období musí být „celkem“, nebo rok ve tvaru RRRR."],
            });
            return;
          }
        }

        const db = getDb();
        // Jeden agregační dotaz — GROUP BY podle uživatele, řazení
        // vypravy DESC, km DESC + tie-break jmeno ASC, LIMIT 50.
        // Filtr roku rozsahem data (index expeditions(datum)),
        // filtr docházky + seskupení kryje index participants(status, user_id).
        type ZebrickyRadka = {
          user_id: unknown;
          jmeno_raw: unknown;
          discord_raw: unknown;
          vypravy: unknown;
          km: unknown;
          clen_od: unknown;
        };
        let suroveRadky: ZebrickyRadka[];
        if (obdobi === "celkem") {
          const vysledek = await db.execute(sql`
            SELECT u.id AS user_id,
              TRIM(BOTH ' ' FROM COALESCE(u.jmeno, '') || ' ' || COALESCE(u.prijmeni, '')) AS jmeno_raw,
              NULLIF(TRIM(COALESCE(u.discord_nick, '')), '') AS discord_raw,
              SUM(CASE WHEN p.user_id = e.organizator_id THEN 2 ELSE 1 END)::int AS vypravy,
              (ROUND(COALESCE(SUM(e.km), 0)::numeric, 1))::float8 AS km,
              EXTRACT(YEAR FROM u.created_at)::int AS clen_od
            FROM participants p
            JOIN users u ON u.id = p.user_id
            JOIN expeditions e ON e.id = p.expedition_id
            WHERE p.status = 'ucastnil_se' AND p.user_id IS NOT NULL
              AND e.stav = 'proběhlá'
            GROUP BY u.id, u.jmeno, u.prijmeni, u.discord_nick, u.created_at
            ORDER BY vypravy DESC, km DESC, jmeno_raw ASC
            LIMIT 50
          `);
          suroveRadky = vysledek.rows as ZebrickyRadka[];
        } else {
          const od = `${obdobi}-01-01`;
          const doDne = `${Number(obdobi) + 1}-01-01`;
          const vysledek = await db.execute(sql`
            SELECT u.id AS user_id,
              TRIM(BOTH ' ' FROM COALESCE(u.jmeno, '') || ' ' || COALESCE(u.prijmeni, '')) AS jmeno_raw,
              NULLIF(TRIM(COALESCE(u.discord_nick, '')), '') AS discord_raw,
              SUM(CASE WHEN p.user_id = e.organizator_id THEN 2 ELSE 1 END)::int AS vypravy,
              (ROUND(COALESCE(SUM(e.km), 0)::numeric, 1))::float8 AS km,
              EXTRACT(YEAR FROM u.created_at)::int AS clen_od
            FROM participants p
            JOIN users u ON u.id = p.user_id
            JOIN expeditions e ON e.id = p.expedition_id
            WHERE p.status = 'ucastnil_se' AND p.user_id IS NOT NULL
              AND e.stav = 'proběhlá'
              AND e.datum >= ${od} AND e.datum < ${doDne}
            GROUP BY u.id, u.jmeno, u.prijmeni, u.discord_nick, u.created_at
            ORDER BY vypravy DESC, km DESC, jmeno_raw ASC
            LIMIT 50
          `);
          suroveRadky = vysledek.rows as ZebrickyRadka[];
        }
        const zebricky: import("../../src/shared/api-types").ZebrickyResponse["zebricky"] =
          [];
        for (const radek of suroveRadky) {
          if (typeof radek.user_id !== "string" || radek.user_id.length === 0) {
            continue;
          }
          const celeJmeno =
            typeof radek.jmeno_raw === "string"
              ? radek.jmeno_raw.trim().replace(/\s+/g, " ")
              : "";
          const discord =
            typeof radek.discord_raw === "string" ? radek.discord_raw.trim() : "";
          const jmeno = celeJmeno.length > 0 ? celeJmeno : discord.length > 0 ? discord : "Člen";
          if (
            typeof radek.vypravy !== "number" ||
            !Number.isInteger(radek.vypravy) ||
            radek.vypravy < 0
          ) {
            continue;
          }
          if (
            typeof radek.km !== "number" ||
            !Number.isFinite(radek.km) ||
            radek.km < 0
          ) {
            continue;
          }
          zebricky.push({
            userId: radek.user_id as import("../../src/shared/api-types").UserId,
            jmeno,
            vypravy: radek.vypravy,
            km: radek.km,
            ...(typeof radek.clen_od === "number" ? { clenOd: radek.clen_od } : {}),
          });
        }
        const telo: import("../../src/shared/api-types").ZebrickyResponse = {
          zebricky,
          obdobi,
        };
        res.json(telo);
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* Mapa žebříčku: všechny uskutečněné výpravy klubu. Stejný filtr      */
  /* období jako tabulka. Čte jen přihlášený (bez session → 401).        */
  app.get("/api/zebricky/trasy", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          try {
        const dotaz = req.query as { obdobi?: unknown };
        const surove: unknown = dotaz.obdobi;
        let obdobi = "celkem";
        if (surove !== undefined) {
          if (typeof surove !== "string") {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              obdobi: ["Období musí být „celkem“, nebo rok ve tvaru RRRR."],
            });
            return;
          }
          const ciste = surove.trim();
          if (ciste === "celkem" || ciste.length === 0) {
            obdobi = "celkem";
          } else if (/^\d{4}$/.test(ciste)) {
            const rok = Number(ciste);
            if (!Number.isInteger(rok) || rok < 2000 || rok > 2100) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                obdobi: ["Období musí být „celkem“, nebo rok ve tvaru RRRR."],
              });
              return;
            }
            obdobi = ciste;
          } else {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              obdobi: ["Období musí být „celkem“, nebo rok ve tvaru RRRR."],
            });
            return;
          }
        }

        const db = getDb();
        const podminky = [eq(expeditions.stav, "proběhlá")];
        if (obdobi !== "celkem") {
          podminky.push(gte(expeditions.datum, `${obdobi}-01-01`));
          podminky.push(lt(expeditions.datum, `${Number(obdobi) + 1}-01-01`));
        }
        const radky = await db
          .select({
            id: expeditions.id,
            nazev: expeditions.nazev,
            datum: expeditions.datum,
            km: expeditions.km,
            trasaPolyline: expeditions.trasaPolyline,
          })
          .from(expeditions)
          .where(and(...podminky))
          .orderBy(desc(expeditions.datum));

        const trasy: import("../../src/shared/api-types").ZebrickyTrasa[] = [];
        for (const radek of radky) {
          if (typeof radek.id !== "string" || radek.id.length === 0) continue;
          if (typeof radek.nazev !== "string" || radek.nazev.length === 0) continue;
          const datum =
            typeof radek.datum === "string" ? radek.datum.slice(0, 10) : "";
          if (datum.length === 0) continue;
          trasy.push({
            id: radek.id,
            nazev: radek.nazev,
            datum,
            km: typeof radek.km === "number" ? radek.km : null,
            trasaPolyline:
              typeof radek.trasaPolyline === "string" ? radek.trasaPolyline : null,
          });
        }
        const telo: import("../../src/shared/api-types").ZebrickyTrasyResponse = {
          obdobi,
          trasy,
        };
        res.json(telo);
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });
}
