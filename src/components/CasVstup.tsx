import { useEffect, useId, useRef, useState, type JSX } from "react";
import { evropskyNaIsoCas, isoCasNaEvropsky, maskaEvropskehoCasu } from "../lib/evropsky-cas";
import Ikona from "./Ikona";
import { TLACITKO_V_POLI } from "./formular-tridy";
import VyskakovaciPanel from "./VyskakovaciPanel";

const CAS_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const HODINY = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
/** Po 10 minutách jako v návrhu. Přesný čas jde dál napsat do pole. */
const MINUTY = Array.from({ length: 6 }, (_, i) => String(i * 10).padStart(2, "0"));

export interface CasVstupProps {
  id: string;
  /** Stored value, `HH:MM` or empty. */
  value: string;
  onChange: (cas: string) => void;
  disabled?: boolean;
  className?: string;
  /** Ikona v poli, v modálech je to šipka. */
  ikona?: "clock" | "chevron-down";
  ariaInvalid?: boolean;
}

function SloupecCasu({
  hodnoty,
  vybrano,
  vychozi,
  label,
  onVyber,
}: {
  hodnoty: readonly string[];
  vybrano: string;
  /** Kam se seznam odroluje, dokud není nic vybrané. */
  vychozi?: string;
  label: string;
  onVyber: (hodnota: string) => void;
}): JSX.Element {
  const seznamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seznam = seznamRef.current;
    const cil = vybrano.length > 0 ? vybrano : vychozi;
    if (seznam === null || cil === undefined) return;
    const prvek = seznam.querySelector<HTMLElement>(`[data-hodnota="${cil}"]`);
    if (prvek === null) return;
    const top = prvek.getBoundingClientRect().top - seznam.getBoundingClientRect().top + seznam.scrollTop;
    seznam.scrollTop = top - seznam.clientHeight / 2 + prvek.clientHeight / 2;
  }, [vybrano, vychozi]);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
    <span aria-hidden="true" className="text-[10px] font-bold uppercase tracking-[0.8px] text-ink-3">{label}</span>
    <div ref={seznamRef} role="listbox" aria-label={label} className="posuvnik flex max-h-[178px] w-full flex-col gap-0.5 overflow-y-auto">
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
            className={`flex h-10 w-full shrink-0 items-center justify-center rounded-lg text-sm transition-colors motion-reduce:transition-none min-[90rem]:h-[34px] ${
              aktivni ? "bg-mlha font-semibold text-smrk" : "font-medium text-inkoust hover:bg-povrch-2"
            }`}
          >
            {hodnota}
          </button>
        );
      })}
    </div>
    </div>
  );
}

/**
 * Time field shown as `HH:MM`.
 * The corner control opens a paper clock with hours and minutes.
 */
export default function CasVstup({
  id,
  value,
  onChange,
  disabled = false,
  className = "",
  ikona = "clock",
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
        placeholder="hh:mm"
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
        className={TLACITKO_V_POLI}
      >
        <Ikona nazev={ikona} className="size-4 min-[90rem]:size-3.5 min-[90rem]:text-ink-3" />
      </button>
      <VyskakovaciPanel
        otevreno={otevreno}
        kotva={kotvaRef}
        onZavrit={() => setOtevreno(false)}
        sirka={242}
        label="Výběr času"
        puvod="konec"
        vzhled="cas"
      >
        <div id={panelId} className="flex flex-col gap-2.5">
          <p className="text-[15px] font-bold">Čas</p>
          <div className="flex items-start gap-2">
            <SloupecCasu hodnoty={HODINY} vybrano={hodina} vychozi="16" label="Hodina" onVyber={nastavHodinu} />
            <span aria-hidden="true" className="flex w-2 items-center justify-center self-center pt-4 text-lg font-bold text-inkoust">:</span>
            <SloupecCasu hodnoty={minuta.length === 2 && !MINUTY.includes(minuta) ? [...MINUTY, minuta].sort() : MINUTY} vybrano={minuta} label="Minuta" onVyber={nastavMinutu} />
          </div>
          <div className="flex items-center justify-between px-0.5 pt-0.5">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOtevreno(false);
              }}
              className="nahled-press -ml-2 flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-mech hover:bg-povrch-2 min-[90rem]:min-h-8"
            >
              Bez času
            </button>
            <button
              type="button"
              onClick={() => setOtevreno(false)}
              className="nahled-press -mr-2 flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-smrk hover:bg-mlha min-[90rem]:min-h-8"
            >
              Hotovo
            </button>
          </div>
        </div>
      </VyskakovaciPanel>
    </div>
  );
}
