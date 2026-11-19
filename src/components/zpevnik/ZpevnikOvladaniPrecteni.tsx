import type { JSX } from "react";

/** Visual-only control from pen; no speech or audio is wired. */
export function ZpevnikOvladaniPrecteni(): JSX.Element {
  return (
    <button
      type="button"
      aria-label="1,0× Zastavit"
      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full bg-smrk px-3.5 text-sm font-semibold text-papir focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
      onClick={() => undefined}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
      <span>1,0× Zastavit</span>
    </button>
  );
}