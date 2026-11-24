import type { JSX, ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Seznam v jedné kartě podle návrhu ExApp.pen: bílý povrch, vlasová linka
 * kolem i mezi řádky. Sdílí Členové, Žebříčky, Více a Chat.
 */
export const SEZNAM_KARTA_TRIDA =
  "m-0 min-w-0 list-none overflow-hidden rounded-2xl border border-linka bg-povrch p-0 divide-y divide-linka shadow-karta";

/** Řádek uvnitř karty bez vlastního okraje. Výška 64 px kvůli avataru. */
export const SEZNAM_RADEK_TRIDA =
  "flex min-h-[60px] w-full min-w-0 items-center gap-3 px-3.5 py-3 text-left text-inkoust [touch-action:manipulation] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk motion-safe:transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mlha/50";

interface SeznamKartaProps {
  children: ReactNode;
  /** Popisek pro čtečky, když nad kartou není viditelný nadpis. */
  popisek?: string;
  className?: string;
}

export function SeznamKarta({ children, popisek, className = "" }: SeznamKartaProps): JSX.Element {
  return (
    <ul aria-label={popisek} className={`${SEZNAM_KARTA_TRIDA} ${className}`}>
      {children}
    </ul>
  );
}

/** Šipka ›, dekorace na konci klikacího řádku. */
export function SeznamSipka(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-ink-3"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

interface SeznamRadekProps {
  /** Avatar, ikona nebo pořadí vlevo. */
  vlevo?: ReactNode;
  nazev: ReactNode;
  podtitul?: ReactNode;
  /** Hodnota nebo odznak vpravo, před šipkou. */
  vpravo?: ReactNode;
  /** Odkaz na jinou stránku. Jinak `onClick`, jinak statický řádek. */
  odkaz?: string;
  onClick?: () => void;
  /** Zvýraznění, např. vlastní řádek v žebříčku. */
  aktivni?: boolean;
  /** Šipka › na konci. Výchozí: jen u klikacího řádku. */
  sipka?: boolean;
  /** Přidá se k vnitřku řádku, např. text v barvě akcentu. */
  className?: string;
  ariaCurrent?: "true" | "page";
  /** Tlačítko otevírá dialog (aria-haspopup). */
  otviraDialog?: boolean;
}

/** Jeden řádek seznamu: vlevo, název + podtitul, vpravo, ›. */
export function SeznamRadek({
  vlevo,
  nazev,
  podtitul,
  vpravo,
  odkaz,
  onClick,
  aktivni = false,
  sipka,
  className = "",
  ariaCurrent,
  otviraDialog = false,
}: SeznamRadekProps): JSX.Element {
  const klikaci: boolean = odkaz !== undefined || onClick !== undefined;
  const ukazSipku: boolean = sipka ?? klikaci;
  const vnitrek = (
    <>
      {vlevo}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="block min-w-0 truncate text-[14.5px] font-semibold">{nazev}</span>
        {podtitul !== undefined && podtitul !== null ? (
          <span className="block min-w-0 truncate text-xs text-ink-3">{podtitul}</span>
        ) : null}
      </span>
      {vpravo}
      {ukazSipku ? <SeznamSipka /> : null}
    </>
  );
  const trida = `${SEZNAM_RADEK_TRIDA} ${klikaci ? "nahled-press bez-prejeti" : ""} ${className}`;
  return (
    <li aria-current={ariaCurrent} className={aktivni ? "bg-mlha/60" : undefined}>
      {odkaz !== undefined ? (
        <Link to={odkaz} className={trida}>
          {vnitrek}
        </Link>
      ) : onClick !== undefined ? (
        <button
          type="button"
          onClick={onClick}
          aria-haspopup={otviraDialog ? "dialog" : undefined}
          className={trida}
        >
          {vnitrek}
        </button>
      ) : (
        <div className={trida}>{vnitrek}</div>
      )}
    </li>
  );
}

/** Čtvercový štítek 32 px s ikonou vlevo v řádku (Více, Nastavení). */
export function SeznamIkona({ children, ton = "neutralni" }: { children: ReactNode; ton?: "neutralni" | "akcent" | "svetly" }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${
        ton === "akcent" ? "bg-akcent-100 text-akcent" : ton === "svetly" ? "bg-papir text-smrk" : "bg-povrch-2 text-mech"
      }`}
    >
      {children}
    </span>
  );
}
