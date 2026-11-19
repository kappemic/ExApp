import type { JSX } from "react";
import { fotkyHoverBgSmrk, fotkyTlacitkoSekundarni, fotkyTlacitkoZaklad } from "./fotky-ui";

interface FotkyStahovaciHlavickaProps {
  maFotky: boolean;
  stahovaciRezim: boolean;
  vybranyPocet: number;
  stahujeSe: boolean;
  onZacniStahovani: () => void;
  onZrusStahovani: () => void;
  onStahnoutVybrane: () => void;
  onStahnoutVse: () => void;
}

/**
 * Download controls for album toolbar / dialog header.
 * Available to any viewer who can see photos (not admin-only).
 */
export default function FotkyStahovaciHlavicka({
  maFotky,
  stahovaciRezim,
  vybranyPocet,
  stahujeSe,
  onZacniStahovani,
  onZrusStahovani,
  onStahnoutVybrane,
  onStahnoutVse,
}: FotkyStahovaciHlavickaProps): JSX.Element | null {
  if (!maFotky) return null;

  const zaklad = `${fotkyTlacitkoZaklad} rounded-lg border px-3 text-sm font-bold disabled:opacity-60`;
  const akcni = `${zaklad} w-full border-linka bg-povrch text-inkoust shadow-denik ring-1 ring-smrk/35 sm:w-auto ${fotkyHoverBgSmrk}`;
  const akcniPlne = `${zaklad} w-full border-smrk bg-smrk text-papir sm:w-auto ${fotkyHoverBgSmrk}`;
  const neutralni = `${zaklad} w-full border-linka bg-povrch text-inkoust shadow-denik sm:w-auto`;

  if (!stahovaciRezim) {
    return (
      <button
        type="button"
        onClick={onZacniStahovani}
        aria-label="Stáhnout"
        title="Stáhnout"
        className={`${fotkyTlacitkoSekundarni} nahled-press min-h-11 gap-1.5 px-3`}
      >
        <IkonaStazeni />
        <span className="sr-only sm:not-sr-only sm:inline">Stáhnout</span>
      </button>
    );
  }

  return (
    <div
      className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end"
      data-fotky-stahovaci-akce
      role="group"
      aria-label="Stahování fotek"
    >
      <button
        type="button"
        onClick={onZrusStahovani}
        disabled={stahujeSe}
        className={`${neutralni} order-2 sm:order-1`}
      >
        Zrušit
      </button>
      <button
        type="button"
        onClick={onStahnoutVybrane}
        disabled={vybranyPocet === 0 || stahujeSe}
        className={`${akcniPlne} order-1 col-span-2 sm:order-3`}
      >
        {stahujeSe ? "Ukládám…" : "Stáhnout vybrané"}
      </button>
      <button
        type="button"
        onClick={onStahnoutVse}
        disabled={stahujeSe}
        className={`${akcni} order-3 sm:order-2`}
      >
        Stáhnout vše
      </button>
    </div>
  );
}

function IkonaStazeni(): JSX.Element {
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
        d="M12 4v10M8 10.5 12 14.5 16 10.5M5 19h14"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
