/**
 * Custom chat groups: create, delete, role read/write, and threads.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import {
  chatSkupinaPrava,
  chatSkupiny,
  skupinaZpravy,
} from "../../drizzle/schema/chat_skupiny";
import { users } from "../../drizzle/schema/users";
import type { ApiKonverzace, ApiZprava, ApiZpravaPriloha } from "../../src/shared/api-types";
import { hlaskaZakazuSmazani, jeAdminUcet } from "../../src/shared/mazani-zprav";
import {
  jeIdSkupiny,
  klicSkupiny,
  muzeCistSkupinu,
  muzePsatDoSkupiny,
  muzeMenitPristupSkupiny,
  muzeSpravovatSkupiny,
  normalizujPravaSkupiny,
  roleZProfilu,
  validujNazevSkupiny,
  type PravoSkupiny,
  type SkupinaRole,
} from "../../src/lib/skupiny-pristup";
import {
  type AutentizovanyRequest,
  type SessionUzivatel,
  vyzadujPrihlaseni,
} from "./auth";
import { posliChybu } from "./chyby";
import { getDb, type Db } from "./db";
import {
  ctiIpZRequestu,
  poddotazPrecteni,
  slozAuthorName,
  slozZobrazovaneJmeno,
  smiPoslatZpravu,
  verejnyAvatarUrl,
  type ProfilProJmeno,
} from "./diskuze";
import { nactiProfily } from "./soukrome";
import { ctiR2Nastaveni, FOTKY_NEJSOU_NASTAVENE_ZPRAVA } from "./r2-fotky";
import {
  ChybiUlozistePriloh,
  nactiMapuPriloh,
  nactiTeloZpravy,
  zalozZpravuSPrilohami,
  type PripravenaPriloha,
} from "./zprava-prilohy";
import { prostredi } from "./prostredi";


interface SkupinaRadek {
  id: string;
  nazev: string;
  prava: PravoSkupiny[];
}

function jePravoVstup(
  hodnota: unknown,
): hodnota is { role: string; cist: boolean; psat: boolean } {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const zaznam = hodnota as Record<string, unknown>;
  return (
    typeof zaznam["role"] === "string" &&
    typeof zaznam["cist"] === "boolean" &&
    typeof zaznam["psat"] === "boolean"
  );
}

function ctiPravaZTela(telo: unknown): PravoSkupiny[] | null {
  if (typeof telo !== "object" || telo === null) return null;
  const surove = (telo as Record<string, unknown>)["prava"];
  if (!Array.isArray(surove) || !surove.every(jePravoVstup)) return null;
  return normalizujPravaSkupiny(surove);
}

async function nactiSkupiny(db: Db): Promise<SkupinaRadek[]> {
  const skupiny = await db.select().from(chatSkupiny).orderBy(asc(chatSkupiny.createdAt));
  const prava = await db.select().from(chatSkupinaPrava);
  return skupiny.map((skupina) => ({
    id: skupina.id,
    nazev: skupina.nazev,
    prava: prava
      .filter((pravo) => pravo.skupinaId === skupina.id)
      .map((pravo) => ({
        role: pravo.role as SkupinaRole,
        cist: pravo.cist,
        psat: pravo.psat,
      })),
  }));
}

function vidiSkupinu(uzivatel: SessionUzivatel, skupina: SkupinaRadek): boolean {
  if (muzeSpravovatSkupiny(uzivatel)) return true;
  return muzeCistSkupinu(roleZProfilu(uzivatel), skupina.prava);
}

async function ulozPrava(db: Db, id: string, prava: readonly PravoSkupiny[]): Promise<void> {
  await db.delete(chatSkupinaPrava).where(eq(chatSkupinaPrava.skupinaId, id));
  if (prava.length === 0) return;
  await db.insert(chatSkupinaPrava).values(
    prava.map((pravo) => ({
      skupinaId: id,
      role: pravo.role,
      cist: pravo.cist,
      psat: pravo.psat,
    })),
  );
}

function naZpravu(
  radek: {
    id: string;
    autorId: string | null;
    autorJmeno: string;
    text: string;
    createdAt: Date;
  },
  autor: ProfilProJmeno | null,
  prilohy: readonly ApiZpravaPriloha[] = [],
): ApiZprava | null {
  if (!(radek.createdAt instanceof Date) || Number.isNaN(radek.createdAt.getTime())) {
    return null;
  }
  return {
    id: radek.id,
    expeditionId: null,
    autorId: radek.autorId,
    authorName: slozAuthorName(autor, radek.autorJmeno),
    authorAvatarUrl: verejnyAvatarUrl(autor?.avatarUrl),
    channel: "skupina",
    text: radek.text,
    prilohy: prilohy.map((priloha) => ({ ...priloha })),
    createdAt: radek.createdAt.toISOString(),
  };
}

/** Visible custom groups, including empty ones, for the conversation list. */
export async function nactiSkupinoveKonverzace(
  db: Db,
  uzivatel: SessionUzivatel,
  precteni: Readonly<Record<string, string>>,
  ucetOd: string | null = null,
): Promise<ApiKonverzace[]> {
  const skupiny = (await nactiSkupiny(db)).filter((skupina) => vidiSkupinu(uzivatel, skupina));
  if (skupiny.length === 0) return [];
  const role = roleZProfilu(uzivatel);
  const cteci = skupiny.filter((skupina) => muzeCistSkupinu(role, skupina.prava));
  const idCtecich = cteci.map((skupina) => skupina.id);
  const posledniRadky =
    idCtecich.length === 0
      ? []
      : (
          await db.execute(sql`
            SELECT DISTINCT ON (skupina_id)
              id,
              skupina_id::text AS skupina_id,
              autor_id::text AS autor_id,
              autor_jmeno,
              text,
              created_at
            FROM skupina_zpravy
            WHERE smazano_at IS NULL
              AND skupina_id IN (${sql.join(
                idCtecich.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
            ORDER BY skupina_id, created_at DESC, id DESC
          `)
        ).rows;
  const pocty =
    idCtecich.length === 0
      ? []
      : (
          await db.execute(sql`
            SELECT z.skupina_id::text AS skupina_id, count(*)::int AS pocet
            FROM skupina_zpravy AS z
            LEFT JOIN ${poddotazPrecteni(precteni)} AS p
              ON p.key = ('skupina:' || z.skupina_id::text)
            WHERE z.smazano_at IS NULL
              AND z.skupina_id IN (${sql.join(
                idCtecich.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
              AND (
                z.autor_id IS NULL
                OR lower(z.autor_id::text) <> lower(${uzivatel.id}::text)
              )
              AND (${ucetOd}::timestamptz IS NULL OR z.created_at > ${ucetOd}::timestamptz)
              AND (p.last_read IS NULL OR z.created_at > p.last_read)
            GROUP BY z.skupina_id
          `)
        ).rows;
  const neprectene = new Map<string, number>();
  for (const surovy of pocty) {
    const bunka = surovy as { skupina_id?: unknown; pocet?: unknown };
    if (typeof bunka.skupina_id !== "string") continue;
    const pocet = typeof bunka.pocet === "number" ? bunka.pocet : Number(bunka.pocet);
    neprectene.set(bunka.skupina_id.toLowerCase(), Number.isFinite(pocet) ? pocet : 0);
  }
  const posledni = new Map<
    string,
    {
      id: string;
      autorId: string | null;
      autorJmeno: string;
      text: string;
      createdAt: Date;
    }
  >();
  for (const surovy of posledniRadky) {
    const bunka = surovy as {
      id?: unknown;
      skupina_id?: unknown;
      autor_id?: unknown;
      autor_jmeno?: unknown;
      text?: unknown;
      created_at?: unknown;
    };
    if (
      typeof bunka.id !== "string" ||
      typeof bunka.skupina_id !== "string" ||
      typeof bunka.text !== "string"
    ) {
      continue;
    }
    const createdAt =
      bunka.created_at instanceof Date
        ? bunka.created_at
        : typeof bunka.created_at === "string"
          ? new Date(bunka.created_at)
          : null;
    if (createdAt === null || Number.isNaN(createdAt.getTime())) continue;
    posledni.set(bunka.skupina_id.toLowerCase(), {
      id: bunka.id,
      autorId: typeof bunka.autor_id === "string" ? bunka.autor_id : null,
      autorJmeno: typeof bunka.autor_jmeno === "string" ? bunka.autor_jmeno : "",
      text: bunka.text,
      createdAt,
    });
  }
  const profily = await nactiProfily(
    db,
    [...posledni.values()].map((radek) => radek.autorId ?? "").filter((id) => id.length > 0),
  );
  const prilohy = await nactiMapuPriloh(
    db,
    "skupina",
    [...posledni.values()].map((radek) => radek.id),
  );
  const vysledek: ApiKonverzace[] = [];
  for (const skupina of skupiny) {
    const klic = klicSkupiny(skupina.id);
    const muzeCist = muzeCistSkupinu(role, skupina.prava);
    const radek = muzeCist ? posledni.get(skupina.id.toLowerCase()) : undefined;
    const autor =
      radek === undefined || radek.autorId === null
        ? null
        : (profily.get(radek.autorId.toLowerCase()) ?? null);
    const zprava =
      radek === undefined ? null : naZpravu(radek, autor, prilohy.get(radek.id) ?? []);
    vysledek.push({
      key: klic,
      expeditionId: null,
      channel: "skupina",
      nazev: skupina.nazev,
      muzeCist,
      muzePsat: muzePsatDoSkupiny(role, skupina.prava),
      lastMessage: zprava,
      unreadCount:
        muzeCist && zprava !== null ? (neprectene.get(skupina.id.toLowerCase()) ?? 0) : 0,
    });
  }
  return vysledek;
}

