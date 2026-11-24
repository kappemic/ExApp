import { useEffect, useState } from "react";
import { apiBase } from "./api-base";
import { getExpeditionsSync } from "./expeditions-api";
import { formatRozsahData } from "./expedition-utils";
import { NAHLED_ODKAZU_PATH, jeNahledOdkazuOdpoved, type NahledOdkazu } from "../shared/api-types";
import { maNahled, rozparsujMapu, webOdkazu } from "../shared/odkazy";

/** Náhled odkazu pro zprávu; výprava z ExAppu navíc k tomu, co umí server. */
export type NahledVeZprave = Omit<NahledOdkazu, "druh"> & { druh: NahledOdkazu["druh"] | "vyprava" };

const rozpracovane = new Map<string, Promise<NahledVeZprave | null>>();
const hotove = new Map<string, NahledVeZprave | null>();

/** Odkaz na výpravu v ExAppu vede do aplikace, náhled má z paměti klienta. */
export function cestaVAplikaci(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const cil = new URL(url);
    return cil.origin === window.location.origin ? `${cil.pathname}${cil.search}${cil.hash}` : null;
  } catch {
    return null;
  }
}

function nahledVypravy(url: string): NahledVeZprave | null {
  const cesta = cestaVAplikaci(url);
  const id = cesta === null ? undefined : /^\/vypravy\/([^/?#]+)/.exec(cesta)?.[1];
  if (id === undefined) return null;
  const vyprava = getExpeditionsSync().data.find((v) => v.id === decodeURIComponent(id));
  if (vyprava === undefined) return null;
  return {
    url,
    druh: "vyprava",
    web: "Výprava v ExAppu",
    titulek: vyprava.nazev,
    popis: formatRozsahData(vyprava.datum, vyprava.datumDo),
    obrazekUrl: null,
    bod: null,
  };
}

/** Náhled bez sítě: výprava v aplikaci, nebo mapa s bodem přímo v adrese. */
export function mistniNahled(url: string): NahledVeZprave | null {
  const vyprava = nahledVypravy(url);
  if (vyprava !== null) return vyprava;
  const mapa = rozparsujMapu(url);
  if (mapa === null || mapa.bod === null) return null;
  return {
    url,
    druh: "mapa",
    web: webOdkazu(url),
    titulek: mapa.nazev,
    popis: mapa.poskytovatel,
    obrazekUrl: null,
    bod: mapa.bod,
  };
}

async function stahni(url: string): Promise<NahledVeZprave | null> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return null;
  const odpoved = await fetch(`${zaklad}${NAHLED_ODKAZU_PATH}?${new URLSearchParams({ url }).toString()}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!odpoved.ok) return null;
  const telo: unknown = await odpoved.json();
  return jeNahledOdkazuOdpoved(telo) ? telo.nahled : null;
}

function nactiNahled(url: string): Promise<NahledVeZprave | null> {
  const bezi = rozpracovane.get(url);
  if (bezi !== undefined) return bezi;
  const slib = stahni(url)
    .then((nahled) => {
      hotove.set(url, nahled);
      return nahled;
    })
    .catch(() => null)
    .finally(() => rozpracovane.delete(url));
  rozpracovane.set(url, slib);
  return slib;
}

/** `undefined` = ještě se načítá, `null` = náhled není. */
export function useNahledOdkazu(url: string | null): NahledVeZprave | null | undefined {
  const mistni = url === null ? null : mistniNahled(url);
  const zeServeru = url !== null && mistni === null && maNahled(url);
  const [stav, setStav] = useState<{ url: string; nahled: NahledVeZprave | null } | null>(null);

  useEffect(() => {
    if (url === null || !zeServeru || hotove.has(url)) return;
    let zive = true;
    void nactiNahled(url).then((nahled) => {
      if (zive) setStav({ url, nahled });
    });
    return () => {
      zive = false;
    };
  }, [url, zeServeru]);

  if (url === null) return null;
  if (mistni !== null) return mistni;
  if (!zeServeru) return null;
  if (hotove.has(url)) return hotove.get(url) ?? null;
  return stav !== null && stav.url === url ? stav.nahled : undefined;
}
