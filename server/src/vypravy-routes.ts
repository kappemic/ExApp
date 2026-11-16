/**
 * Expedition HTTP routes: list, detail, signup, attendance, close. Photos live elsewhere.
 */

import {
  and,
  asc,
  desc,
  count,
  eq,
  inArray,
} from "drizzle-orm";
import {
  type Express,
  type Request,
  type Response,
} from "express";
import {
  randomBytes,
} from "node:crypto";
import type {
  ApiExpedice,
  ApiUcastnik,
  ExpediceDetailResponse,
  ExpediceListResponse,
  OdebratUcastnikaResponse,
  OdhlasitResponse,
  PrihlasitNaVypravuResponse,
  PridatUcastnikaPoUzavreniResponse,
  SmazatExpediciResponse,
  StavVypravy,
  UcastniciListResponse,
  UpravitExpediciResponse,
  UzavritVypravuResponse,
  VytvoritExpediciResponse,
  VytvoritOznameniResponse,
} from "../../src/shared/api-types";
import {
  stavPodleObsazenosti,
} from "../../src/shared/obsazenost-vypravy";
import {
  VALIDACNI_ZPRAVY,
  OZNAMENI_PATH,
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
  DISCORD_BARVA_NOVA_VYPRAVA,
  ctiDiscordWebhookUrl,
  jePlatnyDiscordWebhookUrl,
  posliDiscordEmbed,
  sestavEmbedNovaVyprava,
  type DiscordEmbed,
} from "./discord";
import {
  getDb,
  type Db,
} from "./db";
import {
  validujPridaniUcastnikaPoUzavreni,
  validujUpravuExpedice,
  validujOznameni,
  validujUzavreni,
  validujVytvoreniExpedice,
} from "./validace";
import {
  smiPoslatOznameni,
} from "./oznameni-limit";
import {
  smazUlozisteVypravy,
} from "./r2-uklid";
import {
  lzeDoplnitArchiv,
} from "./vyprava-termin";
import {
  clenove,
} from "../../drizzle/schema/clenove";
import {
  expeditions,
} from "../../drizzle/schema/expeditions";
import type {
  ExpeditionRow,
} from "../../drizzle/schema/expeditions";
import {
  participants,
} from "../../drizzle/schema/participants";
import {
  users,
} from "../../drizzle/schema/users";
import {
  verejnyAvatarUrl,
} from "./diskuze";
import {
  nactiCestaSnimky,
  smazSnimkyVypravy,
} from "./cesta-snimky-routes";
import {
  dochazkaKryjePrihlasky,
  nactiMapuNahledu,
  nactiPoctyUcastniku,
  prihlasPokudJeMisto,
  sNahledFotkaId,
  spocitejUcastniky,
  synchronizujPocet,
  toApiExpedice,
  toApiUcastnik,
  vytvorSlugExpedice,
} from "./vypravy";

import {
  MAX_POKUSU_KOD,
  ctiCeleCisloQuery,
  ctiIdVypravy,
  jeUnikatniKolize,
} from "./bff-sdilene";

/** DB řádek + čerstvý COUNT (místo cache sloupce). Nevalidní → null. */
export function apiExpediceSPoctem(
  radek: ExpeditionRow,
  pocet: number,
): ApiExpedice | null {
  const zaklad = toApiExpedice({ ...radek, kapacitaPrihlaseno: pocet });
  if (zaklad === null) return null;
  return {
    ...zaklad,
    kapacita: { prihlaseno: pocet, celkem: radek.kapacitaCelkem },
  };
}