/** Same read gate as GET /api/diskuze/skupiny/:id/zpravy. */
export async function overCteniZpravSkupiny(
  db: Db,
  uzivatel: SessionUzivatel,
  id: string,
): Promise<"ok" | "nenalezeno" | "zakazano"> {
  if (!jeIdSkupiny(id)) return "nenalezeno";
  const skupina = (await nactiSkupiny(db)).find((polozka) => polozka.id === id);
  if (skupina === undefined || !vidiSkupinu(uzivatel, skupina)) return "nenalezeno";
  if (!muzeCistSkupinu(roleZProfilu(uzivatel), skupina.prava)) return "zakazano";
  return "ok";
}

export function registrujSkupiny(app: Express): void {
  app.get("/api/diskuze/skupiny", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          try {
            const db = getDb();
            const spravce = muzeSpravovatSkupiny(uzivatel);
            const role = roleZProfilu(uzivatel);
            const skupiny = (await nactiSkupiny(db))
              .filter((skupina) => vidiSkupinu(uzivatel, skupina))
              .map((skupina) => ({
                id: skupina.id,
                nazev: skupina.nazev,
                muzeCist: muzeCistSkupinu(role, skupina.prava),
                muzePsat: muzePsatDoSkupiny(role, skupina.prava),
                prava: spravce ? skupina.prava : [],
              }));
            res.json({ skupiny, muzeSpravovat: spravce });
          } catch {
            posliChybu(res, "VNITRNI_CHYBA", "Skupiny se nepodařilo načíst.");
          }
        })();
      });
    })();
  });

  app.post("/api/diskuze/skupiny", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          if (!muzeSpravovatSkupiny(uzivatel)) {
            posliChybu(res, "ZAKAZANO", "Skupiny zakládá jen vedení, rada nebo admin.");
            return;
          }
          const telo: unknown = req.body as unknown;
          const nazevSurovy =
            typeof telo === "object" && telo !== null
              ? (telo as Record<string, unknown>)["nazev"]
              : undefined;
          const nazev = typeof nazevSurovy === "string" ? validujNazevSkupiny(nazevSurovy) : null;
          const prava = ctiPravaZTela(telo);
          if (nazev === null || prava === null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj název a práva skupiny.", {
              nazev: nazev === null ? ["Název má 1 až 80 znaků."] : [],
              prava: prava === null ? ["Aspoň jedna role musí skupinu číst."] : [],
            });
            return;
          }
          try {
            const db = getDb();
            const vlozene = await db
              .insert(chatSkupiny)
              .values({ nazev })
              .returning({ id: chatSkupiny.id });
            const id = vlozene[0]?.id;
            if (id === undefined) {
              posliChybu(res, "VNITRNI_CHYBA", "Skupinu se nepodařilo založit.");
              return;
            }
            await ulozPrava(db, id, prava);
            res.status(201).json({ id, nazev, prava });
          } catch {
            posliChybu(res, "VNITRNI_CHYBA", "Skupinu se nepodařilo založit.");
          }
        })();
      });
    })();
  });

  app.patch("/api/diskuze/skupiny/:id", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          if (!muzeMenitPristupSkupiny(uzivatel)) {
            posliChybu(res, "ZAKAZANO", "Přístup skupiny mění jen admin.");
            return;
          }
          const id = typeof req.params["id"] === "string" ? req.params["id"] : "";
          if (!jeIdSkupiny(id)) {
            posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
            return;
          }
          const telo: unknown = req.body as unknown;
          const nazevSurovy =
            typeof telo === "object" && telo !== null
              ? (telo as Record<string, unknown>)["nazev"]
              : undefined;
          const nazev = typeof nazevSurovy === "string" ? validujNazevSkupiny(nazevSurovy) : null;
          const prava = ctiPravaZTela(telo);
          if (nazev === null || prava === null) {
            posliChybu(res, "VALIDATION_ERROR", "Zkontroluj název a práva skupiny.", {
              nazev: nazev === null ? ["Název má 1 až 80 znaků."] : [],
              prava: prava === null ? ["Aspoň jedna role musí skupinu číst."] : [],
            });
            return;
          }
          try {
            const db = getDb();
            const nalezene = await db
              .update(chatSkupiny)
              .set({ nazev })
              .where(eq(chatSkupiny.id, id))
              .returning({ id: chatSkupiny.id });
            if (nalezene.length === 0) {
              posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
              return;
            }
            await ulozPrava(db, id, prava);
            res.json({ id, nazev, prava });
          } catch {
            posliChybu(res, "VNITRNI_CHYBA", "Skupinu se nepodařilo upravit.");
          }
        })();
      });
    })();
  });

  app.delete("/api/diskuze/skupiny/:id", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          if (!muzeSpravovatSkupiny(uzivatel)) {
            posliChybu(res, "ZAKAZANO", "Skupiny maže jen vedení, rada nebo admin.");
            return;
          }
          const id = typeof req.params["id"] === "string" ? req.params["id"] : "";
          if (!jeIdSkupiny(id)) {
            posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
            return;
          }
          try {
            const db = getDb();
            const smazane = await db
              .delete(chatSkupiny)
              .where(eq(chatSkupiny.id, id))
              .returning({ id: chatSkupiny.id });
            if (smazane.length === 0) {
              posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
              return;
            }
            res.json({ ok: true });
          } catch {
            posliChybu(res, "VNITRNI_CHYBA", "Skupinu se nepodařilo smazat.");
          }
        })();
      });
    })();
  });

  app.get("/api/diskuze/skupiny/:id/zpravy", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          const id = typeof req.params["id"] === "string" ? req.params["id"] : "";
          if (!jeIdSkupiny(id)) {
            posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
            return;
          }
          try {
            const db = getDb();
            const skupina = (await nactiSkupiny(db)).find((polozka) => polozka.id === id);
            if (skupina === undefined || !vidiSkupinu(uzivatel, skupina)) {
              posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
              return;
            }
            if (!muzeCistSkupinu(roleZProfilu(uzivatel), skupina.prava)) {
              posliChybu(res, "ZAKAZANO", "Do téhle skupiny nemáš přístup.");
              return;
            }
            const radky = await db
              .select()
              .from(skupinaZpravy)
              .where(eq(skupinaZpravy.skupinaId, id))
              .orderBy(asc(skupinaZpravy.createdAt), asc(skupinaZpravy.id));
            const viditelne = radky.filter((radek) => radek.smazanoAt === null);
            const profily = await nactiProfily(
              db,
              viditelne.map((radek) => radek.autorId ?? "").filter((hodnota) => hodnota.length > 0),
            );
            const prilohy = await nactiMapuPriloh(
              db,
              "skupina",
              viditelne.map((radek) => radek.id),
            );
            const zpravy: ApiZprava[] = [];
            for (const radek of viditelne) {
              const autor =
                radek.autorId === null
                  ? null
                  : (profily.get(radek.autorId.toLowerCase()) ?? null);
              const zprava = naZpravu(radek, autor, prilohy.get(radek.id) ?? []);
              if (zprava !== null) zpravy.push(zprava);
            }
            res.json({ zpravy, nextCursor: null });
          } catch {
            posliChybu(res, "VNITRNI_CHYBA", "Zprávy skupiny se nepodařilo načíst.");
          }
        })();
      });
    })();
  });

  app.post("/api/diskuze/skupiny/:id/zpravy", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          const id = typeof req.params["id"] === "string" ? req.params["id"] : "";
          if (!jeIdSkupiny(id)) {
            posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
            return;
          }
          if (!smiPoslatZpravu(ctiIpZRequestu(req))) {
            posliChybu(
              res,
              "MOC_POZADAVKU",
              "Posíláš zprávy moc rychle. Počkej chvíli a zkus to znovu.",
            );
            req.destroy();
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
            const telo: unknown = nactene.telo;
            const textSurovy =
              typeof telo === "object" && telo !== null
                ? (telo as Record<string, unknown>)["text"]
                : undefined;
            text = typeof textSurovy === "string" ? textSurovy.trim() : "";
            if (text.length < 1 || text.length > 1000) {
              posliChybu(res, "VALIDATION_ERROR", "Zpráva má 1 až 1000 znaků.", {
                text: ["Zpráva má 1 až 1000 znaků."],
              });
              return;
            }
          } else {
            text = nactene.data.text;
            soubory = nactene.data.soubory;
          }
          try {
            const db = getDb();
            const skupina = (await nactiSkupiny(db)).find((polozka) => polozka.id === id);
            if (skupina === undefined) {
              posliChybu(res, "NENALEZENO", "Skupina nenalezena.");
              return;
            }
            if (!muzePsatDoSkupiny(roleZProfilu(uzivatel), skupina.prava)) {
              posliChybu(res, "ZAKAZANO", "Do téhle skupiny smíš jen číst.");
              return;
            }
            const profilRadky = await db
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
            const profil = profilRadky[0];
            const jmeno =
              profil === undefined
                ? ""
                : slozZobrazovaneJmeno({
                    jmeno: profil.jmeno,
                    prijmeni: profil.prijmeni,
                    discordNick: profil.discordNick,
                    email: profil.email,
                  });
            const radek = await zalozZpravuSPrilohami(
              ctiR2Nastaveni(prostredi()),
              soubory,
              "skupina",
              db,
              async () => {
                const vlozene = await db
                  .insert(skupinaZpravy)
                  .values({
                    skupinaId: id,
                    autorId: uzivatel.id,
                    autorJmeno: jmeno,
                    text,
                  })
                  .returning();
                return vlozene[0];
              },
            );
            const mapa = await nactiMapuPriloh(db, "skupina", [radek.id]);
            const zprava = naZpravu(
              radek,
              profil === undefined
                ? null
                : {
                    jmeno: profil.jmeno,
                    prijmeni: profil.prijmeni,
                    discordNick: profil.discordNick,
                    email: profil.email,
                    avatarUrl: profil.avatarUrl,
                  },
              mapa.get(radek.id) ?? [],
            );
            if (zprava === null) {
              posliChybu(res, "VNITRNI_CHYBA", "Zprávu se nepodařilo odeslat.");
              return;
            }
            res.status(201).json({ zprava });
          } catch (chyba: unknown) {
            if (chyba instanceof ChybiUlozistePriloh) {
              posliChybu(res, "FOTKY_NEJSOU_NASTAVENE", FOTKY_NEJSOU_NASTAVENE_ZPRAVA);
              return;
            }
            posliChybu(res, "VNITRNI_CHYBA", "Zprávu se nepodařilo odeslat.");
          }
        })();
      });
    })();
  });

  app.delete("/api/diskuze/skupiny/:id/zpravy/:zpravaId", (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      await vyzadujPrihlaseni(req, res, () => {
        void (async (): Promise<void> => {
          const uzivatel = (req as AutentizovanyRequest).uzivatel;
          const id = typeof req.params["id"] === "string" ? req.params["id"] : "";
          const zpravaId = typeof req.params["zpravaId"] === "string" ? req.params["zpravaId"].trim() : "";
          if (!jeIdSkupiny(id) || zpravaId.length === 0) {
            posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
            return;
          }
          try {
            const db = getDb();
            const skupina = (await nactiSkupiny(db)).find((polozka) => polozka.id === id);
            if (skupina === undefined || !vidiSkupinu(uzivatel, skupina)) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            const nalezene = await db
              .select()
              .from(skupinaZpravy)
              .where(and(eq(skupinaZpravy.id, zpravaId), eq(skupinaZpravy.skupinaId, id)))
              .limit(1);
            const radek = nalezene[0];
            if (radek === undefined || radek.smazanoAt !== null) {
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
              .update(skupinaZpravy)
              .set({ smazanoAt: new Date() })
              .where(and(eq(skupinaZpravy.id, zpravaId), isNull(skupinaZpravy.smazanoAt)))
              .returning({ id: skupinaZpravy.id });
            if (smazane.length === 0) {
              posliChybu(res, "NENALEZENO", "Zpráva nenalezena.");
              return;
            }
            res.json({ ok: true });
          } catch {
            posliChybu(res, "VNITRNI_CHYBA", "Zprávu se nepodařilo smazat.");
          }
        })();
      });
    })();
  });
}
