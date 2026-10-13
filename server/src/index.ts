/**
 * server/src/index.ts — tenký BFF (varianta B architektury).
 *
 * Endpointy dle kontraktu src/shared/api-types.ts:
 * - POST /api/admin/codes — generování 10minutového kódu (jen ADMIN)
 * - POST /api/register    — registrace s platným kódem (veřejné, kód povinný)
 * - POST /api/login       — přihlášení e-mailem + heslem (veřejné)
 * - GET  /api/me          — aktuální uživatel (vyžaduje session)
 * - GET  /api/expeditions — seznam výprav z Neon DB (veřejné, Krok 3)
 * - GET  /api/clenove     — seznam členů z Neon DB (jen ADMIN, Krok 3)
 * - PATCH /api/clenove/:id — úprava člena (jen ADMIN, Krok 3)
 * - GET  /api/users       — seznam uživatelů pro selektor (jen ADMIN, Krok 4)
 * - POST /api/expeditions/:id/ucastnici — dodatečné přidání (jen ADMIN,
 *   i po proběhlá, kapacita se nekontroluje)
 * - DELETE /api/expeditions/:id/ucastnici/:ucastnikId — odebrání (jen ADMIN)
 * - POST /api/logout      — smazání session cookie (aditivně nad kontrakt)
 *
 * Kódy jsou sdílené a opakovaně použitelné: platnost je POUZE
 * `expires_at > now()`. Sloupečky `used_at / used_by` se nečtou ani
 * nezapisují (legacy jednorázového návrhu) — kód mizí jen expirací.
 * Po expiraci vrací registrace 410 KOD_EXPIROVANY.
 *
 * Bootstrap prvotního nastavení: dokud v systému není žádný ADMIN,
 * jde vygenerovat první kód i bez session a první registrace se stane
 * adminem (stejně jako demo useAuth). Pak už jen ADMIN.
 */

import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { randomBytes } from "node:crypto";
import type {
  ApiExpedice,
  ApiFotka,
  ApiUcastnik,
  ApiSchuzka,
  ClenoveListResponse,
  ExpediceDetailResponse,
  ExpediceListResponse,
  FotkyListResponse,
  OdebratUcastnikaResponse,
  OdhlasitResponse,
  PrihlaseniResponse,
  PrihlasitNaVypravuResponse,
  PridatFotkuResponse,
  PridatUcastnikaPoUzavreniResponse,
  RegistraceResponse,
  SchuzkaDetailResponse,
  SchuzkyListResponse,
  SmazatExpediciResponse,
  SmazatFotkuResponse,
  SmazatSchuzkuResponse,
  SmazatVyskytSchuzkyResponse,
  StavVypravy,
  UcastniciListResponse,
  UpravitClenaResponse,
  UpravitExpediciResponse,
  UpravitSchuzkuResponse,
  UpravitUzivateleResponse,
  UserId,
  UserListItem,
  UsersListResponse,
  UzavritVypravuResponse,
  VytvoritExpediciResponse,
  VytvoritKodResponse,
  VytvoritOznameniResponse,
  VytvoritSchuzkuResponse,
} from "../../src/shared/api-types";
import { VALIDACNI_ZPRAVY, STRAVA_NENI_NASTAVENA_ZPRAVA, jeSkolyTridyOdpoved, OZNAMENI_PATH } from "../../src/shared/api-types";
import {
  hashHesla,
  jeSystemBezAdmina,
  nastavSessionCookie,
  overHeslo,
  podepisToken,
  smazSessionCookie,
  toApiUser,
  trioNaRoli,
  vyzadujAdmina,
  vyzadujPrihlaseni,
  vyzadujSpravceVyprav,
  type AutentizovanyRequest,
} from "./auth";
import { posliChybu } from "./chyby";
import { parseAllowedOrigins } from "./cors";
import {
  DISCORD_BARVA_NOVA_VYPRAVA,
  ctiDiscordWebhookUrl,
  jePlatnyDiscordWebhookUrl,
  posliDiscordEmbed,
  sestavEmbedNovaVyprava,
  type DiscordEmbed,
} from "./discord";
import {
  rozdelPlneJmeno,
  seradRole,
  slozPlneJmeno,
  toAdminClen,
  toClenPrehled,
} from "./clenove";
import { getDb, type Db } from "./db";
import { nahodnyKod } from "./kody";
import { jeRozvrhemVyskyt, smiSmazatVyskyt } from "./schuzky";
import {
  validujFotku,
  validujPoznamkuKodu,
  validujPrihlaseni,
  validujPridaniUcastnikaPoUzavreni,
  validujRegistraci,
  validujUpravuClena,
  validujUpravuExpedice,
  DATUM_REGEX,
  jeRealneDatum,
  validujUpravuSchuzky,
  validujUpravuUzivatele,
  validujOznameni,
  validujUzavreni,
  validujVytvoreniExpedice,
  validujVytvoreniSchuzky,
  validujNeparovaneQuery,
  validujParovaniAktivitu,
  validujRucniAktivitu,
  validujStravaCallback,
  jePlatnyStravaState,
} from "./validace";
import {
  STRAVA_SCOPE_DEFAULT,
  StravaVymenaChyba,
  ctiKlientskyPuvod,
  ctiStravaClientId,
  ctiStravaRedirectUri,
  jeRealneClientId,
  nactiVsechnyStravaAktivity,
  oznacSparovane,
  rozhodniOdpojeni,
  rozhodniParovani,
  sestavStravaAuthUrl,
  sestavStravaCallbackRedirect,
  ulozStravaTokeny,
  vymenCodeZaTokeny,
  zajistiPlatnyAccessToken,
} from "./strava";
import {
  chybaKombinace3D,
  isKnownRole,
  mapujRoliNaProfil,
  type ClenskyProfil,
  type Clenstvi,
  type Funkce,
  type Role,
} from "../../src/config/roles";
import { clenove } from "../../drizzle/schema/clenove";
import { expeditions } from "../../drizzle/schema/expeditions";
import type { ExpeditionRow } from "../../drizzle/schema/expeditions";
import { meetings } from "../../drizzle/schema/meetings";
import { meetingExceptions } from "../../drizzle/schema/meetings";
import { participants } from "../../drizzle/schema/participants";
import { photos, type Photo } from "../../drizzle/schema/photos";
import { registrationCodes } from "../../drizzle/schema/registration_codes";
import { stravaTokens } from "../../drizzle/schema/strava_tokens";
import { users } from "../../drizzle/schema/users";
import { toApiSchuzka } from "./schuzky";
import { agregujStatistiky, type StatistikaRadek } from "./statistiky";
import {
  spocitejUcastniky,
  synchronizujPocet,
  toApiExpedice,
  toApiUcastnik,
  vytvorSlugExpedice,
} from "./vypravy";

dotenv.config({ path: [".env.local", ".env"] });

const PORT = Number.parseInt(process.env["PORT"] ?? "3001", 10);
// Produkce: CLIENT_URL muze byt seznam oddeleny carkou
// ("https://app.example.cz,https://admin.example.cz").
// Parsovani je v server/src/cors.ts (testovane bez serveru).
const CLIENT_URL = parseAllowedOrigins(process.env["CLIENT_URL"]);
const DESET_MINUT_MS = 10 * 60 * 1000;
const MAX_POKUSU_KOD = 12;

