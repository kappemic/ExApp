/**
 * Avatar helpers (Fáze 4, Step 4 — tab Osobní údaje).
 *
 * Storage rozhodnutí (skill neon-object-storage + src/config/storage.ts):
 * - Žádný nový provider ani bucket: avatary reuse `UrlStorageProvider`
 *   (`vychoziStorage.pripravUrl`) — URL režim dneška (PATCH /api/me
 *   bere jen https:// URL, kontrakt `UpravitProfilRequest.avatarUrl`).
 * - Budoucí binární upload půjde přes stejnou serverovou routu do
 *   `FOTKY_BUCKET` ("expedition-photos") s klíčem `avatary/<userId>/<uuid>.jpg`
 *   (nový klíč na verzi kvůli CDN cache) — klient nikdy nedrží secret,
 *   vše přes server. Proto tu není žádný S3 klient ani tajemství.
 * - Limity: obrázek jpeg/png/webp, nejvýš 5 MB. Typ se hlídá MIME,
 *   velikost `File.size`.
 */

import { FOTKY_BUCKET, vychoziStorage } from "../../config/storage";

/** Kam budoucí serverová routa avatary uloží (dnes jen dokumentace, žádný klientský upload). */
export const AVATAR_BUCKET = FOTKY_BUCKET;

export const AVATAR_LIMITY = {
  /** 5 MB — větší fotka z mobilu, pořád pod 8 MB limitem fotek výprav. */
  maxBajtu: 5 * 1024 * 1024,
  povoleneTypy: ["image/jpeg", "image/png", "image/webp"] as const,
  maxUrlDelka: 2048,
} as const;

export type AvatarMime = (typeof AVATAR_LIMITY.povoleneTypy)[number];

function jePovolenyMime(typ: string): typ is AvatarMime {
  return (AVATAR_LIMITY.povoleneTypy as readonly string[]).includes(typ);
}

/**
 * Ověří soubor z `<input type="file">` pro avatar.
 * Vrací českou hlášku, nebo null = OK.
 */
export function overSouborAvataru(soubor: File): string | null {
  if (!jePovolenyMime(soubor.type)) {
    return "Avatar musí být obrázek (JPEG, PNG nebo WebP).";
  }
  if (soubor.size <= 0) {
    return "Soubor je prázdný.";
  }
  if (soubor.size > AVATAR_LIMITY.maxBajtu) {
    return "Avatar je moc velký (nejvýš 5 MB).";
  }
  return null;
}

/**
 * Ověří veřejnou https:// URL avatara přes existujícího providera
 * (žádný nový provider). Vrací normalizovanou URL, vyhazuje česky.
 */
export async function overAvatarUrl(url: string): Promise<string> {
  return vychoziStorage.pripravUrl(url);
}

/**
 * Iniciály pro onError fallback (rozbitá URL / prázdný avatar).
 * Break-ui: dlouhá jména → max 2 znaky, diakritika zachována,
 * emoji se počítá jako jeden znak (Array.from kvůli surrogate pairs).
 */
const KLIC_AVATARA =
  /\/avatary\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:jpg|png|webp)(?:\?.*)?$/i;

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  return typeof raw === "string" ? raw.replace(/\/+$/, "") : "";
}

/**
 * URL for an `<img>`. Our R2 objects are private, so a stored
 * `avatary/<userId>/<fileId>.ext` URL is rewritten to
 * `GET /api/users/:id/avatar?v=<fileId>`. The query changes with each
 * upload so a cached previous picture is not reused.
 * Any other https URL is shown as-is.
 */
export function urlAvataruProZobrazeni(ulozena: string | null | undefined): string | null {
  if (typeof ulozena !== "string") return null;
  const cisty = ulozena.trim();
  if (cisty.length === 0) return null;
  const shoda = KLIC_AVATARA.exec(cisty);
  const id = shoda?.[1];
  const souborId = shoda?.[2];
  if (id !== undefined && souborId !== undefined) {
    const zaklad = apiBase();
    if (zaklad.length === 0) return null;
    return `${zaklad}/api/users/${id}/avatar?v=${souborId}`;
  }
  return cisty.startsWith("https://") ? cisty : null;
}

export function inicialyProAvatar(jmeno: string, prijmeni?: string | null): string {
  const casti: string[] = `${jmeno} ${prijmeni ?? ""}`
    .trim()
    .split(/\s+/)
    .filter((c) => c.length > 0);
  if (casti.length === 0) return "?";
  const prvni = casti[0] ?? "";
  const druha = casti.length > 1 ? (casti[casti.length - 1] ?? "") : "";
  const pismeno = (s: string): string => Array.from(s)[0] ?? "";
  const vysledek = `${pismeno(prvni)}${druha.length > 0 ? pismeno(druha) : ""}`;
  const hotovo = vysledek.toLocaleUpperCase("cs-CZ");
  return hotovo.length > 0 ? hotovo : "?";
}
