import type { JSX } from "react";
import {
  nadpisOperaceFotek,
  popisekStavuPolozky,
  type PolozkaStavuFotek,
  type RezimOperaceFotek,
} from "../../lib/fotky-operace-stav";

const LINIE =
  "repeating-linear-gradient(to bottom, transparent 0 21px, rgba(26,46,34,0.07) 21px 22px)";

interface FotkyStavPanelProps {
  rezim: RezimOperaceFotek;
  polozky: readonly PolozkaStavuFotek[];
  /** When false, nothing is rendered (no empty chrome). */
  viditelny: boolean;
  probiha?: boolean;
}

/**
 * Fixed bottom-left diary panel for multi-photo upload/download progress.
 * One bold surface — lined paper, ink border — per-photo rows stay quiet.
 */
export default function FotkyStavPanel({
  rezim,
  polozky,
  viditelny,
  probiha = true,
}: FotkyStavPanelProps): JSX.Element | null {
  if (!viditelny || polozky.length === 0) return null;

  const hotovo = polozky.filter((p) => p.stav === "hotovo").length;
  const nadpis = nadpisOperaceFotek(rezim, probiha);
  const progressPct =
    polozky.length > 0 ? Math.round((hotovo / polozky.length) * 100) : 0;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-busy={probiha}
      data-fotky-stav-panel
      data-rezim={rezim}
      className="pointer-events-none fixed z-40 max-h-[min(52vh,20rem)] w-[min(calc(100vw-1.5rem),20rem)] overflow-hidden rounded-lg border-2 border-inkoust bg-papir/95 shadow-denik backdrop-blur-sm"
      style={{
        left: "max(0.75rem, env(safe-area-inset-left, 0px))",
        bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
        backgroundImage: LINIE,
      }}
    >
      <div className="border-b border-inkoust/15 bg-papir/90 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold tracking-tight text-inkoust">{nadpis}</p>
          <p className="shrink-0 text-xs font-semibold tabular-nums text-inkoust/65">
            {hotovo}/{polozky.length}
          </p>
        </div>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-inkoust/10"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-jantar transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      <ul className="max-h-[calc(min(52vh,20rem)-4.5rem)] overflow-y-auto overscroll-contain px-2 py-2">
        {polozky.map((polozka) => (
          <li
            key={polozka.id}
            className="flex items-start gap-2 rounded-md px-1 py-1.5 text-sm text-inkoust"
            data-stav={polozka.stav}
          >
            <StavTecka stav={polozka.stav} rezim={rezim} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-snug">{polozka.popisek}</p>
              {polozka.stav === "chyba" && polozka.chyba !== undefined ? (
                <p className="mt-0.5 text-xs leading-snug text-red-900/90">{polozka.chyba}</p>
              ) : (
                <p className="text-xs text-inkoust/55">{popisekRadku(polozka, rezim)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function popisekRadku(polozka: PolozkaStavuFotek, rezim: RezimOperaceFotek): string {
  if (polozka.stav === "probiha") {
    return rezim === "nahravani" ? "Nahrávám…" : "Stahuji…";
  }
  return popisekStavuPolozky(polozka.stav);
}

function StavTecka({
  stav,
  rezim,
}: {
  stav: PolozkaStavuFotek["stav"];
  rezim: RezimOperaceFotek;
}): JSX.Element {
  const aktivni =
    stav === "probiha"
      ? rezim === "nahravani"
        ? "bg-smrk ring-smrk/25"
        : "bg-jantar ring-jantar/30"
      : stav === "hotovo"
        ? "bg-inkoust/35"
        : stav === "chyba"
          ? "bg-red-800/80"
          : "border-2 border-inkoust/25 bg-transparent";

  return (
    <span
      className={`mt-1.5 size-2 shrink-0 rounded-full ring-2 ring-transparent ${aktivni} ${
        stav === "probiha" ? "animate-pulse motion-reduce:animate-none" : ""
      }`}
      aria-hidden
    />
  );
}
