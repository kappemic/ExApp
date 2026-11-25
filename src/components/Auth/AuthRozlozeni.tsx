import type { JSX, ReactNode } from "react";
import KrajinaVypravy from "../vypravy-nahled/KrajinaVypravy";

/**
 * Přihlášení a registrace podle ExApp.pen: na telefonu pruh 188 px nahoře,
 * na počítači sloupec 560 px vlevo. Místo fotky z banky je klubová krajina.
 */
export default function AuthRozlozeni({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-papir text-inkoust lg:flex-row">
      <div className="relative h-[calc(188px+env(safe-area-inset-top,0px))] w-full shrink-0 overflow-hidden lg:h-auto lg:min-h-dvh lg:w-[560px]">
        <div aria-hidden="true" className="absolute inset-0">
          <KrajinaVypravy id="exapp-uvod" datum="2026-10-10" className="scale-105" />
          <div className="absolute inset-0 bg-inkoust/60" />
        </div>
        <div className="relative flex h-full flex-col justify-between px-5 pb-5 pt-[calc(18px+env(safe-area-inset-top,0px))] lg:p-12">
          <div className="flex items-center gap-2.5 lg:gap-[11px]">
            <img src="/logo-klubu.png" alt="" className="h-9 w-[22px] object-contain brightness-0 invert lg:h-[57px] lg:w-[35px]" />
            <div className="flex flex-col gap-px lg:flex-row lg:items-center lg:gap-[11px]">
              <p className="font-display text-lg font-bold tracking-[-0.2px] text-povrch lg:text-2xl lg:tracking-[-0.3px]">ExApp</p>
              <p className="text-xs font-medium text-[#d5dcc6] lg:text-[17px] lg:tracking-[0.3px]">Školní expediční klub</p>
            </div>
          </div>
          <p className="font-display text-[22px] font-bold leading-[25px] tracking-[-0.4px] text-povrch lg:text-[32px] lg:leading-[37px] lg:tracking-[-0.8px]">
            Výpravy, schůzky, fotky a zpěvník.
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8 lg:justify-center lg:px-20 lg:py-14">
        <div className="mx-auto flex w-full max-w-[392px] flex-1 flex-col gap-5 lg:flex-none lg:gap-[22px]">{children}</div>
      </div>
    </div>
  );
}
