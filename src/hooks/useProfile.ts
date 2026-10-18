/**
 * useProfile — fetch + mutate vlastního profilu (Fáze 4, Step 4).
 *
 * Kontrakt (`src/shared/api-types.ts` §4b — Step 3):
 * - `GET /api/me` (USER i ADMIN, `credentials: include`) → `ApiUser`.
 * - `PATCH /api/me` (parciální, jen poslaná pole) → `{ user }`.
 * Žádný secret v klientovi (jen `VITE_API_BASE_URL`), chyby česky,
 * nikdy nevyhazuje síťovou výjimku — vrací `{ ok: false, chyba }`.
 * Optimistic UI je zakázáno pro e-mail/heslo — a zjednodušeně pro vše:
 * lokální stav se přepisuje až po `ok` odpovědi serveru (zdroj pravdy).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ME_PATH,
  jeApiChyba,
  type ApiErrorCode,
  type ApiUser,
  type UpravitProfilRequest,
  type UpravitProfilResponse,
} from "../shared/api-types";

export type ProfilVysledek<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      chyba: string;
      kod?: ApiErrorCode;
      chybyPoli?: Record<string, string>;
    };

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

function jeApiUser(hodnota: unknown): hodnota is ApiUser {
  if (!jeRecord(hodnota)) return false;
  return (
    typeof hodnota["id"] === "string" &&
    typeof hodnota["email"] === "string" &&
    typeof hodnota["jmeno"] === "string"
  );
}

function jeUpravitOdpoved(hodnota: unknown): hodnota is UpravitProfilResponse {
  if (!jeRecord(hodnota)) return false;
  return jeApiUser(hodnota["user"]);
}

function chybyPoliZTela(telo: unknown): Record<string, string> | undefined {
  if (!jeApiChyba(telo)) return undefined;
  const detaily: Record<string, string[]> = telo.error.details ?? {};
  const vysledek: Record<string, string> = {};
  for (const [pole, seznam] of Object.entries(detaily)) {
    const prvni: string | undefined = seznam[0];
    if (typeof prvni === "string" && prvni.length > 0) vysledek[pole] = prvni;
  }
  return Object.keys(vysledek).length > 0 ? vysledek : undefined;
}

/** Načte vlastní profil (`GET /api/me`). */
export async function nactiProfil(): Promise<ProfilVysledek<ApiUser>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení profil nenačtu. Zkus to později." };
  }
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${ME_PATH}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return { ok: false, chyba: "Bez připojení profil nenačtu. Zkus to později." };
  }
  const telo = await ctiTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return {
        ok: false,
        chyba: telo.error.message,
        kod: telo.error.code,
        chybyPoli: chybyPoliZTela(telo),
      };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeApiUser(telo)) return { ok: false, chyba: OBECNA_CHYBA };
  return { ok: true, data: telo };
}

/**
 * Uloží parciální změny (`PATCH /api/me`). Prázdné heslo volající
 * vůbec neposílá (neměnit); prázdný nepovinný kontakt/avatar/narozeniny
 * posílá jako null (smazat) — viz kontrakt Step 3.
 */
export async function ulozProfil(
  patch: UpravitProfilRequest,
): Promise<ProfilVysledek<ApiUser>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení profil neuložím. Zkus to později." };
  }
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${ME_PATH}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, chyba: "Bez připojení profil neuložím. Zkus to později." };
  }
  const telo = await ctiTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      const chybyPoli = chybyPoliZTela(telo);
      // 409 EMAIL_OBSAZEN nemá details — namapuj na pole e-mail pro inline chybu.
      if (
        telo.error.code === "EMAIL_OBSAZEN" &&
        (chybyPoli === undefined || chybyPoli["email"] === undefined)
      ) {
        return {
          ok: false,
          chyba: telo.error.message,
          kod: telo.error.code,
          chybyPoli: { ...(chybyPoli ?? {}), email: telo.error.message },
        };
      }
      return {
        ok: false,
        chyba: telo.error.message,
        kod: telo.error.code,
        chybyPoli,
      };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeUpravitOdpoved(telo)) return { ok: false, chyba: OBECNA_CHYBA };
  return { ok: true, data: telo.user };
}

/** Nahraje vlastní avatar (`POST /api/me/avatar`, multipart `soubor`). */
export async function nahratAvatar(soubor: File): Promise<ProfilVysledek<ApiUser>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení avatar neuložím. Zkus to později." };
  }
  const teloSouboru = new FormData();
  teloSouboru.append("soubor", soubor);
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${ME_PATH}/avatar`, {
      method: "POST",
      credentials: "include",
      body: teloSouboru,
    });
  } catch {
    return { ok: false, chyba: "Bez připojení avatar neuložím. Zkus to později." };
  }
  const telo = await ctiTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return {
        ok: false,
        chyba: telo.error.message,
        kod: telo.error.code,
        chybyPoli: chybyPoliZTela(telo),
      };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeUpravitOdpoved(telo)) return { ok: false, chyba: OBECNA_CHYBA };
  return { ok: true, data: telo.user };
}

export type ProfilStav = "nacitani" | "hotovo" | "chyba";

export interface UseProfil {
  profil: ApiUser | null;
  stav: ProfilStav;
  chyba: string | null;
  uklada: boolean;
  ulozit: (patch: UpravitProfilRequest) => Promise<ProfilVysledek<ApiUser>>;
  znovuNacti: () => void;
}

/**
 * Hook nad `nactiProfil` / `ulozProfil` — jediný zdroj profilu pro tab
 * Osobní údaje. `ulozit` přepisuje `profil` až po úspěchu serveru
 * (žádný optimistic update, hlavně pro e-mail/heslo).
 */
export function useProfile(): UseProfil {
  const [profil, setProfil] = useState<ApiUser | null>(null);
  const [stav, setStav] = useState<ProfilStav>("nacitani");
  const [chyba, setChyba] = useState<string | null>(null);
  const [uklada, setUklada] = useState<boolean>(false);
  const [kolo, setKolo] = useState<number>(0);

  useEffect(() => {
    let zije = true;
    setStav("nacitani");
    setChyba(null);
    void (async (): Promise<void> => {
      const vysledek = await nactiProfil();
      if (!zije) return;
      if (vysledek.ok) {
        setProfil(vysledek.data);
        setStav("hotovo");
      } else {
        setProfil(null);
        setChyba(vysledek.chyba);
        setStav("chyba");
      }
    })();
    return () => {
      zije = false;
    };
  }, [kolo]);

  const ulozit = useCallback(
    async (patch: UpravitProfilRequest): Promise<ProfilVysledek<ApiUser>> => {
      setUklada(true);
      try {
        const vysledek = await ulozProfil(patch);
        if (vysledek.ok) setProfil(vysledek.data);
        return vysledek;
      } finally {
        setUklada(false);
      }
    },
    [],
  );

  const znovuNacti = useCallback((): void => {
    setKolo((k) => k + 1);
  }, []);

  return { profil, stav, chyba, uklada, ulozit, znovuNacti };
}
