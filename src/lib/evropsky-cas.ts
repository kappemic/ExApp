/** Pole ukazuje i ukládá `HH:MM` (návrh ExApp.pen), napsaná tečka se převede. */

const ISO_CAS = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `18:30` zůstane, cokoli jiného dá prázdno. */
export function isoCasNaEvropsky(cas: string): string {
  const shoda = ISO_CAS.exec(cas.trim());
  if (shoda === null) return "";
  return `${shoda[1]}:${shoda[2]}`;
}

/** `18:30` i `18.30` → `18:30`, jinak null, když čas není dopsaný. */
export function evropskyNaIsoCas(text: string): string | null {
  const shoda = /^([01]\d|2[0-3])[.:]([0-5]\d)$/.exec(text.trim());
  if (shoda === null) return null;
  return `${shoda[1]}:${shoda[2]}`;
}

/** Nechá číslice a doplní dvojtečku, nejvýš HH:MM. */
export function maskaEvropskehoCasu(vstup: string): string {
  const cislice = vstup.replace(/\D/g, "").slice(0, 4);
  if (cislice.length <= 2) return cislice;
  return `${cislice.slice(0, 2)}:${cislice.slice(2)}`;
}

/** Čas pro zobrazení podle návrhu: `09:30` → `9:30`. Cokoli jiného dá prázdno. */
export function casKZobrazeni(cas: string): string {
  const shoda = ISO_CAS.exec(cas.trim());
  if (shoda === null) return "";
  return `${Number(shoda[1])}:${shoda[2]}`;
}
