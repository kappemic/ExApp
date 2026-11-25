import type { JSX } from "react";

const PULS = "block animate-pulse rounded-md bg-linka/70 motion-reduce:animate-none";

/** Kostra seznamu Výprav: hero ve stejných rozměrech a pod ním řádky. */
export default function KostraVyprav(): JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Načítám výpravy"
      className="grid min-w-0 gap-[22px] lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-6 min-[90rem]:grid-cols-[minmax(0,1fr)_324px] min-[90rem]:gap-x-10 min-[90rem]:gap-y-10"
    >
      <div className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-linka bg-povrch shadow-denik sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[90rem]:min-h-[340px] min-[90rem]:grid-cols-[432px_minmax(0,1fr)] min-[90rem]:border-transparent">
        <span className="block aspect-[16/9] animate-pulse bg-linka/70 motion-reduce:animate-none sm:aspect-auto sm:h-full sm:min-h-[250px]" />
        <span className="flex min-w-0 flex-col gap-3 p-4 sm:justify-between sm:p-5 min-[90rem]:px-[30px] min-[90rem]:py-7">
          <span className="flex flex-col gap-3">
            <span className={`h-3 w-28 ${PULS}`} />
            <span className={`h-6 w-2/3 min-[90rem]:h-9 ${PULS}`} />
            <span className={`h-3.5 w-1/2 ${PULS}`} />
            <span className={`h-3.5 w-2/5 ${PULS}`} />
          </span>
          <span className={`h-11 w-full min-[90rem]:w-44 ${PULS}`} />
        </span>
      </div>
      <span className="hidden space-y-3 lg:block">
        <span className={`h-5 w-24 ${PULS}`} />
        {[0, 1, 2].map((radek) => (
          <span key={radek} className={`h-12 ${PULS}`} />
        ))}
      </span>
      <span className="block min-w-0 space-y-3">
        <span className={`h-5 w-32 ${PULS}`} />
        {[0, 1, 2].map((radek) => (
          <span key={radek} className={`h-[94px] !rounded-2xl min-[90rem]:h-[108px] ${PULS}`} />
        ))}
      </span>
    </div>
  );
}
