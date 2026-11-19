import type { JSX } from "react";
import LogoKlubu from "./LogoKlubu";

const PULS =
  "animate-pulse rounded-md bg-linka/70 motion-reduce:animate-none";

function mista(pocet: number): number[] {
  return Array.from({ length: pocet }, (_, index) => index);
}

/** Photo album: toolbar icons and a tile grid. */
export function KostraFotky({
  pocet = 6,
  popisek = "Načítám fotky",
}: {
  pocet?: number;
  popisek?: string;
}): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label={popisek}>
      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border-2 border-inkoust/15 bg-white/60 px-3 py-2.5">
        <span className={`h-4 w-24 ${PULS}`} />
        <span className="flex gap-1.5">
          {mista(3).map((index) => (
            <span key={index} className={`h-11 w-11 rounded-lg ${PULS}`} />
          ))}
        </span>
      </div>
      <div className="-mx-4 flex w-[calc(100%+2rem)] flex-col gap-[2px] sm:-mx-6 sm:w-[calc(100%+3rem)] lg:mx-0 lg:w-full">
        {mista(Math.max(1, Math.ceil(pocet / 3))).map((radek) => (
          <div key={radek} className="flex gap-[2px]">
            {mista(3).map((sloupec) => (
              <div
              key={sloupec}
              className="h-32 min-w-0 flex-1 animate-pulse bg-linka/70 motion-reduce:animate-none"
            />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Album cards on the photos index. */
export function KostraAlba({ pocet = 4 }: { pocet?: number }): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label="Načítám alba" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
      {mista(pocet).map((index) => (
        <div key={index} className="overflow-hidden rounded-lg border-2 border-inkoust/15 bg-white/60 shadow-denik">
          <div className={`aspect-[16/9] rounded-none ${PULS}`} />
          <div className="space-y-2 px-4 py-3">
            <span className={`block h-4 w-2/3 ${PULS}`} />
            <span className={`block h-3 w-1/3 ${PULS}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Conversation or member rows. */
export function KostraRadky({
  pocet = 4,
  popisek,
  sAvatarem = false,
}: {
  pocet?: number;
  popisek: string;
  sAvatarem?: boolean;
}): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label={popisek} className="space-y-3">
      {mista(pocet).map((index) => (
        <div
          key={index}
          className="flex min-h-[64px] items-center gap-3 rounded-2xl border-2 border-inkoust/15 bg-white/60 px-3 py-2"
        >
          {sAvatarem ? <span className={`h-10 w-10 shrink-0 rounded-full ${PULS}`} /> : null}
          <span className="min-w-0 flex-1 space-y-2">
            <span className={`block h-4 ${index % 2 === 0 ? "w-2/3" : "w-1/2"} ${PULS}`} />
            <span className={`block h-3 w-1/3 ${PULS}`} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Chat bubbles while a thread loads. */
export function KostraZpravy({ popisek }: { popisek: string }): JSX.Element {
  const strany = ["mr-10", "ml-10", "mr-16", "ml-8"] as const;
  return (
    <div role="status" aria-busy="true" aria-label={popisek} className="space-y-2">
      {strany.map((strana, index) => (
        <div
          key={index}
          className={`h-14 rounded-2xl border-2 border-inkoust/10 ${strana} ${PULS}`}
        />
      ))}
    </div>
  );
}

/** Leaderboard rows under the period filter. */
export function KostraTabulka({
  pocet = 5,
  popisek,
}: {
  pocet?: number;
  popisek: string;
}): JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label={popisek} className="mt-4 overflow-hidden rounded-lg border-2 border-inkoust/15 bg-white/70 lg:mt-0">
      <div className="flex gap-3 border-b border-inkoust/10 px-4 py-3">
        <span className={`h-3 w-12 ${PULS}`} />
        <span className={`h-3 w-24 ${PULS}`} />
        <span className={`ml-auto h-3 w-16 ${PULS}`} />
      </div>
      {mista(pocet).map((index) => (
        <div key={index} className="flex items-center gap-3 border-t border-inkoust/10 px-4 py-3">
          <span className={`h-4 w-6 ${PULS}`} />
          <span className={`h-4 ${index % 2 === 0 ? "w-40" : "w-28"} ${PULS}`} />
          <span className={`ml-auto h-4 w-10 ${PULS}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Full-page skeleton shown while the session is still unknown.
 * Mirrors the journal chrome so the first paint is the page, not a lone sentence.
 */
export default function StrankaKostra({
  vnitrni = false,
}: {
  /** Uvnitř aplikace: hlavičku a spodní lištu už kreslí shell, kostra je nemá. */
  vnitrni?: boolean;
} = {}): JSX.Element {
  return (
    <div aria-busy="true" aria-label="Načítám" className={vnitrni ? "flex flex-col" : "flex min-h-dvh flex-col"}>
      <p className="sr-only">Načítám</p>
      {!vnitrni ? (
      <header className="border-b border-linka">
        <div className="mx-auto flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex items-center gap-2.5">
            <LogoKlubu velikost="sm" />
            <span className={`h-4 w-16 ${PULS}`} />
          </div>
          <div className="hidden items-center gap-2 lg:flex" aria-hidden="true">
            {["w-16", "w-14", "w-20", "w-12", "w-16"].map((sirka, index) => (
              <span key={index} className={`h-8 ${sirka} ${PULS}`} />
            ))}
          </div>
          <span className={`h-9 w-20 ${PULS}`} />
        </div>
      </header>
      ) : null}

      <main className="mx-auto w-full flex-1 px-5 pb-24 pt-6 sm:px-6 sm:pt-10 min-[90rem]:px-10 min-[90rem]:pt-11">
        <span className={`block h-3 w-40 ${PULS}`} />
        <span className={`mt-3 block h-10 w-52 max-w-full bg-inkoust/10 ${PULS}`} />
        <span className={`mt-4 block h-4 w-full max-w-md ${PULS}`} />
        <span className={`mt-2 block h-4 w-2/3 max-w-sm ${PULS}`} />
        <div className="mt-8 space-y-3">
          {["w-2/3", "w-1/2", "w-3/5", "w-2/5"].map((sirka, index) => (
            <div
              key={index}
              className="rounded-2xl border border-linka bg-povrch px-4 py-4 shadow-jemny"
            >
              <span className={`block h-4 ${sirka} ${PULS}`} />
              <span className={`mt-3 block h-3 w-1/3 ${PULS}`} />
            </div>
          ))}
        </div>
      </main>

      {!vnitrni ? (
      <div
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 border-t border-linka bg-papir lg:hidden"
      >
        <div className="mx-auto grid w-full grid-cols-5 gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} className={`mx-auto h-8 w-8 rounded-full ${PULS}`} />
          ))}
        </div>
      </div>
      ) : null}
    </div>
  );
}
