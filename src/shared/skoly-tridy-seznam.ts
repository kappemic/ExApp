/**
 * Static autocomplete for registration. Not read from user rows.
 * Add the club's real school names to SKOLY. Classes cover a typical
 * Czech school (grades 1–9, sections A–C). Free text is still allowed.
 */

const PISMENA = ["A", "B", "C"] as const;

function sestavTridy(): string[] {
  const tridy: string[] = [];
  for (let rocnik = 1; rocnik <= 9; rocnik += 1) {
    for (const pismeno of PISMENA) {
      tridy.push(`${String(rocnik)}.${pismeno}`);
    }
  }
  return tridy;
}

/** School names. Empty until the club list is filled in. */
export const SKOLY: readonly string[] = [];

/** Class labels offered on registration and profile. */
export const TRIDY: readonly string[] = sestavTridy();
