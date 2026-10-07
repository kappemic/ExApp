/**
 * server/src/kody.ts — generátor pozvánkových kódů.
 *
 * Tvar dle kontraktu: 8 znaků, bez 0/O/1/I (lidsky přepisovatelné).
 * Unikátnost hlídá DB (UNIQUE code) — při kolizi volající zkusí znovu.
 */

import { randomInt } from "node:crypto";

/** Znaky kódu: bez 0/O/1/I — lidsky přepisovatelné (kontrakt api-types). */
export const KOD_ZNAKY = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const KOD_DELKA = 8;

/** Kryptograficky bezpečný náhodný kód (8 znaků). */
export function nahodnyKod(): string {
  let kod = "";
  for (let i = 0; i < KOD_DELKA; i += 1) {
    kod += KOD_ZNAKY[randomInt(KOD_ZNAKY.length)];
  }
  return kod;
}
