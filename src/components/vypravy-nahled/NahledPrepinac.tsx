import type { JSX } from "react";

interface Volba<T extends string> {
  id: T;
  popisek: string;
}

/** Segmented control shared by the view switch and the calendar mode. */
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
      className={`flex border border-[hsl(var(--foreground))] ${
        roztahnout ? "w-full md:inline-flex md:w-auto" : "w-auto shrink-0"
      }`}
    >
      {volby.map((volba, index) => {
        const jeAktivni = volba.id === aktivni;
        const maPravyOkraj = index < volby.length - 1;
        return (
          <button
            key={volba.id}
            type="button"
            aria-pressed={jeAktivni}
            onClick={() => onZmena(volba.id)}
            className={`nahled-segment min-h-[44px] flex-1 rounded-none px-4 font-condensed text-sm md:flex-none ${
              maPravyOkraj ? "border-r border-[hsl(var(--foreground))]" : ""
            } ${
              jeAktivni
                ? "na-inkoustu bg-[hsl(var(--ink))] text-[hsl(var(--ink-foreground))]"
                : "nahled-invert bg-transparent text-[hsl(var(--foreground))]"
            }`}
          >
            <span className="nahled-segment-text">{volba.popisek}</span>
          </button>
        );
      })}
    </div>
  );
}
