/** Rounded to one decimal, but whole numbers stay without ",0". */
export function formatKmZaokrouhlene(km: number): string {
  const zaokrouhleno = Math.round(km * 10) / 10;
  return `${String(zaokrouhleno).replace(".", ",")} km`;
}

/** Czech plural form: 1 výprava, 2–4 výpravy, 0 and 5+ výprav. */
export function ceskyPocet(n: number, jedna: string, dvaAzCtyri: string, jinak: string): string {
  if (n === 1) return jedna;
  if (n >= 2 && n <= 4) return dvaAzCtyri;
  return jinak;
}

/** Always one decimal place, including whole numbers ("12,0 km"). */
export function formatKmNaDesetinu(km: number): string {
  return `${String(km.toFixed(1)).replace(".", ",")} km`;
}
