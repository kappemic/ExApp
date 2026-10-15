/**
 * Client for club albums. Shapes match `src/shared/api-types.ts`.
 *
 * GET  {VITE_API_BASE_URL}/api/alba
 * GET  {VITE_API_BASE_URL}/api/alba/:id/fotky
 * POST {VITE_API_BASE_URL}/api/alba            JSON { nazev }  (ADMIN)
 * DELETE {VITE_API_BASE_URL}/api/alba/:id      extra album only (ADMIN)
 * DELETE {VITE_API_BASE_URL}/api/alba/:id/fotky/:fotkaId  extra album photo (ADMIN)
 * POST {VITE_API_BASE_URL}/api/alba/:id/fotky  FormData `soubor`
 *
 * Bytes are loaded from the app stream (`/soubor`), never from an R2 host.
 */

import {
  albumFotkaSouborPath,
  fotkaSouborPath,
  jeApiChyba,
  type ApiAlbum,
  type ApiAlbumFotka,
  type DruhAlba,
} from "../shared/api-types";

export type { ApiAlbum, ApiAlbumFotka, DruhAlba };

/** Alias kept for existing UI imports. */
export type ApiFotkaAlba = ApiAlbumFotka;

export type AlbaVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string };

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

function chybaZTela(telo: unknown, nahradni: string): AlbaVysledek<never> {
  if (jeApiChyba(telo)) return { ok: false, chyba: telo.error.message };
  return { ok: false, chyba: nahradni };
}

function jeDruh(hodnota: unknown): hodnota is DruhAlba {
  return hodnota === "vyprava" || hodnota === "vlastni" || hodnota === "kos";
}

function jeAlbum(hodnota: unknown): hodnota is ApiAlbum {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const radek = hodnota as Record<string, unknown>;
  return (
    typeof radek["id"] === "string" &&
    typeof radek["nazev"] === "string" &&
    jeDruh(radek["druh"]) &&
    (radek["expeditionId"] === null || typeof radek["expeditionId"] === "string") &&
    typeof radek["pocetFotek"] === "number" &&
    Number.isFinite(radek["pocetFotek"]) &&
    (radek["nahledFotkaId"] === null || typeof radek["nahledFotkaId"] === "string")
  );
}

function jeRetezecNeboNullNeboChybi(hodnota: unknown): boolean {
  return hodnota === undefined || hodnota === null || typeof hodnota === "string";
}

function jeFotka(hodnota: unknown): hodnota is ApiAlbumFotka {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const radek = hodnota as Record<string, unknown>;
  return (
    typeof radek["id"] === "string" &&
    typeof radek["url"] === "string" &&
    typeof radek["createdAt"] === "string" &&
    typeof radek["jeNahled"] === "boolean" &&
    jeRetezecNeboNullNeboChybi(radek["expeditionId"]) &&
    jeRetezecNeboNullNeboChybi(radek["albumId"])
  );
}

function normalizujFotku(hodnota: unknown): ApiAlbumFotka | null {
  if (typeof hodnota !== "object" || hodnota === null) return null;
  const radek = hodnota as Record<string, unknown>;
  if (!jeFotka(hodnota)) return null;
  const expeditionId = radek["expeditionId"];
  const albumId = radek["albumId"];
  return {
    id: radek["id"] as string,
    url: radek["url"] as string,
    createdAt: radek["createdAt"] as string,
    jeNahled: radek["jeNahled"] as boolean,
    expeditionId: expeditionId === undefined ? null : (expeditionId as string | null),
    albumId: albumId === undefined ? null : (albumId as string | null),
  };
}

/** True when the address points at Cloudflare R2 (private bytes, do not use as img src). */
export function jeR2Adresa(url: string): boolean {
  const orezana = url.trim();
  if (orezana.length === 0) return false;
  try {
    const host = new URL(orezana).hostname.toLowerCase();
    return host.endsWith(".r2.cloudflarestorage.com") || host.endsWith(".r2.dev") || host === "r2.dev";
  } catch {
    return /r2\.cloudflarestorage\.com|\.r2\.dev/i.test(orezana);
  }
}

function segment(hodnota: string): string {
  return encodeURIComponent(hodnota);
}

/**
 * Stream URL for one photo. Expedition albums use the expedition file
 * route; extra albums use the album file route.
 */
export function urlSouboruAlba(
  album: Pick<ApiAlbum, "id" | "druh" | "expeditionId">,
  fotkaId: string,
): string {
  const zaklad = apiBase();
  if (album.druh === "vyprava" && album.expeditionId !== null) {
    return `${zaklad}${fotkaSouborPath(album.expeditionId, fotkaId)}`;
  }
  if (album.druh === "kos") {
    return "";
  }
  return `${zaklad}${albumFotkaSouborPath(album.id, fotkaId)}`;
}

