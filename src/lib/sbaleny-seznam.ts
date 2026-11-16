import type { DruhAlba } from "../shared/api-types";

/** How many leading items stay visible before the rest must be expanded. */
export const SBALENY_LIMIT = 3;

export interface SbaleneCasti<T> {
  viditelne: T[];
  skryte: T[];
}

export interface AlbumDoSbaleni {
  id: string;
  druh: DruhAlba;
}

export interface SbalenaAlba<T extends AlbumDoSbaleni> {
  vypravyViditelne: T[];
  vypravySkryte: T[];
  vlastni: T[];
  kos: T[];
}

/** Split a list so only the first `limit` items stay visible. */
export function rozdelViditelne<T>(
  polozky: readonly T[],
  limit: number = SBALENY_LIMIT,
): SbaleneCasti<T> {
  if (polozky.length <= limit) {
    return { viditelne: [...polozky], skryte: [] };
  }
  return {
    viditelne: polozky.slice(0, limit),
    skryte: polozky.slice(limit),
  };
}

/**
 * Expedition albums collapse after `limit`. User albums and trash stay whole.
 * The open expedition outside the first slice is pinned into the visible part.
 */
export function rozdelAlbaSidebar<T extends AlbumDoSbaleni>(
  alba: readonly T[],
  aktivniId: string | undefined,
  limit: number = SBALENY_LIMIT,
): SbalenaAlba<T> {
  const vypravy: T[] = [];
  const vlastni: T[] = [];
  const kos: T[] = [];
  for (const album of alba) {
    if (album.druh === "vyprava") vypravy.push(album);
    else if (album.druh === "kos") kos.push(album);
    else vlastni.push(album);
  }
  const rozdelene = rozdelViditelne(vypravy, limit);
  if (aktivniId !== undefined) {
    const index = rozdelene.skryte.findIndex((album) => album.id === aktivniId);
    if (index >= 0) {
      const [pripnute] = rozdelene.skryte.splice(index, 1);
      if (pripnute !== undefined) rozdelene.viditelne.push(pripnute);
    }
  }
  return {
    vypravyViditelne: rozdelene.viditelne,
    vypravySkryte: rozdelene.skryte,
    vlastni,
    kos,
  };
}
