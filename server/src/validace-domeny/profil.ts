/**
 * Own-profile patch validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  jeOblibenaBarva,
} from "../../../src/shared/api-types";
import type { VysledekValidace, ChybyPoli } from "./spolecne";
import { jeRecord, pridej } from "./spolecne";
import { jeRealneDatum, DATUM_REGEX } from "./expedice";
import { overTelefonPatch, overDiscordNickPatch, overEmailPatch, overPrijmeniPatch, overJmenoPatch } from "./ucty";







/* Step 3 — PATCH /api/me (vlastní profil, validace na hranici).        */
/* Parciální: jen poslaná pole se mění (neposlané = undefined, beze      */
/* změny). Pole mapují 1:1 na DB `users` — žádný displayName/nick bez   */
/* sloupce. E-mail se normalizuje na lowercase (unikátnost hlídá route  */
/* nad DB → 409 EMAIL_OBSAZEN). Heslo se tu jen čte (hashuje route       */
/* bcryptem, nikdy se nevrací ani neloguje). Avatar POUZE https:// URL  */
/* v API (UI URL input odebrán — jen náhled + Odebrat/Zahodit, validace  */
/* beze změny; upload souborů až Step 4). Datum narození YYYY-MM-DD     */
/* 1900-01-01 až dnes (DB sloupec `narozeniny` beze změny). */
/* Prázdný objekt projde (idempotentní no-op — route vrátí beze změny).  */
/* ------------------------------------------------------------------ */

export interface CistyProfilUpdate {
  jmeno?: string;
  prijmeni?: string;
  email?: string;
  /** Nové heslo plaintext (hashuje route, nikdy se nevrací). */
  heslo?: string;
  /** Required when `heslo` is set. Checked with bcrypt, never stored. */
  soucasneHeslo?: string;
  /** undefined = beze změny, null = smazat. */
  telefon?: string | null;
  /** undefined = beze změny, null = smazat. */
  discordNick?: string | null;
  skola?: string;
  trida?: string;
  /** undefined = beze změny, null = smazat (POUZE URL). */
  avatarUrl?: string | null;
  bio?: string;
  oblibenaBarva?: string;
  /** YYYY-MM-DD; undefined = beze změny, null = smazat. */
  narozeniny?: string | null;
}

const NAROZENINY_MIN = "1900-01-01";

function dnesYmdProNarozeniny(): string {
  const ted = new Date();
  const rok = ted.getFullYear();
  const mesic = String(ted.getMonth() + 1).padStart(2, "0");
  const den = String(ted.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

function overAvatarUrlPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): { poslan: boolean; hodnota: string | null } {
  if (!Object.hasOwn(data, "avatarUrl")) return { poslan: false, hodnota: null };
  const hodnota: unknown = data["avatarUrl"];
  if (hodnota === null) return { poslan: true, hodnota: null };
  if (typeof hodnota !== "string") {
    pridej(chyby, "avatarUrl", VALIDACNI_ZPRAVY.avatarUrlNeplatny);
    return { poslan: true, hodnota: null };
  }
  const cisty = hodnota.trim();
  // Prázdné = smazat (null) — avatar je nepovinný.
  if (cisty.length === 0) return { poslan: true, hodnota: null };
  if (cisty.length > VALIDACE.avatarUrlMaxDelka) {
    pridej(chyby, "avatarUrl", VALIDACNI_ZPRAVY.avatarUrlDlouhy);
    return { poslan: true, hodnota: null };
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(cisty);
  } catch {
    parsed = null;
  }
  if (parsed === null || parsed.protocol !== "https:") {
    pridej(chyby, "avatarUrl", VALIDACNI_ZPRAVY.avatarUrlNeplatny);
    return { poslan: true, hodnota: null };
  }
  return { poslan: true, hodnota: parsed.toString() };
}

function overBioPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): string | undefined {
  if (!Object.hasOwn(data, "bio")) return undefined;
  const hodnota: unknown = data["bio"];
  if (hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, "bio", VALIDACNI_ZPRAVY.bioDlouhe);
    return undefined;
  }
  const ciste = hodnota.trim();
  if (ciste.length > VALIDACE.bioMaxDelka) {
    pridej(chyby, "bio", VALIDACNI_ZPRAVY.bioDlouhe);
    return undefined;
  }
  return ciste;
}

/**
 * Škola / třída / bio pro PATCH /api/me: neposlané → undefined (beze
 * změny), poslané prázdné → "" (smazat, DB NOT NULL DEFAULT '').
 * (Liší se od overSkolaTrida pro registr, kde chybějící → "".)
 */
function overOblibenaBarvaPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): string | undefined {
  if (!Object.hasOwn(data, "oblibenaBarva")) return undefined;
  const hodnota: unknown = data["oblibenaBarva"];
  if (hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, "oblibenaBarva", VALIDACNI_ZPRAVY.oblibenaBarvaNeplatna);
    return undefined;
  }
  const cista = hodnota.trim().toLocaleLowerCase("cs-CZ");
  if (cista.length === 0) return "";
  if (!jeOblibenaBarva(cista)) {
    pridej(chyby, "oblibenaBarva", VALIDACNI_ZPRAVY.oblibenaBarvaNeplatna);
    return undefined;
  }
  return cista;
}

function overTextNaPrazdnyPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
  pole: "skola" | "trida",
  maxDelka: number,
  hlaska: string,
): string | undefined {
  if (!Object.hasOwn(data, pole)) return undefined;
  const hodnota: unknown = data[pole];
  if (hodnota === null) return "";
  if (typeof hodnota !== "string") {
    pridej(chyby, pole, hlaska);
    return undefined;
  }
  const cista = hodnota.trim();
  if (cista.length === 0) return "";
  if (cista.length > maxDelka) {
    pridej(chyby, pole, hlaska);
    return undefined;
  }
  return cista;
}

