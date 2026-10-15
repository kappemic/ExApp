/**
 * Soft-delete, restore, and permanent delete for expedition `photos`
 * and extra-album `alba_fotky` rows.
 *
 * Trash retention: rows stay in Koš with `smazano_at` set until an admin
 * restores them, calls `trvaleSmazFotku`, or they age past `KOS_RETENTION_DAYS`.
 * Expired rows are removed by `purgeExpiredTrashPhotos` (idempotent), invoked
 * lazily when an admin loads the album list or opens Koš — no separate cron.
 */
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { KOS_RETENTION_DAYS } from "../../src/shared/fotky-kos";
import { albaFotky, type AlbaFotka } from "../../drizzle/schema/alba";
import { photos, type Photo } from "../../drizzle/schema/photos";
import type { ApiAlbumFotka } from "../../src/shared/api-types";
import type { Db } from "./db";
import { klicZVerejneUrl, smazObjektR2, type R2Nastaveni } from "./r2-fotky";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Cutoff: rows with `smazano_at` strictly before this instant are purged. */
export function mezRetenceKos(vuci: Date = new Date()): Date {
  return new Date(vuci.getTime() - KOS_RETENTION_DAYS * MS_PER_DAY);
}

/** Whether a soft-deleted row is past trash retention (eligible for auto purge). */
export function jeFotkaPoRetenciKos(smazanoAt: Date | null, vuci: Date = new Date()): boolean {
  if (smazanoAt === null) return false;
  return smazanoAt.getTime() < mezRetenceKos(vuci).getTime();
}

export type DruhFotkyRadku = "vyprava" | "vlastni";

export type NalezenaFotka =
  | { druh: "vyprava"; radek: Photo }
  | { druh: "vlastni"; radek: AlbaFotka };

export function fotkaVypravyApi(radek: Photo): ApiAlbumFotka {
  return {
    id: radek.id,
    url: radek.url,
    createdAt: radek.createdAt.toISOString(),
    jeNahled: radek.jeNahled,
    expeditionId: radek.expeditionId,
    albumId: null,
    smazanoAt: radek.smazanoAt?.toISOString() ?? null,
  };
}

export function fotkaVlastniApi(radek: AlbaFotka): ApiAlbumFotka {
  return {
    id: radek.id,
    url: radek.url,
    createdAt: radek.createdAt.toISOString(),
    jeNahled: radek.jeNahled,
    expeditionId: null,
    albumId: radek.albumId,
    smazanoAt: radek.smazanoAt?.toISOString() ?? null,
  };
}

export async function najdiFotkuPodleId(db: Db, fotkaId: string): Promise<NalezenaFotka | null> {
  const zVypravy = await db.select().from(photos).where(eq(photos.id, fotkaId)).limit(1);
  const vyprava = zVypravy[0];
  if (vyprava !== undefined) return { druh: "vyprava", radek: vyprava };
  const zAlba = await db.select().from(albaFotky).where(eq(albaFotky.id, fotkaId)).limit(1);
  const vlastni = zAlba[0];
  if (vlastni !== undefined) return { druh: "vlastni", radek: vlastni };
  return null;
}

/** True when the row exists and is soft-deleted (in Koš). */
export function jeFotkaVKosi(nalezena: NalezenaFotka | null): nalezena is NalezenaFotka {
  return nalezena !== null && nalezena.radek.smazanoAt !== null;
}

/** Resolves a photo id to a trash row (`smazano_at` set). */
export async function najdiFotkuVKosi(db: Db, fotkaId: string): Promise<NalezenaFotka | null> {
  const nalezena = await najdiFotkuPodleId(db, fotkaId);
  return jeFotkaVKosi(nalezena) ? nalezena : null;
}

export async function softSmazFotku(db: Db, nalezena: NalezenaFotka): Promise<boolean> {
  if (nalezena.radek.smazanoAt !== null) return false;
  const now = new Date();
  if (nalezena.druh === "vyprava") {
    const aktualizovane = await db
      .update(photos)
      .set({ smazanoAt: now })
      .where(and(eq(photos.id, nalezena.radek.id), isNull(photos.smazanoAt)))
      .returning({ id: photos.id });
    return aktualizovane.length > 0;
  }
  const aktualizovane = await db
    .update(albaFotky)
    .set({ smazanoAt: now })
    .where(and(eq(albaFotky.id, nalezena.radek.id), isNull(albaFotky.smazanoAt)))
    .returning({ id: albaFotky.id });
  return aktualizovane.length > 0;
}

export async function obnovFotku(db: Db, nalezena: NalezenaFotka): Promise<boolean> {
  if (nalezena.radek.smazanoAt === null) return false;
  if (nalezena.druh === "vyprava") {
    const aktualizovane = await db
      .update(photos)
      .set({ smazanoAt: null })
      .where(and(eq(photos.id, nalezena.radek.id), isNotNull(photos.smazanoAt)))
      .returning({ id: photos.id });
    return aktualizovane.length > 0;
  }
  const aktualizovane = await db
    .update(albaFotky)
    .set({ smazanoAt: null })
    .where(and(eq(albaFotky.id, nalezena.radek.id), isNotNull(albaFotky.smazanoAt)))
    .returning({ id: albaFotky.id });
  return aktualizovane.length > 0;
}

/** Permanently deletes trash rows older than `KOS_RETENTION_DAYS`. Safe to call repeatedly. */
export async function purgeExpiredTrashPhotos(
  db: Db,
  nastaveniR2: R2Nastaveni | null,
  vuci: Date = new Date(),
): Promise<number> {
  const mez = mezRetenceKos(vuci);
  const zVyprav = await db
    .select()
    .from(photos)
    .where(and(isNotNull(photos.smazanoAt), lt(photos.smazanoAt, mez)));
  const zVlastnich = await db
    .select()
    .from(albaFotky)
    .where(and(isNotNull(albaFotky.smazanoAt), lt(albaFotky.smazanoAt, mez)));
  let smazano = 0;
  for (const radek of zVyprav) {
    if (await trvaleSmazFotku(db, { druh: "vyprava", radek }, nastaveniR2)) {
      smazano += 1;
    }
  }
  for (const radek of zVlastnich) {
    if (await trvaleSmazFotku(db, { druh: "vlastni", radek }, nastaveniR2)) {
      smazano += 1;
    }
  }
  return smazano;
}

export async function trvaleSmazFotku(
  db: Db,
  nalezena: NalezenaFotka,
  nastaveniR2: R2Nastaveni | null,
): Promise<boolean> {
  const url = nalezena.radek.url;
  const klic =
    nastaveniR2 === null ? null : klicZVerejneUrl(url, nastaveniR2.publicBaseUrl);
  if (klic !== null && nastaveniR2 !== null) {
    await smazObjektR2(nastaveniR2, klic);
  }
  if (nalezena.druh === "vyprava") {
    const smazane = await db
      .delete(photos)
      .where(eq(photos.id, nalezena.radek.id))
      .returning({ id: photos.id });
    return smazane.length > 0;
  }
  const smazane = await db
    .delete(albaFotky)
    .where(eq(albaFotky.id, nalezena.radek.id))
    .returning({ id: albaFotky.id });
  return smazane.length > 0;
}
