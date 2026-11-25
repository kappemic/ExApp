/**
 * Boundary validation for API routes.
 * Domain modules hold the implementation. This file re-exports the public API.
 */

export type {
  ChybyPoli,
  VysledekValidace,
} from "./validace-domeny/spolecne";
export {
  normalizujNepovinny,
} from "./validace-domeny/spolecne";
export type {
  CistaRegistrace,
  CistePrihlaseni,
  CistaUpravaClena,
} from "./validace-domeny/ucty";
export {
  validujRegistraci,
  validujPrihlaseni,
  validujOvereniKodu,
  validujNovyKod,
  validujPoznamkuKodu,
  validujUpravuClena,
} from "./validace-domeny/ucty";
export type {
  CistaNovaExpedice,
  CistaUpravaExpedice,
  CistaDochazka,
  CistyUcastnikPoUzavreni,
} from "./validace-domeny/expedice";
export {
  DATUM_REGEX,
  jeRealneDatum,
  validujVytvoreniExpedice,
  validujUpravuExpedice,
  validujUzavreni,
  validujPridaniUcastnikaPoUzavreni,
} from "./validace-domeny/expedice";
export type {
  CistaFotka,
} from "./validace-domeny/fotky";
export {
  FOTKA_URL_MAX_DELKA,
  FOTKA_POPIS_MAX_DELKA,
  validujFotku,
} from "./validace-domeny/fotky";
export type {
  CistaUpravaRoleUzivatele,
  CistaUpravaUzivatele,
} from "./validace-domeny/uzivatele";
export {
  validujUpravuRoleUzivatele,
  validujUpravuUzivatele,
} from "./validace-domeny/uzivatele";
export type {
  CistaNovaSchuzka,
  CistaUpravaSchuzky,
} from "./validace-domeny/schuzky";
export {
  validujVytvoreniSchuzky,
  validujUpravuSchuzky,
} from "./validace-domeny/schuzky";
export type {
  CistyStravaCallback,
  CisteNeparovaneQuery,
  CisteParovaniAktivitu,
  CistaRucniAktivita,
} from "./validace-domeny/strava";
export {
  jePlatnyStravaState,
  validujStravaCallback,
  validujNeparovaneQuery,
  validujParovaniAktivitu,
  validujRucniAktivitu,
} from "./validace-domeny/strava";
export type {
  CisteOznameni,
} from "./validace-domeny/oznameni";
export {
  validujOznameni,
} from "./validace-domeny/oznameni";
export type {
  CistaZprava,
} from "./validace-domeny/zpravy";
export {
  validujZpravu,
} from "./validace-domeny/zpravy";
export type {
  CistyProfilUpdate,
} from "./validace-domeny/profil";
export {
  validujProfilUpdate,
} from "./validace-domeny/profil";