const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* POST /api/admin/codes — jen ADMIN (bootstrap bez session, když      */
/* v systému ještě není žádný admin). Expirace fixně +10 minut.        */
/* ------------------------------------------------------------------ */

app.post("/api/admin/codes", (req: Request, res: Response) => {
  void (async (): Promise<void> => {
    const overeni = validujPoznamkuKodu(req.body as unknown);
    if (!overeni.uspech || overeni.data === null) {
      posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
      return;
    }

    let bezAdmina = false;
    try {
      bezAdmina = await jeSystemBezAdmina();
    } catch {
      posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
      return;
    }

    // Poznámka se validuje na hranici, ale nemá kam se uložit
    // (tabulka registration_codes ji nemá) — vědomě se zahazuje.
    void overeni.data.poznamka;

    if (bezAdmina) {
      await vytvorKod(res, null);
      return;
    }
    vyzadujAdmina(req, res, () => {
      void vytvorKod(res, (req as AutentizovanyRequest).uzivatel.id);
    });
  })();
});

async function vytvorKod(res: Response, createdBy: string | null): Promise<void> {
  const db = getDb();
  const ted = Date.now();
  for (let pokus = 0; pokus < MAX_POKUSU_KOD; pokus += 1) {
    const kod = nahodnyKod();
    try {
      const vlozene = await db
        .insert(registrationCodes)
        .values({
          code: kod,
          createdBy,
          expiresAt: new Date(ted + DESET_MINUT_MS),
        })
        .returning({
          id: registrationCodes.id,
          createdAt: registrationCodes.createdAt,
          expiresAt: registrationCodes.expiresAt,
        });
      const radek = vlozene[0];
      if (radek === undefined) throw new Error(" prázdný returning");
      const telo: VytvoritKodResponse = {
        id: radek.id as VytvoritKodResponse["id"],
        kod,
        createdAt: radek.createdAt.toISOString(),
        expiresAt: radek.expiresAt.toISOString(),
      };
      res.status(201).json(telo);
      return;
    } catch (chyba) {
      if (jeUnikatniKolize(chyba)) continue;
      posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
      return;
    }
  }
  posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
}

/**
 * Postgres unique_violation (23505) — typově bezpečná detekce bez any.
 * HTTP driver (neon-http) balí NeonDbError do `cause` — obálka od drizzle
 * nese jen query/params, takže se kontrolují obě úrovně (pg i neon-http).
 */
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

/* ------------------------------------------------------------------ */
/* POST /api/register — veřejné, platný kód povinný.                   */
/* Platný = expires_at > now() (sdílený, multi-use). Po expiraci 410.  */
/* ------------------------------------------------------------------ */

app.post("/api/register", (req: Request, res: Response) => {
  void (async (): Promise<void> => {
    const overeni = validujRegistraci(req.body as unknown);
    if (!overeni.uspech || overeni.data === null) {
      posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
      return;
    }
    const vstup = overeni.data;
    const db = getDb();

    try {
      const nalezene = await db
        .select()
        .from(registrationCodes)
        .where(sql`${registrationCodes.code} = ${vstup.kod}`)
        .limit(1);
      const kod = nalezene[0];
      if (kod === undefined) {
        posliChybu(res, "KOD_NEPLATNY", "Kód je neplatný. Zkontroluj ho, nebo požádej vedoucí o nový.");
        return;
      }
      if (kod.expiresAt.getTime() <= Date.now()) {
        posliChybu(res, "KOD_EXPIROVANY", "Kód vypršel (platí 10 minut). Požádej vedoucí o nový.");
        return;
      }
      // Multi-use: used_at / used_by se záměrně nemění — kód platí
      // pro další zařízení až do expires_at.

      const existujici = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${vstup.email}`)
        .limit(1);
      if (existujici.length > 0) {
        posliChybu(res, "EMAIL_OBSAZEN", "Tento e-mail je už obsazený. Zkus se přihlásit.");
        return;
      }

      const bezAdmina = await jeSystemBezAdmina();
      const passwordHash = await hashHesla(vstup.heslo);
      // Dual-write: trio je zdroj pravdy, `role` je mirror (trioNaRoli).
      // První účet (systém bez admina): aktivní člen + admin příznak.
      const noveTrio: ClenskyProfil = bezAdmina
        ? { clenstvi: "aktivni_clen", funkce: null, isAdmin: true }
        : { clenstvi: "clen", funkce: null, isAdmin: false };
      const vlozeni = await db
        .insert(users)
        .values({
          email: vstup.email,
          jmeno: vstup.jmeno,
          prijmeni: vstup.prijmeni ?? "",
          telefon: vstup.telefon,
          discordNick: vstup.discordNick,
          role: trioNaRoli(noveTrio),
          clenstvi: noveTrio.clenstvi,
          funkce: noveTrio.funkce,
          isAdmin: noveTrio.isAdmin,
          skola: vstup.skola,
          trida: vstup.trida,
          passwordHash,
        })
        .returning();
      const novy = vlozeni[0];
      if (novy === undefined) throw new Error("prázdný returning");

      nastavSessionCookie(res, podepisToken(novy.id));
      const telo: RegistraceResponse = { user: toApiUser(novy) };
      res.status(201).json(telo);
    } catch (chyba) {
      if (jeUnikatniKolize(chyba)) {
        // Závod dvou registrací se stejným e-mailem.
        posliChybu(res, "EMAIL_OBSAZEN", "Tento e-mail je už obsazený. Zkus se přihlásit.");
        return;
      }
      if (!res.headersSent) {
        posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
      }
    }
  })();
});

/* ------------------------------------------------------------------ */
/* POST /api/login — veřejné. Špatný e-mail i heslo → 401 SPATNE_HESLO */
/* (záměrně nerozlišujeme, aby nešlo enumerovat účty).                 */
/* ------------------------------------------------------------------ */

app.post("/api/login", (req: Request, res: Response) => {
  void (async (): Promise<void> => {
    const overeni = validujPrihlaseni(req.body as unknown);
    if (!overeni.uspech || overeni.data === null) {
      posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
      return;
    }
    try {
      const db = getDb();
      const nalezeni = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${overeni.data.email}`)
        .limit(1);
      const uzivatel = nalezeni[0];
      const hesloOk =
        uzivatel === undefined
          ? false
          : await overHeslo(overeni.data.heslo, uzivatel.passwordHash);
      if (uzivatel === undefined || !hesloOk) {
        posliChybu(res, "SPATNE_HESLO", "Špatný e-mail nebo heslo.");
        return;
      }
      nastavSessionCookie(res, podepisToken(uzivatel.id));
      const telo: PrihlaseniResponse = { user: toApiUser(uzivatel) };
      res.json(telo);
    } catch {
      if (!res.headersSent) {
        posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
      }
    }
  })();
});

/* ------------------------------------------------------------------ */
/* GET /api/me — vyžaduje session (USER i ADMIN).                      */
/* ------------------------------------------------------------------ */

app.get("/api/me", (req: Request, res: Response) => {
  void (async (): Promise<void> => {
    await vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        try {
          const db = getDb();
          const id = (req as AutentizovanyRequest).uzivatel.id;
          const nalezeni = await db
            .select()
            .from(users)
            .where(sql`${users.id} = ${id}::uuid`)
            .limit(1);
          const uzivatel = nalezeni[0];
          if (uzivatel === undefined) {
            posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
            return;
          }
          res.json(toApiUser(uzivatel));
        } catch {
          if (!res.headersSent) {
            posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
          }
        }
      })();
    });
  })();
});

