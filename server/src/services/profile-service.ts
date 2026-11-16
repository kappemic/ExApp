/**
 * server/src/services/profile-service.ts — business logika PATCH /api/me.
 *
 * Odděleně od routy (AGENTS.md: logika v services, route jen hranice).
 * Čisté funkce bez DB a bez logování — route řeší session, unikátnost
 * e-mailu a bcrypt hash. Heslo tudy nikdy neteče (ani plaintext, ani
 * hash) — hashuje ho route po validaci, hash se nikdy nevrací klientovi.
 *
 * Pole mapují 1:1 na DB `users` (migrace 0015): jmeno, prijmeni, telefon,
 * discordNick, skola, trida, avatar_url, bio, narozeniny (DB sloupec
 * `narozeniny` beze změny, UI label „Datum narození"). Žádný
 * displayName/nick bez sloupce.
 */

import type { CistyProfilUpdate } from "../validace";

/** DB patch pro drizzle `.update(users).set(...)` (bez e-mailu/hesla). */
export interface ProfilDbPatch {
  jmeno?: string;
  prijmeni?: string;
  telefon?: string | null;
  discordNick?: string | null;
  skola?: string;
  trida?: string;
  avatarUrl?: string | null;
  bio?: string;
  oblibenaBarva?: string;
  narozeniny?: string | null;
  updatedAt: Date;
}

/**
 * True, když PATCH nic nemění (prázdné tělo / vše beze změny).
 * Route pak jen vrátí aktuálního uživatele bez UPDATE (idempotentní).
 */
export function jeProfilBezZmen(vstup: CistyProfilUpdate): boolean {
  return (
    vstup.jmeno === undefined &&
    vstup.prijmeni === undefined &&
    vstup.email === undefined &&
    vstup.heslo === undefined &&
    vstup.telefon === undefined &&
    vstup.discordNick === undefined &&
    vstup.skola === undefined &&
    vstup.trida === undefined &&
    vstup.avatarUrl === undefined &&
    vstup.bio === undefined &&
    vstup.oblibenaBarva === undefined &&
    vstup.narozeniny === undefined
  );
}

/**
 * Validovaný vstup → DB patch (1:1 na sloupce `users`).
 * E-mail a heslo záměrně NEOBSAHUJE — e-mail řeší route (unikátnost
 * + 409), heslo route (bcrypt hash). Vstup už prošel validací na hranici,
 * takže se tu jen překlápí (žádné throw, žádné any).
 */
export function sestavProfilDbPatch(vstup: CistyProfilUpdate): ProfilDbPatch {
  const patch: ProfilDbPatch = { updatedAt: new Date() };
  if (vstup.jmeno !== undefined) patch.jmeno = vstup.jmeno;
  if (vstup.prijmeni !== undefined) patch.prijmeni = vstup.prijmeni;
  if (vstup.telefon !== undefined) patch.telefon = vstup.telefon;
  if (vstup.discordNick !== undefined) patch.discordNick = vstup.discordNick;
  if (vstup.skola !== undefined) patch.skola = vstup.skola;
  if (vstup.trida !== undefined) patch.trida = vstup.trida;
  if (vstup.avatarUrl !== undefined) patch.avatarUrl = vstup.avatarUrl;
  if (vstup.bio !== undefined) patch.bio = vstup.bio;
  if (vstup.oblibenaBarva !== undefined) patch.oblibenaBarva = vstup.oblibenaBarva;
  if (vstup.narozeniny !== undefined) patch.narozeniny = vstup.narozeniny;
  return patch;
}
