import type { JSX, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Ikona from "./Ikona";

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

/** Tlačítko zpět podle návrhu ExApp.pen: čtverec 44 px s rohy 12, povrch, vlasová linka, šipka ‹. */
function TlacitkoZpet({ popisek, onClick }: { popisek: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={popisek}
      className="nahled-press inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-linka bg-povrch text-inkoust [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mlha"
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
        <h1 className="min-w-0 font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust">
          {titulek}
        </h1>
      </header>
    );
  }

  return (
    <header className={`grid grid-cols-[2.75rem_minmax(0,1fr)_minmax(2.75rem,auto)] items-center gap-2 ${className}`}>
      <TlacitkoZpet popisek={zpetPopisek} onClick={naZpet} />
      <h1 className="truncate text-center font-display text-[17px] font-bold text-inkoust">{titulek}</h1>
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
      className="nahled-press inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-smrk [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
    >
      {children}
    </button>
  );
}

/** React Router si v historii drží pořadí; 0 znamená stránku otevřenou přímo z odkazu. */
function jeKamSeVratit(): boolean {
  const stav: unknown = window.history.state;
  const poradi = typeof stav === "object" && stav !== null ? (stav as { idx?: unknown }).idx : undefined;
  return typeof poradi === "number" && poradi > 0;
}

/**
 * Návrat na podstránkách na počítači (návrh ho má jen na telefonu a tabletu).
 * Sedí v horním odsazení stránky, nadpis proto zůstává tam, kde je v návrhu.
 * Vrací na předchozí stránku aplikace, po otevření z odkazu na `zpet`.
 */
export function ZpetPocitac({
  zpet,
  popisek,
  className = "",
}: {
  zpet: string;
  popisek: string;
  className?: string;
}): JSX.Element {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        if (jeKamSeVratit()) void navigate(-1);
        else void navigate(zpet);
      }}
      title={popisek}
      className={`bez-prejeti group -ml-1.5 -mt-8 mb-1 hidden h-7 w-fit items-center gap-1 rounded-lg pl-1 pr-2.5 text-[13px] font-medium text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:flex ${className}`}
    >
      <Ikona
        nazev="chevron-left"
        className="size-4 text-ink-3 transition-transform duration-150 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:-translate-x-0.5"
      />
      {popisek}
    </button>
  );
}
