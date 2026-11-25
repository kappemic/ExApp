/**
 * Songbook client. Cookie session, no secrets.
 */
import { apiBase } from "./api-base";
import { chybaZApiTela, ctiJsonTelo, jeRecord } from "./api-odpoved";
import { CTENI_BEZ_SPOJENI, ZAPIS_BEZ_SPOJENI } from "./spojeni";
import { ctiKnihu, smazKnihu, ulozKnihu } from "./zpevnik-offline";
import type { ApiZpevnikNavrh, ApiZpevnikPisen, TeloPisne } from "../shared/zpevnik";

export type VysledekKnihy =
  | { ok: true; pisne: ApiZpevnikPisen[]; zdroj: "sit" | "telefon" }
  | { ok: false; chyba: string };

function knihaZTelefonu(chyba: string): VysledekKnihy {
  if (typeof localStorage === "undefined") return { ok: false, chyba };
  const ulozene = ctiKnihu(localStorage);
  if (ulozene === null) return { ok: false, chyba };
  return { ok: true, pisne: ulozene, zdroj: "telefon" };
}

function pisneZOdpovedi(telo: unknown): ApiZpevnikPisen[] | null {
  if (typeof telo !== "object" || telo === null) return null;
  const pisne = (telo as { pisne?: unknown }).pisne;
  if (!Array.isArray(pisne) || !pisne.every(jePisen)) return null;
  return pisne;
}

function jeTelo(hodnota: unknown): hodnota is TeloPisne {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  return Array.isArray((hodnota as { bloky?: unknown }).bloky);
}

function jePisen(hodnota: unknown): hodnota is ApiZpevnikPisen {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const radek = hodnota as {
    id?: unknown;
    nazev?: unknown;
    autor?: unknown;
    telo?: unknown;
  };
  return (
    typeof radek.id === "string" &&
    typeof radek.nazev === "string" &&
    typeof radek.autor === "string" &&
    jeTelo(radek.telo)
  );
}

export async function nactiKnihu(): Promise<VysledekKnihy> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return knihaZTelefonu("Zpěvník se nepodařilo načíst.");
  try {
    const odpoved = await fetch(`${zaklad}/api/zpevnik`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!odpoved.ok) return knihaZTelefonu("Zpěvník se nepodařilo načíst.");
    const pisne = pisneZOdpovedi(await ctiJsonTelo(odpoved));
    if (pisne === null) return { ok: false, chyba: "Zpěvník se nepodařilo načíst." };
    return { ok: true, pisne, zdroj: "sit" };
  } catch {
    return knihaZTelefonu("Bez spojení se zpěvník nenačetl a v telefonu zatím není uložený.");
  }
}

/** Published songs only. Writes the phone copy used when the network is down. */
export async function stahniKnihu(): Promise<VysledekKnihy> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: "Zpěvník se nepodařilo stáhnout." };
  try {
    const odpoved = await fetch(`${zaklad}/api/zpevnik`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!odpoved.ok) return { ok: false, chyba: "Zpěvník se nepodařilo stáhnout." };
    const pisne = pisneZOdpovedi(await ctiJsonTelo(odpoved));
    if (pisne === null) return { ok: false, chyba: "Zpěvník se nepodařilo stáhnout." };
    if (typeof localStorage === "undefined") {
      return { ok: false, chyba: "Telefon kopii zpěvníku neuloží." };
    }
    ulozKnihu(localStorage, pisne);
    return { ok: true, pisne, zdroj: "sit" };
  } catch {
    return { ok: false, chyba: "Zpěvník se nepodařilo stáhnout. Zkontroluj připojení." };
  }
}

export function jeKnihaUlozena(): boolean {
  if (typeof localStorage === "undefined") return false;
  return ctiKnihu(localStorage) !== null;
}

export function smazUlozenouKnihu(): void {
  if (typeof localStorage === "undefined") return;
  smazKnihu(localStorage);
}

function pisenZTelefonu(id: string, chyba = "Píseň se nepodařilo načíst."):
  | { ok: true; pisen: ApiZpevnikPisen }
  | { ok: false; chyba: string; nenalezena: boolean } {
  if (typeof localStorage !== "undefined") {
    const nalezena = ctiKnihu(localStorage)?.find((radek) => radek.id === id);
    if (nalezena !== undefined) return { ok: true, pisen: nalezena };
  }
  return { ok: false, chyba, nenalezena: false };
}

export async function nactiPisen(id: string): Promise<
  | { ok: true; pisen: ApiZpevnikPisen }
  | { ok: false; chyba: string; nenalezena: boolean }
> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return pisenZTelefonu(id);
  try {
    const odpoved = await fetch(`${zaklad}/api/zpevnik/${id}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (odpoved.status === 404) {
      return { ok: false, chyba: "Píseň nenalezena.", nenalezena: true };
    }
    if (!odpoved.ok) return pisenZTelefonu(id);
    const telo = await ctiJsonTelo(odpoved);
    if (typeof telo !== "object" || telo === null) {
      return { ok: false, chyba: "Píseň se nepodařilo načíst.", nenalezena: false };
    }
    const pisen = (telo as { pisen?: unknown }).pisen;
    if (!jePisen(pisen)) {
      return { ok: false, chyba: "Píseň se nepodařilo načíst.", nenalezena: false };
    }
    return { ok: true, pisen };
  } catch {
    return pisenZTelefonu(id, "Bez spojení se píseň nenačetla a v telefonu není uložená.");
  }
}

function jeNavrh(hodnota: unknown): hodnota is ApiZpevnikNavrh {
  return jePisen(hodnota);
}

async function posliJson(
  cesta: string,
  metoda: "POST" | "PATCH" | "DELETE",
  telo?: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; chyba: string }> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: "Zpěvník se nepodařilo uložit." };
  try {
    const odpoved = await fetch(`${zaklad}${cesta}`, {
      method: metoda,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(telo === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
    const data = await ctiJsonTelo(odpoved);
    if (!odpoved.ok) return chybaZApiTela(data, "Zpěvník se nepodařilo uložit.");
    return { ok: true, data };
  } catch {
    return { ok: false, chyba: ZAPIS_BEZ_SPOJENI };
  }
}

export async function nactiNavrhy(): Promise<
  { ok: true; navrhy: ApiZpevnikNavrh[] } | { ok: false; chyba: string }
> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: "Frontu se nepodařilo načíst." };
  try {
    const odpoved = await fetch(`${zaklad}/api/zpevnik/navrhy`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo = await ctiJsonTelo(odpoved);
    if (!odpoved.ok) return chybaZApiTela(telo, "Frontu se nepodařilo načíst.");
    if (typeof telo !== "object" || telo === null || !Array.isArray((telo as { navrhy?: unknown }).navrhy)) {
      return { ok: false, chyba: "Frontu se nepodařilo načíst." };
    }
    const navrhy = (telo as { navrhy: unknown[] }).navrhy;
    if (!navrhy.every(jeNavrh)) return { ok: false, chyba: "Frontu se nepodařilo načíst." };
    return { ok: true, navrhy };
  } catch {
    return { ok: false, chyba: CTENI_BEZ_SPOJENI };
  }
}

export async function nactiNavrh(id: string): Promise<
  { ok: true; navrh: ApiZpevnikNavrh } | { ok: false; chyba: string }
> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: "Návrh se nepodařilo načíst." };
  try {
    const odpoved = await fetch(`${zaklad}/api/zpevnik/navrhy/${id}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo = await ctiJsonTelo(odpoved);
    if (!odpoved.ok) return chybaZApiTela(telo, "Návrh se nepodařilo načíst.");
    if (!jeRecord(telo)) return { ok: false, chyba: "Návrh se nepodařilo načíst." };
    const navrh = telo["navrh"];
    if (!jeNavrh(navrh)) return { ok: false, chyba: "Návrh se nepodařilo načíst." };
    return { ok: true, navrh };
  } catch {
    return { ok: false, chyba: CTENI_BEZ_SPOJENI };
  }
}

export async function upravNavrh(
  id: string,
  nazev: string,
  autor: string,
  telo: TeloPisne,
): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const vysledek = await posliJson(`/api/zpevnik/navrhy/${id}`, "PATCH", { nazev, autor, telo });
  if (!vysledek.ok) return vysledek;
  return { ok: true };
}

export async function vytvorNavrh(
  nazev: string,
  autor: string,
  telo: TeloPisne,
): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const vysledek = await posliJson("/api/zpevnik/navrhy", "POST", { nazev, autor, telo });
  if (!vysledek.ok) return vysledek;
  return { ok: true };
}

export async function schvalNavrh(id: string): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const vysledek = await posliJson(`/api/zpevnik/navrhy/${id}/schvalit`, "POST");
  if (!vysledek.ok) return vysledek;
  return { ok: true };
}

export async function smazNavrh(id: string): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const vysledek = await posliJson(`/api/zpevnik/navrhy/${id}`, "DELETE");
  if (!vysledek.ok) return vysledek;
  return { ok: true };
}

export async function nahrejSoubor(
  soubor: File,
): Promise<{ ok: true; navrhy: ApiZpevnikNavrh[] } | { ok: false; chyba: string }> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: "Soubor se nepodařilo nahrát." };
  try {
    const odpoved = await fetch(`${zaklad}/api/zpevnik/import`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": soubor.type.length > 0 ? soubor.type : "application/octet-stream",
      },
      body: soubor,
    });
    const data = await ctiJsonTelo(odpoved);
    if (!odpoved.ok) {
      if (jeRecord(data)) {
        const chyba = data["error"];
        if (jeRecord(chyba)) {
          const podrobnosti = chyba["details"];
          if (jeRecord(podrobnosti)) {
            const soubor = podrobnosti["soubor"];
            if (Array.isArray(soubor) && typeof soubor[0] === "string" && soubor[0].length > 0) {
              return { ok: false, chyba: soubor[0] };
            }
          }
        }
      }
      return chybaZApiTela(data, "Soubor se nepodařilo nahrát.");
    }
    const prisle = jeRecord(data) ? data["navrhy"] : undefined;
    const navrhy = Array.isArray(prisle) ? prisle.filter(jeNavrh) : [];
    return { ok: true, navrhy };
  } catch {
    return { ok: false, chyba: ZAPIS_BEZ_SPOJENI };
  }
}

export async function upravPisen(
  id: string,
  nazev: string,
  autor: string,
  telo: TeloPisne,
): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const vysledek = await posliJson(`/api/zpevnik/${id}`, "PATCH", { nazev, autor, telo });
  if (!vysledek.ok) return vysledek;
  return { ok: true };
}

export async function smazPisen(id: string): Promise<{ ok: true } | { ok: false; chyba: string }> {
  const vysledek = await posliJson(`/api/zpevnik/${id}`, "DELETE");
  if (!vysledek.ok) return vysledek;
  return { ok: true };
}

