/**
 * Pure album rules: name length, vyprava vs vlastni, list order and covers.
 * Routes live in alba-routes.ts. No database access here.
 */
import type { ApiAlbum } from "../../src/shared/api-types";
import { ALBUM_KOS_ID } from "../../src/shared/fotky-kos";
import { sestavMapuNahledu, type NahledKandidat } from "./vypravy";

export const ALBUM_NAZEV_MIN = 2;
export const ALBUM_NAZEV_MAX = 80;

const ZPRAVA_NAZEV_KRATKY = "Název alba musí mít aspoň 2 znaky.";
const ZPRAVA_NAZEV_DLOUHY = "Název alba může mít nejvýš 80 znaků.";
const ZPRAVA_NAZEV_CHYBI = "Zadej název alba.";

export type VysledekNazvuAlba =
  | { ok: true; nazev: string }
  | { ok: false; zprava: string };

/** POST /api/alba body. Trim, then 2–80 characters. */
export function validujNazevAlba(telo: unknown): VysledekNazvuAlba {
  if (typeof telo !== "object" || telo === null || Array.isArray(telo)) {
    return { ok: false, zprava: ZPRAVA_NAZEV_CHYBI };
  }
  const surovy: unknown = (telo as Record<string, unknown>)["nazev"];
  if (typeof surovy !== "string") return { ok: false, zprava: ZPRAVA_NAZEV_CHYBI };
  const nazev = surovy.trim();
  if (nazev.length < ALBUM_NAZEV_MIN) return { ok: false, zprava: ZPRAVA_NAZEV_KRATKY };
  if (nazev.length > ALBUM_NAZEV_MAX) return { ok: false, zprava: ZPRAVA_NAZEV_DLOUHY };
  return { ok: true, nazev };
}

/**
 * Which store an id belongs to.
 * An expedition id wins when the same string is also present as a vlastni id.
 */
export function urciDruhAlba(
  id: string,
  expeditionIds: readonly string[],
  vlastniIds: readonly string[],
): "vyprava" | "vlastni" | null {
  if (expeditionIds.includes(id)) return "vyprava";
  if (vlastniIds.includes(id)) return "vlastni";
  return null;
}

export type RozhodnutiSmazaniAlba = "smazat" | "nenalezeno";

/**
 * DELETE /api/alba/:id. Only an extra album (`alba`) is deletable.
 * An expedition id is never deletable, even when the same string is also a vlastni id.
 * The route still requires `vyzadujAdmina` before this decision.
 */
export function rozhodniSmazaniAlba(
  id: string,
  expeditionIds: readonly string[],
  vlastniIds: readonly string[],
): RozhodnutiSmazaniAlba {
  const orezane = id.trim();
  if (orezane.length === 0) return "nenalezeno";
  if (expeditionIds.includes(orezane)) return "nenalezeno";
  if (vlastniIds.includes(orezane)) return "smazat";
  return "nenalezeno";
}

/** Drops one extra album after a successful delete. Expedition cards stay. */
export function seznamPoSmazaniAlba(alba: readonly ApiAlbum[], smazaneId: string): ApiAlbum[] {
  return alba.filter((album) => album.druh !== "vlastni" || album.id !== smazaneId);
}

export interface VstupVypravyAlba {
  id: string;
  nazev: string;
  datum: string;
  /** Expedition status. Only `proběhlá` becomes an album. */
  stav: string;
}

/** Album list and album detail include an expedition only after it is closed. */
export function jeVypravaSViditelnymAlbem(stav: string): boolean {
  return stav === "proběhlá";
}

export interface VstupVlastniAlba {
  id: string;
  nazev: string;
  createdAt: Date;
}

/** One photo used for counts and covers. `parentId` is the expedition or album id. */
export interface AlbumFotkaZdroj {
  id: string;
  parentId: string;
  jeNahled: boolean;
  createdAt: Date;
}

function naKandidaty(fotky: readonly AlbumFotkaZdroj[]): NahledKandidat[] {
  return fotky.map((fotka) => ({
    id: fotka.id,
    expeditionId: fotka.parentId,
    jeNahled: fotka.jeNahled,
    createdAt: fotka.createdAt,
  }));
}

function spocitej(fotky: readonly AlbumFotkaZdroj[]): Map<string, number> {
  const pocty = new Map<string, number>();
  for (const fotka of fotky) {
    pocty.set(fotka.parentId, (pocty.get(fotka.parentId) ?? 0) + 1);
  }
  return pocty;
}

/**
 * Completed expeditions first (`stav === "proběhlá"`; volno and skoro plno are omitted),
 * ordered by date then Czech name, then extra albums by createdAt.
 * Cover is the flagged photo, otherwise the oldest one. Missing photos → null.
 */
export function sestavSeznamAlb(
  vypravy: readonly VstupVypravyAlba[],
  vlastni: readonly VstupVlastniAlba[],
  fotkyVyprav: readonly AlbumFotkaZdroj[],
  fotkyVlastnich: readonly AlbumFotkaZdroj[],
): ApiAlbum[] {
  const nahledyVyprav = sestavMapuNahledu(naKandidaty(fotkyVyprav));
  const nahledyVlastni = sestavMapuNahledu(naKandidaty(fotkyVlastnich));
  const poctyVyprav = spocitej(fotkyVyprav);
  const poctyVlastni = spocitej(fotkyVlastnich);
  const vypravySerazene = vypravy
    .filter((vyprava) => jeVypravaSViditelnymAlbem(vyprava.stav))
    .sort((a, b) => {
      const datum = a.datum.localeCompare(b.datum);
      if (datum !== 0) return datum;
      const nazev = a.nazev.localeCompare(b.nazev, "cs");
      if (nazev !== 0) return nazev;
      return a.id.localeCompare(b.id);
    });
  const vlastniSerazene = [...vlastni].sort((a, b) => {
    const cas = a.createdAt.getTime() - b.createdAt.getTime();
    if (cas !== 0) return cas;
    return a.id.localeCompare(b.id);
  });
  const zVyprav: ApiAlbum[] = vypravySerazene.map((vyprava) => ({
    id: vyprava.id,
    nazev: vyprava.nazev,
    druh: "vyprava",
    expeditionId: vyprava.id,
    pocetFotek: poctyVyprav.get(vyprava.id) ?? 0,
    nahledFotkaId: nahledyVyprav.get(vyprava.id) ?? null,
  }));
  const zVlastnich: ApiAlbum[] = vlastniSerazene.map((album) => ({
    id: album.id,
    nazev: album.nazev,
    druh: "vlastni",
    expeditionId: null,
    pocetFotek: poctyVlastni.get(album.id) ?? 0,
    nahledFotkaId: nahledyVlastni.get(album.id) ?? null,
  }));
  return [...zVyprav, ...zVlastnich];
}

/** Virtual trash folder appended for admins after `sestavSeznamAlb`. */
export function albumKos(pocetFotek: number, nahledFotkaId: string | null): ApiAlbum {
  return {
    id: ALBUM_KOS_ID,
    nazev: "Koš",
    druh: "kos",
    expeditionId: null,
    pocetFotek,
    nahledFotkaId,
  };
}
