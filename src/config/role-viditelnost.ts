/**
 * src/config/role-viditelnost.ts — Krok 18: matice viditelnosti rolí.
 *
 * Čistá UI logika bez DB/HTTP. Zdroj pravdy ROLE_DOC.md §5 + dodatek 3D §5:
 * - Výpravy čtou všichni; spravují je dual-guard (`isAdmin` NEBO `smiNaVypravy`).
 * - Tlačítko „Upravit" kopíruje právo spravovat výpravy.
 * - Fotky + členové/kódy jen `isAdmin` (aktivní člen bez admina nestačí).
 * - Statistiky, přihlásit/odhlásit a odpojit vlastní Stravu smí každá
 *   přihlášená role (běžný člen, aktivní člen i vedoucí/admin).
 *
 * Seed účty a přihlášení viz docs/testovaci-ucty.md.
 */

import { smiNaVypravy } from "./roles";
import type { ClenskyProfil } from "./roles";

/** Co daný 3D profil v UI smí a vidí (jen boolean matice, žádné PII). */
export interface ViditelnostRole {
  /** Čtení seznamu a detailu výprav. */
  muzeCistVypravy: boolean;
  /** Vytvářet/upravovat/mazat/uzavírat výpravy (dual-guard). */
  muzeSpravovatVypravy: boolean;
  /** Tlačítko „Upravit" v modalu výpravy (= spravovat výpravy). */
  vidiUpravit: boolean;
  /** Nahrávat/mazat fotky k výpravě (jen ADMIN). */
  muzeSpravovatFotky: boolean;
  /** Spravovat členy a generovat registrační kódy (jen ADMIN). */
  muzeSpravovatClenyKody: boolean;
  /** Čtení statistik a leaderboardu. */
  vidiStatistiky: boolean;
  /** Přihlásit se / odhlásit se z výpravy. */
  muzeSePrihlasitNaVypravu: boolean;
  /** Odpojit vlastní Strava účet. */
  muzeOdpojitStravu: boolean;
}

/**
 * Vrátí matici viditelnosti pro 3D profil.
 * Čistá funkce — stejný vstup vždy vrátí stejný výstup.
 */
export function viditelnostProProfil(profil: ClenskyProfil): ViditelnostRole {
  const spravceVyprav: boolean = profil.isAdmin || smiNaVypravy(profil);
  const admin: boolean = profil.isAdmin;
  return {
    muzeCistVypravy: true,
    muzeSpravovatVypravy: spravceVyprav,
    vidiUpravit: spravceVyprav,
    muzeSpravovatFotky: admin,
    muzeSpravovatClenyKody: admin,
    vidiStatistiky: true,
    muzeSePrihlasitNaVypravu: true,
    muzeOdpojitStravu: true,
  };
}
