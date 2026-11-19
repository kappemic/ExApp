import type { JSX, ReactNode } from "react";
import KrajinaVypravy from "../vypravy-nahled/KrajinaVypravy";

/** Pen auth split: full-bleed hero on mobile, 560px photo column on desktop. */
export default function AuthRozlozeni({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-dvh w-full bg-papir text-inkoust lg:flex">
      <div
        className="relative w-full overflow-hidden lg:w-[560px] lg:shrink-0"
        aria-hidden="true"
      >
        <div className="relative aspect-[5/4] w-full sm:aspect-[16/11] lg:absolute lg:inset-0 lg:aspect-auto lg:min-h-dvh">
          <KrajinaVypravy id="exapp-auth-hero" datum="2026-06-12" className="min-h-full min-w-full scale-105" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/70" />
          <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-6 lg:p-8">
            <div>
              <p className="font-condensed text-base font-semibold tracking-tight text-papir">ExApp</p>
              <p className="mt-0.5 text-sm text-papir/90">Školní expediční klub</p>
            </div>
            <p className="font-display max-w-[18ch] text-[26px] font-bold leading-[1.15] text-papir sm:text-[28px] lg:max-w-none lg:text-[32px] lg:leading-tight">
              Výpravy, schůzky, fotky a zpěvník.
            </p>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8 lg:justify-center lg:px-12 lg:py-14">
        <div className="mx-auto w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}