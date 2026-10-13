import type { JSX } from "react";

export default function ChatPage(): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Školní expediční klub</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Chat
          </h1>
          <span className="inline-flex -rotate-3 items-center rounded border-2 border-inkoust bg-jantar px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-papir shadow-razitko">
            Brzy
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Společná nástěnka a domluva k výpravám. Diskuze a vzkazy přibudou
          ve Fázi 5.
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
              <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z" />
              <path d="M8.5 9.5h7" />
              <path d="M8.5 12.5h4" />
            </svg>
          </div>
          <h2 className="mt-5 text-lg font-bold tracking-tight">
            Nástěnka se připravuje
          </h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
            Zatím tu nejsou žádné zprávy. Domluva k nejbližší výpravě se tu
            objeví, jakmile chat zapneme.
          </p>
          <p
            aria-hidden="true"
            className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
          >
            exapp · ticho před poradou
          </p>
        </div>
      </div>
    </main>
  );
}
