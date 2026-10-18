import type { JSX } from "react";

export default function NahledPrazdne({
  nadpis,
  text,
  akce,
}: {
  nadpis: string;
  text: string;
  akce?: { popisek: string; onClick: () => void };
}): JSX.Element {
  return (
    <div role="status" className="text-left">
      <p className="text-balance text-2xl font-light leading-tight">{nadpis}</p>
      <p className="mt-2 max-w-[70ch] text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
        {text}
      </p>
      {akce !== undefined ? (
        <button
          type="button"
          onClick={akce.onClick}
          className="nahled-press nahled-invert mt-4 inline-flex min-h-[44px] items-center rounded-none border border-[hsl(var(--foreground))] bg-transparent px-4 font-condensed text-sm"
        >
          {akce.popisek}
        </button>
      ) : null}
    </div>
  );
}
