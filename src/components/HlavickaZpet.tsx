import type { JSX, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface HlavickaZpetProps {
  /** Kam vede zpět, když stránku neotevřela jiná obrazovka (`state.odkud`). */
  zpet: string;
  /** Popisek tlačítka pro čtečky, např. „Zpět do zpěvníku". */
  zpetPopisek: string;
  /** Vlastní akce místo navigace (např. zavření modalu stránky). */
  onZpet?: () => void;
  titulek: string;
  /**
   * `panel`: malý titulek uprostřed, akce vpravo (detail, formulář).
   * `nadpis`: velký nadpis stránky hned vedle šipky (Nastavení, Návrhy písní).
   */
  varianta?: "panel" | "nadpis";
  /** Textová akce vpravo v `panel` variantě (Upravit, Zrušit). */
  akce?: ReactNode;
  className?: string;
}

/** Kulaté tlačítko zpět podle návrhu ExApp.pen: povrch, vlasová linka, šipka ‹. */
function TlacitkoZpet({ popisek, onClick }: { popisek: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={popisek}
      className="nahled-press inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-linka bg-povrch text-inkoust [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mlha"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px]"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}

/**
 * Hlavička podstránky se zpět. Vrací se tam, odkud uživatel přišel
 * (`location.state.odkud`), jinak na `zpet`.
 */
export default function HlavickaZpet({
  zpet,
  zpetPopisek,
  onZpet,
  titulek,
  varianta = "panel",
  akce,
  className = "",
}: HlavickaZpetProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  function naZpet(): void {
    if (onZpet !== undefined) {
      onZpet();
      return;
    }
    const odkud = (location.state as { odkud?: unknown } | null)?.odkud;
    if (typeof odkud === "string" && odkud.length > 0 && odkud !== location.pathname) {
      void navigate(odkud);
      return;
    }
    void navigate(zpet);
  }

  if (varianta === "nadpis") {
    return (
      <header className={`flex min-w-0 items-center gap-3 ${className}`}>
        <TlacitkoZpet popisek={zpetPopisek} onClick={naZpet} />
        <h1 className="min-w-0 font-display text-[28px] font-bold leading-tight tracking-tight text-inkoust sm:text-3xl">
          {titulek}
        </h1>
      </header>
    );
  }

  return (
    <header className={`grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(2.75rem,auto)] items-center gap-2 ${className}`}>
      <TlacitkoZpet popisek={zpetPopisek} onClick={naZpet} />
      <h1 className="truncate text-center font-display text-base font-bold text-inkoust">{titulek}</h1>
      <div className="flex min-h-11 items-center justify-end">{akce}</div>
    </header>
  );
}

/** Textová akce vpravo v hlavičce (Upravit, Zrušit). */
export function AkceHlavicky({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nahled-press inline-flex min-h-11 items-center rounded-lg px-1.5 text-[15px] font-semibold text-smrk [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
    >
      {children}
    </button>
  );
}
