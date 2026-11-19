import { forwardRef, useId, useRef, useState, type JSX } from "react";
import Ikona from "./Ikona";
import VyskakovaciPanel from "./VyskakovaciPanel";

export interface VolbaVyberu {
  value: string;
  popisek: string;
}

interface VyberPoleProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  volby: readonly VolbaVyberu[];
  className?: string;
  disabled?: boolean;
}

/**
 * Closed field with a paper list instead of the browser menu.
 */
const VyberPole = forwardRef<HTMLButtonElement, VyberPoleProps>(function VyberPole(
  { id, value, onChange, volby, className = "", disabled = false },
  ref,
): JSX.Element {
  const [otevreno, setOtevreno] = useState(false);
  const kotvaRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const vybrana = volby.find((volba) => volba.value === value);
  const prazdne = value.length === 0;

  return (
    <div ref={kotvaRef} className="relative">
      <button
        ref={ref}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={otevreno}
        aria-controls={panelId}
        onClick={() => setOtevreno((stav) => !stav)}
        className={`pole-vyberu flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`min-w-0 truncate ${prazdne ? "font-medium text-mech" : ""}`}>
          {vybrana?.popisek ?? "Vyber"}
        </span>
        <Ikona nazev="chevron-down" className={`size-4 text-mech transition-transform motion-reduce:transition-none ${otevreno ? "rotate-180" : ""}`} />
      </button>
      <VyskakovaciPanel
        otevreno={otevreno}
        kotva={kotvaRef}
        onZavrit={() => setOtevreno(false)}
        label="Výběr"
        role="listbox"
        minSirka={242}
        vzhled="nabidka"
      >
        <ul id={panelId} role="presentation" className="posuvnik flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {volby.map((volba) => {
            const aktivni = volba.value === value;
            return (
              <li key={volba.value.length > 0 ? volba.value : "prazdne"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={aktivni}
                  onClick={() => {
                    onChange(volba.value);
                    setOtevreno(false);
                  }}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-2.5 text-left text-[13.5px] transition-colors motion-reduce:transition-none min-[90rem]:min-h-9 ${
                    aktivni ? "bg-mlha font-semibold text-smrk" : "font-medium text-inkoust hover:bg-povrch-2"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{volba.popisek}</span>
                  {aktivni ? <Ikona nazev="check" className="size-4 text-smrk" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </VyskakovaciPanel>
    </div>
  );
});

export default VyberPole;
