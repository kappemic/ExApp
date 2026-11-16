/**
 * Codes, registration, login, profile, and member contracts.
 */

import type { Clenstvi, Funkce, Role } from "../../config/roles";
import type { UserId, ApiUser, RegistrationCodeId } from "./spolecne";


/* 1) POST /api/admin/codes — jen ADMIN                                 */
/* Hranice: vyžaduje session s authRole === "ADMIN".                   */
/* Jinak 401 NEPRIHLASEN (bez session) / 403 ZAKAZANO (USER).          */
/* ------------------------------------------------------------------ */

export const ADMIN_CODES_PATH = "/api/admin/codes" as const;

/** Vstup je záměrně prázdný: expirace je fixně 10 minut (PRD 2.1). */
export interface VytvoritKodRequest {
  /** Volitelná poznámka pro admina. Max 120 znaků. Nikdy povinná. */
  poznamka?: string;
}

export interface VytvoritKodResponse {
  id: RegistrationCodeId;
  /** 8 znaků, bez 0/O/1/I — lidsky přepisovatelný. */
  kod: string;
  createdAt: string;
  /** createdAt + 10 minut. Klient odpočítává podle této hodnoty. */
  expiresAt: string;
}

/* ------------------------------------------------------------------ */
/* 2) POST /api/register — veřejné, platný kód povinný                  */
/* Platný kód = expires_at > now() (sdílený, opakovaně použitelný).    */
/* Po úspěchu se kód nespotřebovává — mizí jen expirací (purge).       */
/* Krok 5 zámek (multi-use): DB sloupce used_at / used_by jsou legacy   */
/* jednorázového návrhu (drizzle/schema/registration_codes.ts, migrace */
/* 0001) — kontrakt je nezavazuje, server ani klient je nečtou          */
/* ani nezapisují. Jediné pravidlo platnosti je expires_at > now().    */
/* ------------------------------------------------------------------ */

export const REGISTER_PATH = "/api/register" as const;

export interface RegistraceRequest {
  jmeno: string;
  /** Příjmení — nově aditivně (optional, aby starší klienti procházeli). */
  prijmeni?: string;
  email: string;
  heslo: string;
  /** Telefon — nepovinný; prázdný řetězec hranice normalizuje na null. */
  telefon?: string | null;
  /** Discord nick — nepovinný; prázdný řetězec hranice normalizuje na null. */
  discordNick?: string | null;
  /** Pozvánkový kód z POST /api/admin/codes. Trim + uppercase na hranici. */
  kod: string;
  /** Škola — nepovinná; prázdná se normalizuje na "". Max 120 znaků. */
  skola?: string;
  /** Třída — nepovinná; prázdná se normalizuje na "". Max 120 znaků. */
  trida?: string;
}

export interface RegistraceResponse {
  user: ApiUser;
}

/* ------------------------------------------------------------------ */
/* 3) POST /api/login — veřejné                                        */
/* ------------------------------------------------------------------ */

export const LOGIN_PATH = "/api/login" as const;

export interface PrihlaseniRequest {
  email: string;
  heslo: string;
}

export interface PrihlaseniResponse {
  user: ApiUser;
}

/* ------------------------------------------------------------------ */
/* 4) GET /api/me — vyžaduje session (USER i ADMIN)                     */
/* Bez session → 401 NEPRIHLASEN. Nikdy nevrací 404 pro „sebe".        */
/* ------------------------------------------------------------------ */

export const ME_PATH = "/api/me" as const;

export type MeResponse = ApiUser;

/* ------------------------------------------------------------------ */
/* 4b) PATCH /api/me — úprava vlastního profilu (Step 3, USER i ADMIN)  */
/* Hranice: vyžaduje session (`vyzadujPrihlaseni`). Bez session → 401   */
/* NEPRIHLASEN. Cíl je VŽDY session.user.id (žádné :id v URL) — IDOR     */
/* je vyloučen konstrukcí. Změna hesla nebo e-mailu vyžaduje            */
/* `soucasneHeslo`, ostatní pole ne.                                    */
/* Parciální PATCH sémantika — jen poslaná pole se mění. Pole mapují    */
/* 1:1 na DB `users`: jmeno, prijmeni, telefon, discordNick, skola,     */
/* trida + nové avatar_url / bio / narozeniny (DB sloupec `narozeniny`  */
/* beze změny, UI label „Datum narození"; migrace 0015). Žádný          */
/* displayName/nick bez sloupce — zobrazované jméno = jmeno + prijmeni. */
/* E-mail: lowercase normalizace + kontrola unikátnosti (jiné id s       */
/* týmž e-mailem → 409 EMAIL_OBSAZEN). Heslo: plaintext v body, server   */
/* hashuje bcrypt (cost 10, stejně jako registr), hash se nikdy nevrací */
/* ani neloguje. Avatar: POUZE https:// URL v API (UI URL input odebrán, */
/* upload souborů až Step 4).                                            */
/* Nevalidní pole → 422 VALIDATION_ERROR s details (pole → české hlášky).*/
/* Úspěch → 200 + `UpravitProfilResponse`. Idempotentní: opakovaný PATCH */
/* se stejným tělem přepíše stejné hodnoty (`updatedAt` se obnoví).      */
/* Chyby vždy jen `ApiErrorResponse`. Aditivní, nic se nepřejmenovává.  */
/* ------------------------------------------------------------------ */

