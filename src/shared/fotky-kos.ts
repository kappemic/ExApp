/** Virtual album id for admin trash (not a DB row). */
export const ALBUM_KOS_ID = "kos" as const;

/** Days after soft-delete before trash rows are permanently removed (DB + R2). */
export const KOS_RETENTION_DAYS = 30;

export function jeAlbumKos(albumId: string): boolean {
  return albumId.trim() === ALBUM_KOS_ID;
}
