/**
 * Member and user admin HTTP routes.
 */

import {
  and,
  asc,
  eq,
  ne,
  sql,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import type {
  ClenoveListResponse,
  SmazatUzivateleResponse,
  UpravitClenaResponse,
  UpravitUzivateleResponse,
  UserId,
  UserListItem,
  UsersListResponse,
} from "../../src/shared/api-types";
import {
  slucAdminASuperadmin,
  trioNaRoli,
  vyzadujAdmina,
  vyzadujPrihlaseni,
  vyzadujSuperadmina,
  type AutentizovanyRequest,
} from "./auth";
import {
  posliChybu,
} from "./chyby";
import {
  rozdelPlneJmeno,
  seradRole,
  slozPlneJmeno,
  toAdminClen,
  toClenPrehled,
} from "./clenove";
import {
  getDb,
  type Db,
} from "./db";
import {
  validujUpravuClena,
  validujUpravuUzivatele,
} from "./validace";
import {
  smazAvatarUctu,
} from "./r2-uklid";
import {
  chybaKombinace3D,
  isKnownRole,
  mapujRoliNaProfil,
  vidiTelefonyClenu,
  type ClenskyProfil,
  type Clenstvi,
  type Funkce,
  type Role,
} from "../../src/config/roles";
import {
  clenove,
} from "../../drizzle/schema/clenove";
import {
  users,
} from "../../drizzle/schema/users";
import {
  verejnyAvatarUrl,
} from "./diskuze";

export function registrujCleny(app: Express): void {
  /** Postgres check_violation (23514), including the Neon HTTP driver wrapper. */
  function jeCheckSuperadmina(chyba: unknown): boolean {
    if (typeof chyba !== "object" || chyba === null) return false;
    const zaznam = chyba as { code?: unknown; cause?: unknown };
    if (zaznam.code === "23514") return true;
    const pricina: unknown = zaznam.cause;
    if (typeof pricina === "object" && pricina !== null) {
      return (pricina as { code?: unknown }).code === "23514";
    }
    return false;
  }

  const HLASKA_POSLEDNI_SUPERADMIN_ODEBRAT =
    "Posledního hlavního admina odebrat nejde.";
  const HLASKA_POSLEDNI_SUPERADMIN_SMAZAT =
    "Posledního hlavního admina smazat nejde.";

  /** True when some other row still holds is_superadmin. */
  async function lzeSejmoutSuperadmina(db: Db, id: string): Promise<boolean> {
    const ostatni = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isSuperadmin, true), ne(users.id, id)))
      .limit(1);
    return ostatni.length > 0;
  }

  /**
   * UPDATE/DELETE only if another superadmin remains.
   * The count runs in the same statement, so two racing demotions cannot
   * both clear the last flag.
   */
  function podminkaNePosledniSuperadmin(id: string) {
    return and(
      eq(users.id, id),
      sql`(SELECT count(*)::int FROM users WHERE is_superadmin = true AND id <> ${id}::uuid) >= 1`,
    );
  }

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
    vyzadujSuperadmina(req, res, () => {
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
  /* GET /api/users — každý přihlášený (USER i ADMIN). Úzký tvar           */
  /* `UserListItem` včetně e-mailu, telefonu a Discordu. Bez session →    */
  /* 401 NEPRIHLASEN. Úpravy a mazání zůstávají na PATCH/DELETE za        */
  /* `vyzadujSuperadmina`. Nikdy nevrací hash hesla. Řazeno e-mailem.     */
  /* ------------------------------------------------------------------ */

  app.get("/api/users", (req: Request, res: Response) => {
    void vyzadujPrihlaseni(req, res, () => {
      void (async (): Promise<void> => {
        try {
          const db = getDb();
          const radky = await db.select().from(users).orderBy(asc(users.email));
          const divak = (req as AutentizovanyRequest).uzivatel;
          const vidiTelefon = vidiTelefonyClenu(divak);
          const telo: UsersListResponse = {
            users: radky.map((radek) => toUserListItem(radek, vidiTelefon)),
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

  /** DB row → UserListItem. Plain members get telefon: null. */
  function toUserListItem(radek: UserRow, vidiTelefon = true): UserListItem {
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
      isSuperadmin: radek.isSuperadmin === true,
      skola: typeof radek.skola === "string" ? radek.skola : "",
      trida: typeof radek.trida === "string" ? radek.trida : "",
      discordNick:
        typeof radek.discordNick === "string" ? radek.discordNick : null,
      telefon: vidiTelefon && typeof radek.telefon === "string" ? radek.telefon : null,
      avatarUrl: verejnyAvatarUrl(radek.avatarUrl),
      oblibenaBarva:
        typeof radek.oblibenaBarva === "string" ? radek.oblibenaBarva : "",
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
    vyzadujSuperadmina(req, res, () => {
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
            isSuperadmin?: boolean;
            skola?: string;
            trida?: string;
            updatedAt: Date;
          } = { updatedAt: new Date() };

          const stavajiciPrava = {
            isAdmin: stavajici.isAdmin,
            isSuperadmin: stavajici.isSuperadmin === true,
          };
          const prava =
            vstup.role !== undefined
              ? slucAdminASuperadmin(stavajiciPrava, {
                  isAdmin: mapujRoliNaProfil(vstup.role).isAdmin,
                })
              : slucAdminASuperadmin(stavajiciPrava, {
                  isAdmin: vstup.isAdmin,
                  isSuperadmin: vstup.isSuperadmin,
                });
          const sundaSuperadmina =
            stavajiciPrava.isSuperadmin && !prava.isSuperadmin;

          if (vstup.role !== undefined) {
            // Staré `{ role }` — zpětná kompatibilita: trio z mapování.
            // Sundání admina sundá i superadmina (CHECK v DB).
            const profil = mapujRoliNaProfil(vstup.role);
            zmeny.role = vstup.role;
            zmeny.clenstvi = profil.clenstvi;
            zmeny.funkce = profil.funkce;
            zmeny.isAdmin = prava.isAdmin;
            zmeny.isSuperadmin = prava.isSuperadmin;
          } else {
            // Nové parciální trio — efektivní kombinace (merge s DB řádkem).
            const efektProfil: ClenskyProfil = {
              clenstvi: vstup.clenstvi ?? stavajiciClenstvi,
              funkce:
                vstup.funkce !== undefined ? vstup.funkce : stavajiciFunkce,
              isAdmin: prava.isAdmin,
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
              vstup.isAdmin !== undefined ||
              vstup.isSuperadmin !== undefined ||
              prava.isAdmin !== stavajiciPrava.isAdmin ||
              prava.isSuperadmin !== stavajiciPrava.isSuperadmin;
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
            if (
              vstup.isAdmin !== undefined ||
              vstup.isSuperadmin !== undefined ||
              prava.isAdmin !== stavajiciPrava.isAdmin
            ) {
              zmeny.isAdmin = prava.isAdmin;
            }
            if (
              vstup.isSuperadmin !== undefined ||
              prava.isSuperadmin !== stavajiciPrava.isSuperadmin
            ) {
              zmeny.isSuperadmin = prava.isSuperadmin;
            }
            if (vstup.skola !== undefined) zmeny.skola = vstup.skola;
            if (vstup.trida !== undefined) zmeny.trida = vstup.trida;
            // Dual-write mirror — jen když se trio mění (škola/třída roli nese).
            if (meniTrio) zmeny.role = trioNaRoli(efektProfil);
          }

          if (sundaSuperadmina) {
            const lze = await lzeSejmoutSuperadmina(db, id);
            if (!lze) {
              posliChybu(res, "ZAKAZANO", HLASKA_POSLEDNI_SUPERADMIN_ODEBRAT);
              return;
            }
          }

          const aktualizovane = await db
            .update(users)
            .set(zmeny)
            .where(
              sundaSuperadmina
                ? podminkaNePosledniSuperadmin(id)
                : eq(users.id, id),
            )
            .returning();
          const radek = aktualizovane[0];
          if (radek === undefined) {
            if (sundaSuperadmina) {
              posliChybu(res, "ZAKAZANO", HLASKA_POSLEDNI_SUPERADMIN_ODEBRAT);
              return;
            }
            posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
            return;
          }
          const telo: UpravitUzivateleResponse = {
            user: toUserListItem(radek),
          };
          res.json(telo);
        } catch (chyba) {
          if (res.headersSent) return;
          if (jeCheckSuperadmina(chyba)) {
            posliChybu(
              res,
              "ZAKAZANO",
              "Superadmin musí zůstat zároveň adminem.",
            );
            return;
          }
          posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
        }
      })();
    });
  });

  /* ------------------------------------------------------------------ */
  /* DELETE /api/users/:id — smazání účtu (jen superadmin).               */
  /* Vlastní účet (session id === :id) → 403. Poslední superadmin → 403.  */
  /* Neznámé id → 404. Související řádky řeší ON DELETE. `clenove` ne.    */
  /* ------------------------------------------------------------------ */

  app.delete("/api/users/:id", (req: Request, res: Response) => {
    vyzadujSuperadmina(req, res, () => {
      void (async (): Promise<void> => {
        const suroveId: unknown = (req.params as Record<string, unknown>)["id"];
        const id = typeof suroveId === "string" ? suroveId.trim() : "";
        if (id.length === 0) {
          posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
          return;
        }
        const session = (req as AutentizovanyRequest).uzivatel;
        if (session.id === id) {
          posliChybu(
            res,
            "ZAKAZANO",
            "Vlastní účet z administrace smazat nejde.",
          );
          return;
        }
        try {
          const db = getDb();
          const nalezeni = await db
            .select({
              id: users.id,
              isSuperadmin: users.isSuperadmin,
              avatarUrl: users.avatarUrl,
            })
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
          const cil = nalezeni[0];
          if (cil === undefined) {
            posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
            return;
          }
          const jeSuperadmin = cil.isSuperadmin === true;
          if (jeSuperadmin && !(await lzeSejmoutSuperadmina(db, id))) {
            posliChybu(res, "ZAKAZANO", HLASKA_POSLEDNI_SUPERADMIN_SMAZAT);
            return;
          }
          await smazAvatarUctu(id, cil.avatarUrl);
          const smazane = await db
            .delete(users)
            .where(
              jeSuperadmin ? podminkaNePosledniSuperadmin(id) : eq(users.id, id),
            )
            .returning({ id: users.id });
          if (smazane.length === 0) {
            if (jeSuperadmin) {
              posliChybu(res, "ZAKAZANO", HLASKA_POSLEDNI_SUPERADMIN_SMAZAT);
              return;
            }
            posliChybu(res, "NENALEZENO", "Uživatel nenalezen.");
            return;
          }
          const telo: SmazatUzivateleResponse = { ok: true };
          res.json(telo);
        } catch {
          if (!res.headersSent) {
            posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
          }
        }
      })();
    });
  });
}