/* Aditivně nad kontrakt: odhlášení smaže httpOnly cookie. Vždy 200. */
app.post("/api/logout", (_req: Request, res: Response) => {
  smazSessionCookie(res);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* GET /api/expeditions — veřejné čtení z Neon DB (Krok 3 + Krok 2      */
/* query dle kontraktu: ?stav=proběhlá = historie, ?page&pageSize).      */
/* Autoritativní zdroj: tabulka `expeditions`, řazeno datem.             */
/* Bez query = vše bez `pagination`; s page/pageSize = stránka +         */
/* `pagination`. Nikdy mocky ani snapshot — prázdná DB vrátí prázdné     */
/* pole (UI pak ukáže ExpeditionEmpty). Nevalidní řádek se přeskočí.     */
/* ------------------------------------------------------------------ */

function ctiCeleCisloQuery(hodnota: unknown): number | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) return null;
  const cislo = Number(hodnota);
  return Number.isInteger(cislo) ? cislo : null;
}

app.get("/api/expeditions", (req: Request, res: Response) => {
  void (async (): Promise<void> => {
    try {
      const dotaz = req.query as {
        stav?: unknown;
        page?: unknown;
        pageSize?: unknown;
      };
      let stav: StavVypravy | undefined;
      if (dotaz.stav !== undefined) {
        if (
          dotaz.stav !== "volno" &&
          dotaz.stav !== "skoro plno" &&
          dotaz.stav !== "proběhlá"
        ) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            stav: ["Neznámý stav výpravy."],
          });
          return;
        }
        stav = dotaz.stav;
      }

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
      const radky =
        stav === undefined
          ? await db.select().from(expeditions).orderBy(asc(expeditions.datum))
          : await db
              .select()
              .from(expeditions)
              .where(eq(expeditions.stav, stav))
              .orderBy(asc(expeditions.datum));
      const vysledek: ApiExpedice[] = [];
      for (const radek of radky) {
        // Vždy čerstvý COUNT z participants (ne cache sloupec) — číslo
        // na kartách musí sedět se seznamem v detailu. Řádků jsou jednotky.
        const pocet = await spocitejUcastniky(db, radek.id);
        const api = apiExpediceSPoctem(radek, pocet);
        if (api !== null) vysledek.push(api);
      }
      if (page === undefined || pageSize === undefined) {
        const telo: ExpediceListResponse = { expedice: vysledek };
        res.json(telo);
        return;
      }
      const totalItems = vysledek.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const start = (page - 1) * pageSize;
      const telo: ExpediceListResponse = {
        expedice: vysledek.slice(start, start + pageSize),
        pagination: { page, pageSize, totalItems, totalPages },
      };
      res.json(telo);
    } catch {
      if (!res.headersSent) {
        posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
      }
    }
  })();
});

/* ------------------------------------------------------------------ */
/* GET /api/clenove — jen ADMIN (Krok 3). Čte `clenove` (14 řádků).     */
/* Bez session → 401 NEPRIHLASEN, přihlášený USER → 403 ZAKAZANO.       */
/* ------------------------------------------------------------------ */

app.get("/api/clenove", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
    void (async (): Promise<void> => {
      try {
        const db = getDb();
        const radky = await db
          .select()
          .from(clenove)
          .orderBy(asc(clenove.id));
        const telo: ClenoveListResponse = {
          clenove: radky.map(toClenPrehled),
        };
        res.json(telo);
      } catch {
        if (!res.headersSent) {
          posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
        }
      }
    })();
  });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/clenove/:id — jen ADMIN (Krok 3). Parciální update.       */
/* Neznámé id → 404 NENALEZENO. Nevalidní pole/kombinace rolí → 422     */
/* VALIDATION_ERROR s details (role: [chybaKombinaceRole(...)]) —       */
/* validace patří na hranici (validujUpravuClena). DB `clenove` umí     */
/* persistovat jen jmeno (složené z jmeno + prijmeni) a role[];         */
/* kontakty (email / telefon / discordNick) se validují, ale nemají     */
/* kam se uložit — vědomě se zahazují (precedent: poznamka u kódů).     */
/* Idempotentní: opakovaný PATCH se stejným tělem je bezpečný.          */
/* ------------------------------------------------------------------ */

app.patch("/api/clenove/:id", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujUpravuClena(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }
      const suroveId: unknown = (req.params as Record<string, unknown>)["id"];
      const id = typeof suroveId === "string" ? suroveId : "";
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Člen nenalezen.");
        return;
      }
      try {
        const db = getDb();
        const nalezeni = await db
          .select()
          .from(clenove)
          .where(eq(clenove.id, id))
          .limit(1);
        const stavajici = nalezeni[0];
        if (stavajici === undefined) {
          posliChybu(res, "NENALEZENO", "Člen nenalezen.");
          return;
        }
        const vstup = overeni.data;
        const existujici = rozdelPlneJmeno(stavajici.jmeno);
        const novaJmenoCast = vstup.jmeno ?? existujici.jmeno;
        const novaPrijmeniCast = vstup.prijmeni ?? existujici.prijmeni;
        const novePlneJmeno = slozPlneJmeno(novaJmenoCast, novaPrijmeniCast);
        const meniJmeno =
          (vstup.jmeno !== undefined || vstup.prijmeni !== undefined) &&
          novePlneJmeno !== stavajici.jmeno;
        const novaRole = vstup.role === undefined ? null : seradRole(vstup.role);
        const meniRoli = novaRole !== null;

        if (!meniJmeno && !meniRoli) {
          const telo: UpravitClenaResponse = {
            clen: toAdminClen(stavajici, {
              email: vstup.email,
              telefon: vstup.telefon,
              discordNick: vstup.discordNick,
            }),
          };
          res.json(telo);
          return;
        }

        const aktualizovane = await db
          .update(clenove)
          .set({
            ...(meniJmeno ? { jmeno: novePlneJmeno } : {}),
            ...(novaRole !== null ? { role: [...novaRole] } : {}),
          })
          .where(eq(clenove.id, id))
          .returning();
        const radek = aktualizovane[0];
        if (radek === undefined) {
          posliChybu(res, "NENALEZENO", "Člen nenalezen.");
          return;
        }
        const telo: UpravitClenaResponse = {
          clen: toAdminClen(radek, {
            email: vstup.email,
            telefon: vstup.telefon,
            discordNick: vstup.discordNick,
          }),
        };
        res.json(telo);
      } catch {
        if (!res.headersSent) {
          posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
        }
      }
    })();
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/users — jen ADMIN (Krok 4 + správa členů). Úzký tvar         */
/* `[{ id, jmeno (složené), email, role }]` — role je primární DB role  */
/* (jedna hodnota z roles.ts, users.role CHECK). Bez session → 401      */
/* NEPRIHLASEN, přihlášený USER → 403 ZAKAZANO. Nikdy nevrací hash      */
/* hesla (stejně jako ApiUser). Řazeno e-mailem.                        */
/* ------------------------------------------------------------------ */

app.get("/api/users", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
    void (async (): Promise<void> => {
      try {
        const db = getDb();
        const radky = await db
          .select({
            id: users.id,
            jmeno: users.jmeno,
            prijmeni: users.prijmeni,
            email: users.email,
            role: users.role,
            clenstvi: users.clenstvi,
            funkce: users.funkce,
            isAdmin: users.isAdmin,
            skola: users.skola,
            trida: users.trida,
            discordNick: users.discordNick,
          })
          .from(users)
          .orderBy(asc(users.email));
        const telo: UsersListResponse = {
          users: radky.map((radek): UserListItem => {
            const cele = `${radek.jmeno} ${radek.prijmeni}`
              .trim()
              .replace(/\s+/g, " ");
            const role: Role = isKnownRole(radek.role) ? radek.role : "clen";
            const clenstvi: Clenstvi =
              radek.clenstvi === "aktivni_clen" ? "aktivni_clen" : "clen";
            const funkce: Funkce =
              radek.funkce === "vedeni" || radek.funkce === "rada"
                ? radek.funkce
                : null;
            return {
              id: radek.id as UserId,
              jmeno: cele.length > 0 ? cele : radek.email,
              email: radek.email,
              role,
              clenstvi,
              funkce,
              isAdmin: radek.isAdmin,
              skola: typeof radek.skola === "string" ? radek.skola : "",
              trida: typeof radek.trida === "string" ? radek.trida : "",
              discordNick:
                typeof radek.discordNick === "string" ? radek.discordNick : null,
            };
          }),
        };
        res.json(telo);
      } catch {
        if (!res.headersSent) {
          posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
        }
      }
    })();
  });
});

type UserRow = typeof users.$inferSelect;

/** DB řádek `users` → úzký `UserListItem` (selektor + správa, včetně 3D tria). */
function toUserListItem(radek: UserRow): UserListItem {
  const cele = `${radek.jmeno} ${radek.prijmeni}`.trim().replace(/\s+/g, " ");
  const role: Role = isKnownRole(radek.role) ? radek.role : "clen";
  const clenstvi: Clenstvi =
    radek.clenstvi === "aktivni_clen" ? "aktivni_clen" : "clen";
  const funkce: Funkce =
    radek.funkce === "vedeni" || radek.funkce === "rada"
      ? radek.funkce
      : null;
  return {
    id: radek.id as UserId,
    jmeno: cele.length > 0 ? cele : radek.email,
    email: radek.email,
    role,
    clenstvi,
    funkce,
    isAdmin: radek.isAdmin,
    skola: typeof radek.skola === "string" ? radek.skola : "",
    trida: typeof radek.trida === "string" ? radek.trida : "",
    discordNick:
      typeof radek.discordNick === "string" ? radek.discordNick : null,
  };
}

