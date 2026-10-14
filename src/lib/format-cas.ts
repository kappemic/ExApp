/**
 * src/lib/format-cas.ts — jednotný krátký český formát času pro diskuze.
 *
 * Sjednocuje duplicitní `formatCasZpravy` (ZpravaBublina) a `formatCasNastenky`
 * (ChatPage) do jediné implementace `formatCasKratce`. Obě původní jména
 * zůstávají jako re-exporty pro zpětnou kompatibilitu test-importů.
 * Strict TypeScript, žádný `any`.
 */

/** „1. 10. 10:00" — krátký český formát času zprávy / položky nástěnky. */
export function formatCasKratce(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  } catch {
    return dt.toLocaleString();
  }
}

/**
 * Zpětná kompatibilita: původní jméno z `ZpravaBublina.tsx`.
 * Deleguje na `formatCasKratce` — žádná duplicitní implementace.
 */
export function formatCasZpravy(iso: string): string {
  return formatCasKratce(iso);
}

/**
 * Zpětná kompatibilita: původní jméno z `ChatPage.tsx`.
 * Deleguje na `formatCasKratce` — žádná duplicitní implementace.
 */
export function formatCasNastenky(iso: string): string {
  return formatCasKratce(iso);
}
