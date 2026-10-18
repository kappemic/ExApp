import type { JSX } from "react";

/** Stamped eyebrow that cuts the panel border. The page paper shows through. */
export default function SectionTag({
  id,
  text,
}: {
  id: string;
  text: string;
}): JSX.Element {
  return (
    <h2
      id={id}
      className="absolute -top-3.5 left-4 z-10 border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 font-condensed text-[11px] font-semibold uppercase tracking-[0.28em]"
    >
      {text}
    </h2>
  );
}
