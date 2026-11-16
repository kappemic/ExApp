/** European entry is 24-hour `HH.MM`. Stored values stay `HH:MM`. */

const ISO_CAS = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `18:30` → `18.30`. Anything else becomes empty. */
export function isoCasNaEvropsky(cas: string): string {
  const shoda = ISO_CAS.exec(cas.trim());
  if (shoda === null) return "";
  return `${shoda[1]}.${shoda[2]}`;
}

/** `18.30` → `18:30`, or null when the text is not a finished time. */
export function evropskyNaIsoCas(text: string): string | null {
  const shoda = /^([01]\d|2[0-3])\.([0-5]\d)$/.exec(text.trim());
  if (shoda === null) return null;
  return `${shoda[1]}:${shoda[2]}`;
}

/** Keep digits and insert the dot while typing, capped at HH.MM. */
export function maskaEvropskehoCasu(vstup: string): string {
  const cislice = vstup.replace(/\D/g, "").slice(0, 4);
  if (cislice.length <= 2) return cislice;
  return `${cislice.slice(0, 2)}.${cislice.slice(2)}`;
}