/* ------------------------------------------------------------------ */
/* PATCH /api/users/:id — úprava 3D tria / školy / třídy (jen ADMIN).    */
/* Tělo je parciální trio (`clenstvi?/funkce?/isAdmin?/skola?/trida?`)    */
/* NEBO samotné staré `{ role }` (mapujRoliNaProfil → trio) — obojí      */
/* najednou → 422 (validujUpravuUzivatele). Efektivní trio (merge s DB)   */
/* hlídá chybaKombinace3D (`clen` + funkce → 422 s details.funkce).       */
/* Dual-write: trio + mirror `role` (trioNaRoli) atomicky v témže UPDATE. */
/* Neznámé id → 404 NENALEZENO. Idempotentní: stejné tělo se jen přepíše. */
/* ------------------------------------------------------------------ */

app.patch("/api/users/:id", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujUpravuUzivatele(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }
      const suroveId: unknown = (req.params as Record<string, unknown>)["id"];
      const id = typeof suroveId === "string" ? suroveId.trim() : "";
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
        return;
      }
      const vstup = overeni.data;
      try {
        const db = getDb();
        const nalezeni = await db
          .select()
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        const stavajici = nalezeni[0];
        if (stavajici === undefined) {
          posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
          return;
        }
        const stavajiciClenstvi: Clenstvi =
          stavajici.clenstvi === "aktivni_clen" ? "aktivni_clen" : "clen";
        const stavajiciFunkce: Funkce =
          stavajici.funkce === "vedeni" || stavajici.funkce === "rada"
            ? stavajici.funkce
            : null;

        const zmeny: {
          role?: Role;
          clenstvi?: Clenstvi;
          funkce?: Funkce;
          isAdmin?: boolean;
          skola?: string;
          trida?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (vstup.role !== undefined) {
          // Staré `{ role }` — zpětná kompatibilita: trio z mapování.
          const profil = mapujRoliNaProfil(vstup.role);
          zmeny.role = vstup.role;
          zmeny.clenstvi = profil.clenstvi;
          zmeny.funkce = profil.funkce;
          zmeny.isAdmin = profil.isAdmin;
        } else {
          // Nové parciální trio — efektivní kombinace (merge s DB řádkem).
          const efektProfil: ClenskyProfil = {
            clenstvi: vstup.clenstvi ?? stavajiciClenstvi,
            funkce:
              vstup.funkce !== undefined ? vstup.funkce : stavajiciFunkce,
            isAdmin: vstup.isAdmin ?? stavajici.isAdmin,
          };
          const chyba3D: string | null = chybaKombinace3D(efektProfil);
          if (chyba3D !== null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              funkce: [chyba3D],
            });
            return;
          }
          const meniTrio =
            vstup.clenstvi !== undefined ||
            vstup.funkce !== undefined ||
            vstup.isAdmin !== undefined;
          const meniSkolu =
            vstup.skola !== undefined || vstup.trida !== undefined;
          if (!meniTrio && !meniSkolu) {
            const telo: UpravitUzivateleResponse = {
              user: toUserListItem(stavajici),
            };
            res.json(telo);
            return;
          }
          if (vstup.clenstvi !== undefined) zmeny.clenstvi = vstup.clenstvi;
          if (vstup.funkce !== undefined) zmeny.funkce = vstup.funkce;
          if (vstup.isAdmin !== undefined) zmeny.isAdmin = vstup.isAdmin;
          if (vstup.skola !== undefined) zmeny.skola = vstup.skola;
          if (vstup.trida !== undefined) zmeny.trida = vstup.trida;
          // Dual-write mirror — jen když se trio mění (škola/třída roli nese).
          if (meniTrio) zmeny.role = trioNaRoli(efektProfil);
        }

        const aktualizovane = await db
          .update(users)
          .set(zmeny)
          .where(eq(users.id, id))
          .returning();
        const radek = aktualizovane[0];
        if (radek === undefined) {
          posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
          return;
        }
        const telo: UpravitUzivateleResponse = {
          user: toUserListItem(radek),
        };
        res.json(telo);
      } catch {
        if (!res.headersSent) {
          posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
        }
      }
    })();
  });
});

/* ------------------------------------------------------------------ */
/* Krok 3b — Expedice CRUD + účast + uzavření (kontrakt api-types §8).   */
/* Matice: POST/PATCH/DELETE detailu + PATCH /uzavrit + správa účastníků */
/* po uzavření = dual-guard (admin nebo aktivní člen);                   */
/* GET detail = PUBLIC; účast (seznam / prihlasit / odhlasit) = USER.    */
/* Kapacita je vždy `kapacita_celkem` vs COUNT řádků v `participants`.   */
/* Uzavření nastaví `stav: "proběhlá"` + zapíše docházku. Chyby vždy     */
/* jen ApiErrorResponse (posliChybu). Pozor na závod dvou přihlášek —     */
/* duplicitu jistí UNIQUE v DB (23505 → 409 UZ_PRIHLASEN).               */
/* ------------------------------------------------------------------ */

/** `:id` z cesty — prázdné → volající vrátí 404 NENALEZENO. */
function ctiIdVypravy(req: Request): string {
  const surova: unknown = (req.params as Record<string, unknown>)["id"];
  return typeof surova === "string" ? surova.trim() : "";
}

/** DB řádek + čerstvý COUNT (místo cache sloupce). Nevalidní → null. */
function apiExpediceSPoctem(
  radek: ExpeditionRow,
  pocet: number,
): ApiExpedice | null {
  const zaklad = toApiExpedice(radek);
  if (zaklad === null) return null;
  return {
    ...zaklad,
    kapacita: { prihlaseno: pocet, celkem: radek.kapacitaCelkem },
  };
}

interface ExpediceDetail {
  expedice: ApiExpedice;
  ucastnici: ApiUcastnik[];
  pocet: number;
}

/**
 * Výprava + účastníci s denormalizovaným `jmeno` (users → celé jméno,
 * clenove → plné jméno). Neznámá výprava / nevalidní řádek → null.
 */
async function nactiExpediciSDetailem(
  db: Db,
  id: string,
): Promise<ExpediceDetail | null> {
  const nalezene = await db
    .select()
    .from(expeditions)
    .where(eq(expeditions.id, id))
    .limit(1);
  const radek = nalezene[0];
  if (radek === undefined) return null;

  const prihlasky = await db
    .select()
    .from(participants)
    .where(eq(participants.expeditionId, id))
    .orderBy(asc(participants.createdAt));

  const userIds = [
    ...new Set(
      prihlasky
        .map((polozka) => polozka.userId)
        .filter((hodnota): hodnota is string => hodnota !== null),
    ),
  ];
  const clenIds = [
    ...new Set(
      prihlasky
        .map((polozka) => polozka.clenId)
        .filter((hodnota): hodnota is string => hodnota !== null),
    ),
  ];
  const jmena = new Map<string, string>();
  if (userIds.length > 0) {
    const ucty = await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds));
    for (const ucet of ucty) {
      const cele = `${ucet.jmeno} ${ucet.prijmeni}`.trim().replace(/\s+/g, " ");
      jmena.set(`user:${ucet.id}`, cele.length > 0 ? cele : ucet.email);
    }
  }
  if (clenIds.length > 0) {
    const clenoveRadky = await db
      .select()
      .from(clenove)
      .where(inArray(clenove.id, clenIds));
    for (const clen of clenoveRadky) jmena.set(`clen:${clen.id}`, clen.jmeno);
  }

  const ucastnici: ApiUcastnik[] = [];
  for (const prihlaska of prihlasky) {
    const klic =
      prihlaska.userId !== null
        ? `user:${prihlaska.userId}`
        : prihlaska.clenId !== null
          ? `clen:${prihlaska.clenId}`
          : null;
    const api = toApiUcastnik(prihlaska, klic === null ? "" : (jmena.get(klic) ?? ""));
    if (api !== null) ucastnici.push(api);
  }

  const expedice = apiExpediceSPoctem(radek, prihlasky.length);
  if (expedice === null) return null;
  // Krok 20: veřejný detail nese i ušlé kilometry výpravy (expedice-level,
  // takže je vidí i ti, kdo na ní nebyli). null = administrace ještě
  // nedopsala kilometry. Nové pole je aditivní — klient si ho volí.
  expedice.km = typeof radek.km === "number" ? radek.km : null;
  expedice.prevyseniM =
    typeof radek.prevyseniM === "number" ? radek.prevyseniM : null;
  expedice.trasaPolyline =
    typeof radek.trasaPolyline === "string" ? radek.trasaPolyline : null;
  return { expedice, ucastnici, pocet: prihlasky.length };
}

