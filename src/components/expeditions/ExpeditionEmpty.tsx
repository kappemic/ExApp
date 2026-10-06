import type { JSX } from "react";

export default function ExpeditionEmpty(): JSX.Element {
  return (
    <div
      role="status"
      className="flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-white/60 px-6 py-14 text-center shadow-denik"
    >
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-inkoust bg-papir shadow-razitko"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-7 w-7 text-smrk"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" strokeOpacity="0.5" />
          <path d="M15.5 8.5 13 13l-4.5 2.5L11 11z" fill="currentColor" fillOpacity="0.18" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </div>

      <h2 className="mt-5 text-lg font-bold tracking-tight">
        Žádné nadcházející výpravy
      </h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
        Deník je zatím prázdný — vedoucí sem brzy připíše první záznam.
        Zkuste to prosím později.
      </p>
      <p
        aria-hidden="true"
        className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
      >
        oddílový deník · archiv prázdný
      </p>
    </div>
  );
}