/** Stream context for a photo (including items listed in Koš). */
export function albumProFotku(
  fotka: Pick<ApiAlbumFotka, "expeditionId" | "albumId">,
): Pick<ApiAlbum, "id" | "druh" | "expeditionId"> {
  if (fotka.expeditionId !== null && fotka.expeditionId.length > 0) {
    return { id: fotka.expeditionId, druh: "vyprava", expeditionId: fotka.expeditionId };
  }
  if (fotka.albumId !== null && fotka.albumId.length > 0) {
    return { id: fotka.albumId, druh: "vlastni", expeditionId: null };
  }
  return { id: "", druh: "vlastni", expeditionId: null };
}

/** Cover stream, or null when the album has no highlight (empty paper, no broken icon). */
export function urlObaluAlba(album: ApiAlbum): string | null {
  if (album.nahledFotkaId === null) return null;
  return urlSouboruAlba(album, album.nahledFotkaId);
}

/**
 * Address safe to put in `<img src>`. Prefers the app stream.
 * An R2 `url` from the list payload is never returned.
 */
export function srcFotkyAlba(
  album: Pick<ApiAlbum, "id" | "druh" | "expeditionId">,
  fotka: Pick<ApiAlbumFotka, "id" | "url" | "expeditionId" | "albumId">,
): string {
  const kontext =
    album.druh === "kos" ? albumProFotku(fotka) : album;
  const soubor = urlSouboruAlba(kontext, fotka.id);
  if (soubor.length > 0) return soubor;
  if (fotka.url.length > 0 && !jeR2Adresa(fotka.url)) return fotka.url;
  return "";
}

function ctiAlbumZTela(telo: unknown): ApiAlbum | null {
  if (jeAlbum(telo)) return telo;
  if (typeof telo !== "object" || telo === null) return null;
  const radek = telo as Record<string, unknown>;
  return jeAlbum(radek["album"]) ? radek["album"] : null;
}

export async function nactiAlba(): Promise<AlbaVysledek<ApiAlbum[]>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Alba jsou teď nedostupná." };
  }
  try {
    const odpoved = await fetch(`${zaklad}/api/alba`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo = await ctiTelo(odpoved);
    if (!odpoved.ok) return chybaZTela(telo, "Alba se nepodařilo načíst.");
    if (typeof telo !== "object" || telo === null) {
      return { ok: false, chyba: "Alba se nepodařilo načíst." };
    }
    const surova = (telo as Record<string, unknown>)["alba"];
    if (!Array.isArray(surova)) {
      return { ok: false, chyba: "Alba se nepodařilo načíst." };
    }
    const alba: ApiAlbum[] = [];
    for (const polozka of surova) {
      if (jeAlbum(polozka)) alba.push(polozka);
    }
    return { ok: true, data: alba };
  } catch {
    return { ok: false, chyba: "Alba jsou bez připojení nedostupná." };
  }
}

export async function nactiFotkyAlba(albumId: string): Promise<AlbaVysledek<ApiAlbumFotka[]>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Fotky jsou teď nedostupné." };
  }
  try {
    const odpoved = await fetch(`${zaklad}/api/alba/${segment(albumId)}/fotky`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo = await ctiTelo(odpoved);
    if (odpoved.status === 404) {
      return { ok: false, chyba: "Tohle album tu není." };
    }
    if (!odpoved.ok) return chybaZTela(telo, "Fotky se nepodařilo načíst.");
    if (typeof telo !== "object" || telo === null) {
      return { ok: false, chyba: "Fotky se nepodařilo načíst." };
    }
    const surova = (telo as Record<string, unknown>)["fotky"];
    if (!Array.isArray(surova)) {
      return { ok: false, chyba: "Fotky se nepodařilo načíst." };
    }
    const fotky: ApiAlbumFotka[] = [];
    for (const polozka of surova) {
      const fotka = normalizujFotku(polozka);
      if (fotka !== null) fotky.push(fotka);
    }
    return { ok: true, data: fotky };
  } catch {
    return { ok: false, chyba: "Fotky jsou bez připojení nedostupné." };
  }
}

/** ADMIN only. Returns the created album when the body matches, otherwise null after 201. */
export async function vytvorAlbum(nazev: string): Promise<AlbaVysledek<ApiAlbum | null>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení album založit nejde." };
  }
  try {
    const odpoved = await fetch(`${zaklad}/api/alba`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ nazev }),
    });
    const telo = await ctiTelo(odpoved);
    if (odpoved.status === 401 || odpoved.status === 403) {
      return chybaZTela(telo, "Nové album může založit jen vedoucí.");
    }
    if (odpoved.status !== 200 && odpoved.status !== 201) {
      return chybaZTela(telo, "Album se nepodařilo založit.");
    }
    return { ok: true, data: ctiAlbumZTela(telo) };
  } catch {
    return { ok: false, chyba: "Bez připojení album založit nejde." };
  }
}

