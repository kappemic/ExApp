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

export function volnaMista(expedice: Expedition): number {
  return Math.max(
    0,
    expedice.kapacita.celkem - expedice.kapacita.prihlaseno,
  );
}

export function jeProbehla(expedice: Expedition): boolean {
  return expedice.stav === "proběhlá";
}
