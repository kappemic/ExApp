import type { DiskuzeVysledek } from "./diskuze-api";
import type { ApiZprava, ZpravyListResponse } from "../shared/api-types";

/** Photos from one author within this gap belong to one burst. */
export const DAVKA_FOTEK_MS = 3 * 60 * 1000;

/** One image sent in a chat thread. Optimistic rows are left out. */
export interface ChatFotka {
  id: string;
  nazev: string;
  createdAt: string;
  autor: string;
}

export function fotkyZeZprav(zpravy: readonly ApiZprava[]): ChatFotka[] {
  const fotky: ChatFotka[] = [];
  for (const zprava of zpravy) {
    if (zprava.id.startsWith("optimistic-")) continue;
    for (const priloha of zprava.prilohy) {
      if (!priloha.jeObrazek || priloha.id.startsWith("optimistic-")) continue;
      fotky.push({
        id: priloha.id,
        nazev: priloha.nazev,
        createdAt: zprava.createdAt,
        autor: zprava.authorName,
      });
    }
  }
  return fotky;
}

/**
 * Walks an ascending thread until `nextCursor` is empty.
 * Callers that already return the whole thread finish in one step.
 */
export async function nactiFotkyVlakna(
  nactiStranku: (cursor?: string) => Promise<DiskuzeVysledek<ZpravyListResponse>>,
): Promise<{ ok: true; fotky: ChatFotka[] } | { ok: false; chyba: string }> {
  const zpravy: ApiZprava[] = [];
  let cursor: string | undefined;
  const videne = new Set<string>();
  for (let krok = 0; krok < 40; krok += 1) {
    const vysledek = await nactiStranku(cursor);
    if (!vysledek.ok) return { ok: false, chyba: vysledek.chyba };
    zpravy.push(...vysledek.data.zpravy);
    const dalsi = vysledek.data.nextCursor;
    if (dalsi === null || dalsi.length === 0 || videne.has(dalsi)) break;
    videne.add(dalsi);
    cursor = dalsi;
  }
  return { ok: true, fotky: fotkyZeZprav(zpravy) };
}

/** A message that is only images, so it can join a photo burst. */
export function jeCisteFotkovaZprava(zprava: ApiZprava): boolean {
  if (zprava.text.trim().length > 0) return false;
  const obrazky = zprava.prilohy.filter((priloha) => priloha.jeObrazek);
  return obrazky.length > 0 && obrazky.length === zprava.prilohy.length;
}

function navazujeDavka(predchozi: string, dalsi: string): boolean {
  const od = Date.parse(predchozi);
  const po = Date.parse(dalsi);
  if (!Number.isFinite(od) || !Number.isFinite(po)) return false;
  const rozdil = po - od;
  return rozdil >= 0 && rozdil <= DAVKA_FOTEK_MS;
}

export type RadekVlakna =
  | { druh: "zprava"; zprava: ApiZprava }
  | { druh: "davka"; zpravy: ApiZprava[] };

/**
 * Image-only messages from the same author within `DAVKA_FOTEK_MS`
 * become one burst. Text, files, or another author start a new row.
 */
export function seskupRadkyVlakna(zpravy: readonly ApiZprava[]): RadekVlakna[] {
  const radky: RadekVlakna[] = [];
  for (const zprava of zpravy) {
    const posledni = radky[radky.length - 1];
    const predchozi = posledni?.druh === "davka" ? posledni.zpravy[posledni.zpravy.length - 1] : undefined;
    if (
      posledni?.druh === "davka" &&
      predchozi !== undefined &&
      jeCisteFotkovaZprava(zprava) &&
      predchozi.autorId === zprava.autorId &&
      navazujeDavka(predchozi.createdAt, zprava.createdAt)
    ) {
      posledni.zpravy.push(zprava);
      continue;
    }
    if (jeCisteFotkovaZprava(zprava)) {
      radky.push({ druh: "davka", zpravy: [zprava] });
    } else {
      radky.push({ druh: "zprava", zprava });
    }
  }
  return radky;
}

export interface DavkaChatFotek {
  key: string;
  autor: string;
  od: string;
  fotky: ChatFotka[];
}

/** Same burst rule as the thread, applied to the flat lightroom list. */
export function seskupDavkyChatFotek(fotky: readonly ChatFotka[]): DavkaChatFotek[] {
  const davky: DavkaChatFotek[] = [];
  for (const fotka of fotky) {
    const posledni = davky[davky.length - 1];
    const predchozi = posledni?.fotky[posledni.fotky.length - 1];
    if (
      posledni !== undefined &&
      predchozi !== undefined &&
      predchozi.autor === fotka.autor &&
      navazujeDavka(predchozi.createdAt, fotka.createdAt)
    ) {
      posledni.fotky.push(fotka);
      continue;
    }
    davky.push({ key: fotka.id, autor: fotka.autor, od: fotka.createdAt, fotky: [fotka] });
  }
  return davky;
}
