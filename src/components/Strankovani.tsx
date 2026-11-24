import type { JSX } from "react";
import { cislaStranek } from "../lib/strankovani";

/**
 * Stránkování 1 / 2 / 3 podle ExApp.pen: čtvercová čísla, aktivní tmavé.
 * Jedna stránka = nic se nevykreslí.
 */
export default function Strankovani({
  cislo,
  pocet,
  onZmena,
  popisek = "Stránkování",
  className = "",
}: {
  cislo: number;
  pocet: number;
  onZmena: (cislo: number) => void;
  popisek?: string;
  className?: string;
}): JSX.Element | null {
  if (pocet <= 1) return null;
  return (
    <nav aria-label={popisek} className={`flex flex-wrap items-center justify-center gap-1.5 min-[90rem]:justify-end ${className}`}>
      {cislaStranek(cislo, pocet).map((polozka, i) =>
        polozka === "…" ? (
          <span key={`mezera-${i}`} aria-hidden="true" className="px-1 text-sm text-ink-3">
            …
          </span>
        ) : (
          <button
            key={polozka}
            type="button"
            onClick={() => onZmena(polozka)}
            aria-current={polozka === cislo ? "page" : undefined}
            aria-label={`Stránka ${polozka}`}
            className={`bez-prejeti inline-flex size-11 items-center justify-center rounded-xl border text-sm font-semibold min-[90rem]:size-7 min-[90rem]:rounded-lg min-[90rem]:text-xs [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk ${
              polozka === cislo
                ? "border-inkoust bg-inkoust text-papir"
                : "border-linka bg-transparent text-mech [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mlha/60"
            }`}
          >
            {polozka}
          </button>
        ),
      )}
    </nav>
  );
}

/** Tlačítko „Načíst další" pod mřížkou karet. */
export function NacistDalsi({
  zbyva,
  onClick,
  className = "",
}: {
  zbyva: number;
  onClick: () => void;
  className?: string;
}): JSX.Element | null {
  if (zbyva <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`nahled-press inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-linka bg-povrch px-4 text-[13px] font-semibold text-mech [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mlha/60 ${className}`}
    >
      Načíst další
    </button>
  );
}
