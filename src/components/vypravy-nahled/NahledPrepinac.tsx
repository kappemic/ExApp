import type { JSX } from "react";

interface Volba<T extends string> {
  id: T;
  popisek: string;
}

/** Segmentový přepínač podle ExApp.pen: šedá dráha, aktivní volba bílá se stínem. */
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
      className={`inline-flex h-9 max-w-full items-center gap-0.5 rounded-[18px] bg-povrch-2 p-[3px] ${
        roztahnout ? "w-fit min-w-0" : "w-auto shrink-0"
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
            className={`bez-prejeti h-[30px] min-w-[44px] touch-manipulation rounded-[15px] px-3 text-[12.5px] select-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none ${
              roztahnout ? "" : ""
            } ${
              jeAktivni
                ? "bg-povrch font-semibold text-inkoust shadow-[0_1px_2px_#1c261514]"
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
