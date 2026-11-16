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
    <div role="status" className="rounded-xl bg-mlha/60 px-5 py-6 text-left">
      <p className="font-display text-balance text-xl font-bold leading-tight text-inkoust">
        {nadpis}
      </p>
      <p className="mt-1 max-w-[65ch] text-base leading-relaxed text-mech">{text}</p>
      {akce !== undefined ? (
        <button
          type="button"
          onClick={akce.onClick}
          className="nahled-press mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-papir px-5 text-sm font-semibold text-inkoust shadow-denik hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          {akce.popisek}
        </button>
      ) : null}
    </div>
  );
}
