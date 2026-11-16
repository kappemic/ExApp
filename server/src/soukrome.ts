/**
 * Private 1:1 threads. The pair key is shared; a third account gets nothing.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import { soukromeZpravy } from "../../drizzle/schema/soukrome_zpravy";
import { users } from "../../drizzle/schema/users";
import type { ApiKonverzace, ApiZprava, ApiZpravaPriloha } from "../../src/shared/api-types";
import {
  jeUcastnikSoukromeho,
  partnerSoukromeho,
} from "../../src/shared/soukromy-klic";
import type { Db } from "./db";
import { poddotazPrecteni, slozAuthorName, verejnyAvatarUrl, type ProfilProJmeno } from "./diskuze";
import { nactiMapuPriloh } from "./zprava-prilohy";

export async function nactiProfily(
  db: Db,
  ids: ReadonlyArray<string>,
): Promise<Map<string, ProfilProJmeno>> {
  const mapa = new Map<string, ProfilProJmeno>();
  const unikatni = [...new Set(ids)];
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
    mapa.set(radek.id.toLowerCase(), {
      jmeno: radek.jmeno,
      prijmeni: radek.prijmeni,
      discordNick: radek.discordNick,
      email: radek.email,
      avatarUrl: verejnyAvatarUrl(radek.avatarUrl),
    });
  }
  return mapa;
}

function naApi(
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
    channel: "soukrome",
    text: radek.text,
    prilohy: prilohy.map((priloha) => ({ ...priloha })),
    createdAt: radek.createdAt.toISOString(),
  };
}

/** Threads the signed-in user belongs to. Others are dropped. */
export async function nactiSoukromeKonverzace(
  db: Db,
  userId: string,
  precteni: Readonly<Record<string, string>>,
  ucetOd: string | null = null,
): Promise<ApiKonverzace[]> {
  const ja = userId.trim().toLowerCase();
  const posledni = await db.execute(sql`
    SELECT DISTINCT ON (klic)
      id, klic, autor_id::text AS autor_id, autor_jmeno, text, created_at
    FROM soukrome_zpravy
    WHERE smazano_at IS NULL
      AND (
        split_part(klic, ':', 2) = ${ja}
        OR split_part(klic, ':', 3) = ${ja}
      )
    ORDER BY klic, created_at DESC, id DESC
  `);
  const pocty = await db.execute(sql`
    SELECT z.klic, count(*)::int AS pocet
    FROM soukrome_zpravy AS z
    LEFT JOIN ${poddotazPrecteni(precteni)} AS p ON p.key = z.klic
    WHERE z.smazano_at IS NULL
      AND (
        split_part(z.klic, ':', 2) = ${ja}
        OR split_part(z.klic, ':', 3) = ${ja}
      )
      AND (z.autor_id IS NULL OR lower(z.autor_id::text) <> ${ja})
      AND (${ucetOd}::timestamptz IS NULL OR z.created_at > ${ucetOd}::timestamptz)
      AND (p.last_read IS NULL OR z.created_at > p.last_read)
    GROUP BY z.klic
  `);
  const neprectene = new Map<string, number>();
  for (const surovy of pocty.rows) {
    const bunka = surovy as { klic?: unknown; pocet?: unknown };
    if (typeof bunka.klic !== "string") continue;
    const pocet = typeof bunka.pocet === "number" ? bunka.pocet : Number(bunka.pocet);
    neprectene.set(bunka.klic, Number.isFinite(pocet) ? pocet : 0);
  }
  const radky: {
    id: string;
    klic: string;
    autorId: string | null;
    autorJmeno: string;
    text: string;
    createdAt: Date;
  }[] = [];
  for (const surovy of posledni.rows) {
    const bunka = surovy as {
      id?: unknown;
      klic?: unknown;
      autor_id?: unknown;
      autor_jmeno?: unknown;
      text?: unknown;
      created_at?: unknown;
    };
    if (typeof bunka.id !== "string" || typeof bunka.klic !== "string" || typeof bunka.text !== "string") {
      continue;
    }
    if (!jeUcastnikSoukromeho(bunka.klic, ja)) continue;
    const createdAt =
      bunka.created_at instanceof Date
        ? bunka.created_at
        : typeof bunka.created_at === "string"
          ? new Date(bunka.created_at)
          : null;
    if (createdAt === null || Number.isNaN(createdAt.getTime())) continue;
    radky.push({
      id: bunka.id,
      klic: bunka.klic,
      autorId: typeof bunka.autor_id === "string" ? bunka.autor_id : null,
      autorJmeno: typeof bunka.autor_jmeno === "string" ? bunka.autor_jmeno : "",
      text: bunka.text,
      createdAt,
    });
  }
  const partneri = radky
    .map((radek) => partnerSoukromeho(radek.klic, ja))
    .filter((id): id is string => id !== null);
  const profily = await nactiProfily(
    db,
    [...partneri, ...radky.map((radek) => radek.autorId ?? "")].filter((id) => id.length > 0),
  );
  const prilohy = await nactiMapuPriloh(
    db,
    "soukroma",
    radky.map((radek) => radek.id),
  );
  const skupiny: ApiKonverzace[] = [];
  for (const radek of radky) {
    const autor = radek.autorId === null ? null : (profily.get(radek.autorId.toLowerCase()) ?? null);
    const zprava = naApi(radek, autor, prilohy.get(radek.id) ?? []);
    if (zprava === null) continue;
    const partnerId = partnerSoukromeho(radek.klic, ja);
    const partner = partnerId === null ? null : (profily.get(partnerId) ?? null);
    skupiny.push({
      key: radek.klic,
      expeditionId: null,
      channel: "soukrome",
      partnerId,
      partnerJmeno: partner === null ? "Člen" : slozAuthorName(partner, ""),
      lastMessage: zprava,
      unreadCount: neprectene.get(radek.klic) ?? 0,
    });
  }
  return skupiny;
}

export async function nactiVlaknoSoukrome(
  db: Db,
  klic: string,
  userId: string,
): Promise<ApiZprava[] | null> {
  if (!jeUcastnikSoukromeho(klic, userId)) return null;
  const radky = await db
    .select()
    .from(soukromeZpravy)
    .where(eq(soukromeZpravy.klic, klic))
    .orderBy(asc(soukromeZpravy.createdAt), asc(soukromeZpravy.id));
  const viditelne = radky.filter((radek) => radek.smazanoAt === null);
  const profily = await nactiProfily(
    db,
    viditelne.map((radek) => radek.autorId ?? "").filter((id) => id.length > 0),
  );
  const prilohy = await nactiMapuPriloh(db, "soukroma", viditelne.map((radek) => radek.id));
  const vysledek: ApiZprava[] = [];
  for (const radek of viditelne) {
    const autor = radek.autorId === null ? null : (profily.get(radek.autorId.toLowerCase()) ?? null);
    const zprava = naApi(radek, autor, prilohy.get(radek.id) ?? []);
    if (zprava !== null) vysledek.push(zprava);
  }
  return vysledek;
}

export { jeUcastnikSoukromeho };
