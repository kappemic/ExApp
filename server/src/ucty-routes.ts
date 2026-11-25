/**
 * Account HTTP routes: registration codes, register, login, session, profile, avatar.
 */

import {
  desc,
  gt,
  lte,
  sql,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import type {
  OvereniKoduResponse,
  PrihlaseniResponse,
  RegistraceResponse,
  UpravitProfilResponse,
  VytvoritKodResponse,
  ZiveKodyResponse,
} from "../../src/shared/api-types";
import {
  hashHesla,
  nastavSessionCookie,
  overHeslo,
  overHesloNeboAtrapa,
  podepisToken,
  smazSessionCookie,
  toApiUser,
  trioNaRoli,
  vyzadujAdmina,
  vyzadujPrihlaseni,
  type AutentizovanyRequest,
} from "./auth";
import {
  posliChybu,
  vnitrniChyba,
} from "./chyby";
import {
  AVATAR_MAX_BAJTU,
  AVATAR_TELO_MAX_BAJTU,
  FOTKY_NEJSOU_NASTAVENE_ZPRAVA,
  contentTypeProPriponu,
  ctiR2Nastaveni,
  klicAvataru,
  klicAvataruZVerejneUrl,
  posliObrazekZKlice,
  pripravObrazekKUlozeni,
  rozpoznajObrazek,
  rozdelMultipart,
  smazObrazekR2Tise,
  ulozPripravenyObrazek,
} from "./r2-fotky";
import {
  chceNahled,
  maBezpecneRozmery,
  OBRAZEK_PRILIS_VELKY,
} from "./obrazek-nahled";
import {
  getDb,
} from "./db";
import {
  nahodnyKod,
} from "./kody";
import { rozhodniOvereniKodu } from "./overeni-kodu";
import {
  validujOvereniKodu,
  validujNovyKod,
  validujPrihlaseni,
  validujProfilUpdate,
  validujRegistraci,
} from "./validace";
import {
  smiPokusOUcet,
} from "./prihlaseni-limit";
import { smiUpravitProfil } from "./profil-limit";
import {
  mapujRoliNaProfil,
  roleKoduNeboClen,
  smiNastavitRoliKodu,
  type ClenskyProfil,
  type RoleKodu,
} from "../../src/config/roles";
import {
  registrationCodes,
} from "../../drizzle/schema/registration_codes";
import {
  users,
} from "../../drizzle/schema/users";
import {
  ctiIpZRequestu,
} from "./diskuze";
import {
  jeProfilBezZmen,
  sestavProfilDbPatch,
} from "./services/profile-service";

import {
  MAX_POKUSU_KOD,
  ctiSuroveTelo,
  jeUnikatniKolize,
} from "./bff-sdilene";
import { prostredi } from "./prostredi";


const DESET_MINUT_MS = 10 * 60 * 1000;

/** Smaže z tabulky všechny kódy, jejichž platnost už skončila. */
export async function smazExpirovaneKody(): Promise<void> {
  await getDb()
    .delete(registrationCodes)
    .where(lte(registrationCodes.expiresAt, new Date()));
}

export function registrujUcty(app: Express): void {
  function odmitniKdyzMocPokusu(req: Request, res: Response): boolean {
    if (smiPokusOUcet(ctiIpZRequestu(req))) return false;
    posliChybu(res, "MOC_POZADAVKU", "Pokusů je moc. Počkej chvíli a zkus to znovu.");
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* GET /api/admin/codes — jen ADMIN. Živé řádky: code, expiresAt, role.  */
  /* ------------------------------------------------------------------ */

  app.get("/api/admin/codes", (req: Request, res: Response) => {
    vyzadujAdmina(req, res, () => {
      void (async (): Promise<void> => {
        try {
          const db = getDb();
          const radky = await db
            .select({
              code: registrationCodes.code,
              expiresAt: registrationCodes.expiresAt,
              role: registrationCodes.role,
            })
            .from(registrationCodes)
            .where(gt(registrationCodes.expiresAt, new Date()))
            .orderBy(desc(registrationCodes.expiresAt));
          const telo: ZiveKodyResponse = {
            kody: radky.map((radek) => ({
              code: radek.code,
              expiresAt: radek.expiresAt.toISOString(),
              role: roleKoduNeboClen(radek.role),
            })),
          };
          res.status(200).json(telo);
        } catch {
          if (!res.headersSent) {
            posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
          }
        }
      })();
    });
  });

  /* ------------------------------------------------------------------ */
  /* POST /api/admin/codes — jen ADMIN. Bez admina v DB kód nevznikne;   */
  /* prvního hlavního admina založí `npm run seed:superadmin`.          */
  /* Expirace fixně +10 minut. Vyšší roli než člen smí jen hlavní admin.  */
  /* ------------------------------------------------------------------ */

  app.post("/api/admin/codes", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const overeni = validujNovyKod(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }

      // Poznámka se na hranici jen ověří, tabulka registration_codes ji
      // nemá kam uložit. Ukládá se role.
      const { role } = overeni.data;

      vyzadujAdmina(req, res, () => {
        const { id, isSuperadmin } = (req as AutentizovanyRequest).uzivatel;
        if (!smiNastavitRoliKodu(role, isSuperadmin)) {
          posliChybu(res, "ZAKAZANO", "Kód s vyšší rolí než člen smí vytvořit jen hlavní admin.");
          return;
        }
        void vytvorKod(res, id, role);
      });
    })();
  });

  async function vytvorKod(res: Response, createdBy: string | null, role: RoleKodu): Promise<void> {
    try {
      await smazExpirovaneKody();
    } catch {
      posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
      return;
    }
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
            role,
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
          role,
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

  /* ------------------------------------------------------------------ */
  /* POST /api/kody/overit — jen čte. Řádek se nespotřebuje ani nemaže.  */
  /* Neznámý nebo expirovaný kód → 422, platný → 200 { platny, expiresAt }. */
  /* ------------------------------------------------------------------ */

  app.post("/api/kody/overit", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      if (odmitniKdyzMocPokusu(req, res)) return;
      const overeni = validujOvereniKodu(req.body as unknown);
      if (!overeni.uspech || overeni.data === null) {
        posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
        return;
      }
      try {
        const db = getDb();
        const nalezene = await db
          .select({
            code: registrationCodes.code,
            expiresAt: registrationCodes.expiresAt,
          })
          .from(registrationCodes)
          .where(sql`${registrationCodes.code} = ${overeni.data.kod}`)
          .limit(1);
        const rozhodnuti = rozhodniOvereniKodu(nalezene, overeni.data.kod, Date.now());
        if (!rozhodnuti.platny) {
          posliChybu(res, "VALIDATION_ERROR", rozhodnuti.chyba, {
            kod: [rozhodnuti.chyba],
          });
          return;
        }
        const telo: OvereniKoduResponse = {
          platny: true,
          expiresAt: rozhodnuti.expiresAt,
        };
        res.status(200).json(telo);
      } catch {
        if (!res.headersSent) {
          posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
        }
      }
    })();
  });

  /* ------------------------------------------------------------------ */
  /* POST /api/register — veřejné, platný kód povinný.                   */
  /* Platný = expires_at > now() (sdílený, multi-use). Po expiraci 410.  */
  /* ------------------------------------------------------------------ */

  app.post("/api/register", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      if (odmitniKdyzMocPokusu(req, res)) return;
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
        // Nejdřív řádek v paměti, pak purge — expirovaný kód musí
        // pořád vrátit 410, i když z tabulky mezitím zmizí.
        await smazExpirovaneKody();
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

        const passwordHash = await hashHesla(vstup.heslo);
        // Dual-write: trio je zdroj pravdy, `role` je mirror (trioNaRoli).
        // Roli určuje kód. Admin z něj vzniknout nemůže (roleKoduNeboClen),
        // the first admin comes only from the seed script.
        const noveTrio: ClenskyProfil = {
          ...mapujRoliNaProfil(roleKoduNeboClen(kod.role)),
          isAdmin: false,
        };
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
            isSuperadmin: false,
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
      if (odmitniKdyzMocPokusu(req, res)) return;
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
        const hesloOk = await overHesloNeboAtrapa(
          overeni.data.heslo,
          uzivatel?.passwordHash,
        );
        if (uzivatel === undefined || !hesloOk) {
          posliChybu(res, "SPATNE_HESLO", "Špatný e-mail nebo heslo.");
          return;
        }
        nastavSessionCookie(res, podepisToken(uzivatel.id), overeni.data.zustat);
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
  /* PATCH /api/me — úprava vlastního profilu (Step 3, USER i ADMIN).     */
  /* Cíl je VŽDY session.user.id (žádné :id v URL) — IDOR vyloučen        */
  /* konstrukcí. Nové heslo i změna e-mailu vyžadují současné heslo. Bez  */
  /* session → 401 NEPRIHLASEN (vyzadujPrihlaseni). Moc pokusů → 429      */
  /* MOC_POZADAVKU. Nevalidní pole → 422 VALIDATION_ERROR s details.      */
  /* Kolize e-mailu → 409 EMAIL_OBSAZEN, až po ověření hesla, aby session */
  /* bez hesla nezjistila, které e-maily existují.                        */
  /* Heslo se hashuje bcrypt (cost 10, stejně jako registr), hash se      */
  /* nikdy nevrací. Avatar POUZE URL. Soubor jde přes POST /api/me/avatar. */
  /* ------------------------------------------------------------------ */

  app.patch("/api/me", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          if (!smiUpravitProfil((req as AutentizovanyRequest).uzivatel.id)) {
            posliChybu(res, "MOC_POZADAVKU", "Pokusů je moc. Počkej chvíli a zkus to znovu.");
            return;
          }
          const overeni = validujProfilUpdate(req.body as unknown);
          if (!overeni.uspech || overeni.data === null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", overeni.chybyPoli);
            return;
          }
          const vstup = overeni.data;
          try {
            const db = getDb();
            const id = (req as AutentizovanyRequest).uzivatel.id;
            const nalezeni = await db
              .select()
              .from(users)
              .where(sql`${users.id} = ${id}::uuid`)
              .limit(1);
            const stavajici = nalezeni[0];
            if (stavajici === undefined) {
              posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
              return;
            }

            // E-mail: normalizován na lowercase už ve validaci. Stejná
            // hodnota jako dosud = beze změny a bez nároku na heslo.
            const novyEmail =
              vstup.email !== undefined && vstup.email !== stavajici.email.toLowerCase()
                ? vstup.email
                : undefined;

            if (novyEmail !== undefined || vstup.heslo !== undefined) {
              if (vstup.soucasneHeslo === undefined) {
                posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                  soucasneHeslo: ["Napiš současné heslo."],
                });
                return;
              }
              const sedi = await overHeslo(vstup.soucasneHeslo, stavajici.passwordHash);
              if (!sedi) {
                posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
                  soucasneHeslo: ["Současné heslo nesedí."],
                });
                return;
              }
            }

            // Unikátnost case-insensitive.
            if (novyEmail !== undefined) {
              const kolize = await db
                .select({ id: users.id })
                .from(users)
                .where(sql`lower(${users.email}) = ${novyEmail}`)
                .limit(1);
              const cizi = kolize[0];
              if (cizi !== undefined && cizi.id !== stavajici.id) {
                posliChybu(res, "EMAIL_OBSAZEN", "Tento e-mail je už obsazený.");
                return;
              }
            }

            // Heslo: plaintext hashuje bcrypt (stejný cost jako registr).
            // Nikdy se nevrací (toApiUser) ani neloguje (žádný log body).
            let novyHash: string | undefined;
            if (vstup.heslo !== undefined) {
              novyHash = await hashHesla(vstup.heslo);
            }

            if (
              jeProfilBezZmen(vstup) &&
              novyEmail === undefined &&
              novyHash === undefined
            ) {
              const telo: UpravitProfilResponse = {
                user: toApiUser(stavajici),
              };
              res.json(telo);
              return;
            }

            const patch = sestavProfilDbPatch(vstup);
            const aktualizovane = await db
              .update(users)
              .set({
                ...patch,
                ...(novyEmail !== undefined ? { email: novyEmail } : {}),
                ...(novyHash !== undefined ? { passwordHash: novyHash } : {}),
              })
              .where(sql`${users.id} = ${id}::uuid`)
              .returning();
            const radek = aktualizovane[0];
            if (radek === undefined) {
              posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
              return;
            }
            const telo: UpravitProfilResponse = { user: toApiUser(radek) };
            res.json(telo);
          } catch (chyba) {
            if (jeUnikatniKolize(chyba)) {
              // Závod dvou změn na stejný e-mail.
              posliChybu(res, "EMAIL_OBSAZEN", "Tento e-mail je už obsazený.");
              return;
            }
            if (!res.headersSent) {
              posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
            }
          }
        })();
      });
    })();
  });

  /* POST /api/me/avatar — vlastní fotka (přihlášený). multipart pole `soubor`, */
  /* nejvýš 5 MB, JPEG/PNG/WebP. Uloží do R2 a zapíše `users.avatar_url`.       */
  /* Předchozí vlastní objekt v R2 se po úspěchu smaže. Bez session → 401.      */

  app.post("/api/me/avatar", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const contentType = req.header("content-type") ?? "";
          if (!contentType.includes("multipart/form-data")) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: ["Vyber fotku z telefonu nebo počítače."],
            });
            return;
          }
          const nastaveniR2 = ctiR2Nastaveni(prostredi());
          if (nastaveniR2 === null) {
            posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
            return;
          }
          let teloSouboru: Buffer;
          try {
            teloSouboru = await ctiSuroveTelo(req, AVATAR_TELO_MAX_BAJTU);
          } catch (chyba: unknown) {
            const velikost = chyba instanceof Error && chyba.message === "velikost";
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: [
                velikost
                  ? "Avatar je moc velký (nejvýš 5 MB)."
                  : "Vyber fotku z telefonu nebo počítače.",
              ],
            });
            return;
          }
          const rozdelene = rozdelMultipart(teloSouboru, contentType);
          if (!rozdelene.ok) {
            const text =
              rozdelene.duvod === "velikost"
                ? "Avatar je moc velký (nejvýš 5 MB)."
                : rozdelene.duvod === "format"
                  ? "Avatar musí být obrázek (JPEG, PNG nebo WebP)."
                  : "Vyber fotku z telefonu nebo počítače.";
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: [text],
            });
            return;
          }
          if (rozdelene.fotka.bajty.length > AVATAR_MAX_BAJTU) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: ["Avatar je moc velký (nejvýš 5 MB)."],
            });
            return;
          }
          const pripona = rozpoznajObrazek(rozdelene.fotka.bajty);
          if (pripona === null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: ["Avatar musí být obrázek (JPEG, PNG nebo WebP)."],
            });
            return;
          }
          if (!(await maBezpecneRozmery(rozdelene.fotka.bajty))) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              soubor: [OBRAZEK_PRILIS_VELKY],
            });
            return;
          }
          const id = (req as AutentizovanyRequest).uzivatel.id;
          if (klicAvataru(id, pripona) === null) {
            posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
            return;
          }
          let urlKUlozeni: string;
          let klic: string;
          try {
            const pripraveno = await pripravObrazekKUlozeni(
              rozdelene.fotka.bajty,
              contentTypeProPriponu(pripona),
              pripona,
              "avatar",
              (ext) =>
                ext === "jpg" || ext === "png" || ext === "webp" ? klicAvataru(id, ext) : null,
            );
            if (pripraveno === null) {
              posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
              return;
            }
            klic = pripraveno.klic;
            urlKUlozeni = await ulozPripravenyObrazek(nastaveniR2, pripraveno);
          } catch {
            vnitrniChyba(res);
            return;
          }
          try {
            const db = getDb();
            const nalezeni = await db
              .select()
              .from(users)
              .where(sql`${users.id} = ${id}::uuid`)
              .limit(1);
            const stavajici = nalezeni[0];
            if (stavajici === undefined) {
              posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
              return;
            }
            const aktualizovane = await db
              .update(users)
              .set({ avatarUrl: urlKUlozeni, updatedAt: new Date() })
              .where(sql`${users.id} = ${id}::uuid`)
              .returning();
            const radek = aktualizovane[0];
            if (radek === undefined) {
              posliChybu(res, "NEPRIHLASEN", "Účet už neexistuje. Přihlas se znovu.");
              return;
            }
            const staryKlic = klicAvataruZVerejneUrl(
              typeof stavajici.avatarUrl === "string" ? stavajici.avatarUrl : "",
              nastaveniR2.publicBaseUrl,
              id,
            );
            if (staryKlic !== null && staryKlic !== klic) {
              await smazObrazekR2Tise(nastaveniR2, staryKlic);
            }
            const teloOdpoved: UpravitProfilResponse = { user: toApiUser(radek) };
            res.json(teloOdpoved);
          } catch {
            if (!res.headersSent) {
              posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
            }
          }
        })();
      });
    })();
  });

  /* GET /api/users/:id/avatar — public bytes. The bucket is private, so   */
  /* the browser loads this stream (same idea as expedition photos).       */
  app.get("/api/users/:id/avatar", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        posliChybu(res, "NENALEZENO", "Avatar nenalezen.");
        return;
      }
      try {
        const db = getDb();
        const nalezeni = await db
          .select({ avatarUrl: users.avatarUrl })
          .from(users)
          .where(sql`${users.id} = ${id}::uuid`)
          .limit(1);
        const radek = nalezeni[0];
        const nastaveniR2 = ctiR2Nastaveni(prostredi());
        const ulozena = radek === undefined || typeof radek.avatarUrl !== "string" ? "" : radek.avatarUrl;
        const klic =
          nastaveniR2 === null ? null : klicAvataruZVerejneUrl(ulozena, nastaveniR2.publicBaseUrl, id);
        if (klic === null || nastaveniR2 === null) {
          posliChybu(res, "NENALEZENO", "Avatar nenalezen.");
          return;
        }
        await posliObrazekZKlice(res, nastaveniR2, klic, chceNahled(req));
      } catch {
        if (!res.headersSent) vnitrniChyba(res);
      }
    })();
  });
}