function vnitrniChyba(res: Response): void {
  if (!res.headersSent) {
    posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
  }
}

/* ------------------------------------------------------------------ */
/* Fáze 5 — Discord notifikace (fail-open, observabilita bez secretů).   */
/* Volá se VŽDY až po odeslání odpovědi (201/200), nikdy před ní —       */
/* Discord nesmí blokovat ani shodit request aplikace. Bez nastaveného   */
/* webhooku je to tichý skip se strukturovaným warn logem (událost       */
/* `discord_preskocen`); selhání odeslání hlásí `discord_neodeslano`.    */
/* Log nese jen event + zdroj + důvod — nikdy URL webhooku, tělo         */
/* zprávy ani jiný secret.                                               */
/* ------------------------------------------------------------------ */

function upozorniDiscordBezBlokovani(
  embed: DiscordEmbed,
  zdroj: "nova-vyprava" | "oznameni",
): void {
  const webhook = ctiDiscordWebhookUrl();
  if (webhook.length === 0) {
    console.warn(
      JSON.stringify({
        event: "discord_preskocen",
        zdroj,
        duvod: "chybi-webhook",
      }),
    );
    return;
  }
  if (!jePlatnyDiscordWebhookUrl(webhook)) {
    console.warn(
      JSON.stringify({
        event: "discord_preskocen",
        zdroj,
        duvod: "neplatny-webhook",
      }),
    );
    return;
  }
  void posliDiscordEmbed(embed).catch(() => {
    console.warn(JSON.stringify({ event: "discord_neodeslano", zdroj }));
  });
}

/* POST /api/expeditions — dual-guard (admin nebo aktivní člen). → 201. */
app.post("/api/expeditions", (req: Request, res: Response) => {
  vyzadujSpravceVyprav(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujVytvoreniExpedice(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }
      const vstup = overeni.data;
      try {
        const db = getDb();
        for (let pokus = 0; pokus < MAX_POKUSU_KOD; pokus += 1) {
          const id = vytvorSlugExpedice(
            vstup.nazev,
            randomBytes(4).toString("hex"),
          );
          let radek: ExpeditionRow | undefined;
          try {
            const vlozene = await db
              .insert(expeditions)
              .values({
                id,
                nazev: vstup.nazev,
                datum: vstup.datum,
                datumDo: vstup.datumDo,
                sraz: vstup.sraz,
                popis: vstup.popis,
                trasaOdkaz: vstup.trasaOdkaz,
                kapacitaCelkem: vstup.kapacitaCelkem,
                kapacitaPrihlaseno: 0,
                stav: "volno",
              })
              .returning();
            radek = vlozene[0];
          } catch (chyba) {
            if (jeUnikatniKolize(chyba)) continue;
            throw chyba;
          }
          if (radek === undefined) throw new Error("prázdný returning");
          const api = toApiExpedice(radek);
          if (api === null) throw new Error("nevalidní řádek po insertu");
          const telo: VytvoritExpediciResponse = { expedice: api };
          res.status(201).json(telo);
          // Fáze 5: Discord embed až PO odpovědi — fail-open, mrtvý
          // Discord nikdy neshodí 201 (viz upozorniDiscordBezBlokovani).
          upozorniDiscordBezBlokovani(
            sestavEmbedNovaVyprava({
              nazev: vstup.nazev,
              datum: vstup.datum,
              sraz: vstup.sraz,
              popis: vstup.popis,
            }),
            "nova-vyprava",
          );
          return;
        }
        vnitrniChyba(res);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });
});

/* POST /api/oznameni — dual-guard (admin nebo aktivní člen). Důležitá
   oznámení z PRD §2.5: validace nazev 3–120 + text 1–2000, pak embed na
   Discord stejným fail-open kanálem jako nová výprava. → 201. */
app.post(OZNAMENI_PATH, (req: Request, res: Response) => {
  vyzadujSpravceVyprav(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujOznameni(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }
      const embed: DiscordEmbed = {
        title: `Oznámení: ${overeni.data.nazev}`.slice(0, 256),
        description: overeni.data.text,
        color: DISCORD_BARVA_NOVA_VYPRAVA,
        fields: [],
      };
      // Fail-open jako u výpravy: odpověď 201 nesmí záviset na Discordu.
      upozorniDiscordBezBlokovani(embed, "oznameni");
      const telo: VytvoritOznameniResponse = { ok: true };
      res.status(201).json(telo);
    })();
  });
});

/* GET /api/expeditions/:id — PUBLIC detail pro modal. */
app.get("/api/expeditions/:id", (req: Request, res: Response) => {
  void (async (): Promise<void> => {
    const id = ctiIdVypravy(req);
    if (id.length === 0) {
      posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
      return;
    }
    try {
      const db = getDb();
      const detail = await nactiExpediciSDetailem(db, id);
      if (detail === null) {
        posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
        return;
      }
      const telo: ExpediceDetailResponse = { expedice: detail.expedice };
      res.json(telo);
    } catch {
      vnitrniChyba(res);
    }
  })();
});

/* PATCH /api/expeditions/:id — dual-guard, parciální. `stav` tudy nejde. */
app.patch("/api/expeditions/:id", (req: Request, res: Response) => {
  vyzadujSpravceVyprav(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujUpravuExpedice(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }
      const id = ctiIdVypravy(req);
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
        return;
      }
      const vstup = overeni.data;
      try {
        const db = getDb();
        const nalezene = await db
          .select()
          .from(expeditions)
          .where(eq(expeditions.id, id))
          .limit(1);
        const stavajici = nalezene[0];
        if (stavajici === undefined) {
          posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
          return;
        }
        if (vstup.kapacitaCelkem !== undefined) {
          const pocet = await spocitejUcastniky(db, id);
          // Nula ruší omezení — pod počet přihlášených jít smí.
          if (vstup.kapacitaCelkem !== 0 && vstup.kapacitaCelkem < pocet) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              kapacitaCelkem: [
                "Kapacita nemůže být menší než počet přihlášených.",
              ],
            });
            return;
          }
        }
        const zmeny: {
          nazev?: string;
          datum?: string;
          datumDo?: string | null;
          sraz?: string;
          popis?: string;
          trasaOdkaz?: string;
          kapacitaCelkem?: number;
        } = {};
        if (vstup.nazev !== undefined) zmeny.nazev = vstup.nazev;
        if (vstup.datum !== undefined) zmeny.datum = vstup.datum;
        if (vstup.datumDo !== undefined) zmeny.datumDo = vstup.datumDo;
        if (vstup.sraz !== undefined) zmeny.sraz = vstup.sraz;
        if (vstup.popis !== undefined) zmeny.popis = vstup.popis;
        if (vstup.trasaOdkaz !== undefined) zmeny.trasaOdkaz = vstup.trasaOdkaz;
        if (vstup.kapacitaCelkem !== undefined)
          zmeny.kapacitaCelkem = vstup.kapacitaCelkem;

        // Rozsah od–do proti existujícímu řádku (validace zná jen patch).
        const stavajiciOd: string =
          typeof stavajici.datum === "string"
            ? stavajici.datum.slice(0, 10)
            : "";
        const stavajiciDo: string | null =
          stavajici.datumDo === null
            ? null
            : typeof stavajici.datumDo === "string"
              ? stavajici.datumDo.slice(0, 10)
              : null;
        const efektOd: string = vstup.datum ?? stavajiciOd;
        const efektDo: string | null =
          vstup.datumDo !== undefined ? vstup.datumDo : stavajiciDo;
        if (efektDo !== null && efektOd.length > 0 && efektDo < efektOd) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            datumDo: ["Konec výpravy nesmí být před jejím začátkem."],
          });
          return;
        }

        let radek = stavajici;
        if (Object.keys(zmeny).length > 0) {
          const aktualizovane = await db
            .update(expeditions)
            .set(zmeny)
            .where(eq(expeditions.id, id))
            .returning();
          const novy = aktualizovane[0];
          if (novy === undefined) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          radek = novy;
        }
        const pocet = await spocitejUcastniky(db, id);
        const api = apiExpediceSPoctem(radek, pocet);
        if (api === null) {
          vnitrniChyba(res);
          return;
        }
        const telo: UpravitExpediciResponse = { expedice: api };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });
});

