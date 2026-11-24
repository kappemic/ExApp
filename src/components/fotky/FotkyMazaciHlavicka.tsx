import type { JSX } from "react";
import {
  fotkyLightboxIkona,
  fotkyTlacitkoOdebrat,
  fotkyTlacitkoSekundarni,
  fotkyTlacitkoSmazat,
  fotkyTlacitkoZaklad,
} from "./fotky-ui";

interface FotkyMazaciHlavickaProps {
  isAdmin: boolean;
  maFotky: boolean;
  mazaciRezim: boolean;
  vybranyPocet: number;
  mazeSe: boolean;
  onZacniMazani: () => void;
  onZrusMazani: () => void;
  onSmazatVybrane: () => void;
  onSmazatVse: () => void;
  /** Lightbox: trash glyph only, no paper chip. */
  bezRamce?: boolean;
}

/**
 * Admin delete controls for a top bar next to close.
 * "Smazat vše" is shown only in delete mode.
 */
export default function FotkyMazaciHlavicka({
  isAdmin,
  maFotky,
  mazaciRezim,
  vybranyPocet,
  mazeSe,
  onZacniMazani,
  onZrusMazani,
  onSmazatVybrane,
  onSmazatVse,
  bezRamce = false,
}: FotkyMazaciHlavickaProps): JSX.Element | null {
  if (!isAdmin || !maFotky) return null;

  if (!mazaciRezim) {
    return (
      <button
        type="button"
        onClick={onZacniMazani}
        aria-label="Smazat"
        title="Smazat"
        className={
          bezRamce
            ? fotkyLightboxIkona
            : `${fotkyTlacitkoZaklad} nahled-press h-11 w-11 rounded-xl border border-pole bg-povrch p-0 text-inkoust`
        }
      >
        <IkonaKos />
      </button>
    );
  }

  return (
    <div
      className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end"
      data-fotky-mazaci-akce
      role="group"
      aria-label="Mazání fotek"
    >
      <button
        type="button"
        onClick={onZrusMazani}
        disabled={mazeSe}
        className={`${fotkyTlacitkoSekundarni} order-2 w-full sm:order-1 sm:w-auto`}
      >
        Zrušit
      </button>
      <button
        type="button"
        onClick={onSmazatVybrane}
        disabled={vybranyPocet === 0 || mazeSe}
        className={`${fotkyTlacitkoSmazat} order-1 col-span-2 w-full sm:order-3 sm:w-auto`}
      >
        Smazat vybrané
      </button>
      <button
        type="button"
        onClick={onSmazatVse}
        disabled={mazeSe}
        className={`${fotkyTlacitkoOdebrat} order-3 w-full sm:order-2 sm:w-auto`}
      >
        Smazat vše
      </button>
    </div>
  );
}

function IkonaKos(): JSX.Element {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4.5 7h15M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7M7 7l.8 12.2A1.2 1.2 0 0 0 9 20.2h6a1.2 1.2 0 0 0 1.2-1L17 7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
