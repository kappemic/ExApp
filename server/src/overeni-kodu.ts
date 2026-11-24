/**
 * Read-only invite-code check. Does not delete or consume the row.
 */

import { VALIDACNI_ZPRAVY } from "../../src/shared/api-types";

export type RadekKod = {
  code: string;
  expiresAt: Date;
};

export type VysledekOvereniKodu =
  | { platny: true; expiresAt: string }
  | { platny: false; chyba: string };

export function rozhodniOvereniKodu(
  radky: readonly RadekKod[],
  kod: string,
  ted: number,
): VysledekOvereniKodu {
  const nalezeny = radky.find((radek) => radek.code === kod);
  if (nalezeny === undefined || nalezeny.expiresAt.getTime() <= ted) {
    return { platny: false, chyba: VALIDACNI_ZPRAVY.kodNeznamy };
  }
  return { platny: true, expiresAt: nalezeny.expiresAt.toISOString() };
}