/* DELETE /api/expeditions/:id — dual-guard, maže i účastníky (CASCADE). */
app.delete("/api/expeditions/:id", (req: Request, res: Response) => {
  vyzadujSpravceVyprav(req, res, () => {
    void (async (): Promise<void> => {
      const id = ctiIdVypravy(req);
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
        return;
      }
      try {
        const db = getDb();
        const smazane = await db
          .delete(expeditions)
          .where(eq(expeditions.id, id))
          .returning({ id: expeditions.id });
        if (smazane.length === 0) {
          posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
          return;
        }
        const telo: SmazatExpediciResponse = { ok: true };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });
});

/* GET /api/expeditions/:id/ucastnici — USER i ADMIN. Bez session → 401. */
app.get("/api/expeditions/:id/ucastnici", (req: Request, res: Response) => {
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
          const detail = await nactiExpediciSDetailem(db, id);
          if (detail === null) {
            posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
            return;
          }
          const telo: UcastniciListResponse = {
            ucastnici: detail.ucastnici,
            expedice: detail.expedice,
          };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  })();
});

/* POST /api/expeditions/:id/prihlasit — přihlášení sebe (USER). → 201. */
app.post("/api/expeditions/:id/prihlasit", (req: Request, res: Response) => {
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
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
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
          if (radek.stav === "proběhlá") {
            posliChybu(
              res,
              "VYPRAVA_UZAVRENA",
              "Tahle výprava už proběhla. Přihlásit se nejde.",
            );
            return;
          }
          const moje = await db
            .select()
            .from(participants)
            .where(
              and(
                eq(participants.expeditionId, id),
                eq(participants.userId, uzivatel.id),
              ),
            )
            .limit(1);
          if (moje.length > 0) {
            posliChybu(
              res,
              "UZ_PRIHLASEN",
              "Na tuhle výpravu už jsi přihlášený.",
            );
            return;
          }
          const pocet = await spocitejUcastniky(db, id);
          // Kapacita 0 = bez omezení — plnost se nekontroluje.
          if (radek.kapacitaCelkem !== 0 && pocet >= radek.kapacitaCelkem) {
            posliChybu(res, "KAPACITA_PLNA", "Výprava je už plná.");
            return;
          }

          let vlozenyId: string | null = null;
          let vlozenyCas: Date | null = null;
          try {
            const vlozene = await db
              .insert(participants)
              .values({
                expeditionId: id,
                userId: uzivatel.id,
                clenId: null,
                status: "prihlasen",
              })
              .returning({
                id: participants.id,
                createdAt: participants.createdAt,
              });
            const prvni = vlozene[0];
            if (prvni === undefined) throw new Error("prázdný returning");
            vlozenyId = prvni.id;
            vlozenyCas = prvni.createdAt;
          } catch (chyba) {
            if (jeUnikatniKolize(chyba)) {
              posliChybu(
                res,
                "UZ_PRIHLASEN",
                "Na tuhle výpravu už jsi přihlášený.",
              );
              return;
            }
            throw chyba;
          }

          const novyPocet = await synchronizujPocet(db, id);
          const api = apiExpediceSPoctem(
            { ...radek, kapacitaPrihlaseno: novyPocet },
            novyPocet,
          );
          const ja = await db
            .select()
            .from(users)
            .where(eq(users.id, uzivatel.id))
            .limit(1);
          const mujRadek = ja[0];
          const celeJmeno =
            mujRadek === undefined
              ? uzivatel.email
              : `${mujRadek.jmeno} ${mujRadek.prijmeni}`
                  .trim()
                  .replace(/\s+/g, " ") || mujRadek.email;
          const ucastnik =
            vlozenyId === null || vlozenyCas === null
              ? null
              : toApiUcastnik(
                  {
                    id: vlozenyId,
                    expeditionId: id,
                    userId: uzivatel.id,
                    clenId: null,
                    status: "prihlasen",
                    createdAt: vlozenyCas,
                  },
                  celeJmeno,
                );
          if (api === null || ucastnik === null) {
            vnitrniChyba(res);
            return;
          }
          const telo: PrihlasitNaVypravuResponse = {
            ucastnik,
            expedice: api,
          };
          res.status(201).json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  })();
});

/* DELETE /api/expeditions/:id/odhlasit — odhlášení sebe (USER).         */
/* Idempotentní: bez přihlášky stále 200 `{ ok: true }` (ne 404).        */
app.delete("/api/expeditions/:id/odhlasit", (req: Request, res: Response) => {
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
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
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
          if (radek.stav === "proběhlá") {
            posliChybu(
              res,
              "VYPRAVA_UZAVRENA",
              "Tahle výprava už proběhla. Odhlásit se nejde.",
            );
            return;
          }
          const moje = await db
            .select({ id: participants.id })
            .from(participants)
            .where(
              and(
                eq(participants.expeditionId, id),
                eq(participants.userId, uzivatel.id),
              ),
            )
            .limit(1);
          const vlastni = moje[0];
          if (vlastni !== undefined) {
            await db
              .delete(participants)
              .where(eq(participants.id, vlastni.id));
          }
          const novyPocet = await synchronizujPocet(db, id);
          const api = apiExpediceSPoctem(
            { ...radek, kapacitaPrihlaseno: novyPocet },
            novyPocet,
          );
          if (api === null) {
            vnitrniChyba(res);
            return;
          }
          const telo: OdhlasitResponse = { ok: true, expedice: api };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  })();
});

/* PATCH /api/expeditions/:id/uzavrit — dual-guard (+ docházka).        */
/* Nastaví `stav: "proběhlá"` + přepíše statusy účastníků. Opakované     */
/* uzavření → 409 VYPRAVA_UZAVRENA. Neznámé `ucastnikId` → 422.          */
app.patch("/api/expeditions/:id/uzavrit", (req: Request, res: Response) => {
  vyzadujSpravceVyprav(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujUzavreni(req.body as unknown);
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
        if (radek.stav === "proběhlá") {
          posliChybu(
            res,
            "VYPRAVA_UZAVRENA",
            "Tahle výprava je už uzavřená.",
          );
          return;
        }
        const prihlasky = await db
          .select({ id: participants.id })
          .from(participants)
          .where(eq(participants.expeditionId, id));
        const zname = new Set(prihlasky.map((polozka) => polozka.id));
        const patriVsechny = overeni.data.dochazka.every((zaznam) =>
          zname.has(zaznam.ucastnikId),
        );
        if (!patriVsechny) {
          posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
            dochazka: [VALIDACNI_ZPRAVY.dochazkaNeznamyUcastnik],
          });
          return;
        }
        for (const zaznam of overeni.data.dochazka) {
          await db
            .update(participants)
            .set({ status: zaznam.status })
            .where(eq(participants.id, zaznam.ucastnikId));
        }
        await db
          .update(expeditions)
          .set({ stav: "proběhlá" })
          .where(eq(expeditions.id, id));
        await synchronizujPocet(db, id);
        const detail = await nactiExpediciSDetailem(db, id);
        if (detail === null) {
          vnitrniChyba(res);
          return;
        }
        const telo: UzavritVypravuResponse = {
          expedice: detail.expedice,
          ucastnici: detail.ucastnici,
        };
        res.json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });
});

