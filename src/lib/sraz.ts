/**
 * Sraz výpravy je v datech jeden řetězec, třeba „Hlavní nádraží, 6:30“.
 * Návrh ho ukazuje rozdělený na čas („6:30 sraz“) a místo.
 */
export function rozlozSraz(sraz: string): { cas: string | null; misto: string } {
  const cisty = sraz.trim();
  const shoda = /(\d{1,2}[:.]\d{2})/.exec(cisty);
  if (shoda === null) return { cas: null, misto: cisty };
  const cas = shoda[1].replace(".", ":");
  const misto = cisty
    .replace(shoda[0], "")
    .replace(/\s*,\s*$/, "")
    .replace(/^\s*,\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { cas, misto };
}

const DEN_KRATKY = ["ne", "po", "út", "st", "čt", "pá", "so"];
const MESIC_GEN = [
  "ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince",
];

/** „PÁ 11. – NE 13. PROSINCE“ (velkými písmeny řeší CSS). */
export function rozsahDnu(od: string, doDne: string | null): string {
  const a = new Date(`${od}T12:00:00`);
  if (doDne === null) return `${DEN_KRATKY[a.getDay()]} ${a.getDate()}. ${MESIC_GEN[a.getMonth()]}`;
  const b = new Date(`${doDne}T12:00:00`);
  const zacatek = `${DEN_KRATKY[a.getDay()]} ${a.getDate()}.`;
  const konec = `${DEN_KRATKY[b.getDay()]} ${b.getDate()}. ${MESIC_GEN[b.getMonth()]}`;
  return a.getMonth() === b.getMonth() ? `${zacatek} – ${konec}` : `${zacatek} ${MESIC_GEN[a.getMonth()]} – ${konec}`;
}

/** Počet dní včetně krajních. */
export function pocetDni(od: string, doDne: string | null): number {
  if (doDne === null || doDne.length === 0 || doDne <= od) return 1;
  const a = Date.parse(`${od}T12:00:00`);
  const b = Date.parse(`${doDne}T12:00:00`);
  return Math.round((b - a) / 86_400_000) + 1;
}
