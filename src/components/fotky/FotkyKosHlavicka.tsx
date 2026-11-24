import type { JSX } from "react";
import {
  fotkyKosAkceObal,
  fotkyTlacitkoOdebrat,
  fotkyTlacitkoPrimarni,
  fotkyTlacitkoSekundarni,
  fotkyTlacitkoSmazat,
} from "./fotky-ui";

interface FotkyKosHlavickaProps {
  maFotky: boolean;
  spravovaciRezim: boolean;
  vybranyPocet: number;
  pracujeSe: boolean;
  onZacniSpravovat: () => void;
  onZrusit: () => void;
  onObnovitVybrane: () => void;
  onObnovitVse: () => void;
  onSmazatNatrvaloVybrane: () => void;
  onSmazatNatrvaloVse: () => void;
}

/**
 * Admin trash actions: restore or permanently delete selected photos.
 */
export default function FotkyKosHlavicka({
  maFotky,
  spravovaciRezim,
  vybranyPocet,
  pracujeSe,
  onZacniSpravovat,
  onZrusit,
  onObnovitVybrane,
  onObnovitVse,
  onSmazatNatrvaloVybrane,
  onSmazatNatrvaloVse,
}: FotkyKosHlavickaProps): JSX.Element | null {
  if (!maFotky) return null;

  if (!spravovaciRezim) {
    return (
      <button type="button" onClick={onZacniSpravovat} className={`${fotkyTlacitkoSekundarni} shrink-0`}>
        Spravovat
      </button>
    );
  }

  return (
    <div className={fotkyKosAkceObal} data-fotky-kos-akce>
      <button
        type="button"
        onClick={onZrusit}
        disabled={pracujeSe}
        className={`${fotkyTlacitkoSekundarni} order-last col-span-2 sm:order-none sm:col-span-1`}
      >
        Zrušit
      </button>

      <div className="contents" data-fotky-kos-skupina-obnovit role="group" aria-label="Obnovit fotky">
        <button type="button" onClick={onObnovitVse} disabled={pracujeSe} className={fotkyTlacitkoSekundarni}>
          Obnovit vše
        </button>
        <button
          type="button"
          onClick={onObnovitVybrane}
          disabled={vybranyPocet === 0 || pracujeSe}
          className={fotkyTlacitkoPrimarni}
          aria-label={
            vybranyPocet > 0 ? `Obnovit vybrané (${vybranyPocet})` : "Obnovit vybrané"
          }
        >
          Obnovit vybrané
        </button>
      </div>

      <div
        className="hidden h-6 w-px shrink-0 bg-linka sm:block"
        aria-hidden
        data-fotky-kos-delic
      />

      <div className="contents" data-fotky-kos-skupina-smazat role="group" aria-label="Smazat natrvalo">
        <button
          type="button"
          onClick={onSmazatNatrvaloVse}
          aria-label="Smazat vše natrvalo"
          disabled={pracujeSe}
          className={fotkyTlacitkoOdebrat}
        >
          Smazat vše
        </button>
        <button
          type="button"
          onClick={onSmazatNatrvaloVybrane}
          disabled={vybranyPocet === 0 || pracujeSe}
          className={fotkyTlacitkoSmazat}
          aria-label={
            vybranyPocet > 0
              ? `Smazat vybrané natrvalo (${vybranyPocet})`
              : "Smazat vybrané natrvalo"
          }
        >
          Smazat vybrané
        </button>
      </div>
    </div>
  );
}