/* ------------------------------------------------------------------ */
/* Dodatečná správa účastníků po uzavření — varianta A (jen ADMIN).      */
/* POST /:id/ucastnici přidá userId XOR clenId (status default           */
/* `ucastnil_se`), DELETE /:id/ucastnici/:ucastnikId odebere. Funguje    */
/* i u `stav: "proběhlá"` (na rozdíl od POST /prihlasit), kapacita se    */
/* nekontroluje — nikdy KAPACITA_PLNA. Duplicita UNIQUE (23505) → 409    */
/* UZ_PRIHLASEN, neznámé userId/clenId → 404 NENALEZENO, neznámé         */
/* ucastnikId (i opakovaný DELETE) → 404. PATCH /uzavrit výše se nemění. */
/* ------------------------------------------------------------------ */

/** `:ucastnikId` z cesty — prázdné → volající vrátí 404 NENALEZENO. */
function ctiIdUcastnika(req: Request): string {
  const surova: unknown = (req.params as Record<string, unknown>)["ucastnikId"];
  return typeof surova === "string" ? surova.trim() : "";
}

/* POST /api/expeditions/:id/ucastnici — dual-guard, i po proběhlá. → 201. */
app.post("/api/expeditions/:id/ucastnici", (req: Request, res: Response) => {
  vyzadujSpravceVyprav(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujPridaniUcastnikaPoUzavreni(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }
      const id = ctiIdVypravy(req);
      if (id.length === 0) {
        posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
        return;
      }
      const vstup = overeni.data;
      try {
        const db = getDb();
        const nalezene = await db
          .select()
          .from(expeditions)
          .where(eq(expeditions.id, id))
          .limit(1);
        if (nalezene[0] === undefined) {
          posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
          return;
        }
        // Stav se záměrně nekontroluje — jde to i po proběhlá.
        // Kapacita se po uzavření nekontroluje — nikdy KAPACITA_PLNA.
        // Existence userId/clenId se ověřuje nad DB (404), jméno pak
        // denormalizuje nactiExpediciSDetailem z čerstvých řádků.
        if (vstup.userId !== null) {
          const ucty = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, vstup.userId))
            .limit(1);
          if (ucty[0] === undefined) {
            posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
            return;
          }
        } else if (vstup.clenId !== null) {
          const clenoveRadky = await db
            .select({ id: clenove.id })
            .from(clenove)
            .where(eq(clenove.id, vstup.clenId))
            .limit(1);
          if (clenoveRadky[0] === undefined) {
            posliChybu(res, "NENALEZENO", "Člen nenalezen.");
            return;
          }
        }

        let vlozenyId: string | null = null;
        try {
          const vlozene = await db
            .insert(participants)
            .values({
              expeditionId: id,
              userId: vstup.userId,
              clenId: vstup.clenId,
              status: vstup.status,
            })
            .returning({ id: participants.id });
          const prvni = vlozene[0];
          if (prvni === undefined) throw new Error("prázdný returning");
          vlozenyId = prvni.id;
        } catch (chyba) {
          if (jeUnikatniKolize(chyba)) {
            posliChybu(
              res,
              "UZ_PRIHLASEN",
              "Tenhle účastník už je na výpravě přihlášený.",
            );
            return;
          }
          throw chyba;
        }

        await synchronizujPocet(db, id);
        const detail = await nactiExpediciSDetailem(db, id);
        if (detail === null || vlozenyId === null) {
          vnitrniChyba(res);
          return;
        }
        const ucastnik = detail.ucastnici.find(
          (polozka) => polozka.id === vlozenyId,
        );
        if (ucastnik === undefined) {
          vnitrniChyba(res);
          return;
        }
        const telo: PridatUcastnikaPoUzavreniResponse = {
          ucastnik,
          expedice: detail.expedice,
        };
        res.status(201).json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });
});

/* DELETE /api/expeditions/:id/ucastnici/:ucastnikId — dual-guard. → 200. */
app.delete(
  "/api/expeditions/:id/ucastnici/:ucastnikId",
  (req: Request, res: Response) => {
    vyzadujSpravceVyprav(req, res, () => {
      void (async (): Promise<void> => {
        const id = ctiIdVypravy(req);
        const ucastnikId = ctiIdUcastnika(req);
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Výprava nenalezena.");
          return;
        }
        if (ucastnikId.length === 0) {
          posliChybu(res, "NENALEZENO", "Účastník nenalezen.");
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
          // Stav se záměrně nekontroluje — jde to i po proběhlá.
          const smazane = await db
            .delete(participants)
            .where(
              and(
                eq(participants.id, ucastnikId),
                eq(participants.expeditionId, id),
              ),
            )
            .returning({ id: participants.id });
          if (smazane.length === 0) {
            posliChybu(res, "NENALEZENO", "Účastník nenalezen.");
            return;
          }
          await synchronizujPocet(db, id);
          const detail = await nactiExpediciSDetailem(db, id);
          if (detail === null) {
            vnitrniChyba(res);
            return;
          }
          const telo: OdebratUcastnikaResponse = {
            ok: true,
            expedice: detail.expedice,
          };
          res.json(telo);
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  },
);

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
  };
}

/** `:fotkaId` z cesty — prázdné → volající vrátí 404 NENALEZENO. */
function ctiIdFotky(req: Request): string {
  const surova: unknown = (req.params as Record<string, unknown>)["fotkaId"];
  return typeof surova === "string" ? surova.trim() : "";
}

/* GET /api/expeditions/:id/fotky — PUBLIC seznam pro modal/historii. */
app.get("/api/expeditions/:id/fotky", (req: Request, res: Response) => {
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
        .where(eq(photos.expeditionId, id))
        .orderBy(asc(photos.createdAt));
      const telo: FotkyListResponse = { fotky: radky.map(toApiFotka) };
      res.json(telo);
    } catch {
      vnitrniChyba(res);
    }
  })();
});

/* POST /api/expeditions/:id/fotky — každý přihlášený, jen proběhlá. → 201. */
app.post("/api/expeditions/:id/fotky", (req: Request, res: Response) => {
  vyzadujPrihlaseni(req, res, () => {
    void (async (): Promise<void> => {
      const overeni = validujFotku(req.body as unknown);
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
        if (radek.stav !== "proběhlá") {
          posliChybu(
            res,
            "VYPRAVA_UZAVRENA",
            "Fotky jdou přidat až k proběhlé výpravě. Nejdřív ji uzavři s docházkou.",
          );
          return;
        }
        const adminId = (req as AutentizovanyRequest).uzivatel.id;
        const vlozene = await db
          .insert(photos)
          .values({
            expeditionId: id,
            url: overeni.data.url,
            popis: overeni.data.popis,
            uploadedBy: adminId,
          })
          .returning();
        const nove = vlozene[0];
        if (nove === undefined) throw new Error("prázdný returning");
        const telo: PridatFotkuResponse = { fotka: toApiFotka(nove) };
        res.status(201).json(telo);
      } catch {
        vnitrniChyba(res);
      }
    })();
  });
});

