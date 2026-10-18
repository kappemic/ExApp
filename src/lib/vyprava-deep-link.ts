/**
 * src/lib/vyprava-deep-link.ts — Step 3: deep-link výprava → Diskuze.
 *
 * Jeden krok z Nástěnky / Chatu do diskuze dané výpravy:
 * `/vypravy?vyprava=<id>` otevře `ExpeditionModal` s danou výpravou
 * a doscrolluje na sekci Diskuze (včetně focusu, mobil OK).
 * Přímé otevření URL funguje stejně (mount lookup + fallback detail).
 *
 * Pravidla:
 * - Query param `?vyprava=<id>` na `/vypravy` (kompatibilní se `?zobrazeni=`).
 * - Výpravu nikdy nehledat ručně v UI — mount lookup přes mapu podle id
 *   + fallback `GET expediceDetailPath` (viz VypravyPage).
 * - Nevalidní id: ignorovat + param smazat (viz VypravyPage).
 * - Zpětná navigace modal nezavěsí: param pryč = modal pryč (viz VypravyPage).
 *
 * Čisté pomocníci bez závislostí — export pro testy (bez jsdom, bez fetch).
 * Strict TypeScript, žádný `any`, česky.
 */

/** Query param nesoucí id výpravy k otevření (`/vypravy?vyprava=<id>`). */
export const VYPRAVA_PARAM = "vyprava" as const;

/** Query param zobrazení seznamu (`seznam` / `kalendar`) — deep-link ho zachovává. */
export const ZOBRAZENI_PARAM = "zobrazeni" as const;

/** Maximální délka id z URL (slug / uuid se vejde, smetí ne). */
const MAX_DELKA_ID = 200;

/** Řídicí znaky + `<` `>` do id výpravy nepatří (smetí z URL). */
const ZAKAZANE_V_ID: RegExp = new RegExp("[\\u0000-\\u001F\\u007F<>]");

/**
 * Normalizuje `?vyprava=<id>` z URL.
 * Prázdné / chybějící / overlong / se zakázanými znaky → `null`
 * (volající ignoruje + param smaže, modal se neotevře).
 */
export function parseVypravaId(
  hodnota: string | null | undefined,
): string | null {
  if (hodnota === null || hodnota === undefined) return null;
  const ciste: string = hodnota.trim();
  if (ciste.length === 0) return null;
  if (ciste.length > MAX_DELKA_ID) return null;
  if (ZAKAZANE_V_ID.test(ciste)) return null;
  return ciste;
}

/**
 * Postaví deep-link na diskuzi výpravy.
 * `zobrazeni` se předává dál, jen když je platné (`seznam` / `kalendar`),
 * aby přepínač seznamu po návratu zůstal tam, kde byl.
 */
export function buildVypravyDeepLink(
  idVypravy: string,
  zobrazeni?: string | null,
): string {
  const params = new URLSearchParams();
  params.set(VYPRAVA_PARAM, idVypravy.trim());
  if (zobrazeni === "seznam" || zobrazeni === "kalendar") {
    params.set(ZOBRAZENI_PARAM, zobrazeni);
  }
  return `/vypravy?${params.toString()}`;
}

/**
 * Zapíše / smaže `?vyprava=` v existujících paramech.
 * Ostatní paramy (`zobrazeni`, …) nechává — merge, ne přepis.
 * Čistá funkce pro testy; komponenta výsledek předá `setSearchParams`.
 */
export function sVypravouVUrl(
  prev: Readonly<URLSearchParams>,
  id: string | null,
): URLSearchParams {
  const next = new URLSearchParams(prev.toString());
  if (id === null) {
    next.delete(VYPRAVA_PARAM);
  } else {
    const ciste: string = id.trim();
    if (ciste.length > 0) next.set(VYPRAVA_PARAM, ciste);
  }
  return next;
}
