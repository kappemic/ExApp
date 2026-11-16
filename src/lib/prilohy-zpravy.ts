import { apiBase } from "./api-base";
import { VALIDACE, type ApiZpravaPriloha } from "../shared/api-types";

/** Same Czech copy as the server file check (`hlaskaSouboru`). */
export const CHYBA_PRILOHA_VELIKOST = "Soubor může mít nejvýš 10 MB.";
export const CHYBA_PRILOHA_FORMAT = "Ten typ souboru nejde přiložit.";
export const CHYBA_PRILOHA_POCET = "K jedné zprávě jde přiložit nejvýš 5 souborů.";

const POVOLENE = new Set<string>(VALIDACE.prilohaPovolenePripony);

/** `accept` for the file input. The client still checks every file. */
export function acceptPriloh(): string {
  return VALIDACE.prilohaPovolenePripony.map((pripona) => `.${pripona}`).join(",");
}

/**
 * Allowlisted extension from the basename. Mirrors the server rule:
 * last `.ext` of 1–10 alphanumerics, lowercased.
 */
export function priponaPrilohy(nazev: string): string | null {
  const bezKontrol = nazev.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, "");
  const casti = bezKontrol.split(/[/\\]/);
  const bazovy = (casti[casti.length - 1] ?? "").replace(/["\\]/g, "").trim();
  const shoda = /\.([A-Za-z0-9]{1,10})$/.exec(bazovy);
  const pripona = shoda?.[1]?.toLowerCase() ?? "";
  if (!POVOLENE.has(pripona)) return null;
  return pripona;
}

export interface VysledekPriloh {
  soubory: File[];
  /** First problem in this pick. Accepted files stay in `soubory`. */
  chyba: string | null;
}

/**
 * Adds files that pass size, extension, and the cap of 5.
 * A bad file is skipped and reported; it is never queued for upload.
 */
export function pridejPrilohy(
  stavajici: readonly File[],
  nove: readonly File[],
): VysledekPriloh {
  const soubory: File[] = [...stavajici];
  let chyba: string | null = null;
  for (const soubor of nove) {
    if (priponaPrilohy(soubor.name) === null) {
      if (chyba === null) chyba = CHYBA_PRILOHA_FORMAT;
      continue;
    }
    if (soubor.size > VALIDACE.prilohaMaxBajtu) {
      if (chyba === null) chyba = CHYBA_PRILOHA_VELIKOST;
      continue;
    }
    if (soubory.length >= VALIDACE.prilohyMaxPocet) {
      if (chyba === null) chyba = CHYBA_PRILOHA_POCET;
      continue;
    }
    soubory.push(soubor);
  }
  return { soubory, chyba };
}

/** Cookie-authenticated stream. Empty API base stays a same-origin path. */
export function urlPrilohyZpravy(id: string): string {
  return `${apiBase()}/api/diskuze/prilohy/${encodeURIComponent(id)}`;
}

/** Short Czech size for a chip or a download link. */
export function formatVelikostiPrilohy(bajty: number): string {
  if (!Number.isFinite(bajty) || bajty < 0) return "0 B";
  if (bajty < 1024) return `${Math.round(bajty)} B`;
  if (bajty < 1024 * 1024) {
    const kb = bajty / 1024;
    const text = kb >= 10 ? kb.toFixed(0) : kb.toFixed(1);
    return `${text.replace(".", ",")} kB`;
  }
  const mb = bajty / (1024 * 1024);
  const text = mb >= 10 ? mb.toFixed(0) : mb.toFixed(1);
  return `${text.replace(".", ",")} MB`;
}

/** Placeholder rows so a file-only send is visible before the server answers. */
export function optimistickePrilohy(soubory: readonly File[]): ApiZpravaPriloha[] {
  return soubory.map((soubor, index) => ({
    id: `optimistic-soubor-${index}-${soubor.size}`,
    nazev: soubor.name.trim().length > 0 ? soubor.name : "soubor",
    bajty: soubor.size,
    contentType: soubor.type.length > 0 ? soubor.type : "application/octet-stream",
    jeObrazek: false,
  }));
}
