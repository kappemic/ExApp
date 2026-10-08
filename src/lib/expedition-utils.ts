/**
 * Formátování a výpočty pro výpravy.
 * Čistá business logika bez závislostí na Reactu — UI ji jen konzumuje.
 */

import type { Expedition } from "./mock-expeditions";

const celyDatum = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const denFormat = new Intl.DateTimeFormat("cs-CZ", { day: "numeric" });
const mesicFormat = new Intl.DateTimeFormat("cs-CZ", { month: "short" });
const rokFormat = new Intl.DateTimeFormat("cs-CZ", { year: "numeric" });

export function formatCelyDatum(isoDatum: string): string {
  return celyDatum.format(new Date(`${isoDatum}T12:00:00`));
}

const mesicDlouhyFormat = new Intl.DateTimeFormat("cs-CZ", { month: "long" });

/**
 * Rozsah výpravy od–do: jednodenní → "17. října 2026",
 * vícedenní ve stejném měsíci → "17.–19. října 2026",
 * přes měsíce → "30. října – 2. listopadu 2026", přes roky plně obě data.
 */
export function formatRozsahData(od: string, datumDo: string | null): string {
  if (datumDo === null || datumDo.length === 0 || datumDo === od) {
    return formatCelyDatum(od);
  }
  const start = od.split("-").map(Number);
  const konec = datumDo.split("-").map(Number);
  const r1 = start[0];
  const m1 = start[1];
  const d1 = start[2];
  const r2 = konec[0];
  const m2 = konec[1];
  const d2 = konec[2];
  if (
    r1 === undefined ||
    m1 === undefined ||
    d1 === undefined ||
    r2 === undefined ||
    m2 === undefined ||
    d2 === undefined ||
    !Number.isInteger(r1) ||
    !Number.isInteger(m1) ||
    !Number.isInteger(d1) ||
    !Number.isInteger(r2) ||
    !Number.isInteger(m2) ||
    !Number.isInteger(d2)
  ) {
    return `${formatCelyDatum(od)} – ${formatCelyDatum(datumDo)}`;
  }
  if (r1 === r2 && m1 === m2) {
    const mesic = mesicDlouhyFormat.format(new Date(`${od}T12:00:00`));
    return `${d1}.–${d2}. ${mesic} ${r1}`;
  }
  if (r1 === r2) {
    const mesicOd = mesicDlouhyFormat.format(new Date(`${od}T12:00:00`));
    return `${d1}. ${mesicOd} – ${formatCelyDatum(datumDo)}`;
  }
  return `${formatCelyDatum(od)} – ${formatCelyDatum(datumDo)}`;
}

export function formatDen(isoDatum: string): string {
  return denFormat.format(new Date(`${isoDatum}T12:00:00`));
}

export function formatMesicZkratka(isoDatum: string): string {
  return mesicFormat.format(new Date(`${isoDatum}T12:00:00`)).replace(".", "");
}

export function formatRok(isoDatum: string): string {
  return rokFormat.format(new Date(`${isoDatum}T12:00:00`));
}

export function obsazenostProcenta(expedice: Expedition): number {
  if (expedice.kapacita.celkem <= 0) return 0;
  const pct = Math.round(
    (expedice.kapacita.prihlaseno / expedice.kapacita.celkem) * 100,
  );
  return Math.min(100, Math.max(0, pct));
}

/** Kapacita 0 = bez omezení (prázdné / nula při tvorbě). */
export function jeBezOmezeni(expedice: Expedition): boolean {
  return expedice.kapacita.celkem <= 0;
}

export function volnaMista(expedice: Expedition): number {
  return Math.max(
    0,
    expedice.kapacita.celkem - expedice.kapacita.prihlaseno,
  );
}

export function jeProbehla(expedice: Expedition): boolean {
  return expedice.stav === "proběhlá";
}
