import type { JSX } from "react";
import {
  fotkyHoverBgSmrk,
  fotkyHoverBgSmrkPlne,
  fotkyTlacitkoZaklad,
} from "./fotky-ui";

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

  const zaklad = `${fotkyTlacitkoZaklad} w-full rounded-full border-2 px-3 text-sm font-bold disabled:opacity-60 sm:w-auto`;
  const akcni = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik ring-1 ring-smrk/35 ${fotkyHoverBgSmrk}`;
  const akcniPlne = `${zaklad} border-inkoust bg-smrk text-papir shadow-denik ${fotkyHoverBgSmrkPlne}`;
  const neutralni = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik`;

  if (!stahovaciRezim) {
    return (
      <button type="button" onClick={onZacniStahovani} className={akcni}>
        Stáhnout
      </button>
    );
  }

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:min-w-[11rem]"
      data-fotky-stahovaci-akce
    >
      <button type="button" onClick={onZrusStahovani} disabled={stahujeSe} className={neutralni}>
        Zrušit
      </button>
      <button type="button" onClick={onStahnoutVse} disabled={stahujeSe} className={akcniPlne}>
        {stahujeSe ? "Ukládám…" : "Stáhnout vše"}
      </button>
      <button
        type="button"
        onClick={onStahnoutVybrane}
        disabled={vybranyPocet === 0 || stahujeSe}
        className={akcni}
      >
        Stáhnout vybrané
      </button>
    </div>
  );
}
