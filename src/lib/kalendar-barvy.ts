/**
 * Barvy událostí v kalendáři podle ExApp.pen. Výprava dostane stabilně jednu
 * ze tří palet (terakota, olivová, okr), aby souběžné výpravy šly odlišit.
 * Schůzka je vždy okrová (legenda „Výprava / Schůzka“ v návrhu).
 */
export type BarvaUdalosti = "akcent" | "smrk" | "okr";

const PALETY: readonly BarvaUdalosti[] = ["akcent", "smrk", "okr"];

/** Stabilní barva výpravy podle id (stejná ve všech měsících a pohledech). */
export function barvaVypravy(id: string): BarvaUdalosti {
  let soucet = 0;
  for (let i = 0; i < id.length; i += 1) {
    soucet = (soucet * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETY[soucet % PALETY.length] ?? "akcent";
}

/** Tailwind třídy pro štítek, značku a text v dané barvě. */
export const TRIDY_BARVY: Record<
  BarvaUdalosti,
  { podklad: string; znacka: string; text: string; tecka: string }
> = {
  akcent: { podklad: "bg-akcent-100", znacka: "bg-akcent", text: "text-[#7a3a1b]", tecka: "bg-akcent" },
  smrk: { podklad: "bg-mlha", znacka: "bg-smrk", text: "text-smrk", tecka: "bg-smrk" },
  okr: { podklad: "bg-okr-100", znacka: "bg-okr", text: "text-okr", tecka: "bg-okr" },
};
