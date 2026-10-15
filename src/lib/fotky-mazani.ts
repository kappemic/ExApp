import { KOS_RETENTION_DAYS } from "../shared/fotky-kos";

/** Prefer id captured when confirm opened; lightbox index may change or close. */
export function idAktualniFotkyProPotvrzeni(
  idPriOtevreni: string | null | undefined,
  idZLightboxu: string | null | undefined,
): string | null {
  const ulozene = idPriOtevreni?.trim();
  if (ulozene !== undefined && ulozene.length > 0) return ulozene;
  const live = idZLightboxu?.trim();
  if (live !== undefined && live.length > 0) return live;
  return null;
}

/** Which delete confirmation is open. */
export type PotvrzeniMazaniFotek =
  | "vybrane"
  | "vse"
  | "aktualni"
  | "natrvalo_vybrane"
  | "natrvalo_vse";

/** Photo ids to delete for the active confirmation. */
export function idsFotekKeSmazani(
  fotky: readonly { id: string }[],
  vybrane: ReadonlySet<string>,
  potvrzeni: PotvrzeniMazaniFotek,
  aktualniId?: string | null,
): string[] {
  if (potvrzeni === "aktualni") {
    return aktualniId !== undefined && aktualniId !== null && aktualniId.length > 0
      ? [aktualniId]
      : [];
  }
  if (potvrzeni === "vse" || potvrzeni === "natrvalo_vse") {
    return fotky.map((fotka) => fotka.id);
  }
  if (potvrzeni === "natrvalo_vybrane" || potvrzeni === "vybrane") {
    return fotky.filter((fotka) => vybrane.has(fotka.id)).map((fotka) => fotka.id);
  }
  return [];
}

export function nadpisPotvrzeniMazaniFotek(
  potvrzeni: PotvrzeniMazaniFotek,
  doKose: boolean,
): string {
  if (potvrzeni === "aktualni") return "Jsi si jistý?";
  if (potvrzeni === "natrvalo_vse") return "Smazat vše natrvalo?";
  if (potvrzeni === "natrvalo_vybrane") return "Smazat vybrané natrvalo?";
  if (potvrzeni === "vse") return doKose ? "Přesunout vše do koše?" : "Smazat všechny fotky?";
  return doKose ? "Přesunout vybrané do koše?" : "Smazat vybrané fotky?";
}

export function popisPotvrzeniMazaniFotek(
  potvrzeni: PotvrzeniMazaniFotek,
  pocet: number,
  doKose: boolean,
): string {
  if (potvrzeni === "aktualni") {
    return doKose
      ? `Fotka se přesune do koše. Po ${KOS_RETENTION_DAYS} dnech se smaže natrvalo, dřív ji můžeš obnovit.`
      : "Opravdu smazat tuto fotku? Tahle akce nejde vzít zpět.";
  }
  if (potvrzeni === "natrvalo_vse") {
    return "Fotky zmizí z koše i ze serveru. Tahle akce nejde vzít zpět.";
  }
  if (potvrzeni === "natrvalo_vybrane") {
    const n = Math.max(0, pocet);
    if (n === 1) return "Fotka zmizí z koše i ze serveru. Tahle akce nejde vzít zpět.";
    return `${n} fotek zmizí z koše i ze serveru. Tahle akce nejde vzít zpět.`;
  }
  if (potvrzeni === "vse") {
    return doKose
      ? "Všechny fotky v tomto albu se přesunou do koše."
      : "Opravdu smazat všechny fotky v tomto albu? Tahle akce nejde vzít zpět.";
  }
  const n = Math.max(0, pocet);
  if (n === 1) {
    return doKose
      ? "Jedna vybraná fotka se přesune do koše."
      : "Opravdu smazat jednu vybranou fotku?";
  }
  return doKose
    ? `${n} vybraných fotek se přesune do koše.`
    : `Opravdu smazat ${n} vybraných fotek? Tahle akce nejde vzít zpět.`;
}

export type PotvrzeniObnovyFotek = "vybrane" | "vse" | "aktualni";

export function idsFotekKObnove(
  fotky: readonly { id: string }[],
  vybrane: ReadonlySet<string>,
  potvrzeni: PotvrzeniObnovyFotek,
  aktualniId?: string | null,
): string[] {
  if (potvrzeni === "aktualni") {
    return aktualniId !== undefined && aktualniId !== null && aktualniId.length > 0
      ? [aktualniId]
      : [];
  }
  if (potvrzeni === "vse") return fotky.map((fotka) => fotka.id);
  return fotky.filter((fotka) => vybrane.has(fotka.id)).map((fotka) => fotka.id);
}

export function nadpisPotvrzeniObnovy(potvrzeni: PotvrzeniObnovyFotek): string {
  if (potvrzeni === "aktualni") return "Obnovit fotku?";
  return potvrzeni === "vse" ? "Obnovit všechny fotky?" : "Obnovit vybrané fotky?";
}

export function popisPotvrzeniObnovy(potvrzeni: PotvrzeniObnovyFotek, pocet: number): string {
  if (potvrzeni === "aktualni") {
    return "Fotka se vrátí do původního alba.";
  }
  if (potvrzeni === "vse") {
    return "Všechny fotky v koši se vrátí do původních alb.";
  }
  const n = Math.max(0, pocet);
  if (n === 1) return "Jedna vybraná fotka se vrátí do původního alba.";
  return `${n} vybraných fotek se vrátí do původních alb.`;
}