export function overNarozeninyPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): { poslan: boolean; hodnota: string | null } {
  if (!Object.hasOwn(data, "narozeniny"))
    return { poslan: false, hodnota: null };
  const hodnota: unknown = data["narozeniny"];
  if (hodnota === null) return { poslan: true, hodnota: null };
  if (typeof hodnota !== "string") {
    pridej(chyby, "narozeniny", VALIDACNI_ZPRAVY.narozeninyNeplatne);
    return { poslan: true, hodnota: null };
  }
  const ciste = hodnota.trim();
  if (ciste.length === 0) return { poslan: true, hodnota: null };
  const den = ciste.slice(0, 10);
  if (!DATUM_REGEX.test(den)) {
    pridej(chyby, "narozeniny", VALIDACNI_ZPRAVY.narozeninyNeplatne);
    return { poslan: true, hodnota: null };
  }
  const rok = Number(den.slice(0, 4));
  const mesic = Number(den.slice(5, 7));
  const denCislo = Number(den.slice(8, 10));
  if (!jeRealneDatum(rok, mesic, denCislo)) {
    pridej(chyby, "narozeniny", VALIDACNI_ZPRAVY.narozeninyNeplatne);
    return { poslan: true, hodnota: null };
  }
  if (den < NAROZENINY_MIN || den > dnesYmdProNarozeniny()) {
    pridej(chyby, "narozeniny", VALIDACNI_ZPRAVY.narozeninyMimoRozsah);
    return { poslan: true, hodnota: null };
  }
  return { poslan: true, hodnota: den };
}

function overHesloPatch(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
): string | undefined {
  if (!Object.hasOwn(data, "heslo")) return undefined;
  const hodnota: unknown = data["heslo"];
  if (typeof hodnota !== "string" || hodnota.length === 0) {
    pridej(chyby, "heslo", VALIDACNI_ZPRAVY.hesloPovinne);
    return undefined;
  }
  if (hodnota.length < VALIDACE.hesloMinDelka) {
    pridej(chyby, "heslo", VALIDACNI_ZPRAVY.hesloKratke);
    return undefined;
  }
  if (hodnota.length > VALIDACE.hesloMaxDelka) {
    pridej(chyby, "heslo", VALIDACNI_ZPRAVY.hesloDlouhe);
    return undefined;
  }
  return hodnota;
}

function overSoucasneHeslo(
  chyby: ChybyPoli,
  data: Record<string, unknown>,
  meniHeslo: boolean,
): string | undefined {
  const hodnota: unknown = data["soucasneHeslo"];
  // Změnu e-mailu zná až routa (porovnává s DB), proti ní se povinnost hlídá tam.
  if (hodnota === undefined || hodnota === "") {
    if (meniHeslo) pridej(chyby, "soucasneHeslo", "Napiš současné heslo.");
    return undefined;
  }
  if (typeof hodnota !== "string") {
    pridej(chyby, "soucasneHeslo", "Napiš současné heslo.");
    return undefined;
  }
  if (hodnota.length > VALIDACE.hesloMaxDelka) {
    pridej(chyby, "soucasneHeslo", VALIDACNI_ZPRAVY.hesloDlouhe);
    return undefined;
  }
  return hodnota;
}

/**
 * Validace PATCH /api/me — parciální, jen poslaná pole.
 * Neznámá pole se ignorují (aditivní klienti nepadají).
 * Prázdný objekt projde s prázdnými daty (no-op).
 */
export function validujProfilUpdate(
  telo: unknown,
): VysledekValidace<CistyProfilUpdate> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const jmeno = overJmenoPatch(chyby, telo);
  const prijmeni = overPrijmeniPatch(chyby, telo);
  const email = overEmailPatch(chyby, telo);
  const heslo = overHesloPatch(chyby, telo);
  const soucasne = overSoucasneHeslo(chyby, telo, heslo !== undefined);
  const telefon = overTelefonPatch(chyby, telo);
  const discordNick = overDiscordNickPatch(chyby, telo);
  const skola = overTextNaPrazdnyPatch(
    chyby,
    telo,
    "skola",
    VALIDACE.skolaMaxDelka,
    VALIDACNI_ZPRAVY.skolaDlouha,
  );
  const trida = overTextNaPrazdnyPatch(
    chyby,
    telo,
    "trida",
    VALIDACE.tridaMaxDelka,
    VALIDACNI_ZPRAVY.tridaDlouha,
  );
  const avatar = overAvatarUrlPatch(chyby, telo);
  const bio = overBioPatch(chyby, telo);
  const oblibenaBarva = overOblibenaBarvaPatch(chyby, telo);
  const narozeniny = overNarozeninyPatch(chyby, telo);
  if (Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  const data: CistyProfilUpdate = {};
  if (jmeno !== undefined) data.jmeno = jmeno;
  if (prijmeni !== undefined) data.prijmeni = prijmeni;
  if (email !== undefined) data.email = email;
  if (heslo !== undefined) data.heslo = heslo;
  if (soucasne !== undefined) data.soucasneHeslo = soucasne;
  if (telefon.poslan) data.telefon = telefon.hodnota;
  if (discordNick.poslan) data.discordNick = discordNick.hodnota;
  if (skola !== undefined) data.skola = skola;
  if (trida !== undefined) data.trida = trida;
  if (avatar.poslan) data.avatarUrl = avatar.hodnota;
  if (bio !== undefined) data.bio = bio;
  if (oblibenaBarva !== undefined) data.oblibenaBarva = oblibenaBarva;
  if (narozeniny.poslan) data.narozeniny = narozeniny.hodnota;
  return { uspech: true, data, chybyPoli: {} };
}
