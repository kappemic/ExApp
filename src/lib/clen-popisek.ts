import { mapujRoliNaProfil, type ClenskyProfil } from "../config/roles";
import type { UserListItem } from "../shared/api-types";

/** 3D profil člena s fallbackem ze starého `role` (trio je optional). */
export function profilClena(clen: UserListItem): ClenskyProfil {
  const zaklad = mapujRoliNaProfil(clen.role);
  return {
    clenstvi: clen.clenstvi ?? zaklad.clenstvi,
    funkce: clen.funkce ?? zaklad.funkce,
    isAdmin: clen.isAdmin ?? zaklad.isAdmin,
  };
}

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