export function registrujVypravy(app: Express): void {
  /* ------------------------------------------------------------------ */
  /* GET /api/expeditions — veřejné čtení z Neon DB (Krok 3 + Krok 2      */
  /* query dle kontraktu: ?stav=proběhlá = historie, ?page&pageSize).      */
  /* Autoritativní zdroj: tabulka `expeditions`, řazeno datem.             */
  /* Bez query = vše bez `pagination`; s page/pageSize = stránka +         */
  /* `pagination`. Nikdy mocky ani snapshot — prázdná DB vrátí prázdné     */
  /* pole (UI pak ukáže ExpeditionEmpty). Nevalidní řádek se přeskočí.     */
  /* ------------------------------------------------------------------ */

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
        // History reads newest first, so the oldest records sit on the last page.
        const poradi =
          stav === "proběhlá"
            ? desc(expeditions.datum)
            : asc(expeditions.datum);
        let radky;
        let totalItemsSql: number | null = null;
        if (page !== undefined && pageSize !== undefined) {
          const offset = (page - 1) * pageSize;
          const pocet =
            stav === undefined
              ? await db.select({ hodnota: count() }).from(expeditions)
              : await db
                  .select({ hodnota: count() })
                  .from(expeditions)
                  .where(eq(expeditions.stav, stav));
          const surovy = pocet[0]?.hodnota ?? 0;
          totalItemsSql = typeof surovy === "number" ? surovy : Number(surovy);
          radky =
            stav === undefined
              ? await db
                  .select()
                  .from(expeditions)
                  .orderBy(poradi)
                  .limit(pageSize)
                  .offset(offset)
              : await db
                  .select()
                  .from(expeditions)
                  .where(eq(expeditions.stav, stav))
                  .orderBy(poradi)
                  .limit(pageSize)
                  .offset(offset);
        } else {
          radky =
            stav === undefined
              ? await db.select().from(expeditions).orderBy(poradi)
              : await db
                  .select()
                  .from(expeditions)
                  .where(eq(expeditions.stav, stav))
                  .orderBy(poradi);
        }
        const nahledy = await nactiMapuNahledu(
          db,
          radky.map((radek) => radek.id),
        );
        const pocty = await nactiPoctyUcastniku(
          db,
          radky.map((radek) => radek.id),
        );
        const vysledek: ApiExpedice[] = [];
        for (const radek of radky) {
          const pocet = pocty.get(radek.id) ?? 0;
          const api = apiExpediceSPoctem(radek, pocet);
          if (api !== null) vysledek.push(sNahledFotkaId(api, nahledy));
        }
        if (page === undefined || pageSize === undefined) {
          const telo: ExpediceListResponse = { expedice: vysledek };
          res.json(telo);
          return;
        }
        const totalItems = totalItemsSql ?? vysledek.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const telo: ExpediceListResponse = {
          expedice: vysledek,
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
  /* Krok 3b — Expedice CRUD + účast + uzavření (kontrakt api-types §8).   */
  /* Matice: POST/PATCH/DELETE detailu + PATCH /uzavrit + správa účastníků */
  /* po uzavření = dual-guard (admin nebo aktivní člen);                   */
  /* GET detail = PUBLIC; účast (seznam / prihlasit / odhlasit) = USER.    */
  /* Kapacita je vždy `kapacita_celkem` vs COUNT řádků v `participants`.   */
  /* Uzavření nastaví `stav: "proběhlá"` + zapíše docházku. Chyby vždy     */
  /* jen ApiErrorResponse (posliChybu). Pozor na závod dvou přihlášek —     */
  /* duplicitu jistí UNIQUE v DB (23505 → 409 UZ_PRIHLASEN).               */
  /* ------------------------------------------------------------------ */

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
    const avatary = new Map<string, string | null>();
    if (userIds.length > 0) {
      const ucty = await db
        .select()
        .from(users)
        .where(inArray(users.id, userIds));
      for (const ucet of ucty) {
        const cele = `${ucet.jmeno} ${ucet.prijmeni}`.trim().replace(/\s+/g, " ");
        jmena.set(`user:${ucet.id}`, cele.length > 0 ? cele : ucet.email);
        avatary.set(ucet.id, verejnyAvatarUrl(ucet.avatarUrl));
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
      const api = toApiUcastnik(
        prihlaska,
        klic === null ? "" : (jmena.get(klic) ?? ""),
        prihlaska.userId === null ? null : (avatary.get(prihlaska.userId) ?? null),
      );
      if (api !== null) ucastnici.push(api);
    }

    const expedice = apiExpediceSPoctem(radek, prihlasky.length);
    if (expedice === null) return null;
    const nahledy = await nactiMapuNahledu(db, [id]);
    expedice.nahledFotkaId = nahledy.get(id) ?? null;
    // Krok 20: veřejný detail nese i ušlé kilometry výpravy (expedice-level,
    // takže je vidí i ti, kdo na ní nebyli). null = administrace ještě
    // nedopsala kilometry. Nové pole je aditivní — klient si ho volí.
    expedice.km = typeof radek.km === "number" ? radek.km : null;
    expedice.prevyseniM =
      typeof radek.prevyseniM === "number" ? radek.prevyseniM : null;
    expedice.trasaPolyline =
      typeof radek.trasaPolyline === "string" ? radek.trasaPolyline : null;
    expedice.stravaActivityId =
      typeof radek.stravaActivityId === "string" && radek.stravaActivityId.length > 0
        ? radek.stravaActivityId
        : null;
    return { expedice, ucastnici, pocet: prihlasky.length };
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
        const ucetId = (req as AutentizovanyRequest).uzivatel.id;
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
                  stav: stavPodleObsazenosti(vstup.kapacitaCelkem, 0),
                  organizatorId: ucetId,
                })
                .returning();
              radek = vlozene[0];
            } catch (chyba) {
              if (jeUnikatniKolize(chyba)) continue;
              throw chyba;
            }
            if (radek === undefined) throw new Error("prázdný returning");
            // Creator is signed up immediately. Capacity 0 means unlimited.
            const pocetPred = await spocitejUcastniky(db, id);
            const vejdeSe =
              vstup.kapacitaCelkem === 0 || pocetPred < vstup.kapacitaCelkem;
            if (vejdeSe) {
              await db.insert(participants).values({
                expeditionId: id,
                userId: ucetId,
                clenId: null,
                status: "prihlasen",
              });
            }
            const pocet = await synchronizujPocet(db, id);
            const api = apiExpediceSPoctem(
              {
                ...radek,
                kapacitaPrihlaseno: pocet,
                stav: stavPodleObsazenosti(vstup.kapacitaCelkem, pocet),
              },
              pocet,
            );
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
        const ucetId = (req as AutentizovanyRequest).uzivatel.id;
        if (!smiPoslatOznameni(ucetId)) {
          posliChybu(res, "MOC_POZADAVKU", "Oznámení jde poslat nejvýš pětkrát za hodinu.");
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
        const snimky = await nactiCestaSnimky(db, id);
        const telo: ExpediceDetailResponse = {
          expedice: detail.expedice,
          cestaTam: snimky.cestaTam,
          cestaZpet: snimky.cestaZpet,
        };
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
          let pocetPriKapacite: number | null = null;
          if (vstup.kapacitaCelkem !== undefined) {
            const pocet = await spocitejUcastniky(db, id);
            pocetPriKapacite = pocet;
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
            stav?: "volno" | "skoro plno";
          } = {};
          if (vstup.nazev !== undefined) zmeny.nazev = vstup.nazev;
          if (vstup.datum !== undefined) zmeny.datum = vstup.datum;
          if (vstup.datumDo !== undefined) zmeny.datumDo = vstup.datumDo;
          if (vstup.sraz !== undefined) zmeny.sraz = vstup.sraz;
          if (vstup.popis !== undefined) zmeny.popis = vstup.popis;
          if (vstup.trasaOdkaz !== undefined) zmeny.trasaOdkaz = vstup.trasaOdkaz;
          if (vstup.kapacitaCelkem !== undefined) {
            zmeny.kapacitaCelkem = vstup.kapacitaCelkem;
            if (stavajici.stav !== "proběhlá" && pocetPriKapacite !== null) {
              zmeny.stav = stavPodleObsazenosti(
                vstup.kapacitaCelkem,
                pocetPriKapacite,
              );
            }
          }

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
          await smazUlozisteVypravy(db, id);
          await smazSnimkyVypravy(db, id);
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
            if (
              lzeDoplnitArchiv({
                stav: radek.stav,
                datum: radek.datum,
                datumDo: radek.datumDo,
              })
            ) {
              posliChybu(
                res,
                "VYPRAVA_UZAVRENA",
                "Termín už skončil. Přihlásit se nejde.",
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
            const prihlaseni = await prihlasPokudJeMisto(db, id, uzivatel.id);
            if (prihlaseni.stav === "kolize") {
              posliChybu(
                res,
                "UZ_PRIHLASEN",
                "Na tuhle výpravu už jsi přihlášený.",
              );
              return;
            }
            if (prihlaseni.stav === "plno") {
              posliChybu(res, "KAPACITA_PLNA", "Výprava je už plná.");
              return;
            }

            const vlozenyId: string = prihlaseni.id;
            const vlozenyCas: Date = prihlaseni.createdAt;

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
            const ucastnik = toApiUcastnik(
              {
                id: vlozenyId,
                expeditionId: id,
                userId: uzivatel.id,
                clenId: null,
                status: "prihlasen",
                createdAt: vlozenyCas,
              },
              celeJmeno,
              verejnyAvatarUrl(mujRadek?.avatarUrl),
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
            if (
              lzeDoplnitArchiv({
                stav: radek.stav,
                datum: radek.datum,
                datumDo: radek.datumDo,
              })
            ) {
              posliChybu(
                res,
                "VYPRAVA_UZAVRENA",
                "Termín už skončil. Odhlásit se nejde.",
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
          const zname = prihlasky.map((polozka) => polozka.id);
          const dodane = overeni.data.dochazka.map((zaznam) => zaznam.ucastnikId);
          const znameMnozina = new Set(zname);
          const patriVsechny = dodane.every((id) => znameMnozina.has(id));
          if (!patriVsechny) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              dochazka: [VALIDACNI_ZPRAVY.dochazkaNeznamyUcastnik],
            });
            return;
          }
          if (!dochazkaKryjePrihlasky(zname, dodane)) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", {
              dochazka: [VALIDACNI_ZPRAVY.dochazkaNeuplna],
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
}
