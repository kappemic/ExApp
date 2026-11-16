import { useEffect, useId, useRef, useState, type JSX } from "react";
import { evropskyNaIsoCas, isoCasNaEvropsky, maskaEvropskehoCasu } from "../lib/evropsky-cas";
import VyskakovaciPanel from "./VyskakovaciPanel";

const CAS_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const HODINY = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTY = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export interface CasVstupProps {
  id: string;
  /** Stored value, `HH:MM` or empty. */
  value: string;
  onChange: (cas: string) => void;
  disabled?: boolean;
  className?: string;
  ariaInvalid?: boolean;
}

function SloupecCasu({
  hodnoty,
  vybrano,
  label,
  onVyber,
}: {
  hodnoty: readonly string[];
  vybrano: string;
  label: string;
  onVyber: (hodnota: string) => void;
}): JSX.Element {
  const seznamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seznam = seznamRef.current;
    if (seznam === null || vybrano.length === 0) return;
    const prvek = seznam.querySelector<HTMLElement>(`[data-hodnota="${vybrano}"]`);
    if (prvek === null) return;
    const top = prvek.getBoundingClientRect().top - seznam.getBoundingClientRect().top + seznam.scrollTop;
    seznam.scrollTop = top - seznam.clientHeight / 2 + prvek.clientHeight / 2;
  }, [vybrano]);

  return (
    <div ref={seznamRef} role="listbox" aria-label={label} className="max-h-56 flex-1 overflow-y-auto">
      {hodnoty.map((hodnota) => {
        const aktivni = hodnota === vybrano;
        return (
          <button
            key={hodnota}
            type="button"
            role="option"
            data-hodnota={hodnota}
            aria-selected={aktivni}
            onClick={() => onVyber(hodnota)}
            className={`flex h-10 w-full items-center justify-center rounded-lg text-base tabular-nums ${
              aktivni ? "bg-smrk font-semibold text-papir" : "text-inkoust hover:bg-mlha"
            }`}
          >
            {hodnota}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Time field shown as `HH.MM`. The parent still receives `HH:MM`.
 * The corner control opens a paper clock with hours and minutes.
 */
export default function CasVstup({
  id,
  value,
  onChange,
  disabled = false,
  className = "",
  ariaInvalid = false,
}: CasVstupProps): JSX.Element {
  const [text, setText] = useState<string>(() => isoCasNaEvropsky(value));
  const [otevreno, setOtevreno] = useState(false);
  const kotvaRef = useRef<HTMLDivElement>(null);
  const fokusRef = useRef(false);
  const panelId = useId();
  const hodina = CAS_REGEX.test(value) ? value.slice(0, 2) : "";
  const minuta = CAS_REGEX.test(value) ? value.slice(3, 5) : "";

  useEffect(() => {
    if (fokusRef.current) return;
    setText(isoCasNaEvropsky(value));
  }, [value]);

  function zmen(surove: string): void {
    const dalsi = maskaEvropskehoCasu(surove);
    setText(dalsi);
    if (dalsi.length === 0) {
      onChange("");
      return;
    }
    const iso = evropskyNaIsoCas(dalsi);
    if (iso !== null) onChange(iso);
  }

  function nastavHodinu(dalsi: string): void {
    onChange(`${dalsi}:${minuta.length === 2 ? minuta : "00"}`);
  }

  function nastavMinutu(dalsi: string): void {
    onChange(`${hodina.length === 2 ? hodina : "00"}:${dalsi}`);
  }

  return (
    <div ref={kotvaRef} className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        lang="cs"
        placeholder="hh.mm"
        value={text}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onFocus={() => {
          fokusRef.current = true;
        }}
        onBlur={() => {
          fokusRef.current = false;
          setText(isoCasNaEvropsky(value));
        }}
        onChange={(e) => zmen(e.target.value)}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        aria-label="Otevřít výběr času"
        aria-expanded={otevreno}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOtevreno((stav) => !stav)}
        className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-lg text-mech hover:bg-mlha hover:text-inkoust disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l4 2" />
        </svg>
      </button>
      <VyskakovaciPanel
        otevreno={otevreno}
        kotva={kotvaRef}
        onZavrit={() => setOtevreno(false)}
        sirka={220}
        label="Výběr času"
      >
        <div id={panelId}>
          <div className="flex items-stretch gap-1">
            <SloupecCasu hodnoty={HODINY} vybrano={hodina} label="Hodina" onVyber={nastavHodinu} />
            <span aria-hidden="true" className="flex items-center text-lg font-semibold text-mech">.</span>
            <SloupecCasu hodnoty={MINUTY} vybrano={minuta} label="Minuta" onVyber={nastavMinutu} />
          </div>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOtevreno(false);
            }}
            className="mt-1 flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold text-mech hover:bg-mlha hover:text-inkoust"
          >
            Bez času
          </button>
        </div>
      </VyskakovaciPanel>
    </div>
  );
}
