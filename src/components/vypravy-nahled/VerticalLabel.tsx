import type { JSX } from "react";

/** Coordinate label along a panel edge. Visible from xl only. */
export default function VerticalLabel({
  text,
  strana,
}: {
  text: string;
  strana: "vlevo" | "vpravo";
}): JSX.Element {
  const vlevo = strana === "vlevo";
  return (
    <p
      aria-hidden="true"
      className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 font-condensed text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--muted-foreground))] xl:block ${
        vlevo ? "left-3 rotate-180" : "right-3"
      }`}
      style={{ writingMode: "vertical-rl" }}
    >
      {text}
    </p>
  );
}