/* DELETE /api/expeditions/:id/fotky/:fotkaId — jen ADMIN. */
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
        const smazane = await db
          .delete(photos)
          .where(and(eq(photos.id, fotkaId), eq(photos.expeditionId, id)))
          .returning({ id: photos.id });
        if (smazane.length === 0) {
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

/* ------------------------------------------------------------------ */
/* GET /api/meta/skoly-tridy — PUBLIC číselník škol a tříd.              */
/* Jen názvy (žádné osobní údaje — nikdy user_id / e-maily). DISTINCT     */
/* otrimovaných neprázdných hodnot, case-insensitive dedup (první        */
/* originál), ORDER BY LOWER, LIMIT 200 + 200. Cache 60 s                */
/* (`Cache-Control: public, max-age=60`). Tvar hlídá jeSkolyTridyOdpoved.*/
/* ------------------------------------------------------------------ */

const META_SKOLY_TRIDY_LIMIT = 200;

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
      const db = getDb();
      const skolyRadky = await db
        .selectDistinct({ hodnota: users.skola })
        .from(users)
        .where(sql`NULLIF(TRIM(${users.skola}), '') IS NOT NULL`)
        .orderBy(users.skola)
        .limit(META_SKOLY_TRIDY_LIMIT);
      const tridyRadky = await db
        .selectDistinct({ hodnota: users.trida })
        .from(users)
        .where(sql`NULLIF(TRIM(${users.trida}), '') IS NOT NULL`)
        .orderBy(users.trida)
        .limit(META_SKOLY_TRIDY_LIMIT);
      const telo = {
        skoly: normalizujNazvy(skolyRadky.map((radek) => radek.hodnota)),
        tridy: normalizujNazvy(tridyRadky.map((radek) => radek.hodnota)),
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

/* Neznámá /api cesta → jednotná 404 (mimo /api necháváme statický hosting). */
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
      const radky = await db
        .select()
        .from(meetings)
        .orderBy(asc(meetings.datum));
      const schuzky: SchuzkyListResponse["schuzky"] = [];
      for (const radek of radky) {
        const api = toApiSchuzka(radek);
        if (api === null) continue;
        // B4 — filtr výjimek: vynechávané data pro týdenní řady.
        const vynechene = await nactiOccurrence(db, radek.id, radek.opakovani);
        const sVyjimkami: ApiSchuzka =
          vynechene.length > 0 ? { ...api, vynecheneVyskyty: vynechene } : api;
        schuzky.push(sVyjimkami);
      }
      if (page === undefined || pageSize === undefined) {
        const telo: SchuzkyListResponse = { schuzky };
        res.json(telo);
        return;
      }
      const totalItems = schuzky.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const start = (page - 1) * pageSize;
      const telo: SchuzkyListResponse = {
        schuzky: schuzky.slice(start, start + pageSize),
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
          mistnost?: string | null;
          popis?: string;
          opakovani?: string;
        } = {};
        if (vstup.nazev !== undefined) zmeny.nazev = vstup.nazev;
        if (vstup.datum !== undefined) zmeny.datum = vstup.datum;
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

/* ------------------------------------------------------------------ */
/* Fáze 4, Krok 1 — Strava OAuth + správa tokenů (kontrakt §15).        */
/* GET /api/strava/auth-url = PUBLIC (jen veřejné CLIENT_ID, žádný      */
/* secret — frontend přes ni staví redirect na Strava authorize).       */
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

/* GET /api/strava/auth-url — PUBLIC, vrací `{ url }` na Strava authorize. */
/* Krok 7b: nikdy nevrací mock URL do prohlížeče — nemumerické / mock /   */
/* prázdné ID (chybí reálné STRAVA_CLIENT_ID) → 503 STRAVA_NENI_NASTAVENA. */
/* Mock výměna code→tokens na callbacku tím není dotčena (STRAVA_MOCK=1). */
app.get("/api/strava/auth-url", (req: Request, res: Response) => {
  const dotaz = req.query as Record<string, unknown>;
  const suroveState: unknown = dotaz["state"];
  const surovyState =
    typeof suroveState === "string" ? suroveState.trim().slice(0, 256) : "";
  // Krok 9: state se stejnou přísností jako callback — scripty / mezery
  // → 422 s polem state (nikdy je neposílat Stravě).
  if (!jePlatnyStravaState(surovyState)) {
    posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
      state: ["Stav propojení je neplatný. Zkus to znovu."],
    });
    return;
  }
  const state = surovyState;
  const clientId = ctiStravaClientId();
  if (!jeRealneClientId(clientId)) {
    posliChybu(res, "STRAVA_NENI_NASTAVENA", STRAVA_NENI_NASTAVENA_ZPRAVA);
    return;
  }
  const url = sestavStravaAuthUrl({
    clientId,
    redirectUri: ctiStravaRedirectUri(),
    state,
    scope: STRAVA_SCOPE_DEFAULT,
  });
  res.json({ url });
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
        } catch {
          vnitrniChyba(res);
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
      } catch {
        vnitrniChyba(res);
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
        if (radek.stav !== "proběhlá") {
          posliChybu(
            res,
            "VYPRAVA_UZAVRENA",
            "Kilometry jdou zapsat až k proběhlé výpravě. Nejdřív ji uzavři s docházkou.",
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
          await db.delete(stravaTokens).where(eq(stravaTokens.userId, id));
          await db
            .update(users)
            .set({ stravaId: null, updatedAt: new Date() })
            .where(eq(users.id, id));
          res.json({ ok: true });
        } catch {
          vnitrniChyba(res);
        }
      })();
    });
  })();
});

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
            .orderBy(asc(expeditions.datum));
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
/* Krok 5 Fáze 4 — GET /api/zebricky?obdobi=celkem|YYYY (PUBLIC).        */
/* Jeden GROUP BY dotaz (bez N+1):                                       */
/* `participants(status=ucastnil_se) ⋈ users ⋈ expeditions`,              */
/* `vypravy` = COUNT účastí, `km` = SUM km (null → 0, na 1 desetinné).    */
/* Řazení účast DESC > km DESC, tie-break jmeno ASC (deterministické),   */
/* LIMIT 50. `obdobi=celkem` = vše; `obdobi=YYYY` = jen datum daného      */
/* roku (rozsah `datum >= YYYY-01-01 AND datum < YYYY+1` — použije        */
/* index `expeditions(datum)`). Bez PII kromě `jmeno` (žádný e-mail /    */
/* telefon / secrety — vrací jen userId/jmeno/vypravy/km). Nevalidní      */
/* obdobi → 422 VALIDATION_ERROR. Bez session (PUBLIC precedent výprav).  */
/* ------------------------------------------------------------------ */

app.get("/api/zebricky", (req: Request, res: Response) => {
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
        email_fallback: unknown;
        vypravy: unknown;
        km: unknown;
      };
      let suroveRadky: ZebrickyRadka[];
      if (obdobi === "celkem") {
        const vysledek = await db.execute(sql`
          SELECT u.id AS user_id,
            TRIM(BOTH ' ' FROM COALESCE(u.jmeno, '') || ' ' || COALESCE(u.prijmeni, '')) AS jmeno_raw,
            u.email AS email_fallback,
            COUNT(*)::int AS vypravy,
            (ROUND(COALESCE(SUM(e.km), 0)::numeric, 1))::float8 AS km
          FROM participants p
          JOIN users u ON u.id = p.user_id
          JOIN expeditions e ON e.id = p.expedition_id
          WHERE p.status = 'ucastnil_se' AND p.user_id IS NOT NULL
            AND e.stav = 'proběhlá'
          GROUP BY u.id, u.jmeno, u.prijmeni, u.email
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
            u.email AS email_fallback,
            COUNT(*)::int AS vypravy,
            (ROUND(COALESCE(SUM(e.km), 0)::numeric, 1))::float8 AS km
          FROM participants p
          JOIN users u ON u.id = p.user_id
          JOIN expeditions e ON e.id = p.expedition_id
          WHERE p.status = 'ucastnil_se' AND p.user_id IS NOT NULL
            AND e.stav = 'proběhlá'
            AND e.datum >= ${od} AND e.datum < ${doDne}
          GROUP BY u.id, u.jmeno, u.prijmeni, u.email
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
        const jmeno =
          celeJmeno.length > 0
            ? celeJmeno
            : typeof radek.email_fallback === "string"
              ? radek.email_fallback
              : "";
        if (jmeno.length === 0) continue;
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

app.use("/api", (_req: Request, res: Response) => {
  posliChybu(res, "NENALEZENO", "Tahle stránka API neexistuje.");
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError) {
    posliChybu(res, "BAD_REQUEST", "Požadavek není platný JSON.");
    return;
  }
  posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
});

const port = Number.isFinite(PORT) && PORT > 0 ? PORT : 3001;
app.listen(port, () => {
  process.stdout.write(`ExApp BFF naslouchá na http://localhost:${port}\n`);
});
