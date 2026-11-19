import { apiBase } from "./api-base";
import { ctiJsonTelo } from "./api-odpoved";
import { getZpravy } from "./diskuze-api";
import { fotkyPath } from "../shared/api-types";

export type PoctySmazaniVypravy = {
  dochazka: number;
  fotky: number;
  zpravy: number;
};

/** Loads delete-confirmation counts from existing data routes. */
export async function nactiPoctySmazaniVypravy(
  idVypravy: string,
  pocetUcastniku: number,
): Promise<PoctySmazaniVypravy> {
  const zaklad = apiBase();
  let fotky = 0;
  let zpravy = 0;
  if (zaklad.length > 0) {
    try {
      const odpovedFotky = await fetch(`${zaklad}${fotkyPath(idVypravy)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (odpovedFotky.ok) {
        const telo: unknown = await ctiJsonTelo(odpovedFotky);
        if (
          typeof telo === "object" &&
          telo !== null &&
          Array.isArray((telo as { fotky?: unknown }).fotky)
        ) {
          fotky = (telo as { fotky: unknown[] }).fotky.length;
        }
      }
    } catch {
      /* fail-open for counts */
    }
    const vysledekZprav = await getZpravy(idVypravy, { limit: 100 });
    if (vysledekZprav.ok) {
      zpravy = vysledekZprav.data.zpravy.length;
    }
  }
  return { dochazka: pocetUcastniku, fotky, zpravy };
}