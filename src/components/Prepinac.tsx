import type { JSX } from "react";

/** Přepínač z ExApp.pen: 38 × 22 px, zapnutý olivový, jezdec 16 px. Klikací plocha 44 px. */
export default function Prepinac({
  zapnuto,
  onZmena,
  popisek,
  disabled = false,
}: {
  zapnuto: boolean;
  onZmena: (zapnuto: boolean) => void;
  popisek: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={zapnuto}
      aria-label={popisek}
      disabled={disabled}
      onClick={() => onZmena(!zapnuto)}
      className="bez-prejeti group inline-flex min-h-11 shrink-0 items-center focus-visible:outline-none disabled:opacity-50"
    >
      <span
        className={`flex h-[22px] w-[38px] items-center rounded-full p-[3px] transition-colors duration-200 motion-reduce:transition-none group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-smrk ${
          zapnuto ? "bg-smrk" : "bg-linka"
        }`}
      >
        <span
          className={`block size-4 rounded-full bg-povrch shadow-[0_1px_2px_#1c261526] transition-transform duration-200 ease-out motion-reduce:transition-none ${
            zapnuto ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
