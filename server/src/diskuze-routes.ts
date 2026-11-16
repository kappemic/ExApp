/**
 * Discussion, conversation, and attachment HTTP routes.
 */

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import type {
  ApiZprava,
  PosliZpravuResponse,
  SmazatZpravuResponse,
  DiskuzeMetaResponse,
  OznacPrecteniResponse,
  ZpravyListResponse,
  KonverzaceListResponse,
  PosliGlobalZpravuResponse,
  ApiKonverzace,
  KanalDiskuze,
} from "../../src/shared/api-types";
import {
  jeKanalDiskuze,
} from "../../src/shared/api-types";
import {
  hlaskaZakazuSmazani,
  jeAdminUcet,
} from "../../src/shared/mazani-zprav";
import {
  VALIDACE,
} from "../../src/shared/api-types";
import {
  ctiVolitelnehoUzivatele,
  vyzadujPrihlaseni,
  type AutentizovanyRequest,
} from "./auth";
import {
  posliChybu,
  vnitrniChyba,
} from "./chyby";
import { oznameSoukromou, oznameZminky } from "./push";
import {
  FOTKY_NEJSOU_NASTAVENE_ZPRAVA,
  ctiR2Nastaveni,
} from "./r2-fotky";
import {
  chceNahled,
} from "./obrazek-nahled";
import {
  getDb,
  type Db,
} from "./db";
import {
  validujZpravu,
} from "./validace";
import {
  expeditions,
} from "../../drizzle/schema/expeditions";
import {
  users,
} from "../../drizzle/schema/users";
import {
  soukromeZpravy,
} from "../../drizzle/schema/soukrome_zpravy";
import {
  zpravy,
} from "../../drizzle/schema/zpravy";
import {
  diskuzePrecteni,
} from "../../drizzle/schema/diskuze_precteni";
import {
  jeKonverzaceKlic,
  konverzaceKlicExpedice,
  konverzacePrecteni,
} from "../../drizzle/schema/konverzace_precteni";
import {
  anonymniDiskuzeMeta,
  ctiIpZRequestu,
  jeVlaknoNeprectene,
  nactiPrehledZprav,
  nactiStrankuZprav,
  slozZobrazovaneJmeno,
  smiPoslatZpravu,
  smiPsatKanal,
  toApiZprava,
  verejnyAvatarUrl,
  type ProfilProJmeno,
} from "./diskuze";
import {
  nactiSoukromeKonverzace,
  nactiVlaknoSoukrome,
  nactiProfily,
} from "./soukrome";
import {
  nactiSkupinoveKonverzace,
  overCteniZpravSkupiny,
} from "./skupiny";
import {
  ChybiUlozistePriloh,
  nactiMapuPriloh,
  nactiPristupPrilohy,
  nactiTeloZpravy,
  posliUlozenouPrilohu,
  zalozZpravuSPrilohami,
  type PripravenaPriloha,
} from "./zprava-prilohy";
import {
  jeUcastnikSoukromeho,
  klicSoukromehoChatu,
} from "../../src/shared/soukromy-klic";

import {
  ctiIdVypravy,
} from "./bff-sdilene";
import { prostredi } from "./prostredi";


