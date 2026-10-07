/**
 * Klient pro detail + účast výprav (Krok 5).
 * Tenký BFF fetch-first: `VITE_API_BASE_URL` + kontrakt `src/shared/api-types.ts`.
 * Žádný secret v klientovi (jen `VITE_*`). Chyby česky, nikdy nevyhazuje
 * síťovou výjimku ven — vrací `{ ok: false, chyba }`.
 */

import {
  jeApiChyba,
  odhlasitPath,
  prihlasitPath,
  ucastniciPath,
  uzavritPath,
  expediceDetailPath,
  type ApiErrorCode,
  type ApiExpedice,
  type ApiUcastnik,
  type DochazkaZaznam,
  type OdhlasitResponse,
  type PrihlasitNaVypravuResponse,
  type SmazatExpediciResponse,
  type UcastniciListResponse,
  type UpravitExpediciRequest,
  type UpravitExpediciResponse,
  type UzavritVypravuResponse,
  type VytvoritExpediciRequest,
} from "../shared/api-types";
import type { ChybyExpedice } from "../components/expeditions/ExpeditionForm";

export type { ApiUcastnik };

/** Sjednocený výsledek mutací — úspěch nese data, chyba českou hlášku. */
export type UcastVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode; chybyPoli?: ChybyExpedice };

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

/** Bezpečné čtení JSON — prázdné / ne-JSON tělo → null. */
async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

function chybaZTela(telo: unknown, status: number): UcastVysledek<never> {
  if (jeApiChyba(telo)) {
    const kod: ApiErrorCode = telo.error.code;
    void status;
    return { ok: false, chyba: telo.error.message, kod };
  }
  return { ok: false, chyba: OBECNA_CHYBA };
}

/** První česká hláška pro dané pole z `details` (VALIDATION_ERROR). */
function prvniHlaska(detaily: Record<string, string[]>, pole: string): string | undefined {
  const seznam: string[] | undefined = detaily[pole];
  if (seznam === undefined || seznam.length === 0) return undefined;
  const hlaska: string | undefined = seznam[0];
  return hlaska;
}

/** Mapuje 422 `details` na pole ExpeditionForm (server je zdrojem pravdy). */
function mapujChybyPoli(telo: unknown): ChybyExpedice {
  if (!jeApiChyba(telo)) return {};
  if (telo.error.code !== "VALIDATION_ERROR") return {};
  const detaily: Record<string, string[]> = telo.error.details ?? {};
  const vysledek: ChybyExpedice = {};
  const pole: Array<"nazev" | "datum" | "sraz" | "popis" | "kapacitaCelkem"> = [
    "nazev",
    "datum",
    "sraz",
    "popis",
    "kapacitaCelkem",
  ];
  for (const klic of pole) {
    const hlaska: string | undefined = prvniHlaska(detaily, klic);
    if (hlaska !== undefined) vysledek[klic] = hlaska;
  }
  return vysledek;
}

interface FetchVysledek {
  status: number;
  telo: unknown;
}

/** Jednotné volání BFF se session cookie. `null` = bez backendu / síť padla. */
async function volej(
  cesta: string,
  metoda: "GET" | "POST" | "PATCH" | "DELETE",
  payload?: VytvoritExpediciRequest | UpravitExpediciRequest | { dochazka: DochazkaZaznam[] },
): Promise<FetchVysledek | null> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return null;
  try {
    const odpoved: Response = await fetch(`${zaklad}${cesta}`, {
      method: metoda,
      credentials: "include",
      headers:
        payload === undefined
          ? { Accept: "application/json" }
          : { "Content-Type": "application/json", Accept: "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: odpoved.status, telo: await ctiTelo(odpoved) };
  } catch {
    return null;
  }
}

function jeUcastniciOdpoved(telo: unknown): telo is UcastniciListResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  return Array.isArray(kandidat["ucastnici"]);
}

/** Seznam přihlášených pro modal (vyžaduje session — bez ní 401). */
export async function nactiUcastniky(
  idVypravy: string,
): Promise<UcastVysledek<{ ucastnici: ApiUcastnik[]; expedice: ApiExpedice }>> {
  const vysledek: FetchVysledek | null = await volej(ucastniciPath(idVypravy), "GET");
  if (vysledek === null) {
    return { ok: false, chyba: "Seznam účastníků je bez připojení nedostupný." };
  }
  if (vysledek.status === 200 && jeUcastniciOdpoved(vysledek.telo)) {
    return { ok: true, data: { ucastnici: vysledek.telo.ucastnici, expedice: vysledek.telo.expedice } };
  }
  return chybaZTela(vysledek.telo, vysledek.status);
}

function jePrihlasitOdpoved(telo: unknown): telo is PrihlasitNaVypravuResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  return typeof kandidat["ucastnik"] === "object" && typeof kandidat["expedice"] === "object";
}

