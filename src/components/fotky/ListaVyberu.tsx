import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Ikona from "../Ikona";
import { fotkyTlacitkoPrimarni, fotkyTlacitkoSekundarni, fotkyTlacitkoSmazat } from "./fotky-ui";

const VELIKOST =
  "h-11 whitespace-nowrap text-[13.5px] min-[90rem]:h-[46px] min-[90rem]:gap-2 min-[90rem]:px-[18px] min-[90rem]:text-sm";

interface ListaVyberuProps {
  /** Místo v hlavičce alba, kde jinak sedí Nahrát, Stáhnout a koš. */
  cil: HTMLElement;
  popisek: string;
  vybranoVse: boolean;
  probiha: boolean;
  onZrusit: () => void;
  onPrepnoutVse: () => void;
  /** Hlavní tlačítko podle režimu. */
  children: ReactNode;
}

/**
 * Tlačítka výběru fotek. Sedí v hlavičce místo běžných tlačítek, po odrolování
 * se drží u horního okraje, aby šla použít i uprostřed dlouhého alba.
 */
export default function ListaVyberu({
  cil,
  popisek,
  vybranoVse,
  probiha,
  onZrusit,
  onPrepnoutVse,
  children,
}: ListaVyberuProps): JSX.Element {
  const listaRef = useRef<HTMLDivElement>(null);
  const [odrolovano, setOdrolovano] = useState(false);

  useEffect(() => {
    const sledovani = new IntersectionObserver(([zaznam]) => {
      if (zaznam !== undefined) setOdrolovano(!zaznam.isIntersecting);
    });
    sledovani.observe(cil);
    return () => {
      sledovani.disconnect();
    };
  }, [cil]);

  // Tlačítko, které režim zapnulo, z hlavičky zmizelo.
  useEffect(() => {
    listaRef.current?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      ref={listaRef}
      tabIndex={-1}
      role="group"
      aria-label={popisek}
      data-fotky-lista-vyberu
      className={`flex gap-2 outline-none! min-[90rem]:gap-2.5 ${
        odrolovano
          ? "fixed inset-x-3 top-[calc(var(--stavova-lista)+0.5rem)] z-30 rounded-2xl border border-linka bg-povrch p-2 shadow-panel min-[90rem]:left-auto min-[90rem]:right-10 min-[90rem]:top-[84px]"
          : "w-full"
      }`}
    >
      <button
        type="button"
        onClick={onZrusit}
        disabled={probiha}
        aria-label="Zrušit"
        className={`${fotkyTlacitkoSekundarni} ${VELIKOST} max-[90rem]:w-11 max-[90rem]:shrink-0 max-[90rem]:!px-0`}
      >
        <Ikona nazev="x" className="size-[17px] text-mech min-[90rem]:size-4" />
        <span className="hidden min-[90rem]:inline">Zrušit</span>
      </button>
      <button
        type="button"
        onClick={onPrepnoutVse}
        disabled={probiha}
        className={`${fotkyTlacitkoSekundarni} ${VELIKOST} flex-1 min-[90rem]:flex-none`}
      >
        {vybranoVse ? "Zrušit výběr" : "Vybrat vše"}
      </button>
      {children}
    </div>,
    cil,
  );
}

/** Hlavní tlačítko lišty: stažení zeleně, mazání terakotou. */
export function TlacitkoVyberu({
  druh,
  disabled,
  onClick,
  children,
}: {
  druh: "stahnout" | "smazat";
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${druh === "smazat" ? fotkyTlacitkoSmazat : fotkyTlacitkoPrimarni} ${VELIKOST} flex-1 min-[90rem]:min-w-[140px] min-[90rem]:flex-none`}
    >
      <Ikona nazev={druh === "smazat" ? "trash-2" : "download"} className="size-4" />
      {children}
    </button>
  );
}
