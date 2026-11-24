/** Náhled odkazu ve zprávě (GET /api/nahled-odkazu?url=…). */
import type { BodMapy } from "../odkazy";

export const NAHLED_ODKAZU_PATH = "/api/nahled-odkazu" as const;

export interface NahledOdkazu {
  /** Adresa, kterou zpráva obsahuje. */
  url: string;
  druh: "mapa" | "web";
  /** Doména pro popisek, třeba „mapy.com“. */
  web: string;
  titulek: string | null;
  popis: string | null;
  obrazekUrl: string | null;
  bod: BodMapy | null;
}

export interface NahledOdkazuResponse {
  /** null, když stránka náhled nemá nebo neodpověděla. */
  nahled: NahledOdkazu | null;
}

function jeTextNeboNull(hodnota: unknown): hodnota is string | null {
  return hodnota === null || typeof hodnota === "string";
}

function jeBodNeboNull(hodnota: unknown): hodnota is BodMapy | null {
  if (hodnota === null) return true;
  if (typeof hodnota !== "object") return false;
  const bod = hodnota as Record<string, unknown>;
  return (
    typeof bod["lat"] === "number" &&
    typeof bod["lon"] === "number" &&
    (bod["zoom"] === null || typeof bod["zoom"] === "number")
  );
}

export function jeNahledOdkazuOdpoved(hodnota: unknown): hodnota is NahledOdkazuResponse {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const nahled = (hodnota as Record<string, unknown>)["nahled"];
  if (nahled === null) return true;
  if (typeof nahled !== "object" || nahled === undefined) return false;
  const radek = nahled as Record<string, unknown>;
  return (
    typeof radek["url"] === "string" &&
    (radek["druh"] === "mapa" || radek["druh"] === "web") &&
    typeof radek["web"] === "string" &&
    jeTextNeboNull(radek["titulek"]) &&
    jeTextNeboNull(radek["popis"]) &&
    jeTextNeboNull(radek["obrazekUrl"]) &&
    jeBodNeboNull(radek["bod"])
  );
}
