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
    "nahled-press nahled-invert inline-flex min-h-[44px] items-center gap-2 rounded-none border border-[hsl(var(--foreground))] bg-transparent px-4 font-condensed text-sm disabled:opacity-40";
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
      >
        <Sipka smer="vlevo" />
        Novější
      </button>
      <p className="min-h-[44px] px-1 py-2 text-sm tabular-nums">
        Stránka {stranka} z {stranek}
      </p>
      <button
        type="button"
        className={tlacitko}
        disabled={stranka >= stranek}
        onClick={onDalsi}
      >
        Starší
        <Sipka smer="vpravo" />
      </button>
    </nav>
  );
}
