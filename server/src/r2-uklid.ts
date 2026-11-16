/**
 * Deletes R2 objects when the row that points at them is hard-deleted.
 * Soft-delete leaves the bytes in place until a hard delete.
 */

import { and, eq, inArray } from "drizzle-orm";
import { photos } from "../../drizzle/schema/photos";
import { zpravaPrilohy } from "../../drizzle/schema/zprava_prilohy";
import { zpravy } from "../../drizzle/schema/zpravy";
import type { Db } from "./db";
import {
  ctiR2Nastaveni,
  klicAvataruZVerejneUrl,
  klicNahledu,
  klicZVerejneUrl,
  smazObjektR2,
} from "./r2-fotky";
import { prostredi } from "./prostredi";


function kliceSeSourozencem(klice: readonly string[]): string[] {
  const vse: string[] = [];
  for (const klic of klice) {
    vse.push(klic);
    const nahled = klicNahledu(klic);
    if (nahled !== null) vse.push(nahled);
  }
  return vse;
}

async function smazKlice(klice: readonly string[]): Promise<void> {
  const nastaveni = ctiR2Nastaveni(prostredi());
  const cile = kliceSeSourozencem(klice);
  if (nastaveni === null || cile.length === 0) return;
  await Promise.all(
    cile.map((klic) => smazObjektR2(nastaveni, klic).catch(() => undefined)),
  );
}

/** Photos and chat attachments of an expedition, before the row is deleted. */
export async function smazUlozisteVypravy(db: Db, expeditionId: string): Promise<void> {
  const nastaveni = ctiR2Nastaveni(prostredi());
  const fotky = await db
    .select({ url: photos.url })
    .from(photos)
    .where(eq(photos.expeditionId, expeditionId));
  const zpravaRadky = await db
    .select({ id: zpravy.id })
    .from(zpravy)
    .where(eq(zpravy.expediceId, expeditionId));
  const zpravaIds = zpravaRadky.map((radek) => radek.id);
  const prilohy =
    zpravaIds.length === 0
      ? []
      : await db
          .select({ klic: zpravaPrilohy.klic })
          .from(zpravaPrilohy)
          .where(and(eq(zpravaPrilohy.druh, "zprava"), inArray(zpravaPrilohy.zpravaId, zpravaIds)));
  const klice: string[] = prilohy.map((priloha) => priloha.klic);
  if (nastaveni !== null) {
    for (const fotka of fotky) {
      const klic = klicZVerejneUrl(fotka.url, nastaveni.publicBaseUrl);
      if (klic !== null) klice.push(klic);
    }
  }
  await smazKlice(klice);
  if (zpravaIds.length > 0) {
    await db
      .delete(zpravaPrilohy)
      .where(and(eq(zpravaPrilohy.druh, "zprava"), inArray(zpravaPrilohy.zpravaId, zpravaIds)));
  }
}

/** Avatar object for an account that is about to be hard-deleted. */
export async function smazAvatarUctu(userId: string, avatarUrl: string | null): Promise<void> {
  if (avatarUrl === null || avatarUrl.length === 0) return;
  const nastaveni = ctiR2Nastaveni(prostredi());
  if (nastaveni === null) return;
  const klic = klicAvataruZVerejneUrl(avatarUrl, nastaveni.publicBaseUrl, userId);
  if (klic === null) return;
  await smazKlice([klic]);
}
