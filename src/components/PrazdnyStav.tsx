import type { JSX, ReactNode } from "react";
import { Link } from "react-router-dom";

export interface AkcePrazdneho {
  popisek: string;
  onClick?: () => void;
  odkaz?: string;
  /** `hlavni` = olivové tlačítko (vytvořit), `vedlejsi` = obrys (zrušit filtr). */
  varianta?: "hlavni" | "vedlejsi";
}

interface PrazdnyStavProps {
  /** Ikona toho, co tu bude (16–18 px, currentColor). */
  ikona: ReactNode;
  nadpis: string;
  text?: ReactNode;
  /** Jedna cesta ven. Prázdná stránka nesmí být slepá ulička. */
  akce?: AkcePrazdneho;
  /** `karta` = samostatný blok, `vlozeny` = uvnitř existující karty (bez rámečku). */
  vzhled?: "karta" | "vlozeny";
  className?: string;
  /** Vlastní akce místo `akce` (např. nahrávací tlačítko s vlastní logikou). */
  children?: ReactNode;
}

const TLACITKO =
  "nahled-press mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/**
 * Prázdný stav podle „Stavy a limity" v ExApp.pen: ikona v dlaždici,
 * nadpis, krátké vysvětlení a jedna akce.
 */
export default function PrazdnyStav({
  ikona,
  nadpis,
  text,
  akce,
  vzhled = "karta",
  className = "",
  children,
}: PrazdnyStavProps): JSX.Element {
  const trida = `${TLACITKO} ${
    akce?.varianta === "vedlejsi"
      ? "border border-linka bg-povrch text-mech [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mlha/60"
      : "bg-smrk text-papir"
  }`;
  return (
    <div
      role="status"
      className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${
        vzhled === "karta" ? "rounded-2xl border border-linka bg-povrch shadow-karta" : ""
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-povrch-2 text-ink-3"
      >
        {ikona}
      </span>
      <p className="text-[15px] font-semibold text-inkoust">{nadpis}</p>
      {text !== undefined ? (
        <p className="max-w-[18rem] text-[13px] leading-snug text-ink-3">{text}</p>
      ) : null}
      {akce !== undefined ? (
        akce.odkaz !== undefined ? (
          <Link to={akce.odkaz} className={trida}>
            {akce.popisek}
          </Link>
        ) : (
          <button type="button" onClick={akce.onClick} className={trida}>
            {akce.popisek}
          </button>
        )
      ) : null}
      {children !== undefined ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
