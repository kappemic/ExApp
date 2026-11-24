/** Kilometry po měsících pro graf v Žebříčcích („Km podle měsíců“ v ExApp.pen). */

export interface MesicKm {
  /** YYYY-MM */
  klic: string;
  /** „zář“, „říj“ */
  popisek: string;
  km: number;
}

const ZKRATKY = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];

/** Poslední `pocet` měsíců, ve kterých se šlo, od nejstaršího. */
export function kmPodleMesicu(
  trasy: ReadonlyArray<{ datum: string; km: number | null }>,
  pocet = 4,
): MesicKm[] {
  const soucty = new Map<string, number>();
  for (const trasa of trasy) {
    const klic = trasa.datum.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(klic)) continue;
    soucty.set(klic, (soucty.get(klic) ?? 0) + (trasa.km ?? 0));
  }
  return [...soucty.keys()]
    .sort()
    .slice(-pocet)
    .map((klic) => ({
      klic,
      popisek: ZKRATKY[Number(klic.slice(5)) - 1] ?? "",
      km: Math.round((soucty.get(klic) ?? 0) * 10) / 10,
    }));
}

/** Školní sezóna začíná v září: „2026/27“. */
export function sezona(dnes: Date): string {
  const rok = dnes.getMonth() >= 8 ? dnes.getFullYear() : dnes.getFullYear() - 1;
  return `${rok}/${String((rok + 1) % 100).padStart(2, "0")}`;
}

/** Celé názvy měsíců, index 0 = leden. */
export const NAZVY_MESICU = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
] as const;

type TrasaKm = { datum: string; km: number | null };

export interface RokKm {
  rok: number;
  km: number;
  vypravy: number;
  /** Vždy 12 měsíců od ledna, i prázdné. */
  mesice: MesicKm[];
}

function naDesetinu(km: number): number {
  return Math.round(km * 10) / 10;
}

/** Součet kilometrů na desetinu, výpravy bez kilometrů se počítají jako nula. */
export function soucetKm(trasy: ReadonlyArray<TrasaKm>): number {
  return naDesetinu(trasy.reduce((soucet, trasa) => soucet + (trasa.km ?? 0), 0));
}

/** Všech 12 měsíců roku od ledna. Měsíc bez výprav má nulu, aby šly měsíce porovnat. */
export function mesiceRoku(trasy: ReadonlyArray<TrasaKm>, rok: number): MesicKm[] {
  return ZKRATKY.map((popisek, index) => {
    const klic = `${rok}-${String(index + 1).padStart(2, "0")}`;
    return { klic, popisek, km: soucetKm(trasy.filter((trasa) => trasa.datum.startsWith(klic))) };
  });
}

/** Roky od první výpravy po poslední, nejstarší první. Rok bez výprav uprostřed nechybí. */
export function kmPodleLet(trasy: ReadonlyArray<TrasaKm>): RokKm[] {
  const roky = trasy
    .filter((trasa) => /^\d{4}-\d{2}/.test(trasa.datum))
    .map((trasa) => Number(trasa.datum.slice(0, 4)));
  if (roky.length === 0) return [];
  const prvni = Math.min(...roky);
  const posledni = Math.max(...roky);
  return Array.from({ length: posledni - prvni + 1 }, (_, posun) => {
    const rok = prvni + posun;
    const vRoce = trasy.filter((trasa) => trasa.datum.startsWith(`${rok}-`));
    return { rok, km: soucetKm(vRoce), vypravy: vRoce.length, mesice: mesiceRoku(vRoce, rok) };
  });
}

/** „říjen 2026“ z klíče YYYY-MM. */
export function nazevMesice(klic: string): string {
  return `${NAZVY_MESICU[Number(klic.slice(5, 7)) - 1] ?? ""} ${klic.slice(0, 4)}`.trim();
}
