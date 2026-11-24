import { useId, useRef, useState, useEffect, type JSX } from "react";
import { DNY_V_TYDNU } from "./kalendar/DenKalendare";
import Ikona from "./Ikona";
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
  /** Ikona v poli, v modálech je to šipka. */
  ikona?: "calendar" | "chevron-down";
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
  ikona = "calendar",
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
        placeholder="dd. mm. rrrr"
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
        className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center rounded-lg text-mech hover:bg-mlha hover:text-inkoust disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Ikona nazev={ikona} className="size-4 min-[90rem]:size-3.5 min-[90rem]:text-ink-3" />
      </button>
      <VyskakovaciPanel
        otevreno={otevreno}
        kotva={kotvaRef}
        onZavrit={() => setOtevreno(false)}
        sirka={292}
        label="Kalendář"
        puvod="konec"
        vzhled="datum"
      >
        <div id={panelId} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Předchozí měsíc"
              onClick={() => setPohled((stav) => posunMesic(stav.rok, stav.mesic, -1))}
              className="flex size-10 items-center justify-center rounded-lg text-inkoust hover:bg-povrch-2 min-[90rem]:size-7"
            >
              <Ikona nazev="chevron-left" className="size-4" />
            </button>
            <p className="text-[15px] font-bold first-letter:uppercase">{nazevMesice(pohled.rok, pohled.mesic)}</p>
            <button
              type="button"
              aria-label="Další měsíc"
              onClick={() => setPohled((stav) => posunMesic(stav.rok, stav.mesic, 1))}
              className="flex size-10 items-center justify-center rounded-lg text-inkoust hover:bg-povrch-2 min-[90rem]:size-7"
            >
              <Ikona nazev="chevron-right" className="size-4" />
            </button>
          </div>
          <div aria-hidden="true" className="grid grid-cols-7 gap-0.5 text-center">
            {DNY_V_TYDNU.map((den) => (
              <span key={den} className="text-[10px] font-bold uppercase tracking-[0.6px] text-ink-3">{den}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-x-0.5 gap-y-1 min-[90rem]:gap-y-0.5">
            {bunky.map((bunka) => {
              const vybrano = bunka.ymd === value;
              const jeDnes = bunka.ymd === dnes;
              const zakazano = mimoRozsah(bunka.ymd);
              const cislo = Number(bunka.ymd.slice(8, 10));
              // Návrh nechává dny před prvním v měsíci prázdné.
              if (bunka.mimoMesic && cislo > 20) return <span key={bunka.ymd} aria-hidden="true" />;
              return (
                <button
                  key={bunka.ymd}
                  type="button"
                  disabled={zakazano}
                  aria-pressed={vybrano}
                  aria-current={jeDnes && !vybrano ? "date" : undefined}
                  onClick={() => {
                    onChange(bunka.ymd);
                    setOtevreno(false);
                  }}
                  className={`flex size-9 items-center justify-center justify-self-center rounded-full text-[12.5px] transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-30 min-[90rem]:size-[34px] ${
                    vybrano
                      ? "bg-smrk font-bold text-papir"
                      : jeDnes
                        ? "bg-mlha font-bold text-smrk"
                        : bunka.mimoMesic
                          ? "font-medium text-[#c3c7b6] hover:bg-povrch-2"
                          : "font-medium text-inkoust hover:bg-povrch-2"
                  }`}
                >
                  {cislo}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-0.5">
            <button
              type="button"
              onClick={() => {
                onChange(dnes);
                setOtevreno(false);
              }}
              className="nahled-press -ml-2 flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-smrk hover:bg-mlha min-[90rem]:min-h-8"
            >
              Dnes
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
