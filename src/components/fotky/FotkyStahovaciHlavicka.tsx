import type { JSX } from "react";
import Ikona from "../Ikona";
import { fotkyTlacitkoPrimarni, fotkyTlacitkoSekundarni } from "./fotky-ui";

interface FotkyStahovaciHlavickaProps {
  maFotky: boolean;
  stahovaciRezim: boolean;
  vybranyPocet: number;
  vybranoVse: boolean;
  /** Files are fetched and wait for a fresh tap (iOS needs one for the share sheet). */
  galeriePripravena: boolean;
  stahujeSe: boolean;
  onZacniStahovani: () => void;
  onZrusStahovani: () => void;
  onPrepnoutVse: () => void;
  onUlozitDoGalerie: () => void;
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
  vybranoVse,
  galeriePripravena,
  stahujeSe,
  onZacniStahovani,
  onZrusStahovani,
  onPrepnoutVse,
  onUlozitDoGalerie,
  onStahnoutVybrane,
  onStahnoutVse,
}: FotkyStahovaciHlavickaProps): JSX.Element | null {
  if (!maFotky) return null;

  if (!stahovaciRezim) {
    return (
      <button
        type="button"
        onClick={onZacniStahovani}
        aria-label="Stáhnout"
        title="Stáhnout"
        className={`${fotkyTlacitkoSekundarni} nahled-press min-h-11 gap-1.5 px-3`}
      >
        <Ikona nazev="download" className="size-4" />
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
        className={`${fotkyTlacitkoSekundarni} order-2 sm:order-1`}
      >
        Zrušit
      </button>
      <button
        type="button"
        onClick={onPrepnoutVse}
        disabled={stahujeSe}
        className={`${fotkyTlacitkoSekundarni} order-3 sm:order-2`}
      >
        {vybranoVse ? "Zrušit výběr" : "Vybrat vše"}
      </button>
      {galeriePripravena ? (
        <button
          type="button"
          onClick={onUlozitDoGalerie}
          disabled={stahujeSe}
          className={`${fotkyTlacitkoPrimarni} order-1 col-span-2 sm:order-3`}
        >
          Uložit do galerie
        </button>
      ) : (
        <button
          type="button"
          onClick={vybranyPocet > 0 ? onStahnoutVybrane : onStahnoutVse}
          disabled={stahujeSe}
          className={`${fotkyTlacitkoPrimarni} order-1 col-span-2 sm:order-3`}
        >
          <Ikona nazev="download" className="size-4" />
          {stahujeSe
            ? "Stahuji…"
            : vybranyPocet > 0
              ? `Stáhnout vybrané (${vybranyPocet})`
              : "Stáhnout vše"}
        </button>
      )}
    </div>
  );
}
