import { useId, useRef, useState, useEffect, type JSX } from "react";
import { DNY_V_TYDNU } from "./kalendar/DenKalendare";
import VyskakovaciPanel from "./VyskakovaciPanel";
import { mesicMrizkaSKontextem, nazevMesice } from "../lib/kalendar";
import { evropskeNaIso, isoNaEvropske, jeIsoDatum, maskaEvropskehoData } from "../lib/evropske-datum";

export interface DatumVstupProps {
  id: string;
  /** Stored value, `YYYY-MM-DD` or empty. */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}

function dnesYmd(): string {
  const ted = new Date();
  return `${ted.getFullYear()}-${String(ted.getMonth() + 1).padStart(2, "0")}-${String(ted.getDate()).padStart(2, "0")}`;
}

function mesicZIso(iso: string): { rok: number; mesic: number } {
  if (jeIsoDatum(iso)) {
    return { rok: Number(iso.slice(0, 4)), mesic: Number(iso.slice(5, 7)) };
  }
  const dnes = dnesYmd();
  return { rok: Number(dnes.slice(0, 4)), mesic: Number(dnes.slice(5, 7)) };
}

function posunMesic(rok: number, mesic: number, smer: -1 | 1): { rok: number; mesic: number } {
  const dalsi = new Date(rok, mesic - 1 + smer, 1);
  return { rok: dalsi.getFullYear(), mesic: dalsi.getMonth() + 1 };
}

/**
 * Date field shown as `dd.mm.rrrr`. The corner control opens a paper
 * calendar in the same palette as the page.
 */
export default function DatumVstup({
  id,
  value,
  onChange,
  disabled = false,
  min,
  max,
  className = "",
  ariaInvalid = false,
  ariaDescribedBy,
}: DatumVstupProps): JSX.Element {
  const [text, setText] = useState<string>(() => isoNaEvropske(value));
  const [otevreno, setOtevreno] = useState(false);
  const [pohled, setPohled] = useState(() => mesicZIso(value));
  const kotvaRef = useRef<HTMLDivElement>(null);
  const fokusRef = useRef(false);
  const panelId = useId();
  const dnes = dnesYmd();

  useEffect(() => {
    if (fokusRef.current) return;
    setText(isoNaEvropske(value));
  }, [value]);

  function zmen(surove: string): void {
    const dalsi = maskaEvropskehoData(surove);
    setText(dalsi);
    if (dalsi.length === 0) {
      onChange("");
      return;
    }
    const iso = evropskeNaIso(dalsi);
    if (iso !== null) onChange(iso);
  }

  function otevri(): void {
    setPohled(mesicZIso(value.length > 0 ? value : dnes));
    setOtevreno(true);
  }

  function mimoRozsah(den: string): boolean {
    if (min !== undefined && min.length > 0 && den < min) return true;
    if (max !== undefined && max.length > 0 && den > max) return true;
    return false;
  }

  const bunky = mesicMrizkaSKontextem(pohled.rok, pohled.mesic);

  return (
    <div ref={kotvaRef} className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        lang="cs"
        placeholder="dd.mm.rrrr"
        value={text}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onFocus={() => {
          fokusRef.current = true;
        }}
        onBlur={() => {
          fokusRef.current = false;
          setText(isoNaEvropske(value));
        }}
        onChange={(e) => zmen(e.target.value)}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        aria-label="Otevřít kalendář"
        aria-expanded={otevreno}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => (otevreno ? setOtevreno(false) : otevri())}
        className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-lg text-mech hover:bg-mlha hover:text-inkoust disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      </button>
      <VyskakovaciPanel
        otevreno={otevreno}
        kotva={kotvaRef}
        onZavrit={() => setOtevreno(false)}
        sirka={316}
        label="Kalendář"
      >
        <div id={panelId}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Předchozí měsíc"
              onClick={() => setPohled((stav) => posunMesic(stav.rok, stav.mesic, -1))}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-inkoust hover:bg-mlha"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <p className="font-display text-base font-bold capitalize">{nazevMesice(pohled.rok, pohled.mesic)}</p>
            <button
              type="button"
              aria-label="Další měsíc"
              onClick={() => setPohled((stav) => posunMesic(stav.rok, stav.mesic, 1))}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-inkoust hover:bg-mlha"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>
          <div aria-hidden="true" className="grid grid-cols-7 text-center">
            {DNY_V_TYDNU.map((den) => (
              <span key={den} className="pb-1 text-[12px] font-medium text-mech">{den}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {bunky.map((bunka) => {
              const vybrano = bunka.ymd === value;
              const jeDnes = bunka.ymd === dnes;
              const zakazano = mimoRozsah(bunka.ymd);
              const cislo = Number(bunka.ymd.slice(8, 10));
              return (
                <button
                  key={bunka.ymd}
                  type="button"
                  disabled={zakazano}
                  aria-pressed={vybrano}
                  aria-current={jeDnes ? "date" : undefined}
                  onClick={() => {
                    onChange(bunka.ymd);
                    setOtevreno(false);
                  }}
                  className="flex h-10 items-center justify-center disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums ${
                      vybrano
                        ? "bg-smrk font-semibold text-papir"
                        : jeDnes
                          ? "bg-inkoust font-semibold text-papir"
                          : bunka.mimoMesic
                            ? "font-medium text-pole hover:bg-mlha"
                            : "text-inkoust hover:bg-mlha"
                    }`}
                  >
                    {cislo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </VyskakovaciPanel>
    </div>
  );
}
