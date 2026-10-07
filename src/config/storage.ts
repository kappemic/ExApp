/**
 * src/config/storage.ts — Krok 6: rozhodnutí storage pro fotky (minimum Fáze 2).
 *
 * Rozhodnutí (skill neon-object-storage, ověřeno proti `.env.local`):
 * - Žádný `CLOUDINARY_*` ani `SUPABASE_*` klíč v prostředí není → binární
 *   upload se v minimu Fáze 2 NEZAVÁDÍ (žádný nový secret, žádný vendor lock).
 * - Minimum: URL-based řešení — admin vloží veřejnou URL fotky + popis,
 *   server uloží jen URL do `photos` (sloupec `url`, nikdy blob — viz
 *   drizzle/schema/photos.ts). Náhled je obyčejné `<img loading="lazy">`.
 * - Pozdější binární upload: `neon.ts` už deklaruje privátní bucket `app`;
 *   pro fotky se přidá `expedition-photos` s `access: "public_read"` a klient
 *   `Files` (`files-sdk/neon`) přes `StorageProvider.nahrajSoubor()`.
 *   Rozhraní níže je připravené — URL režim je jeho nejjednodušší implementace.
 *
 * Veřejné (smí do klienta): jen názvy bucketu a limity, nikdy secrety.
 */

export const FOTKY_BUCKET = "expedition-photos" as const;

/** Limity pro pozdější binární upload (už dnes je hlídá i URL režim). */
export const FOTKY_LIMITY = {
  maxPopisDelka: 500,
  maxUrlDelka: 2048,
  povoleneProtokoly: ["https:"],
} as const;

/**
 * Minimum Fáze 2: odkud fotka pochází. Dnes vždy `url` (admin vložil odkaz).
 * `upload` je rezervováno pro Neon Object Storage (`expedition-photos`).
 */
export type ZdrojFotky = "url" | "upload";

/**
 * Rozhraní pro pozdější binární upload (Neon Object Storage / Cloudinary).
 * Dnes ho plní `UrlStorageProvider` (žádný upload, jen validace URL).
 * Až přijde bucket, přibude `NeonStorageProvider` se stejnou metodou —
 * volající (`ExpeditionPhotos`, server) se nemění.
 */
export interface StorageProvider {
  readonly zdroj: ZdrojFotky;
  /** Vrátí finální veřejnou URL k uložení do `photos.url`. */
  pripravUrl(vstup: string): Promise<string>;
}

/** URL režim minima: ořízne vstup, zkontroluje https:// a délku. */
export class UrlStorageProvider implements StorageProvider {
  readonly zdroj: ZdrojFotky = "url";

  async pripravUrl(vstup: string): Promise<string> {
    const cista: string = vstup.trim();
    if (cista.length === 0 || cista.length > FOTKY_LIMITY.maxUrlDelka) {
      throw new Error("Odkaz na fotku má špatný tvar.");
    }
    let parsed: URL;
    try {
      parsed = new URL(cista);
    } catch {
      throw new Error("Odkaz na fotku má špatný tvar.");
    }
    if (!FOTKY_LIMITY.povoleneProtokoly.includes(parsed.protocol as "https:")) {
      throw new Error("Odkaz musí začínat https://.");
    }
    return parsed.toString();
  }
}

/** Výchozí provider minima Fáze 2 (URL, bez binárního uploadu). */
export const vychoziStorage: StorageProvider = new UrlStorageProvider();
