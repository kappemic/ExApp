/**
 * Display deadline for signup sheet — expeditions have no DB column yet.
 * Shows Friday before trip start (or trip date when that falls on/before Friday).
 */
export function zobrazitUzavirkuPrihlaseni(datumYmd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datumYmd)) return datumYmd;
  const start = new Date(`${datumYmd}T12:00:00`);
  if (Number.isNaN(start.getTime())) return datumYmd;
  const den = start.getDay();
  const posun = den === 5 ? 0 : den === 6 ? -1 : den === 0 ? -2 : -(den + 2);
  const uzavirka = new Date(start);
  uzavirka.setDate(start.getDate() + posun);
  const formatter = new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const text = formatter.format(uzavirka);
  return text.charAt(0).toUpperCase() + text.slice(1);
}