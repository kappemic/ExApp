/**
 * Discord announcement contracts.
 */



/* 16) Fáze 5 — Discord notifikace + důležitá oznámení (PRD §2.5)        */
/* Nová výprava (POST /api/expeditions → 201) posílá embed na Discord    */
/* fire-and-forget (fail-open — mrtvý Discord nikdy neshodí 201).        */
/* `POST /api/oznameni` je dual-guard (ADMIN nebo aktivní člen — stejný  */
/* `vyzadujSpravceVyprav` jako výpravy) pro „důležitá oznámení":         */
/* validuje `nazev` 3–120 a `text` 1–2000, pak pošle embed stejným       */
/* fail-open kanálem a vrátí 201 + `{ ok: true }`. Žádný secret           */
/* v kontraktu (webhook URL žije jen v serverovém env, nikdy v těle      */
/* požadavku ani odpovědi). Chyby vždy jen `ApiErrorResponse`.           */
/* Aditivní, nic se nepřejmenovává.                                      */
/* ------------------------------------------------------------------ */

/** Cesta důležitých oznámení (dual-guard, viz PRISTUP_OZNAMENI). */
export const OZNAMENI_PATH = "/api/oznameni" as const;

/**
 * Vstup důležitého oznámení.
 * `nazev` 3–120 znaků, `text` 1–2000 znaků (hranice trimuje).
 */
export interface VytvoritOznameniRequest {
  nazev: string;
  text: string;
}

/** Úspěch → 201. Samotný text už je na Discordu, server nic neukládá. */
export interface VytvoritOznameniResponse {
  ok: true;
}

/** Hranice oznámení: zápis jen dual-guard (ADMIN nebo aktivní člen). */
export const PRISTUP_OZNAMENI = {
  [OZNAMENI_PATH]: "ADMIN",
} as const;

/** Guard odpovědi oznámení (právě `{ ok: true }`, žádné secrety). */
export function jeVytvoritOznameniOdpoved(
  hodnota: unknown,
): hodnota is VytvoritOznameniResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (zaznam["ok"] !== true) return false;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
  ]) {
    if (klic in zaznam) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
