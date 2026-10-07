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
  ClenoveListResponse,
  ExpediceDetailResponse,
  ExpediceListResponse,
  FotkyListResponse,
  OdhlasitResponse,
  PrihlaseniResponse,
  PrihlasitNaVypravuResponse,
  PridatFotkuResponse,
  RegistraceResponse,
  SmazatExpediciResponse,
  SmazatFotkuResponse,
  StavVypravy,
  UcastniciListResponse,
  UpravitClenaResponse,
  UpravitExpediciResponse,
  UzavritVypravuResponse,
  VytvoritExpediciResponse,
  VytvoritKodResponse,
} from "../../src/shared/api-types";
import { VALIDACNI_ZPRAVY } from "../../src/shared/api-types";
import {
  hashHesla,
  jeSystemBezAdmina,
  nastavSessionCookie,
  overHeslo,
  podepisToken,
  smazSessionCookie,
  toApiUser,
  vyzadujAdmina,
  vyzadujPrihlaseni,
  type AutentizovanyRequest,
} from "./auth";
import { posliChybu } from "./chyby";
import { parseAllowedOrigins } from "./cors";
import {
  rozdelPlneJmeno,
  seradRole,
  slozPlneJmeno,
  toAdminClen,
  toClenPrehled,
} from "./clenove";
import { getDb, type Db } from "./db";
import { nahodnyKod } from "./kody";
import {
  validujFotku,
  validujPoznamkuKodu,
  validujPrihlaseni,
  validujRegistraci,
  validujUpravuClena,
  validujUpravuExpedice,
  validujUzavreni,
  validujVytvoreniExpedice,
} from "./validace";
import { clenove } from "../../drizzle/schema/clenove";
import { expeditions } from "../../drizzle/schema/expeditions";
import type { ExpeditionRow } from "../../drizzle/schema/expeditions";
import { participants } from "../../drizzle/schema/participants";
import { photos, type Photo } from "../../drizzle/schema/photos";
import { registrationCodes } from "../../drizzle/schema/registration_codes";
import { users } from "../../drizzle/schema/users";
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

/** Postgres unique_violation (23505) — typově bezpečná detekce bez any. */
function jeUnikatniKolize(chyba: unknown): boolean {
  if (typeof chyba !== "object" || chyba === null) return false;
  return (chyba as { code?: unknown }).code === "23505";
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
      const vlozeni = await db
        .insert(users)
        .values({
          email: vstup.email,
          jmeno: vstup.jmeno,
          prijmeni: vstup.prijmeni ?? "",
          telefon: vstup.telefon,
          discordNick: vstup.discordNick,
          role: bezAdmina ? "admin" : "clen",
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
        const api = toApiExpedice(radek);
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
/* Krok 3b — Expedice CRUD + účast + uzavření (kontrakt api-types §8).   */
/* Matice: POST/PATCH/DELETE detailu + PATCH /uzavrit = ADMIN;           */
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
  return { expedice, ucastnici, pocet: prihlasky.length };
}

function vnitrniChyba(res: Response): void {
  if (!res.headersSent) {
    posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
  }
}

/* POST /api/expeditions — jen ADMIN. Úspěch → 201. */
app.post("/api/expeditions", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
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
                sraz: vstup.sraz,
                popis: vstup.popis,
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
          return;
        }
        vnitrniChyba(res);
      } catch {
        vnitrniChyba(res);
      }
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

/* PATCH /api/expeditions/:id — jen ADMIN, parciální. `stav` tudy nejde. */
app.patch("/api/expeditions/:id", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
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
          if (vstup.kapacitaCelkem < pocet) {
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
          sraz?: string;
          popis?: string;
          kapacitaCelkem?: number;
        } = {};
        if (vstup.nazev !== undefined) zmeny.nazev = vstup.nazev;
        if (vstup.datum !== undefined) zmeny.datum = vstup.datum;
        if (vstup.sraz !== undefined) zmeny.sraz = vstup.sraz;
        if (vstup.popis !== undefined) zmeny.popis = vstup.popis;
        if (vstup.kapacitaCelkem !== undefined)
          zmeny.kapacitaCelkem = vstup.kapacitaCelkem;

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

/* DELETE /api/expeditions/:id — jen ADMIN, maže i účastníky (CASCADE). */
app.delete("/api/expeditions/:id", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
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
          if (pocet >= radek.kapacitaCelkem) {
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

/* PATCH /api/expeditions/:id/uzavrit — jen ADMIN (+ docházka).           */
/* Nastaví `stav: "proběhlá"` + přepíše statusy účastníků. Opakované     */
/* uzavření → 409 VYPRAVA_UZAVRENA. Neznámé `ucastnikId` → 422.          */
app.patch("/api/expeditions/:id/uzavrit", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
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
/* Krok 6 — Fotky k uzavřené výpravě (minimum Fáze 2: URL režim).       */
/* Storage rozhodnutí (src/config/storage.ts): žádný Cloudinary /       */
/* Supabase klíč není → ukládá se jen veřejná https:// URL do `photos`  */
/* (nikdy blob). Pozdější Neon Object Storage (bucket                    */
/* `expedition-photos`, `public_read`) použije stejné endpointy —        */
/* kontrakt se nemění. Matice: GET = PUBLIC (náhled v modalu/historii),  */
/* POST + DELETE = ADMIN. Zápis jen u `stav: "proběhlá"`, jinak 409     */
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

/* POST /api/expeditions/:id/fotky — jen ADMIN, jen proběhlá. → 201. */
app.post("/api/expeditions/:id/fotky", (req: Request, res: Response) => {
  vyzadujAdmina(req, res, () => {
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

/* Neznámá /api cesta → jednotná 404 (mimo /api necháváme statický hosting). */
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
