/**
 * Album contracts.
 */



/* Albums (Fotky). Two kinds share one list:                          */
/* - vyprava: not a row of its own. id === expeditions.id, and only     */
/*   when expeditions.stav is "proběhlá" (volno / skoro plno omitted).  */
/*   Photos are existing `photos` rows. Bytes stay on                  */
/*   GET /api/expeditions/:id/fotky/:fotkaId/soubor.                   */
/* - vlastni: row in `alba`, photos in `alba_fotky`. Bytes:           */
/*   GET /api/alba/:id/fotky/:fotkaId/soubor.                          */
/* One `vlastni` album is permanent: ALBUM_NAHLEDY_ID                  */
/* (src/shared/fotky-nahledy.ts). Always listed, never deletable.      */
/* POST …/fotky there is ADMIN, other members get 403 ZAKAZANO.        */
/* Errors are only ApiErrorResponse.                                   */
/* ------------------------------------------------------------------ */

export const ALBA_PATH = "/api/alba" as const;

export type DruhAlba = "vyprava" | "vlastni" | "kos";

/** One album card. `expeditionId` is set only for `druh: "vyprava"`. */
export interface ApiAlbum {
  id: string;
  nazev: string;
  druh: DruhAlba;
  expeditionId: string | null;
  pocetFotek: number;
  nahledFotkaId: string | null;
}

export interface AlbaListResponse {
  alba: ApiAlbum[];
}

export interface VytvoritAlbumRequest {
  nazev: string;
}

/** Created extra album. Count is 0 and the cover is null. → 201. */
export interface VytvoritAlbumResponse {
  album: ApiAlbum;
}

/**
 * DELETE /api/alba/:id — ADMIN (`vyzadujAdmina`). Extra album (`alba`) only.
 * Expedition id → 404 NENALEZENO; the expedition and its `photos` rows stay.
 * Missing id → 404 NENALEZENO, message "Album nenalezeno."
 * Success → 200. `alba_fotky` leave with ON DELETE CASCADE.
 */
export interface SmazatAlbumResponse {
  ok: true;
}

/**
 * One photo inside GET /api/alba/:id/fotky.
 * Expedition album: `expeditionId` is the expedition id, `albumId` is null.
 * Extra album: `expeditionId` is null, `albumId` is `alba.id`.
 */
export interface ApiAlbumFotka {
  id: string;
  url: string;
  createdAt: string;
  jeNahled: boolean;
  expeditionId: string | null;
  albumId: string | null;
  /** Set when listing trash; null for active album photos. */
  smazanoAt?: string | null;
  /** Pixel size of the stored file. Absent on older responses and older rows. */
  sirka?: number;
  vyska?: number;
}

export interface AlbumFotkyResponse {
  fotky: ApiAlbumFotka[];
}

/** Multipart upload of one or more `soubor` fields. → 201. */
export interface PridatAlbumFotkyResponse {
  fotky: ApiAlbumFotka[];
}

/**
 * DELETE /api/alba/:id/fotky/:fotkaId — ADMIN (`vyzadujAdmina`).
 * Soft-delete: row stays in DB with `smazano_at` (Koš). Extra album only;
 * expedition id → 404 (use DELETE /api/expeditions/:id/fotky/:fotkaId).
 * Missing row → 404. Success → 200.
 */
export interface SmazatAlbumFotkuResponse {
  ok: true;
}

/** POST /api/alba/kos/fotky/:fotkaId/obnovit — ADMIN. Clears smazano_at. */
export interface ObnovitFotkuZKoseResponse {
  ok: true;
}

/** DELETE /api/alba/kos/fotky/:fotkaId — ADMIN. Hard delete + R2 when configured. */
export interface TrvaleSmazatFotkuZKoseResponse {
  ok: true;
}

/** Streams one extra-album object. Expedition photos use `fotkaSouborPath`. */
export function albumFotkaSouborPath(
  albumId: string,
  fotkaId: string,
): `/api/alba/${string}/fotky/${string}/soubor` {
  return `/api/alba/${albumId}/fotky/${fotkaId}/soubor`;
}
