/**
 * Archive writes stay closed until the trip is marked proběhlá,
 * or until its end date is already in the past (Neuzavřené).
 */

export function dnesniDatumYmd(ted: Date = new Date()): string {
  const rok = ted.getFullYear();
  const mesic = String(ted.getMonth() + 1).padStart(2, "0");
  const den = String(ted.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

export function konecVypravyYmd(
  datum: string,
  datumDo: string | null,
): string {
  const od = datum.slice(0, 10);
  if (datumDo === null || datumDo.length === 0) return od;
  return datumDo.slice(0, 10);
}

export function lzeDoplnitArchiv(
  vstup: { stav: string; datum: string; datumDo: string | null },
  dnes?: string,
): boolean {
  if (vstup.stav === "proběhlá") return true;
  const dnesYmd = dnes ?? dnesniDatumYmd();
  return konecVypravyYmd(vstup.datum, vstup.datumDo) < dnesYmd;
}