/** ADMIN only. Deletes an extra album. Expedition ids are rejected by the API. */
export async function smazAlbum(albumId: string): Promise<AlbaVysledek<null>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení album smazat nejde." };
  }
  try {
    const odpoved = await fetch(`${zaklad}/api/alba/${segment(albumId)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo = await ctiTelo(odpoved);
    if (odpoved.status === 401 || odpoved.status === 403) {
      return chybaZTela(telo, "Album může smazat jen vedoucí.");
    }
    if (odpoved.status === 404) {
      return chybaZTela(telo, "Album nenalezeno.");
    }
    if (!odpoved.ok) return chybaZTela(telo, "Album se nepodařilo smazat.");
    return { ok: true, data: null };
  } catch {
    return { ok: false, chyba: "Bez připojení album smazat nejde." };
  }
}

/** ADMIN only. Deletes one photo from an extra album (`alba_fotky`). */
/** ADMIN only. Restores one photo from Koš to its original album. */
export async function obnovFotkuZKose(fotkaId: string): Promise<AlbaVysledek<null>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení obnovit nejde." };
  }
  try {
    const odpoved = await fetch(`${zaklad}/api/alba/kos/fotky/${segment(fotkaId)}/obnovit`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo = await ctiTelo(odpoved);
    if (odpoved.status === 401 || odpoved.status === 403) {
      return chybaZTela(telo, "Fotku může obnovit jen vedoucí.");
    }
    if (odpoved.status === 404) {
      return chybaZTela(telo, "Fotka v koši není.");
    }
    if (!odpoved.ok) return chybaZTela(telo, "Fotku se nepodařilo obnovit.");
    return { ok: true, data: null };
  } catch {
    return { ok: false, chyba: "Bez připojení obnovit nejde." };
  }
}

/** ADMIN only. Permanently deletes one photo from Koš (DB + R2). */
export async function trvaleSmazFotkuZKose(fotkaId: string): Promise<AlbaVysledek<null>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení smazat nejde." };
  }
  try {
    const odpoved = await fetch(`${zaklad}/api/alba/kos/fotky/${segment(fotkaId)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo = await ctiTelo(odpoved);
    if (odpoved.status === 401 || odpoved.status === 403) {
      return chybaZTela(telo, "Fotku může smazat jen vedoucí.");
    }
    if (odpoved.status === 404) {
      return chybaZTela(telo, "Fotka v koši není.");
    }
    if (!odpoved.ok) return chybaZTela(telo, "Fotku se nepodařilo smazat natrvalo.");
    return { ok: true, data: null };
  } catch {
    return { ok: false, chyba: "Bez připojení smazat nejde." };
  }
}

export async function smazFotkuAlba(
  albumId: string,
  fotkaId: string,
): Promise<AlbaVysledek<null>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení smazat nejde." };
  }
  try {
    const odpoved = await fetch(
      `${zaklad}/api/alba/${segment(albumId)}/fotky/${segment(fotkaId)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
    const telo = await ctiTelo(odpoved);
    if (odpoved.status === 401 || odpoved.status === 403) {
      return chybaZTela(telo, "Fotku může smazat jen vedoucí.");
    }
    if (odpoved.status === 404) {
      return chybaZTela(telo, "Fotka nenalezena.");
    }
    if (!odpoved.ok) return chybaZTela(telo, "Fotku se nepodařilo smazat.");
    return { ok: true, data: null };
  } catch {
    return { ok: false, chyba: "Bez připojení smazat nejde." };
  }
}

/** One file per request. Content-Type is left to the browser (FormData boundary). */
export async function nahrajFotku(albumId: string, soubor: File): Promise<AlbaVysledek<null>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení fotku nahrát nejde." };
  }
  const telo = new FormData();
  telo.append("soubor", soubor);
  try {
    const odpoved = await fetch(`${zaklad}/api/alba/${segment(albumId)}/fotky`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
      body: telo,
    });
    if (odpoved.ok) return { ok: true, data: null };
    const json = await ctiTelo(odpoved);
    return chybaZTela(json, "Fotku se nepodařilo nahrát.");
  } catch {
    return { ok: false, chyba: "Bez připojení fotku nahrát nejde." };
  }
}

/** Czech count: 1 fotka, 2–4 fotky, 11–14 fotek, 21 fotka, … */
export function popisekPoctuFotek(pocet: number): string {
  const n = Math.abs(Math.trunc(pocet));
  const konec = n % 10;
  const sto = n % 100;
  let tvar = "fotek";
  if (konec === 1 && sto !== 11) tvar = "fotka";
  else if (konec >= 2 && konec <= 4 && (sto < 12 || sto > 14)) tvar = "fotky";
  return `${n} ${tvar}`;
}

export function popisekDruhu(druh: DruhAlba): string {
  if (druh === "vyprava") return "Výprava";
  if (druh === "kos") return "Koš";
  return "Album";
}
