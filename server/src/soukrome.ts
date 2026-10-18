/**
 * Private 1:1 threads. The pair key is shared; a third account gets nothing.
 */
import { asc, eq, inArray, isNull } from "drizzle-orm";
import { soukromeZpravy } from "../../drizzle/schema/soukrome_zpravy";
import { users } from "../../drizzle/schema/users";
import type { ApiKonverzace, ApiZprava } from "../../src/shared/api-types";
import {
  jeUcastnikSoukromeho,
  partnerSoukromeho,
} from "../../src/shared/soukromy-klic";
import type { Db } from "./db";
import { slozAuthorName, verejnyAvatarUrl, type ProfilProJmeno } from "./diskuze";

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

function naApi(radek: {
  id: string;
  autorId: string | null;
  autorJmeno: string;
  text: string;
  createdAt: Date;
}, autor: ProfilProJmeno | null): ApiZprava | null {
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
    createdAt: radek.createdAt.toISOString(),
  };
}

/** Threads the signed-in user belongs to. Others are dropped. */
export async function nactiSoukromeKonverzace(
  db: Db,
  userId: string,
  precteni: Readonly<Record<string, string>>,
): Promise<ApiKonverzace[]> {
  const radky = await db
    .select()
    .from(soukromeZpravy)
    .where(isNull(soukromeZpravy.smazanoAt))
    .orderBy(asc(soukromeZpravy.createdAt), asc(soukromeZpravy.id));
  const moje = radky.filter((radek) => jeUcastnikSoukromeho(radek.klic, userId));
  const partneri = moje
    .map((radek) => partnerSoukromeho(radek.klic, userId))
    .filter((id): id is string => id !== null);
  const profily = await nactiProfily(db, [...partneri, ...moje.map((r) => r.autorId ?? "")].filter((id) => id.length > 0));
  const skupiny = new Map<string, ApiKonverzace>();
  for (const radek of moje) {
    const autor = radek.autorId === null ? null : (profily.get(radek.autorId.toLowerCase()) ?? null);
    const zprava = naApi(radek, autor);
    if (zprava === null) continue;
    const partnerId = partnerSoukromeho(radek.klic, userId);
    const partner = partnerId === null ? null : (profily.get(partnerId) ?? null);
    const stavajici = skupiny.get(radek.klic);
    if (stavajici === undefined) {
      skupiny.set(radek.klic, {
        key: radek.klic,
        expeditionId: null,
        channel: "soukrome",
        partnerId,
        partnerJmeno: partner === null ? "Člen" : slozAuthorName(partner, ""),
        lastMessage: zprava,
        unreadCount: 0,
      });
    } else {
      stavajici.lastMessage = zprava;
    }
    const konverzace = skupiny.get(radek.klic);
    if (konverzace === undefined) continue;
    const lastRead = precteni[radek.klic];
    if (lastRead === undefined || zprava.createdAt > lastRead) {
      konverzace.unreadCount += 1;
    }
  }
  return [...skupiny.values()];
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
  const vysledek: ApiZprava[] = [];
  for (const radek of viditelne) {
    const autor = radek.autorId === null ? null : (profily.get(radek.autorId.toLowerCase()) ?? null);
    const zprava = naApi(radek, autor);
    if (zprava !== null) vysledek.push(zprava);
  }
  return vysledek;
}

export { jeUcastnikSoukromeho };