export function registrujDiskuzi(app: Express): void {
  /* ------------------------------------------------------------------ */
  /* Fáze 5, Krok 4 — Diskuze k výpravě (vlákno zpráv, PRD §2.5).          */
  /* GET vlákna = PUBLIC (?limit default 50, cap 100 & cursor, řazeno      */
  /* created_at ASC + id ASC tie-break, nextCursor = id poslední zprávy).  */
  /* POST = USER (rate-limit 10/min/ip → 429 MOC_POZADAVKU; text se ukládá */
  /* raw trimnutý bez escapování — escapuje až render `escapujHtml`).      */
  /* DELETE detailu = autor do 10 minut, nebo admin (i stará a cizí).       */
  /* Jinak 403 ZAKAZANO. Soft-delete (UPDATE smazano_at, GET filtruje       */
  /* smazano_at IS NULL). Smazání výpravy maže vlákno (CASCADE v DB).      */
  /* Chyby vždy jen ApiErrorResponse.                                      */
  /* ------------------------------------------------------------------ */

  /** `:zpravaId` z cesty — prázdné → volající vrátí 404 NENALEZENO. */
  function ctiIdZpravy(req: Request): string {
    const surova: unknown = (req.params as Record<string, unknown>)["zpravaId"];
    return typeof surova === "string" ? surova.trim() : "";
  }

  /** `?limit` vlákna — default 50, cap 100. Neplatné → null (route vrátí 422). */
  function ctiLimitZprav(dotaz: { limit?: unknown }): number | null {
    const surova: unknown = dotaz.limit;
    if (surova === undefined || surova === null) return VALIDACE.zpravyLimitDefault;
    const cista: string = typeof surova === "number" ? String(surova) : typeof surova === "string" ? surova.trim() : "";
    if (cista.length === 0) return VALIDACE.zpravyLimitDefault;
    const cislo = Number(cista);
    if (!Number.isInteger(cislo) || cislo < 1 || cislo > VALIDACE.zpravyLimitMax) return null;
    return cislo;
  }

  /** `?tail=1` — poslední stránka vlákna (živé zprávy), ne nejstarší. */
  function ctiKonecZprav(dotaz: { tail?: unknown }): boolean {
    return dotaz.tail === "1" || dotaz.tail === "true";
  }

  /** `?cursor` vlákna — opaque id poslední zprávy. Prázdné = od začátku. */
  function ctiCursorZprav(dotaz: { cursor?: unknown }): string | null {
    const surova: unknown = dotaz.cursor;
    if (surova === undefined || surova === null) return null;
    if (typeof surova !== "string") return null;
    const ciste = surova.trim();
    return ciste.length === 0 ? null : ciste;
  }

  /* ------------------------------------------------------------------ */
  /* Step 2 — jména z JOINu `users` (bez extra fetch z klienta).          */
  /* Jeden batched SELECT pro celé vlákno (žádné N+1) → `authorName`       */
  /* (jmeno+prijmeni, fallback discordNick/email; SET NULL drží snapshot). */
  /* ------------------------------------------------------------------ */

  /** Batched JOIN autorů pro vlákno (jeden SELECT, žádné N+1). */
  async function nactiJmenaAutoru(
    db: Db,
    autorIds: ReadonlyArray<string>,
  ): Promise<Map<string, ProfilProJmeno>> {
    const mapa = new Map<string, ProfilProJmeno>();
    const unikatni: string[] = [...new Set(autorIds)];
    if (unikatni.length === 0) return mapa;
    const radky = await db
      .select({
        id: users.id,
        jmeno: users.jmeno,
        prijmeni: users.prijmeni,
        discordNick: users.discordNick,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.id, unikatni));
    for (const radek of radky) {
      mapa.set(radek.id, {
        jmeno: radek.jmeno,
        prijmeni: radek.prijmeni,
        discordNick: radek.discordNick,
        email: radek.email,
        avatarUrl: verejnyAvatarUrl(radek.avatarUrl),
      });
    }
    return mapa;
  }

  /** `?channel` globálu — `dulezite` | `general`; neplatné → null (route 422). */
  function ctiKanalGlobalu(dotaz: { channel?: unknown }): KanalDiskuze | null | undefined {
    const surova: unknown = dotaz.channel;
    if (surova === undefined || surova === null) return undefined;
    if (typeof surova !== "string") return null;
    const ciste = surova.trim();
    if (!jeKanalDiskuze(ciste)) return null;
    const kanal: KanalDiskuze = ciste as KanalDiskuze;
    if (kanal === "expedice") return null;
    return kanal;
  }

  /* GET /api/expeditions/:id/zpravy — logged-in members only. */
  app.get("/api/expeditions/:id/zpravy", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
      const id = ctiIdVypravy(req);
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
        return;
      }
      const dotaz = req.query as { limit?: unknown; cursor?: unknown; tail?: unknown };
      if (dotaz.cursor !== undefined && dotaz.cursor !== null && typeof dotaz.cursor !== "string") {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
          cursor: ["Kurzor musí být text."],
        });
        return;
      }
      const limit = ctiLimitZprav(dotaz);
      if (limit === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
          limit: ["Počet zpráv musí být od 1 do 100."],
        });
        return;
      }
      const cursor = ctiCursorZprav(dotaz);
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
        const filtr = and(eq(zpravy.expediceId, id), isNull(zpravy.smazanoAt));
        if (filtr === undefined) {
          vnitrniChyba(res);
          return;
        }
        const stranka = await nactiStrankuZprav(db, filtr, limit, cursor, ctiKonecZprav(dotaz));
        const jmena = await nactiJmenaAutoru(
          db,
          stranka.radky
            .map((radek) => radek.autorId)
            .filter((hodnota): hodnota is string => typeof hodnota === "string"),
        );
        const prilohy = await nactiMapuPriloh(
          db,
          "zprava",
          stranka.radky.map((radek) => radek.id),
        );
        const zpravyStranky: ApiZprava[] = [];
        for (const radek of stranka.radky) {
          const profil: ProfilProJmeno | null =
            typeof radek.autorId === "string" ? (jmena.get(radek.autorId) ?? null) : null;
          const api = toApiZprava(radek, profil, prilohy.get(radek.id) ?? []);
          if (api !== null) zpravyStranky.push(api);
        }
        const telo: ZpravyListResponse = {
          zpravy: zpravyStranky,
          nextCursor: stranka.nextCursor,
        };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
      })();
      });
    })();
  });

  /* POST /api/expeditions/:id/zpravy — přihlášený (USER). → 201. */
  app.post("/api/expeditions/:id/zpravy", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const ip = ctiIpZRequestu(req);
          if (!smiPoslatZpravu(ip)) {
            posliChybu(res, "MOC_POZADAVKU", "Posíláš zprávy moc rychle. Počkej chvíli a zkus to znovu.");
            return;
          }
          const nactene = await nactiTeloZpravy(req);
          if (!nactene.ok) {
            posliChybu(res, "VALIDATION_ERROR", nactene.hlaska, nactene.chyby);
            return;
          }
          let text = "";
          let soubory: PripravenaPriloha[] = [];
          if (nactene.zdroj === "json") {
            const overeni = validujZpravu(nactene.telo);
            if (!overeni.uspech || overeni.data === null) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
              return;
            }
            text = overeni.data.text;
          } else {
            text = nactene.data.text;
            soubory = nactene.data.soubory;
          }
          const id = ctiIdVypravy(req);
          if (id.length === 0) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          try {
            const db = getDb();
            const nalezene = await db
              .select({ id: expeditions.id })
              .from(expeditions)
              .where(eq(expeditions.id, id))
              .limit(1);
            if (nalezene.length === 0) {
              posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
              return;
            }
            const autorId = (req as AutentizovanyRequest).uzivatel.id;
            const autorRadky = await db
              .select({
                jmeno: users.jmeno,
                prijmeni: users.prijmeni,
                discordNick: users.discordNick,
                email: users.email,
                avatarUrl: users.avatarUrl,
              })
              .from(users)
              .where(eq(users.id, autorId))
              .limit(1);
            const autorProfil: ProfilProJmeno | null =
              autorRadky[0] === undefined
                ? null
                : {
                    jmeno: autorRadky[0].jmeno,
                    prijmeni: autorRadky[0].prijmeni,
                    discordNick: autorRadky[0].discordNick,
                    email: autorRadky[0].email,
                    avatarUrl: verejnyAvatarUrl(autorRadky[0].avatarUrl),
                  };
            const snapshot: string =
              autorProfil === null ? "" : slozZobrazovaneJmeno(autorProfil);
            const nove = await zalozZpravuSPrilohami(
              ctiR2Nastaveni(prostredi()),
              soubory,
              "zprava",
              db,
              async () => {
                const vlozene = await db
                  .insert(zpravy)
                  .values({
                    expediceId: id,
                    kanal: "expedice",
                    autorId,
                    autorJmeno: snapshot,
                    text,
                  })
                  .returning();
                return vlozene[0];
              },
            );
            const mapa = await nactiMapuPriloh(db, "zprava", [nove.id]);
            const api = toApiZprava(nove, autorProfil, mapa.get(nove.id) ?? []);
            if (api === null) {
              vnitrniChyba(res);
              return;
            }
            const telo: PosliZpravuResponse = { zprava: api };
            res.status(201).json(telo);
          } catch (chyba: unknown) {
            if (chyba instanceof ChybiUlozistePriloh) {
              posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
              return;
            }
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* DELETE /api/expeditions/:id/zpravy/:zpravaId — autor nebo dual-guard (soft-delete). */
  app.delete("/api/expeditions/:id/zpravy/:zpravaId", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const id = ctiIdVypravy(req);
          const zpravaId = ctiIdZpravy(req);
          if (id.length === 0 || zpravaId.length === 0) {
            posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
            return;
          }
          try {
            const db = getDb();
            const nalezene = await db
              .select()
              .from(zpravy)
              .where(and(eq(zpravy.id, zpravaId), eq(zpravy.expediceId, id)))
              .limit(1);
            const radek = nalezene[0];
            if (radek === undefined || radek.smazanoAt !== null) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            const uzivatel = (req as AutentizovanyRequest).uzivatel;
            const jeAutor: boolean = radek.autorId !== null && radek.autorId === uzivatel.id;
            const pravo = {
              jeAdmin: jeAdminUcet(uzivatel),
              jeAutor,
              createdAt: radek.createdAt,
            };
            const duvod = hlaskaZakazuSmazani(pravo);
            if (duvod !== null) {
              posliChybu(res, "ZAKAZANO", duvod);
              return;
            }
            const smazane = await db
              .update(zpravy)
              .set({ smazanoAt: new Date() })
              .where(and(eq(zpravy.id, zpravaId), eq(zpravy.expediceId, id)))
              .returning({ id: zpravy.id });
            if (smazane.length === 0) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            const telo: SmazatZpravuResponse = { ok: true };
            res.json(telo);
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* ------------------------------------------------------------------ */
  /* Step 2 — Globální kanály + přehled konverzací (kontrakt §19).          */
  /* GET konverzace i GET globálu = USER (viz PRISTUP_KONVERZACE);         */
  /* POST globálu = USER + guard kanálu (`dulezite` jen                     */
  /* vedeni/rada/admin, jinak 403 ZAKAZANO; `general` každý přihlášený).   */
  /* POST read = USER, upsert `konverzace_precteni` (key v body, čas razí   */
  /* server, userId VŽDY ze session). U vláken výprav drží read i legacy   */
  /* `diskuze_precteni`, aby staré badge nesvítily. Chyby jen ApiError.    */
  /* ------------------------------------------------------------------ */

  /* GET /api/diskuze/zpravy?channel=dulezite|general — logged-in members. */
  app.get("/api/diskuze/zpravy", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
      const dotaz = req.query as { channel?: unknown; limit?: unknown; cursor?: unknown; tail?: unknown };
      const kanal = ctiKanalGlobalu(dotaz);
      if (kanal === null || kanal === undefined) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
          channel: ["Kanál musí být „dulezite“, nebo „general“."],
        });
        return;
      }
      const limit = ctiLimitZprav(dotaz);
      if (limit === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
          limit: ["Počet zpráv musí být od 1 do 100."],
        });
        return;
      }
      if (dotaz.cursor !== undefined && dotaz.cursor !== null && typeof dotaz.cursor !== "string") {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
          cursor: ["Kurzor musí být text."],
        });
        return;
      }
      const cursor = ctiCursorZprav(dotaz);
      try {
        const db = getDb();
        const filtr = and(
          eq(zpravy.kanal, kanal),
          isNull(zpravy.expediceId),
          isNull(zpravy.smazanoAt),
        );
        if (filtr === undefined) {
          vnitrniChyba(res);
          return;
        }
        const stranka = await nactiStrankuZprav(db, filtr, limit, cursor, ctiKonecZprav(dotaz));
        const jmena = await nactiJmenaAutoru(
          db,
          stranka.radky
            .map((radek) => radek.autorId)
            .filter((hodnota): hodnota is string => typeof hodnota === "string"),
        );
        const prilohy = await nactiMapuPriloh(
          db,
          "zprava",
          stranka.radky.map((radek) => radek.id),
        );
        const zpravyStranky: ApiZprava[] = [];
        for (const radek of stranka.radky) {
          const profil: ProfilProJmeno | null =
            typeof radek.autorId === "string" ? (jmena.get(radek.autorId) ?? null) : null;
          const api = toApiZprava(radek, profil, prilohy.get(radek.id) ?? []);
          if (api !== null) zpravyStranky.push(api);
        }
        const telo: ZpravyListResponse = {
          zpravy: zpravyStranky,
          nextCursor: stranka.nextCursor,
        };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
      })();
      });
    })();
  });

  /* DELETE /api/diskuze/zpravy/:zpravaId — autor do 10 minut, nebo admin. */
  app.delete("/api/diskuze/zpravy/:zpravaId", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const zpravaId = ctiIdZpravy(req);
          if (zpravaId.length === 0) {
            posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
            return;
          }
          try {
            const db = getDb();
            const nalezene = await db
              .select()
              .from(zpravy)
              .where(eq(zpravy.id, zpravaId))
              .limit(1);
            const radek = nalezene[0];
            if (
              radek === undefined ||
              radek.smazanoAt !== null ||
              radek.expediceId !== null ||
              (radek.kanal !== "dulezite" && radek.kanal !== "general")
            ) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            const uzivatel = (req as AutentizovanyRequest).uzivatel;
            const duvod = hlaskaZakazuSmazani({
              jeAdmin: jeAdminUcet(uzivatel),
              jeAutor: radek.autorId !== null && radek.autorId === uzivatel.id,
              createdAt: radek.createdAt,
            });
            if (duvod !== null) {
              posliChybu(res, "ZAKAZANO", duvod);
              return;
            }
            const smazane = await db
              .update(zpravy)
              .set({ smazanoAt: new Date() })
              .where(and(eq(zpravy.id, zpravaId), isNull(zpravy.smazanoAt)))
              .returning({ id: zpravy.id });
            if (smazane.length === 0) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            res.json({ ok: true });
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* POST /api/diskuze/zpravy {channel, text} — USER + guard kanálu. → 201. */
  app.post("/api/diskuze/zpravy", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const ip = ctiIpZRequestu(req);
          if (!smiPoslatZpravu(ip)) {
            posliChybu(res, "MOC_POZADAVKU", "Posíláš zprávy moc rychle. Počkej chvíli a zkus to znovu.");
            return;
          }
          const nactene = await nactiTeloZpravy(req);
          if (!nactene.ok) {
            posliChybu(res, "VALIDATION_ERROR", nactene.hlaska, nactene.chyby);
            return;
          }
          let text = "";
          let soubory: PripravenaPriloha[] = [];
          let kanalSurovy: unknown;
          if (nactene.zdroj === "json") {
            const telo: unknown = nactene.telo;
            kanalSurovy =
              typeof telo === "object" && telo !== null
                ? (telo as Record<string, unknown>)["channel"]
                : undefined;
          } else {
            kanalSurovy = nactene.data.pole.channel;
            text = nactene.data.text;
            soubory = nactene.data.soubory;
          }
          if (!jeKanalDiskuze(kanalSurovy) || kanalSurovy === "expedice" || kanalSurovy === "soukrome" || kanalSurovy === "skupina") {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              channel: ["Kanál musí být „dulezite“, nebo „general“."],
            });
            return;
          }
          if (nactene.zdroj === "json") {
            const overeni = validujZpravu(nactene.telo);
            if (!overeni.uspech || overeni.data === null) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
              return;
            }
            text = overeni.data.text;
          }
          const kanal: KanalDiskuze = kanalSurovy;
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          if (!smiPsatKanal({ funkce: uzivatel.funkce, isAdmin: uzivatel.isAdmin }, kanal)) {
            posliChybu(res, "ZAKAZANO", "Důležité zprávy může psát jen vedení, rada nebo admin.");
            return;
          }
          try {
            const db = getDb();
            const autorRadky = await db
              .select({
                jmeno: users.jmeno,
                prijmeni: users.prijmeni,
                discordNick: users.discordNick,
                email: users.email,
                avatarUrl: users.avatarUrl,
              })
              .from(users)
              .where(eq(users.id, uzivatel.id))
              .limit(1);
            const autorProfil: ProfilProJmeno | null =
              autorRadky[0] === undefined
                ? null
                : {
                    jmeno: autorRadky[0].jmeno,
                    prijmeni: autorRadky[0].prijmeni,
                    discordNick: autorRadky[0].discordNick,
                    email: autorRadky[0].email,
                    avatarUrl: verejnyAvatarUrl(autorRadky[0].avatarUrl),
                  };
            const snapshot: string =
              autorProfil === null ? "" : slozZobrazovaneJmeno(autorProfil);
            const nove = await zalozZpravuSPrilohami(
              ctiR2Nastaveni(prostredi()),
              soubory,
              "zprava",
              db,
              async () => {
                const vlozene = await db
                  .insert(zpravy)
                  .values({
                    expediceId: null,
                    kanal,
                    autorId: uzivatel.id,
                    autorJmeno: snapshot,
                    text,
                  })
                  .returning();
                return vlozene[0];
              },
            );
            const mapa = await nactiMapuPriloh(db, "zprava", [nove.id]);
            const api = toApiZprava(nove, autorProfil, mapa.get(nove.id) ?? []);
            if (api === null) {
              vnitrniChyba(res);
              return;
            }
            const odpoved: PosliGlobalZpravuResponse = { zprava: api };
            if (kanal === "general" || kanal === "dulezite") {
              await oznameZminky({
                text,
                autorId: uzivatel.id,
                autorJmeno: snapshot,
                kanal,
              });
            }
            res.status(201).json(odpoved);
          } catch (chyba: unknown) {
            if (chyba instanceof ChybiUlozistePriloh) {
              posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
              return;
            }
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* GET /api/diskuze/soukrome?klic= — jen účastník dvojice. */
  app.get("/api/diskuze/soukrome", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const klic = typeof req.query.klic === "string" ? req.query.klic.trim() : "";
          const userId = (req as AutentizovanyRequest).uzivatel.id;
          if (!jeUcastnikSoukromeho(klic, userId)) {
            posliChybu(res, "ZAKAZANO", "Tenhle soukromý chat není tvůj.");
            return;
          }
          try {
            const vlakno = await nactiVlaknoSoukrome(getDb(), klic, userId);
            res.json({ zpravy: vlakno ?? [], nextCursor: null });
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* POST /api/diskuze/soukrome { partnerId, text } — soukromá zpráva jednomu členovi. */
  app.post("/api/diskuze/soukrome", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const ip = ctiIpZRequestu(req);
          if (!smiPoslatZpravu(ip)) {
            posliChybu(res, "MOC_POZADAVKU", "Posíláš zprávy moc rychle. Počkej chvíli a zkus to znovu.");
            return;
          }
          const nactene = await nactiTeloZpravy(req);
          if (!nactene.ok) {
            posliChybu(res, "VALIDATION_ERROR", nactene.hlaska, nactene.chyby);
            return;
          }
          let text = "";
          let soubory: PripravenaPriloha[] = [];
          let partnerId = "";
          if (nactene.zdroj === "json") {
            const telo: unknown = nactene.telo;
            const partnerSurovy =
              typeof telo === "object" && telo !== null
                ? (telo as Record<string, unknown>)["partnerId"]
                : undefined;
            partnerId = typeof partnerSurovy === "string" ? partnerSurovy.trim() : "";
          } else {
            partnerId = nactene.data.pole.partnerId;
            text = nactene.data.text;
            soubory = nactene.data.soubory;
          }
          const ja = (req as AutentizovanyRequest).uzivatel.id;
          const klic = klicSoukromehoChatu(ja, partnerId);
          if (klic === null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              partnerId: ["Vyber člena, kterému chceš napsat."],
            });
            return;
          }
          if (nactene.zdroj === "json") {
            const overeni = validujZpravu(nactene.telo);
            if (!overeni.uspech || overeni.data === null) {
              posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
              return;
            }
            text = overeni.data.text;
          }
          try {
            const db = getDb();
            const profily = await nactiProfily(db, [ja, partnerId]);
            if (!profily.has(partnerId.toLowerCase())) {
              posliChybu(res, "NENALEZENO", "Člen nenalezen.");
              return;
            }
            const autor = profily.get(ja.toLowerCase()) ?? null;
            const jmeno = autor === null ? "" : slozZobrazovaneJmeno(autor);
            const radek = await zalozZpravuSPrilohami(
              ctiR2Nastaveni(prostredi()),
              soubory,
              "soukroma",
              db,
              async () => {
                const vlozene = await db
                  .insert(soukromeZpravy)
                  .values({
                    klic,
                    autorId: ja,
                    autorJmeno: jmeno,
                    text,
                  })
                  .returning();
                return vlozene[0];
              },
            );
            const vlakno = await nactiVlaknoSoukrome(db, klic, ja);
            const zprava = vlakno?.find((polozka) => polozka.id === radek.id) ?? null;
            if (zprava === null) {
              vnitrniChyba(res);
              return;
            }
            await oznameSoukromou({
              partnerId,
              autorJmeno: jmeno,
              text,
              klic,
            });
            res.status(201).json({ zprava });
          } catch (chyba: unknown) {
            if (chyba instanceof ChybiUlozistePriloh) {
              posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
              return;
            }
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* DELETE /api/diskuze/soukrome/:zpravaId — účastník, autor do 10 minut nebo admin. */
  app.delete("/api/diskuze/soukrome/:zpravaId", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const zpravaId = ctiIdZpravy(req);
          if (zpravaId.length === 0) {
            posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
            return;
          }
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          try {
            const db = getDb();
            const nalezene = await db
              .select()
              .from(soukromeZpravy)
              .where(eq(soukromeZpravy.id, zpravaId))
              .limit(1);
            const radek = nalezene[0];
            if (radek === undefined || radek.smazanoAt !== null || !jeUcastnikSoukromeho(radek.klic, uzivatel.id)) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            const duvod = hlaskaZakazuSmazani({
              jeAdmin: jeAdminUcet(uzivatel),
              jeAutor: radek.autorId !== null && radek.autorId === uzivatel.id,
              createdAt: radek.createdAt,
            });
            if (duvod !== null) {
              posliChybu(res, "ZAKAZANO", duvod);
              return;
            }
            const smazane = await db
              .update(soukromeZpravy)
              .set({ smazanoAt: new Date() })
              .where(and(eq(soukromeZpravy.id, zpravaId), isNull(soukromeZpravy.smazanoAt)))
              .returning({ id: soukromeZpravy.id });
            if (smazane.length === 0) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            res.json({ ok: true });
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* GET /api/diskuze/konverzace — logged-in overview, including last message. */
  app.get("/api/diskuze/konverzace", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
      try {
        const db = getDb();
        const session = await ctiVolitelnehoUzivatele(req);
        const ucetOd: string | null = session === null ? null : await ctiVznikUctu(db, session.id);
        let precteni: Record<string, string> = {};
        if (session !== null) {
          const globalni = await db
            .select({
              key: konverzacePrecteni.conversationKey,
              lastReadAt: konverzacePrecteni.lastReadAt,
            })
            .from(konverzacePrecteni)
            .where(eq(konverzacePrecteni.userId, session.id));
          const vlakna = await db
            .select({
              expediceId: diskuzePrecteni.expediceId,
              lastReadAt: diskuzePrecteni.lastReadAt,
            })
            .from(diskuzePrecteni)
            .where(eq(diskuzePrecteni.userId, session.id));
          const mapa: Record<string, string> = {};
          for (const radek of vlakna) {
            mapa[konverzaceKlicExpedice(radek.expediceId)] = radek.lastReadAt.toISOString();
          }
          for (const radek of globalni) {
            mapa[radek.key] = radek.lastReadAt.toISOString();
          }
          precteni = mapa;
        }
        const seskupene: ApiKonverzace[] = await nactiPrehledZprav(
          db,
          session?.id ?? null,
          precteni,
          ucetOd,
        );
        const soukrome: ApiKonverzace[] =
          session === null
            ? []
            : await nactiSoukromeKonverzace(db, session.id, precteni, ucetOd);
        const vlastniSkupiny: ApiKonverzace[] =
          session === null ? [] : await nactiSkupinoveKonverzace(db, session, precteni, ucetOd);
        const hotove: ApiKonverzace[] = [...seskupene, ...soukrome, ...vlastniSkupiny];
        const klice = new Set(hotove.map((konverzace) => konverzace.key));
        const globalniKanals: ReadonlyArray<KanalDiskuze> = ["dulezite", "general"];
        for (const kanal of globalniKanals) {
          if (!klice.has(kanal)) {
            hotove.push({
              key: kanal,
              expeditionId: null,
              channel: kanal,
              lastMessage: null,
              unreadCount: 0,
            });
          }
        }
        hotove.sort((a, b) => (a.key > b.key ? 1 : a.key < b.key ? -1 : 0));
        if (session === null) {
          for (const konverzace of hotove) konverzace.unreadCount = 0;
        }
        const telo: KonverzaceListResponse = { konverzace: hotove };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
      })();
      });
    })();
  });

  /* POST /api/diskuze/konverzace/read {key} — USER, idempotentní upsert. */
  app.post("/api/diskuze/konverzace/read", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const telo: unknown = req.body as unknown;
          const klicSurovy: unknown =
            typeof telo === "object" && telo !== null
              ? (telo as Record<string, unknown>)["key"]
              : undefined;
          if (typeof klicSurovy !== "string" || !jeKonverzaceKlic(klicSurovy.trim())) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              key: ["Neznámá konverzace."],
            });
            return;
          }
          const key: string = klicSurovy.trim();
          try {
            const db = getDb();
            if (key.startsWith("expedice:")) {
              const slug = key.slice("expedice:".length);
              if (!(await existujeVyprava(db, slug))) {
                posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
                return;
              }
            }
            const userId: string = (req as AutentizovanyRequest).uzivatel.id;
            if (key.startsWith("soukrome:") && !jeUcastnikSoukromeho(key, userId)) {
              posliChybu(res, "ZAKAZANO", "Tenhle soukromý chat není tvůj.");
              return;
            }
            const ted = new Date();
            await db
              .insert(konverzacePrecteni)
              .values({ userId, conversationKey: key, lastReadAt: ted })
              .onConflictDoUpdate({
                target: [konverzacePrecteni.userId, konverzacePrecteni.conversationKey],
                set: { lastReadAt: ted },
              });
            if (key.startsWith("expedice:")) {
              const slug = key.slice("expedice:".length);
              await db
                .insert(diskuzePrecteni)
                .values({ userId, expediceId: slug, lastReadAt: ted })
                .onConflictDoUpdate({
                  target: [diskuzePrecteni.userId, diskuzePrecteni.expediceId],
                  set: { lastReadAt: ted },
                });
            }
            const odpoved: OznacPrecteniResponse = { lastReadAt: ted.toISOString() };
            res.json(odpoved);
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* ------------------------------------------------------------------ */
  /* Step 1 — Diskuze unread: meta + read (HANDOFF §10, kontrakt §18).      */
  /* GET meta = PUBLIC (anonym: lastReadAt null, unread false).             */
  /* POST read = USER (idempotentní upsert, userId VŽDY ze session —        */
  /* nikdy z body/query; tělo se ignoruje, čas razí server). Neznámá        */
  /* expedice → 404 NENALEZENO. Odpovědi jen ISO + boolean (žádný secret).  */
  /* ------------------------------------------------------------------ */

  /** Account creation time. Messages at or before this are not unread. */
  async function ctiVznikUctu(db: Db, userId: string): Promise<string | null> {
    const nalezene = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const cas: Date | undefined = nalezene[0]?.createdAt;
    if (!(cas instanceof Date) || Number.isNaN(cas.getTime())) return null;
    return cas.toISOString();
  }

  /**
   * Latest visible message, plus the latest message that can mark the thread
   * unread for `viewerId`. The viewer's own rows never do.
   */
  async function ctiLatestZpravy(
    db: Db,
    id: string,
    viewerId: string | null,
  ): Promise<{ latest: string | null; latestProUnread: string | null }> {
    const nalezene = await db
      .select({ createdAt: zpravy.createdAt, autorId: zpravy.autorId })
      .from(zpravy)
      .where(and(eq(zpravy.expediceId, id), isNull(zpravy.smazanoAt)))
      .orderBy(asc(zpravy.createdAt));
    let latest: string | null = null;
    let latestProUnread: string | null = null;
    for (const radek of nalezene) {
      const iso: string = radek.createdAt.toISOString();
      if (latest === null || iso > latest) latest = iso;
      const vlastni: boolean =
        viewerId !== null &&
        radek.autorId !== null &&
        radek.autorId.toLowerCase() === viewerId.toLowerCase();
      if (!vlastni && (latestProUnread === null || iso > latestProUnread)) {
        latestProUnread = iso;
      }
    }
    return { latest, latestProUnread };
  }

  /** Značka uživatele pro expedici; null = nikdy nečetl. */
  async function ctiLastRead(
    db: Db,
    userId: string,
    id: string,
  ): Promise<string | null> {
    const nalezene = await db
      .select({ lastReadAt: diskuzePrecteni.lastReadAt })
      .from(diskuzePrecteni)
      .where(
        and(
          eq(diskuzePrecteni.userId, userId),
          eq(diskuzePrecteni.expediceId, id),
        ),
      )
      .limit(1);
    const radek = nalezene[0];
    if (radek === undefined) return null;
    return radek.lastReadAt.toISOString();
  }

  /** True = expedice existuje (hlídá 404 před čtením vlákna/značky). */
  async function existujeVyprava(db: Db, id: string): Promise<boolean> {
    const nalezene = await db
      .select({ id: expeditions.id })
      .from(expeditions)
      .where(eq(expeditions.id, id))
      .limit(1);
    return nalezene.length > 0;
  }

  /* GET /api/expeditions/:id/discussion/meta — PUBLIC badge pro tečku. */
  app.get("/api/expeditions/:id/discussion/meta", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const id = ctiIdVypravy(req);
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
        return;
      }
      try {
        const db = getDb();
        if (!(await existujeVyprava(db, id))) {
          posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
          return;
        }
        const session = await ctiVolitelnehoUzivatele(req);
        const casy = await ctiLatestZpravy(db, id, session?.id ?? null);
        // Volitelné přihlášení — anonym (null) se nepersonalizuje (unread false).
        if (session === null) {
          const telo: DiskuzeMetaResponse = anonymniDiskuzeMeta(casy.latest);
          res.json(telo);
          return;
        }
        const lastRead: string | null = await ctiLastRead(db, session.id, id);
        const ucetOd: string | null = await ctiVznikUctu(db, session.id);
        const telo: DiskuzeMetaResponse = {
          latestMessageAt: casy.latest,
          lastReadAt: lastRead,
          unread: jeVlaknoNeprectene(casy.latestProUnread, lastRead, ucetOd),
        };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });

  /* POST /api/expeditions/:id/discussion/read — USER, idempotentní upsert. */
  app.post("/api/expeditions/:id/discussion/read", (req: Request, res: Response) => {
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
            if (!(await existujeVyprava(db, id))) {
              posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
              return;
            }
            const userId: string = (req as AutentizovanyRequest).uzivatel.id;
            const ted = new Date();
            await db
              .insert(diskuzePrecteni)
              .values({ userId, expediceId: id, lastReadAt: ted })
              .onConflictDoUpdate({
                target: [diskuzePrecteni.userId, diskuzePrecteni.expediceId],
                set: { lastReadAt: ted },
              });
            const telo: OznacPrecteniResponse = {
              lastReadAt: ted.toISOString(),
            };
            res.json(telo);
          } catch {
            vnitrniChyba(res);
          }
        })();
      });
    })();
  });

  /* GET /api/diskuze/prilohy/:id — stejné právo jako čtení vlákna. Bez veřejné R2 URL. */
  app.get("/api/diskuze/prilohy/:id", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const surove: unknown = (req.params as Record<string, unknown>)["id"];
      const id = typeof surove === "string" ? surove.trim() : "";
      try {
        const db = getDb();
        const pristup = await nactiPristupPrilohy(db, id);
        if (pristup.stav === "chybi") {
          posliChybu(res, "NENALEZENO", "Příloha nenalezena.");
          return;
        }
        const priloha = pristup.priloha;
        const odesli = async (): Promise<void> => {
          const nastaveni = ctiR2Nastaveni(prostredi());
          if (nastaveni === null) {
            posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
            return;
          }
          await posliUlozenouPrilohu(res, nastaveni, priloha, chceNahled(req));
        };
        if (pristup.stav === "verejna") {
          await vyzadujPrihlaseni(req, res, () => {
            void (async (): Promise<void> => {
              try {
                await odesli();
              } catch {
                vnitrniChyba(res);
              }
            })();
          });
          return;
        }
        await vyzadujPrihlaseni(req, res, () => {
          void (async (): Promise<void> => {
            const uzivatel = (req as AutentizovanyRequest).uzivatel;
            if (pristup.stav === "soukroma") {
              if (!jeUcastnikSoukromeho(pristup.klicVlakna, uzivatel.id)) {
                posliChybu(res, "ZAKAZANO", "Tenhle soukromý chat není tvůj.");
                return;
              }
            } else if (pristup.stav === "skupina") {
              const overeni = await overCteniZpravSkupiny(db, uzivatel, pristup.skupinaId);
              if (overeni === "nenalezeno") {
                posliChybu(res, "NENALEZENO", "Příloha nenalezena.");
                return;
              }
              if (overeni === "zakazano") {
                posliChybu(res, "ZAKAZANO", "Do téhle skupiny nemáš přístup.");
                return;
              }
            }
            try {
              await odesli();
            } catch {
              vnitrniChyba(res);
            }
          })();
        });
      } catch {
        vnitrniChyba(res);
      }
    })();
  });
}
