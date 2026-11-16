import type { JSX } from "react";

function Sipka({ smer }: { smer: "vlevo" | "vpravo" }): JSX.Element {
  const d =
    smer === "vlevo"
      ? "M13.5 8H2.5M6.5 4 2.5 8l4 4"
      : "M2.5 8h11M9.5 4 13.5 8l-4 4";
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d={d} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function NahledHistorieStranky({
  stranka,
  stranek,
  onPredchozi,
  onDalsi,
}: {
  stranka: number;
  stranek: number;
  onPredchozi: () => void;
  onDalsi: () => void;
}): JSX.Element {
  const tlacitko =
    "nahled-press nahled-invert inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg border border-pole bg-papir text-inkoust disabled:opacity-40";
  return (
    <nav
      aria-label="Stránkování historie"
      className="mt-6 flex flex-wrap items-center gap-3"
    >
      <button
        type="button"
        className={tlacitko}
        disabled={stranka <= 1}
        onClick={onPredchozi}
        aria-label="Novější"
        title="Novější"
      >
        <Sipka smer="vlevo" />
      </button>
      <p className="min-h-[44px] px-1 py-2 text-sm tabular-nums">
        Stránka {stranka} z {stranek}
      </p>
      <button
        type="button"
        className={tlacitko}
        disabled={stranka >= stranek}
        onClick={onDalsi}
        aria-label="Starší"
        title="Starší"
      >
        <Sipka smer="vpravo" />
      </button>
    </nav>
  );
}
