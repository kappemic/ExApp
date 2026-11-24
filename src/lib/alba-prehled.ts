import type { ApiAlbum } from "./alba-api";

/** Jen počítač: `velka` přes dva sloupce a dvě řady, `vedle` dvě karty vedle ní. */
export type VelikostAlbumu = "bezna" | "velka" | "vedle";

/** Velké je vždy první (nejnovější) album, vedle něj další dvě. Pod tři alba zůstane běžná mřížka. */
export function velikostiAlb(
  alba: readonly ApiAlbum[],
  zvyraznit: boolean,
): ReadonlyMap<string, VelikostAlbumu> {
  if (!zvyraznit || alba.length < 3) return new Map();
  return new Map(
    alba
      .slice(0, 3)
      .map((album, poradi): [string, VelikostAlbumu] => [album.id, poradi === 0 ? "velka" : "vedle"]),
  );
}