/**
 * Parciální update vlastního profilu — jen poslaná pole se mění.
 * Prázdný nepovinný kontakt / avatar / datum narození (pole `narozeniny`, "" nebo null)
 * hranice normalizuje na null (smazání). Škola / třída / bio:
 * prázdné → "" (DB NOT NULL DEFAULT ''). Heslo se posílá plaintext
 * (TLS), server ho hashuje a nikdy nevrací.
 */
export interface UpravitProfilRequest {
  jmeno?: string;
  prijmeni?: string;
  email?: string;
  /** Nové heslo plaintext (8–128 znaků). Server hashuje bcrypt. */
  heslo?: string;
  /** Povinné při změně `heslo` nebo `email`. Server ho ověří a neukládá. */
  soucasneHeslo?: string;
  /** Nepovinný; prázdný řetězec / null → null (smazat). Max 32 znaků. */
  telefon?: string | null;
  /** Nepovinný; prázdný řetězec / null → null (smazat). Max 32 znaků. */
  discordNick?: string | null;
  /** Nepovinná; prázdná → "" (DB DEFAULT ''). Max 120 znaků. */
  skola?: string;
  /** Nepovinná; prázdná → "" (DB DEFAULT ''). Max 120 znaků. */
  trida?: string;
  /**
   * Avatar — POUZE veřejná https:// URL v API (max 2048, UI URL input odebrán).
   * "" / null → null (smazat). Upload souborů až Step 4.
   */
  avatarUrl?: string | null;
  /** Nepovinné; max 500 znaků. Prázdné → "". */
  bio?: string;
  /** Primární barva, nebo "" (smazat). */
  oblibenaBarva?: string;
  /** Datum narození YYYY-MM-DD (1900-01-01 až dnes, DB sloupec `narozeniny`); "" / null → null (smazat). */
  narozeniny?: string | null;
}

export interface UpravitProfilResponse {
  user: ApiUser;
}

/* ------------------------------------------------------------------ */
/* 5) PATCH /api/clenove/:id — úprava člena (jen ADMIN, Krok 4b)        */
/* Kontrakt před implementací: UI (ClenDetailModal) dnes ukládá        */
/* lokálně nad mockem přes onSave; až přijde Neon, pošle stejný        */
/* `UpravitClenaRequest` na `clenDetailPath(id)`.                      */
/* Hranice: vyžaduje session s authRole === "ADMIN".                   */
/* Jinak 401 NEPRIHLASEN (bez session) / 403 ZAKAZANO (USER).          */
/* Úspěch → 200 + `UpravitClenaResponse`. Neznámé id → 404 NENALEZENO. */
/* Nevalidní pole/kombinace rolí → 422 VALIDATION_ERROR                */
/* s `details` ve tvaru pole → seznam českých hlášek                   */
/* (role: [chybaKombinaceRole(...)], viz src/config/roles.ts).         */
/* Idempotence: opakovaný PATCH se stejným tělem je bezpečný           */
/* (přepíše stejné hodnoty, `updatedAt` se obnoví).                    */
/* ------------------------------------------------------------------ */

export const CLENOVE_PATH = "/api/clenove" as const;
export const CLEN_DETAIL_VZOR = "/api/clenove/:id" as const;

/** Staví konkrétní URL detailu člena: `/api/clenove/c01`. */
export function clenDetailPath(id: string): `/api/clenove/${string}` {
  return `/api/clenove/${id}`;
}

/**
 * Parciální update — jen poslaná pole se mění (PATCH sémantika).
 * Prázdný řetězec u nepovinných kontaktů hranice normalizuje na null.
 * `role` je celé nové pole rolí (ne delta); validuje `chybaKombinaceRole`.
 */
export interface UpravitClenaRequest {
  jmeno?: string;
  prijmeni?: string;
  email?: string;
  /** Nepovinný; prázdný řetězec → null. Max 32 znaků. */
  telefon?: string | null;
  /** Nepovinný; prázdný řetězec → null. Max 32 znaků. */
  discordNick?: string | null;
  /** Celé nové pole rolí; exkluzivita clen XOR aktivni-clen (viz roles.ts). */
  role?: Role[];
}

/**
 * Plný člen pro admina — na rozdíl od `ApiUser` nese celé `role[]`
 * (zdroj pravdy pro UI) místo jedné primární role.
 */
export interface AdminClen {
  id: UserId;
  jmeno: string;
  prijmeni: string;
  email: string;
  telefon: string | null;
  discordNick: string | null;
  role: Role[];
  /** 3D členství — aditivně optional. */
  clenstvi?: Clenstvi;
  /** 3D funkce — aditivně optional (null = bez funkce). */
  funkce?: Funkce;
  /** Ortogonální admin příznak — aditivně optional. */
  isAdmin?: boolean;
  updatedAt: string;
}

export interface UpravitClenaResponse {
  clen: AdminClen;
}

/* ------------------------------------------------------------------ */
