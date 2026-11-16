import { forwardRef, useId, useRef, useState, type JSX } from "react";
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 shrink-0 text-mech">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <VyskakovaciPanel
        otevreno={otevreno}
        kotva={kotvaRef}
        onZavrit={() => setOtevreno(false)}
        label="Výběr"
        role="listbox"
        minSirka={280}
      >
        <ul id={panelId} role="presentation" className="max-h-60 overflow-y-auto">
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
                  className={`flex min-h-11 w-full items-center whitespace-nowrap rounded-lg px-3 text-left text-base ${
                    aktivni ? "bg-mlha font-semibold text-inkoust" : "text-inkoust hover:bg-mlha"
                  }`}
                >
                  {volba.popisek}
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
