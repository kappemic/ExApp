/**
 * Offline copy of the published book only. Proposals are never stored.
 */
import type { ApiZpevnikPisen } from "../shared/zpevnik";

export const KLIC_KNIHY = "exapp:zpevnik:kniha";

export interface KnihaUloziste {
  getItem(klic: string): string | null;
  setItem(klic: string, hodnota: string): void;
}

function jePisen(hodnota: unknown): hodnota is ApiZpevnikPisen {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const radek = hodnota as { id?: unknown; nazev?: unknown; autor?: unknown; telo?: unknown };
  return (
    typeof radek.id === "string" &&
    typeof radek.nazev === "string" &&
    typeof radek.autor === "string" &&
    typeof radek.telo === "object" &&
    radek.telo !== null
  );
}

export function ulozKnihu(uloziste: KnihaUloziste, pisne: readonly ApiZpevnikPisen[]): void {
  uloziste.setItem(KLIC_KNIHY, JSON.stringify(pisne));
}

export function ctiKnihu(uloziste: KnihaUloziste): ApiZpevnikPisen[] | null {
  const surovy = uloziste.getItem(KLIC_KNIHY);
  if (surovy === null) return null;
  try {
    const data: unknown = JSON.parse(surovy);
    if (!Array.isArray(data) || !data.every(jePisen)) return null;
    return data;
  } catch {
    return null;
  }
}

export function smazKnihu(uloziste: { removeItem(klic: string): void }): void {
  uloziste.removeItem(KLIC_KNIHY);
}
