import type { JSX } from "react";

export interface NeprectenaTeckaProps {
  /** Zobrazit tečku; false = nic nerenderuje (usnadní podmíněné svícení). */
  viditelna?: boolean;
  /** Hustá varianta (8px) pro nadpisy, standard (10px) pro karty. */
  velikost?: "karta" | "nadpis";
  /** Volitelný kontext pro čtečku (název výpravy). */
  nazevVypravy?: string;
}

/**
 * NeprectenaTecka — červená tečka nepřečtené diskuze (Fáze 5, Krok 3).
 *
 * - 8–10 px (nadpis 8px, karta 10px), `pointer-events-none` + `shrink-0`,
 *   takže nikdy nezasahuje do 44px tap-targetu a drží 360px layout.
 * - Přístupnost: `role="status"` + `aria-label="Nepřečtené zprávy"`,
 *   bílý kroužek + tmavý obrys (není jen barvou), kontrast red-800
 *   na papíru ~7:1, viditelný focus se neřeší (nedostává focus).
 * - Token-kontrakt (M1): bílý kroužek VŽDY `ring-2 ring-papir`,
 *   nikdy stínovou arbitrary hodnotou — ring je token design-systému,
 *   stínová arbitrary hodnota ho obchází a rozbíjí konzistenci.
 *   Tmavý obrys drží `border border-inkoust/40`. Bez titulku (mrtvý —
 *   `pointer-events-none` tooltip nikdy nezobrazí a duplikoval by popisek).
 * - `motion-reduce` bez animace (puls jen když je povolený pohyb).
 */
export default function NeprectenaTecka({
  viditelna = true,
  velikost = "karta",
  nazevVypravy,
}: NeprectenaTeckaProps): JSX.Element | null {
  if (!viditelna) return null;

  const rozmer: string = velikost === "nadpis" ? "h-2 w-2" : "h-2.5 w-2.5";
  const cistyNazev: string = (nazevVypravy ?? "").trim();
  const popisek: string =
    cistyNazev.length > 0
      ? `Nepřečtené zprávy v diskuzi výpravy ${cistyNazev}`
      : "Nepřečtené zprávy";

  return (
    <span
      role="status"
      aria-label={popisek}
      data-testid="neprectena-tecka"
      className={`pointer-events-none inline-block shrink-0 rounded-full border border-inkoust/40 bg-red-800 ring-2 ring-papir motion-safe:animate-pulse motion-reduce:animate-none ${rozmer}`}
    />
  );
}
