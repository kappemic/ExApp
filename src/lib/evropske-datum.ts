/** European entry format is day.month.year. Stored values stay ISO. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function jeIsoDatum(hodnota: string): boolean {
  return evropskeNaIso(isoNaEvropske(hodnota)) === hodnota.trim();
}

/** `2026-10-19` → `19.10.2026`. Anything else becomes empty. */
export function isoNaEvropske(iso: string): string {
  const shoda = ISO.exec(iso.trim());
  if (shoda === null) return "";
  const evropske = `${shoda[3]}.${shoda[2]}.${shoda[1]}`;
  return evropskeNaIso(evropske) === iso.trim() ? evropske : "";
}

/** `19.10.2026` or `19.10.2026` with a short day → ISO, or null when incomplete or impossible. */
export function evropskeNaIso(text: string): string | null {
  const shoda = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  if (shoda === null) return null;
  const den = Number(shoda[1]);
  const mesic = Number(shoda[2]);
  const rok = Number(shoda[3]);
  if (mesic < 1 || mesic > 12 || den < 1 || den > 31) return null;
  const iso = `${String(rok).padStart(4, "0")}-${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
  const kontrola = new Date(`${iso}T12:00:00`);
  if (
    kontrola.getFullYear() !== rok ||
    kontrola.getMonth() + 1 !== mesic ||
    kontrola.getDate() !== den
  ) {
    return null;
  }
  return iso;
}

/** Keep digits in day-month-year order and insert the dots while typing. */
export function maskaEvropskehoData(vstup: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(vstup.trim());
  if (iso !== null) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const cislice = vstup.replace(/\D/g, "").slice(0, 8);
  const den = cislice.slice(0, 2);
  const mesic = cislice.slice(2, 4);
  const rok = cislice.slice(4, 8);
  if (cislice.length <= 2) return den;
  if (cislice.length <= 4) return `${den}.${mesic}`;
  return `${den}.${mesic}.${rok}`;
}
