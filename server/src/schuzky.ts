/**
 * server/src/schuzky.ts — mapování řádků `meetings` na `ApiSchuzka`.
 *
 * `toApiSchuzka` je fail-safe jako u výprav: nevalidní DB řádek → null
 * (volající ho přeskočí). Druhý parametr nese vynechané výskyty týdenní
 * řady (B4) — připojí se jen u `tydenni` a jen když je neprázdný.
 * Strážci occurrence-routy (`jeRozvrhemVyskyt`, `smiSmazatVyskyt`) jsou
 * čisté funkce bez I/O kvůli jednotkovým testům.
 */

import type { Meeting } from "../../drizzle/schema/meetings";
import type { ApiSchuzka } from "../../src/shared/api-types";

const DATUM_YMD = /^\d{4}-\d{2}-\d{2}$/;

function jeOpakovani(hodnota: string): hodnota is ApiSchuzka["opakovani"] {
  return hodnota === "jednorazova" || hodnota === "tydenni";
}

/** DB řádek → API schůzka; nevalidní řádek → null (přeskočit). */
export function toApiSchuzka(
  radek: Meeting,
  vynecheneVyskyty: string[] = [],
): ApiSchuzka | null {
  if (typeof radek.id !== "string" || radek.id.length === 0) return null;
  if (typeof radek.nazev !== "string" || radek.nazev.length === 0) return null;
  if (typeof radek.datum !== "string" || !DATUM_YMD.test(radek.datum)) {
    return null;
  }
  if (
    radek.mistnost !== null &&
    radek.mistnost !== undefined &&
    typeof radek.mistnost !== "string"
  ) {
    return null;
  }
  if (typeof radek.popis !== "string") return null;
  if (typeof radek.opakovani !== "string" || !jeOpakovani(radek.opakovani)) {
    return null;
  }
  const schuzka: ApiSchuzka = {
    id: radek.id,
    nazev: radek.nazev,
    datum: radek.datum,
    mistnost: radek.mistnost ?? null,
    popis: radek.popis,
    opakovani: radek.opakovani,
  };
  if (radek.opakovani === "tydenni" && vynecheneVyskyty.length > 0) {
    schuzka.vynecheneVyskyty = [...vynecheneVyskyty];
  }
  return schuzka;
}

/**
 * Strážce occurrence-routy: bez `?rozvrhem=vyskyt` se nic nemaže (422).
 */
export function jeRozvrhemVyskyt(hodnota: unknown): boolean {
  return hodnota === "vyskyt";
}

/** Výskyt jde vynechat jen u týdenní řady — jednorázová vrací 422. */
export function smiSmazatVyskyt(opakovani: string): boolean {
  return opakovani === "tydenni";
}
