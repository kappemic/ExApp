import type { JSX } from "react";

/**
 * Statická kostra karty výpravy — stejný grid i rozměry jako ExpeditionCard.
 * Bez logiky, pouze vizuální placeholder. Respektuje reduced-motion
 * (animace vypnuta globálně v index.css) a je skrytá pro screen readery.
 */
export default function ExpeditionSkeleton(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="flex h-full flex-col overflow-hidden rounded-lg border-2 border-inkoust bg-white/60 shadow-denik motion-safe:animate-pulse"
    >
      {/* Foto / linkovaný podklad */}
      <div className="relative aspect-[16/9] w-full border-b-2 border-inkoust bg-linka/70">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 23px, rgba(26,46,34,0.08) 23px 24px)",
          }}
        />
        {/* razítko + badge */}
        <div className="absolute left-3 top-3 h-[62px] w-14 -rotate-3 rounded-[4px] border-2 border-inkoust/20 bg-papir" />
        <div className="absolute right-3 top-3 h-7 w-20 rounded-full border border-inkoust/15 bg-papir" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="h-5 w-3/4 rounded bg-linka" />
        <div className="mt-2 space-y-1.5">
          <div className="h-3.5 w-full rounded bg-linka/70" />
          <div className="h-3.5 w-5/6 rounded bg-linka/70" />
        </div>

        <div className="mt-3 space-y-1.5 border-t border-dashed border-linka pt-3">
          <div className="h-3.5 w-2/3 rounded bg-linka/60" />
          <div className="h-3.5 w-1/2 rounded bg-linka/60" />
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-24 rounded bg-linka" />
            <div className="h-3.5 w-16 rounded bg-linka/60" />
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-linka">
            <div className="h-full w-1/3 rounded-full bg-mech/50" />
          </div>
        </div>

        <div className="mt-4 flex-1" />
        <div className="flex items-center justify-between gap-3 border-t border-linka pt-3">
          <div className="h-3.5 w-28 rounded bg-linka/60" />
          <div className="h-8 w-24 rounded-md border-2 border-inkoust/20 bg-linka/70" />
        </div>
      </div>
    </div>
  );
}
