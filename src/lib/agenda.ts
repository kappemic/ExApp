import { udalostiProTyden, type KalendarniUdalost, type UdalostiVstup } from "./kalendar";

export interface PolozkaAgendy {
  /** Den výskytu YYYY-MM-DD; u vícedenní výpravy první den v okně. */
  datum: string;
  udalost: KalendarniUdalost;
}

function posunDen(ymd: string, dni: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + dni);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${den}`;
}

/** True once today's clock has moved past a meeting's HH:MM. */
export function schuzkaUzSkoncila(
  datum: string,
  cas: string | null | undefined,
  dnesYmd: string,
  tedHm: string,
): boolean {
  if (datum !== dnesYmd) return false;
  if (cas === null || cas === undefined || !/^\d{2}:\d{2}$/.test(cas)) return false;
  return cas < tedHm;
}

/**
 * Nejbližší schůzky a výpravy od dneška na `dni` dopředu (včetně
 * opakovaných schůzek). Vícedenní výprava se objeví jen jednou.
 * Řazeno podle data, schůzky v rámci dne před výpravami.
 * Dnešní schůzka s časem zmizí, jakmile ten čas uplyne.
 */
export function nejblizsiAgenda(
  vstup: UdalostiVstup,
  dnesYmd: string,
  dni = 14,
  limit = 6,
  tedHm = "",
): PolozkaAgendy[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dnesYmd)) return [];
  const konec = posunDen(dnesYmd, dni);
  const vsechny = new Map<string, KalendarniUdalost[]>();
  for (let posun = 0; posun <= dni; posun += 7) {
    for (const [den, seznam] of udalostiProTyden(vstup, posunDen(dnesYmd, posun))) {
      if (!vsechny.has(den)) vsechny.set(den, seznam);
    }
  }
  const videne = new Set<string>();
  const vysledek: PolozkaAgendy[] = [];
  for (const den of [...vsechny.keys()].sort()) {
    if (den < dnesYmd || den > konec) continue;
    const seznam = [...(vsechny.get(den) ?? [])].sort((a, b) => {
      if (a.typ !== b.typ) return a.typ === "schuzka" ? -1 : 1;
      return (a.cas ?? "99:99").localeCompare(b.cas ?? "99:99");
    });
    for (const udalost of seznam) {
      if (
        udalost.typ === "schuzka" &&
        schuzkaUzSkoncila(den, udalost.cas, dnesYmd, tedHm)
      ) {
        continue;
      }
      const klic = udalost.typ === "vyprava" ? `v:${udalost.id}` : `s:${udalost.id}:${den}`;
      if (videne.has(klic)) continue;
      videne.add(klic);
      vysledek.push({ datum: den, udalost });
    }
  }
  return vysledek.slice(0, limit);
}
