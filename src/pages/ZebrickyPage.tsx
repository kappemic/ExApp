import type { JSX } from "react";

export default function ZebrickyPage(): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Oddílový deník · podzim 2026</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Žebříčky
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Přehled nejaktivnějších členů podle účasti a kilometrů. Žebříček se
          doplní ve Fázi 4 po napojení Stravy.
        </p>
      </header>

      <div className="pt-6">
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
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7 text-smrk"
            >
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            </svg>
          </div>
          <h2 className="mt-5 text-lg font-bold tracking-tight">
            Zatím tu není co hodnotit
          </h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
            Jakmile uzavřeme první výpravy, objeví se tu pořadí
            nejaktivnějších členů.
          </p>
          <p
            aria-hidden="true"
            className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
          >
            oddílový deník · žebříčky se chystají
          </p>
        </div>
      </div>
    </main>
  );
}
