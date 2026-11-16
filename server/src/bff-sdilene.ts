/**
 * Helpers shared by more than one route module.
 * Lives apart from the routers so they do not import each other in a cycle.
 */
import type { Request } from "express";

export const MAX_POKUSU_KOD = 12;

/**
 * Postgres unique_violation (23505) — typově bezpečná detekce bez any.
 * HTTP driver (neon-http) balí NeonDbError do `cause` — obálka od drizzle
 * nese jen query/params, takže se kontrolují obě úrovně (pg i neon-http).
 */
export function jeUnikatniKolize(chyba: unknown): boolean {
  if (typeof chyba !== "object" || chyba === null) return false;
  const zaznam = chyba as { code?: unknown; cause?: unknown };
  if (zaznam.code === "23505") return true;
  const pricina: unknown = zaznam.cause;
  if (typeof pricina === "object" && pricina !== null) {
    return (pricina as { code?: unknown }).code === "23505";
  }
  return false;
}

export function ctiCeleCisloQuery(hodnota: unknown): number | null {
  if (typeof hodnota !== "string" || hodnota.trim().length === 0) return null;
  const cislo = Number(hodnota);
  return Number.isInteger(cislo) ? cislo : null;
}

/** `:id` z cesty — prázdné → volající vrátí 404 NENALEZENO. */
export function ctiIdVypravy(req: Request): string {
  const surova: unknown = (req.params as Record<string, unknown>)["id"];
  return typeof surova === "string" ? surova.trim() : "";
}

export function ctiSuroveTelo(req: Request, maxBajtu: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const kusy: Buffer[] = [];
    let nacteno = 0;
    req.on("data", (dil: Buffer) => {
      nacteno += dil.length;
      if (nacteno > maxBajtu) {
        reject(new Error("velikost"));
        req.destroy();
        return;
      }
      kusy.push(dil);
    });
    req.on("end", () => resolve(Buffer.concat(kusy)));
    req.on("error", () => reject(new Error("cteni")));
  });
}
