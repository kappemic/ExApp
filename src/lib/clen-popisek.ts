import type { ClenskyProfil } from "../config/roles";

/**
 * Jedno slovo pod jménem v seznamu členů (návrh „Telefon · Členové").
 * Bere nejvyšší zařazení: hlavní admin > admin > vedení > rada > členství.
 */
export function popisekClena(profil: ClenskyProfil, isSuperadmin: boolean): string {
  if (isSuperadmin) return "Hlavní admin";
  if (profil.isAdmin) return "Admin";
  if (profil.funkce === "vedeni") return "Vedení";
  if (profil.funkce === "rada") return "Člen rady";
  return profil.clenstvi === "aktivni_clen" ? "Aktivní člen" : "Člen";
}
