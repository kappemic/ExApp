/**
 * src/lib/format-cas.ts — jednotný krátký český formát času pro diskuze.
 *
 * Sjednocuje duplicitní `formatCasZpravy` (ZpravaBublina) a `formatCasNastenky`
 * (ChatPage) do jediné implementace `formatCasKratce`. Obě původní jména
 * zůstávají jako re-exporty pro zpětnou kompatibilitu test-importů.
 * Strict TypeScript, žádný `any`.
 */

/** „10:00" — jen hodina, pro navazující zprávu téhož autora ve stejný den. */
export function formatJenCas(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  } catch {
    return "";
  }
}

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

function rozdilDnu(iso: string): number | null {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const ted = new Date();
  const a = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const b = new Date(ted.getFullYear(), ted.getMonth(), ted.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

function hodinaMinuta(iso: string): string {
  const dt = new Date(iso);
  return `${dt.getHours()}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/** „7:41“, čas pod bublinou (den nese oddělovač vlákna). */
export function formatCasBubliny(iso: string): string {
  return rozdilDnu(iso) === null ? "" : hodinaMinuta(iso);
}

/** „dnes 7:41“, „včera 18:22“, starší „1. 10. 10:00“ (diskuze výpravy). */
export function formatCasVlakna(iso: string): string {
  const dnu = rozdilDnu(iso);
  if (dnu === null) return "";
  const dt = new Date(iso);
  if (dnu === 0) return `dnes ${hodinaMinuta(iso)}`;
  if (dnu === 1) return `včera ${hodinaMinuta(iso)}`;
  return `${dt.getDate()}. ${dt.getMonth() + 1}. ${hodinaMinuta(iso)}`;
}

/** „7:52“ dnes, „včera“, jinak „31. 12.“ (seznam konverzací). */
export function formatCasSeznamu(iso: string): string {
  const dnu = rozdilDnu(iso);
  if (dnu === null) return "";
  const dt = new Date(iso);
  if (dnu === 0) return hodinaMinuta(iso);
  if (dnu === 1) return "včera";
  return `${dt.getDate()}. ${dt.getMonth() + 1}.`;
}

/** „Dnes“, „Včera“, jinak „12. listopadu“ (oddělovač dne ve vlákně). */
export function formatDenVlakna(iso: string): string {
  const dnu = rozdilDnu(iso);
  if (dnu === null) return "";
  if (dnu === 0) return "Dnes";
  if (dnu === 1) return "Včera";
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long" }).format(new Date(iso));
}
