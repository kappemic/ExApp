/**
 * Strava OAuth, activity pairing, and manual activity HTTP routes.
 */

import {
  eq,
  sql,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import {
  STRAVA_NEDOSTUPNA_ZPRAVA,
  STRAVA_NENI_NASTAVENA_ZPRAVA,
} from "../../src/shared/api-types";
import {
  vyzadujPrihlaseni,
  vyzadujSpravceVyprav,
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
  validujNeparovaneQuery,
  validujParovaniAktivitu,
  validujRucniAktivitu,
  validujStravaCallback,
} from "./validace";
import {
  STRAVA_SCOPE_DEFAULT,
  StravaVymenaChyba,
  chceVynutitObnoveni,
  ctiKlientskyPuvod,
  ctiStravaClientId,
  ctiStravaRedirectUri,
  jeRealneClientId,
  jeStravaNedostupnaChyba,
  nactiVsechnyStravaAktivity,
  oznacSparovane,
  rozhodniOdpojeni,
  rozhodniParovani,
  sestavStravaAuthUrl,
  sestavStravaCallbackRedirect,
  odpojStravu,
  ulozStravaTokeny,
  vymenCodeZaTokeny,
  zajistiPlatnyAccessToken,
} from "./strava";
import {
  ctiStravaStateCookie,
  nastavStravaStateCookie,
  sediStravaState,
  smazStravaStateCookie,
  vytvorStravaState,
} from "./strava-state";
import {
  lzeDoplnitArchiv,
} from "./vyprava-termin";
import {
  expeditions,
} from "../../drizzle/schema/expeditions";
import type {
  ExpeditionRow,
} from "../../drizzle/schema/expeditions";
import {
  stravaTokens,
} from "../../drizzle/schema/strava_tokens";
import {
  users,
} from "../../drizzle/schema/users";
import {
  spocitejUcastniky,
} from "./vypravy";

import {
  ctiIdVypravy,
  jeUnikatniKolize,
} from "./bff-sdilene";

import {
  apiExpediceSPoctem,
} from "./vypravy-routes";

export function registrujStravu(app: Express): void {
  /**
   * Výpadek Stravy (timeout / síť / 5xx) → 502 STRAVA_NEDOSTUPNA,
   * jinak slepá 500. Log je strukturovaný a bez secretů
   * (jen event + endpoint — nikdy token, secret ani tělo odpovědi).
   * 401 / 403 / 409 větve tím nejsou dotčeny — volá se jen z `catch`.
   */
  function stravaNedostupnaNeboVnitrniChyba(
    res: Response,
    chyba: unknown,
    endpoint: string,
  ): void {
    if (res.headersSent) return;
    if (jeStravaNedostupnaChyba(chyba)) {
      console.warn(JSON.stringify({ event: "strava_nedostupna", endpoint }));
      posliChybu(res, "STRAVA_NEDOSTUPNA", STRAVA_NEDOSTUPNA_ZPRAVA);
      return;
    }
    vnitrniChyba(res);
  }

  /* ------------------------------------------------------------------ */
  /* Fáze 4, Krok 1 — Strava OAuth + správa tokenů (kontrakt §15).        */
  /* GET /api/strava/auth-url = USER. Server vydá state a httpOnly cookie. */
  /* GET /api/strava/callback?code= = USER: výměna code→tokens proběhne   */
  /* POUZE na serveru (secret nikdy neopustí env), upsert `strava_tokens` */
  /* + `users.strava_id`, pak 302 zpět na profil (`?format=json` vrátí    */
  /* JSON pro strojové klienty). Chybný `code` → 422 VALIDATION_ERROR     */
  /* (pole `code`), bez session → 401 NEPRIHLASEN.                        */
  /* DELETE /api/strava/odpojit = USER: smaže tokeny + `strava_id=NULL`.  */
  /* Idempotentní — i bez propojení vrací 200 `{ ok: true }`.             */
  /* Refresh: `zajistiPlatnyAccessToken` (server/src/strava.ts) obnoví    */
  /* token před každým voláním Stravy — session tím nikdy netrpí.         */
  /* ------------------------------------------------------------------ */

  /* GET /api/strava/auth-url — USER. State vznikne tady, ne z query. */
  /* Krok 7b: nikdy nevrací mock URL do prohlížeče — nemumerické / mock /   */
  /* prázdné ID (chybí reálné STRAVA_CLIENT_ID) → 503 STRAVA_NENI_NASTAVENA. */
  /* Mock výměna code→tokens na callbacku tím není dotčena (STRAVA_MOCK=1). */
  function odpovezStravaAuthUrl(req: Request, res: Response): void {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        const clientId = ctiStravaClientId();
        if (!jeRealneClientId(clientId)) {
          posliChybu(res, "STRAVA_NENI_NASTAVENA", STRAVA_NENI_NASTAVENA_ZPRAVA);
          return;
        }
        const uzivatel = (req as AutentizovanyRequest).uzivatel;
        const vydane = vytvorStravaState(uzivatel.id);
        nastavStravaStateCookie(res, vydane.cookie);
        const url = sestavStravaAuthUrl({
          clientId,
          redirectUri: ctiStravaRedirectUri(),
          state: vydane.state,
          scope: STRAVA_SCOPE_DEFAULT,
        });
        res.json({ url });
      });
    })();
  }

  app.get("/api/strava/auth-url", (req: Request, res: Response) => {
    odpovezStravaAuthUrl(req, res);
  });

  /* GET /api/strava/callback — USER, výměna code→tokens + 302 na profil. */
  /* Krok 9: prohlížeč (bez ?format=json) nikdy nedostane JSON — vždy 302   */
  /* s `?strava=propojeno` nebo `?strava=chyba&duvod=<allowlist>` (český     */
  /* důvod ukáže ProfilPage). `error=access_denied` (uživatel na Stravě      */
  /* zamítl) → `duvod=odepreno`; nevalidní code → `duvod=neplatny-kod`;      */
  /* Stravou odmítnutý code → `duvod=strava-odmitla`. Strojový klient        */
  /* (?format=json) drží JSON kontrakt (422 VALIDATION_ERROR, ne 500).      */
  app.get("/api/strava/callback", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const dotaz = req.query as Record<string, unknown>;
          const chceJson = dotaz["format"] === "json";
          const puvod = ctiKlientskyPuvod();
          const chybaStravy =
            typeof dotaz["error"] === "string" ? dotaz["error"].trim() : "";
          if (chybaStravy.length > 0) {
            if (chceJson) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                code: ["Propojení jsi na Stravě zamítl. Zkus to prosím znovu."],
              });
              return;
            }
            res.redirect(
              302,
              sestavStravaCallbackRedirect(puvod, "chyba", "odepreno"),
            );
            return;
          }
          const overeni = validujStravaCallback(req.query as unknown);
          if (!overeni.uspech || overeni.data === null) {
            if (chceJson) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
              return;
            }
            res.redirect(
              302,
              sestavStravaCallbackRedirect(puvod, "chyba", "neplatny-kod"),
            );
            return;
          }
          try {
            const db = getDb();
            const uzivatel = (req as AutentizovanyRequest).uzivatel;
            const state = overeni.data.state ?? "";
            if (!sediStravaState(ctiStravaStateCookie(req), state, uzivatel.id)) {
              smazStravaStateCookie(res);
              if (chceJson) {
                posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                  state: ["Stav propojení nesedí. Zkus propojení znovu z profilu."],
                });
                return;
              }
              res.redirect(
                302,
                sestavStravaCallbackRedirect(puvod, "chyba", "neplatny-kod"),
              );
              return;
            }
            smazStravaStateCookie(res);
            const vysledek = await vymenCodeZaTokeny(overeni.data.code);
            await ulozStravaTokeny(db, uzivatel.id, vysledek);
            if (chceJson) {
              res.json({
                ok: true,
                stravaId: vysledek.athleteId,
                scope: vysledek.scope,
                expirace: vysledek.expirace.toISOString(),
              });
              return;
            }
            res.redirect(
              302,
              sestavStravaCallbackRedirect(puvod, "propojeno"),
            );
          } catch (chyba) {
            if (chyba instanceof StravaVymenaChyba) {
              if (chceJson) {
                posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                  code: [chyba.message],
                });
                return;
              }
              res.redirect(
                302,
                sestavStravaCallbackRedirect(puvod, "chyba", "strava-odmitla"),
              );
              return;
            }
            // Neočekávaná chyba prohlížeče: taky redirect (ne visící 500
            // bez cíle) — důvod zůstává obecný, detail jen v server logu.
            if (!chceJson && !res.headersSent) {
              res.redirect(
                302,
                sestavStravaCallbackRedirect(puvod, "chyba", "neznama-chyba"),
              );
              return;
            }
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* ------------------------------------------------------------------ */
  /* Krok 2 Fáze 4 — Párování aktivit k uzavřené výpravě.               */
  /* GET /api/strava/neparovane (USER, jen vlastní token, per_page=10,   */
  /* filtr `strava_activity_id IS NULL`). Bez propojení → prázdné pole   */
  /* (ProfilPage pak ukáže výzvu k propojení, nikdy 404).                */
  /* POST /api/expeditions/:id/strava-parovani (dual-guard               */
  /* `vyzadujSpravceVyprav` — USER bez práva → 403; jen `stav=proběhlá`, */
  /* jinak 409 VYPRAVA_UZAVRENA; duplicita → 409 UZ_PRIHLASEN). Po        */
  /* confirmu zapíše `km / prevyseni_m / trasa_polyline /                */
  /* strava_activity_id`. Chyby jen ApiErrorResponse.                    */
  /* ------------------------------------------------------------------ */

  /** DB řádek expedice → veřejná `ApiAktivita` (kopie párovacích sloupců). */
  function toApiAktivitaZRadku(radek: ExpeditionRow): import("../../src/shared/api-types").ApiAktivita {
    return {
      id: `aktivita-${radek.id}`,
      expeditionId: radek.id,
      km: typeof radek.km === "number" ? radek.km : null,
      prevyseniM: typeof radek.prevyseniM === "number" ? radek.prevyseniM : null,
      stravaActivityId:
        typeof radek.stravaActivityId === "string" ? radek.stravaActivityId : null,
      trasaPolyline:
        typeof radek.trasaPolyline === "string" ? radek.trasaPolyline : null,
    };
  }

  /* GET /api/strava/neparovane — USER, VŠECHNY moje aktivity s příznakem. */
  /* Krok 13: `?page&per_page` (default 1/30, max 100); Strava se tahá        */
  /* stránkovaně (per_page cap 100, max 3 stránky do prázdna); seznam vrací   */
  /* VŠECHNY aktivity s `sparovano` + `celkem` (před stránkováním).           */
  /* Bez propojení → prázdné pole (ProfilPage ukáže výzvu, nikdy 404).        */
  app.get("/api/strava/neparovane", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const overeni = validujNeparovaneQuery(req.query as unknown);
          if (!overeni.uspech || overeni.data === null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
            return;
          }
          try {
            const db = getDb();
            const id = (req as AutentizovanyRequest).uzivatel.id;
            const token = await zajistiPlatnyAccessToken(db, id);
            if (token === null) {
              const telo: import("../../src/shared/api-types").NeparovaneAktivityResponse = {
                aktivity: [],
                celkem: 0,
              };
              res.json(telo);
              return;
            }
            const vsechny = await nactiVsechnyStravaAktivity(token, 100, 3);
            const sparovane = await db
              .select({ stravaActivityId: expeditions.stravaActivityId })
              .from(expeditions)
              .where(sql`${expeditions.stravaActivityId} IS NOT NULL`);
            const sparovanaIds: string[] = sparovane.flatMap((radek) =>
              typeof radek.stravaActivityId === "string" &&
              radek.stravaActivityId.length > 0
                ? [radek.stravaActivityId]
                : [],
            );
            const oznacene = oznacSparovane(vsechny, sparovanaIds);
            const celkem = oznacene.length;
            const start = (overeni.data.page - 1) * overeni.data.per_page;
            const telo: import("../../src/shared/api-types").NeparovaneAktivityResponse = {
              aktivity: oznacene.slice(start, start + overeni.data.per_page),
              celkem,
            };
            res.json(telo);
          } catch (chyba) {
            stravaNedostupnaNeboVnitrniChyba(
              res,
              chyba,
              "GET /api/strava/neparovane",
            );
          }
        })();
      });
    })();
  });

  /* POST /api/expeditions/:id/strava-parovani — dual-guard, jen proběhlá. */
  app.post("/api/expeditions/:id/strava-parovani", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const overeni = validujParovaniAktivitu(req.body as unknown);
        if (!overeni.uspech || overeni.data === null) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
          return;
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
          const sparovane = await db
            .select({ stravaActivityId: expeditions.stravaActivityId })
            .from(expeditions)
            .where(sql`${expeditions.stravaActivityId} IS NOT NULL`);
          const aktivitaUzJinde = sparovane.some(
            (polozka) => polozka.stravaActivityId === overeni.data?.activityId,
          );
          const rozhodnuti = rozhodniParovani({
            stav: radek.stav,
            datum: radek.datum,
            datumDo: radek.datumDo,
            expediceSparovana: radek.stravaActivityId !== null,
            aktivitaUzSparovana: aktivitaUzJinde,
          });
          if (!rozhodnuti.ok) {
            posliChybu(res, rozhodnuti.kod, rozhodnuti.zprava);
            return;
          }
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          const token = await zajistiPlatnyAccessToken(db, uzivatel.id);
          if (token === null) {
            posliChybu(
              res,
              "VALIDATION_ERROR",
              "Zkontroluj zvýrazněná pole.",
              { activityId: ["Nejdřív si v profilu propoj Stravu."] },
            );
            return;
          }
          const aktivity = await nactiVsechnyStravaAktivity(token, 100, 3);
          const navrh = aktivity.find(
            (polozka) => polozka.id === (overeni.data?.activityId ?? ""),
          );
          if (navrh === undefined) {
            posliChybu(res, "NENALEZENO", "Aktivita na Stravě nenalezena.");
            return;
          }
          let zapsano: ExpeditionRow | undefined;
          try {
            const aktualizovane = await db
              .update(expeditions)
              .set({
                km: navrh.km,
                prevyseniM: navrh.prevyseniM,
                stravaActivityId: navrh.id,
                trasaPolyline: navrh.trasaPolyline,
              })
              .where(eq(expeditions.id, id))
              .returning();
            zapsano = aktualizovane[0];
          } catch (chyba) {
            if (jeUnikatniKolize(chyba)) {
              posliChybu(
                res,
                "UZ_PRIHLASEN",
                "Tahle aktivita už je spárovaná k jiné výpravě.",
              );
              return;
            }
            throw chyba;
          }
          if (zapsano === undefined) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          const pocet = await spocitejUcastniky(db, id);
          const api = apiExpediceSPoctem(zapsano, pocet);
          if (api === null) {
            vnitrniChyba(res);
            return;
          }
          const telo: import("../../src/shared/api-types").SparujAktivituResponse = {
            expedice: api,
            aktivita: toApiAktivitaZRadku(zapsano),
          };
          res.json(telo);
        } catch (chyba) {
          stravaNedostupnaNeboVnitrniChyba(
            res,
            chyba,
            "POST /api/expeditions/:id/strava-parovani",
          );
        }
      })();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Krok 13 — Odpojení aktivity od výpravy (aditivní).                   */
  /* DELETE /api/expeditions/:id/strava-parovani (dual-guard               */
  /* `vyzadujSpravceVyprav` — USER bez práva → 403; jen `stav=proběhlá`,  */
  /* jinak 409 VYPRAVA_UZAVRENA; nic připojeno → 404 NENALEZENO). Vymaže   */
  /* 4 sloupce (`km / prevyseni_m / strava_activity_id / trasa_polyline →  */
  /* NULL`), takže statistiky klesnou. Audit je strukturovaný log         */
  /* (`strava_odpojeno` + expeditionId) — nikdy tokeny ani secrety.        */
  /* ------------------------------------------------------------------ */

  /* DELETE /api/expeditions/:id/strava-parovani — dual-guard, jen proběhlá. */
  app.delete("/api/expeditions/:id/strava-parovani", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
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
          const pripojeno =
            radek.stravaActivityId !== null ||
            radek.km !== null ||
            radek.prevyseniM !== null ||
            radek.trasaPolyline !== null;
          const rozhodnuti = rozhodniOdpojeni({
            stav: radek.stav,
            datum: radek.datum,
            datumDo: radek.datumDo,
            expediceSparovana: pripojeno,
          });
          if (!rozhodnuti.ok) {
            posliChybu(res, rozhodnuti.kod, rozhodnuti.zprava);
            return;
          }
          const aktualizovane = await db
            .update(expeditions)
            .set({
              km: null,
              prevyseniM: null,
              stravaActivityId: null,
              trasaPolyline: null,
            })
            .where(eq(expeditions.id, id))
            .returning();
          const zapsano = aktualizovane[0];
          if (zapsano === undefined) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          console.info(
            JSON.stringify({ event: "strava_odpojeno", expeditionId: id }),
          );
          const pocet = await spocitejUcastniky(db, id);
          const api = apiExpediceSPoctem(zapsano, pocet);
          if (api === null) {
            vnitrniChyba(res);
            return;
          }
          const telo: import("../../src/shared/api-types").OdpojAktivituResponse = {
            expedice: api,
            aktivita: toApiAktivitaZRadku(zapsano),
          };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Krok 7c — Ruční zadání aktivity k uzavřené výpravě BEZ Stravy.         */
  /* Čtení Strava API (`read`, `activity:read`) je ZDARMA — Summit ani      */
  /* žádné předplatné není potřeba (předplatné odemyká jen prémiové funkce  */
  /* Stravy, ne API pro čtení vlastních aktivit). Předplatné tedy netřeba,  */
  /* a kdo Stravu vůbec nechce, zapíše kilometry ručně:                     */
  /* POST /api/expeditions/:id/aktivita-ruchne { km, prevyseni_m }.         */
  /* Datum se neposílá — bere se z expedice (statistikám stačí km).        */
  /* Dual-guard `vyzadujSpravceVyprav` (USER bez práva → 403); jen          */
  /* `stav=proběhlá`, jinak 409 VYPRAVA_UZAVRENA (stejný kód jako přihláška */
  /* na proběhlou). Zapisuje stejné DB sloupce jako Strava párování         */
  /* (`km / prevyseni_m`), ale `strava_activity_id` i `trasa_polyline`      */
  /* zůstávají NULL — statistiky / heatmapa / leaderboard čtou jen DB       */
  /* (`agregujStatistiky`), takže fungují i bez Stravy. Opakovaný zápis je  */
  /* idempotentní (poslední zápis vyhrává). Chyby jen ApiErrorResponse.     */
  /* ------------------------------------------------------------------ */

  /* POST /api/expeditions/:id/aktivita-ruchne — dual-guard, jen proběhlá. */
  app.post("/api/expeditions/:id/aktivita-ruchne", (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const overeni = validujRucniAktivitu(req.body as unknown);
        if (!overeni.uspech || overeni.data === null) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
          return;
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
              "Kilometry jdou zapsat až po skončení výpravy.",
            );
            return;
          }
          const aktualizovane = await db
            .update(expeditions)
            .set({
              km: overeni.data.km,
              prevyseniM: overeni.data.prevyseniM,
              stravaActivityId: null,
              trasaPolyline: null,
            })
            .where(eq(expeditions.id, id))
            .returning();
          const zapsano = aktualizovane[0];
          if (zapsano === undefined) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          const pocet = await spocitejUcastniky(db, id);
          const api = apiExpediceSPoctem(zapsano, pocet);
          if (api === null) {
            vnitrniChyba(res);
            return;
          }
          const telo: import("../../src/shared/api-types").UlozAktivituRucneResponse = {
            expedice: api,
            aktivita: toApiAktivitaZRadku(zapsano),
          };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  });

  /* DELETE /api/strava/odpojit — USER, smazání tokenů + strava_id=NULL. */app.delete("/api/strava/odpojit", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          try {
            const db = getDb();
            const id = (req as AutentizovanyRequest).uzivatel.id;
            await odpojStravu(db, id);
            res.json({ ok: true });
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* ------------------------------------------------------------------ */
  /* Step 5 (tenký slice) — stav propojení + aliasy connect/disconnect.   */
  /* GET /api/strava/stav (USER): `{ propojeno, stravaId, scope,          */
  /* expirace }` — jen veřejný stav, NIKDY tokeny ani secret. Bez          */
  /* propojení → `{ propojeno: false, stravaId: null, scope: null,         */
  /* expirace: null }` (profil ukáže výzvu, nikdy 404).                    */
  /* GET /api/strava/connect = alias auth-url (stejný USER handler,        */
  /* scope `read,activity:read`). DELETE /api/strava/disconnect = alias    */
  /* odpojit (stejné idempotentní `{ ok: true }`). Párování aktivit, km,   */
  /* heatmapa i leaderboard jsou mimo scope — DB sloupce už existují       */
  /* (`users.strava_id` + `strava_tokens`), nová migrace netřeba.          */
  /* ------------------------------------------------------------------ */

  app.get("/api/strava/stav", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          try {
            const db = getDb();
            const id = (req as AutentizovanyRequest).uzivatel.id;
            const ucty = await db
              .select({ stravaId: users.stravaId })
              .from(users)
              .where(eq(users.id, id))
              .limit(1);
            const ucet = ucty[0];
            if (ucet === undefined) {
              posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
              return;
            }
            if (ucet.stravaId === null) {
              res.json({
                propojeno: false,
                stravaId: null,
                scope: null,
                expirace: null,
              });
              return;
            }
            const tokeny = await db
              .select({ scope: stravaTokens.scope, expirace: stravaTokens.expirace })
              .from(stravaTokens)
              .where(eq(stravaTokens.userId, id))
              .limit(1);
            const radek = tokeny[0];
            if (radek === undefined) {
              // Osiřelé strava_id bez řádku tokenů (např. po ručním zásahu do DB)
              // → tváříme se jako nepropojeno, ať UI navede k Propoj Stravu
              // (místo propojeno:true s fallback expirací, po kterém by párování
              // končilo 422/502).
              res.json({
                propojeno: false,
                stravaId: null,
                scope: null,
                expirace: null,
              });
              return;
            }
            // Klíč se obnovuje sám, když mu zbývá hodina nebo méně.
            // Uživatel na to nemá tlačítko. Odmítnutý refresh → nepropojeno.
            // Výpadek Stravy nechá uložený stav. Tokeny se nevracejí.
            try {
              const platny = await zajistiPlatnyAccessToken(db, id, {
                vynutit: chceVynutitObnoveni(req.query),
              });
              if (platny === null) {
                res.json({
                  propojeno: false,
                  stravaId: null,
                  scope: null,
                  expirace: null,
                });
                return;
              }
              const cerstve = await db
                .select({ scope: stravaTokens.scope, expirace: stravaTokens.expirace })
                .from(stravaTokens)
                .where(eq(stravaTokens.userId, id))
                .limit(1);
              const aktualni = cerstve[0] ?? radek;
              res.json({
                propojeno: true,
                stravaId: ucet.stravaId,
                scope: aktualni.scope ?? STRAVA_SCOPE_DEFAULT,
                expirace: aktualni.expirace ? aktualni.expirace.toISOString() : null,
              });
            } catch {
              res.json({
                propojeno: true,
                stravaId: ucet.stravaId,
                scope: radek.scope ?? STRAVA_SCOPE_DEFAULT,
                expirace: radek.expirace ? radek.expirace.toISOString() : null,
              });
            }
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* GET /api/strava/connect — USER alias auth-url (state vydá server). */
  app.get("/api/strava/connect", (req: Request, res: Response) => {
    odpovezStravaAuthUrl(req, res);
  });

  /* DELETE /api/strava/disconnect — USER alias odpojit (idempotentní). */
  app.delete("/api/strava/disconnect", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          try {
            const db = getDb();
            const id = (req as AutentizovanyRequest).uzivatel.id;
            await odpojStravu(db, id);
            res.json({ ok: true });
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });
}
