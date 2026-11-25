import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  /** Panel nad otevřenou galerií výpravy (dialog z-80). */
  nadDialogem?: boolean;
  /** Tlačítka pod seznamem, třeba po chybě. */
  paticka?: ReactNode;
}

/** Jak dlouho zůstane u hotové fotky vidět „Hotovo“, než řádek odjede. */
const HOTOVO_MS = 700;
const ODJEZD_MS = 260;

/** Hotové řádky při nahrávání postupně mizí, v seznamu zůstává jen to, co zbývá. */
function useMizejiciHotove(
  polozky: readonly PolozkaStavuFotek[],
  zapnuto: boolean,
): { mizi: ReadonlySet<string>; pryc: ReadonlySet<string> } {
  const [mizi, setMizi] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [pryc, setPryc] = useState<ReadonlySet<string>>(
    () => new Set(polozky.filter((p) => p.stav === "hotovo").map((p) => p.id)),
  );
  const naplanovane = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());

  useEffect(() => {
    if (!zapnuto) return;
    for (const { id, stav } of polozky) {
      if (stav !== "hotovo" || pryc.has(id) || naplanovane.current.has(id)) continue;
      naplanovane.current.set(id, [
        setTimeout(() => setMizi((prev) => new Set(prev).add(id)), HOTOVO_MS),
        setTimeout(() => setPryc((prev) => new Set(prev).add(id)), HOTOVO_MS + ODJEZD_MS),
      ]);
    }
  }, [polozky, pryc, zapnuto]);

  useEffect(() => {
    const casovace = naplanovane.current;
    return () => {
      for (const dvojice of casovace.values()) dvojice.forEach(clearTimeout);
      casovace.clear();
    };
  }, []);

  return { mizi, pryc };
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
  nadDialogem = false,
  paticka,
}: FotkyStavPanelProps): JSX.Element | null {
  const nahrava = rezim === "nahravani";
  const { mizi, pryc } = useMizejiciHotove(polozky, nahrava);
  if (!viditelny || polozky.length === 0) return null;

  // Chyby až za tím, co ještě běží, ať na telefonu nezakryjí postup.
  const zbyva = nahrava
    ? [...polozky]
        .filter((p) => !pryc.has(p.id))
        .sort((a, b) => Number(a.stav === "chyba") - Number(b.stav === "chyba"))
    : polozky;
  const hotovo = polozky.filter((p) => p.stav === "hotovo").length;
  const nadpis =
    nahrava && !probiha && hotovo === polozky.length ? "Nahráno" : nadpisOperaceFotek(rezim, probiha);
  const progressPct =
    polozky.length > 0 ? Math.round((hotovo / polozky.length) * 100) : 0;

  const panel = (
    <aside
      role="status"
      aria-live="polite"
      aria-busy={probiha}
      data-fotky-stav-panel
      data-rezim={rezim}
      className="fotky-stav-panel pointer-events-none fixed z-50 flex max-h-[min(52vh,20rem)] w-[calc(100vw-1.5rem)] flex-col sm:w-80 overflow-hidden rounded-lg border border-linka bg-papir/95 shadow-denik backdrop-blur-sm"
      style={{ backgroundImage: LINIE, ...(nadDialogem ? { zIndex: 85 } : {}) }}
    >
      <div className={`shrink-0 bg-papir/90 px-3 py-2.5 ${zbyva.length > 0 ? "border-b border-inkoust/15" : ""}`}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold tracking-tight text-inkoust">{nadpis}</p>
          <p className="shrink-0 text-xs font-semibold text-inkoust/65">
            {hotovo} z {polozky.length}
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
      {zbyva.length > 0 ? (
        <ul
          className={`min-h-0 px-2 py-1.5 ${
            nahrava && probiha
              ? // Telefon: jen pár řádků, další se vysunou, jak hotové mizí. Prst projde na stránku pod tím.
                `overflow-hidden max-sm:max-h-[6.75rem] ${zbyva.length > 3 ? "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]" : ""}`
              : "pointer-events-auto overflow-y-auto"
          }`}
        >
          {zbyva.map((polozka) => {
            const odjizdi = mizi.has(polozka.id);
            return (
              <li
                key={polozka.id}
                data-stav={polozka.stav}
                className={`grid text-sm text-inkoust transition-[grid-template-rows,opacity] duration-[260ms] ease-out motion-reduce:transition-none ${
                  odjizdi ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"
                }`}
              >
                <div className="flex min-h-0 items-start gap-2 overflow-hidden px-1">
                  <span className="py-1.5">
                    <StavTecka stav={polozka.stav} rezim={rezim} />
                  </span>
                  {polozka.stav === "chyba" && polozka.chyba !== undefined ? (
                    <div className="min-w-0 flex-1 py-1.5">
                      <p className="truncate font-medium leading-snug">{polozka.popisek}</p>
                      <p className="mt-0.5 text-xs leading-snug text-red-900/90">{polozka.chyba}</p>
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-1.5">
                      <p className="min-w-0 truncate font-medium leading-snug">{polozka.popisek}</p>
                      <p className="shrink-0 text-xs text-inkoust/65">{popisekRadku(polozka, rezim)}</p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {paticka !== undefined ? (
        <div className="pointer-events-auto flex shrink-0 flex-wrap gap-2 border-t border-inkoust/15 bg-papir/90 px-3 py-2.5">
          {paticka}
        </div>
      ) : null}
    </aside>
  );

  if (typeof document === "undefined") return panel;
  return createPortal(<div className="nocturne contents">{panel}</div>, document.body);
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
      className={`mt-1.5 block size-2 shrink-0 rounded-full ring-2 ring-transparent ${aktivni} ${
        stav === "probiha" ? "animate-pulse motion-reduce:animate-none" : ""
      }`}
      aria-hidden
    />
  );
}
