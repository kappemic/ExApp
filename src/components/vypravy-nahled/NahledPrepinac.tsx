import type { JSX } from "react";

interface Volba<T extends string> {
  id: T;
  popisek: string;
}

/** Segmentový přepínač (C2): olivová mlha jako dráha, aktivní volba bílá. */
export default function NahledPrepinac<T extends string>({
  ariaLabel,
  volby,
  aktivni,
  onZmena,
  roztahnout = true,
}: {
  ariaLabel: string;
  volby: Volba<T>[];
  aktivni: T;
  onZmena: (id: T) => void;
  /** Full width on a phone. Off when the control sits beside another field. */
  roztahnout?: boolean;
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full rounded-xl bg-mlha ${
        roztahnout ? "w-full sm:w-auto sm:shrink-0" : "w-auto shrink-0"
      }`}
    >
      {volby.map((volba) => {
        const jeAktivni = volba.id === aktivni;
        return (
          <button
            key={volba.id}
            type="button"
            aria-pressed={jeAktivni}
            onClick={() => onZmena(volba.id)}
            className={`bez-prejeti min-h-[44px] min-w-[44px] touch-manipulation rounded-xl px-4 text-sm select-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none ${
              roztahnout ? "flex-1 sm:flex-none" : ""
            } ${
              jeAktivni
                ? "bg-smrk font-semibold text-papir"
                : "font-medium text-mech hover:text-inkoust"
            }`}
          >
            {volba.popisek}
          </button>
        );
      })}
    </div>
  );
}