/** Přihlášení sebe (USER). Bez backendu → offline hláška (žádný lokální zápis). */
export async function prihlasNaVypravu(
  idVypravy: string,
): Promise<UcastVysledek<PrihlasitNaVypravuResponse>> {
  const vysledek: FetchVysledek | null = await volej(prihlasitPath(idVypravy), "POST", undefined);
  if (vysledek === null) {
    return { ok: false, chyba: "Bez připojení se přihlásit nejde. Zkus to později." };
  }
  if ((vysledek.status === 201 || vysledek.status === 200) && jePrihlasitOdpoved(vysledek.telo)) {
    return { ok: true, data: vysledek.telo };
  }
  return chybaZTela(vysledek.telo, vysledek.status);
}

function jeOdhlasitOdpoved(telo: unknown): telo is OdhlasitResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  return kandidat["ok"] === true && typeof kandidat["expedice"] === "object";
}

/** Odhlášení sebe (USER, idempotentní). */
export async function odhlasZVypravy(
  idVypravy: string,
): Promise<UcastVysledek<OdhlasitResponse>> {
  const vysledek: FetchVysledek | null = await volej(odhlasitPath(idVypravy), "DELETE");
  if (vysledek === null) {
    return { ok: false, chyba: "Bez připojení se odhlásit nejde. Zkus to později." };
  }
  if (vysledek.status === 200 && jeOdhlasitOdpoved(vysledek.telo)) {
    return { ok: true, data: vysledek.telo };
  }
  return chybaZTela(vysledek.telo, vysledek.status);
}

function jeUpravitOdpoved(telo: unknown): telo is UpravitExpediciResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  return typeof kandidat["expedice"] === "object";
}

/** Úprava výpravy (jen ADMIN, PATCH sémantika). */
export async function upravVypravu(
  idVypravy: string,
  payload: UpravitExpediciRequest,
): Promise<UcastVysledek<UpravitExpediciResponse>> {
  const vysledek: FetchVysledek | null = await volej(expediceDetailPath(idVypravy), "PATCH", payload);
  if (vysledek === null) {
    return { ok: false, chyba: "Bez připojení uložit nejde. Zkus to později." };
  }
  if (vysledek.status === 200 && jeUpravitOdpoved(vysledek.telo)) {
    return { ok: true, data: vysledek.telo };
  }
  if (vysledek.status === 422) {
    const zaklad = chybaZTela(vysledek.telo, vysledek.status);
    if (!zaklad.ok) {
      return { ...zaklad, chybyPoli: mapujChybyPoli(vysledek.telo) };
    }
  }
  return chybaZTela(vysledek.telo, vysledek.status);
}

function jeSmazatOdpoved(telo: unknown): telo is SmazatExpediciResponse {
  if (typeof telo !== "object" || telo === null) return false;
  return (telo as Record<string, unknown>)["ok"] === true;
}

/** Smazání výpravy (jen ADMIN, CASCADE). */
export async function smazVypravu(idVypravy: string): Promise<UcastVysledek<SmazatExpediciResponse>> {
  const vysledek: FetchVysledek | null = await volej(expediceDetailPath(idVypravy), "DELETE");
  if (vysledek === null) {
    return { ok: false, chyba: "Bez připojení smazat nejde. Zkus to později." };
  }
  if (vysledek.status === 200 && jeSmazatOdpoved(vysledek.telo)) {
    return { ok: true, data: vysledek.telo };
  }
  return chybaZTela(vysledek.telo, vysledek.status);
}

function jeUzavritOdpoved(telo: unknown): telo is UzavritVypravuResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const kandidat = telo as Record<string, unknown>;
  return typeof kandidat["expedice"] === "object" && Array.isArray(kandidat["ucastnici"]);
}

/** Uzavření výpravy + docházka (jen ADMIN). */
export async function uzavriVypravu(
  idVypravy: string,
  dochazka: DochazkaZaznam[],
): Promise<UcastVysledek<UzavritVypravuResponse>> {
  const vysledek: FetchVysledek | null = await volej(uzavritPath(idVypravy), "PATCH", { dochazka });
  if (vysledek === null) {
    return { ok: false, chyba: "Bez připojení uzavřít nejde. Zkus to později." };
  }
  if (vysledek.status === 200 && jeUzavritOdpoved(vysledek.telo)) {
    return { ok: true, data: vysledek.telo };
  }
  return chybaZTela(vysledek.telo, vysledek.status);
}
