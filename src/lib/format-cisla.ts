/** Rounded to one decimal, but whole numbers stay without ",0". */
export function formatKmZaokrouhlene(km: number): string {
  const zaokrouhleno = Math.round(km * 10) / 10;
  return `${String(zaokrouhleno).replace(".", ",")} km`;
}

/** Always one decimal place, including whole numbers ("12,0 km"). */
export function formatKmNaDesetinu(km: number): string {
  return `${String(km.toFixed(1)).replace(".", ",")} km`;
}
