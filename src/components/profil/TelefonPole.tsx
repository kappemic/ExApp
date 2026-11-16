import { useEffect, useId, useMemo, useRef, useState, type JSX } from "react";
import {
  VYCHOZI_KOD_ZEME,
  formatujNarodniTelefon,
  seznamZemi,
  type KodZeme,
} from "../../shared/telefon";

interface TelefonPoleProps {
  id: string;
  hodnota: string;
  kodZeme: KodZeme;
  onZmena: (hodnota: string, kodZeme: KodZeme) => void;
  vstupTrida: string;
  name?: string;
  disabled?: boolean;
  neplatny?: boolean;
  popisChybyId?: string;
}

function vlajka(kod: string): string {
  return [...kod.toUpperCase()]
    .map((znak) => String.fromCodePoint(127397 + znak.charCodeAt(0)))
    .join("");
}

function bezDiakritiky(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Prefix picker plus a nationally formatted phone field. Default country is Czechia. */
export default function TelefonPole({
  id,
  hodnota,
  kodZeme,
  onZmena,
  vstupTrida,
  name,
  disabled = false,
  neplatny = false,
  popisChybyId,
}: TelefonPoleProps): JSX.Element {
  const [otevreno, setOtevreno] = useState(false);
  const [hledani, setHledani] = useState("");
  const obal = useRef<HTMLDivElement>(null);
  const hledaniRef = useRef<HTMLInputElement>(null);
  const seznamId = useId();
  const zeme = seznamZemi();
  const vybrana = zeme.find((polozka) => polozka.kod === kodZeme) ?? zeme[0];

  const filtrovane = useMemo(() => {
    const dotaz = bezDiakritiky(hledani.trim());
    if (dotaz.length === 0) return zeme;
    return zeme.filter((polozka) => {
      const nazev = bezDiakritiky(polozka.nazev);
      const predvolba = polozka.predvolba.toLowerCase();
      return nazev.includes(dotaz) || predvolba.includes(dotaz.replace(/\s/g, "")) || polozka.kod.toLowerCase().includes(dotaz);
    });
  }, [hledani, zeme]);

  useEffect(() => {
    if (!otevreno) return;
    hledaniRef.current?.focus();
    function zavriVen(udalost: MouseEvent): void {
      if (!obal.current?.contains(udalost.target as Node)) setOtevreno(false);
    }
    function zavriEsc(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") setOtevreno(false);
    }
    document.addEventListener("mousedown", zavriVen);
    document.addEventListener("keydown", zavriEsc);
    return () => {
      document.removeEventListener("mousedown", zavriVen);
      document.removeEventListener("keydown", zavriEsc);
    };
  }, [otevreno]);

  function vyberZemi(kod: KodZeme): void {
    onZmena(formatujNarodniTelefon(hodnota, kod), kod);
    setOtevreno(false);
    setHledani("");
  }

  const predvolba = vybrana?.predvolba ?? "+420";
  const nazev = vybrana?.nazev ?? "Česko";
  const kod = vybrana?.kod ?? VYCHOZI_KOD_ZEME;

  return (
    <div ref={obal} className="relative">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={otevreno}
          aria-controls={seznamId}
          aria-label={`Předvolba, ${nazev} ${predvolba}`}
          onClick={() => setOtevreno((stav) => !stav)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border-2 border-inkoust bg-white px-3 text-base font-bold text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-50 [touch-action:manipulation]"
        >
          <span aria-hidden="true">{vlajka(kod)}</span>
          <span>{predvolba}</span>
        </button>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          disabled={disabled}
          value={hodnota}
          placeholder="777 123 456"
          maxLength={32}
          aria-invalid={neplatny}
          aria-describedby={popisChybyId}
          onChange={(e) => onZmena(formatujNarodniTelefon(e.target.value, kodZeme), kodZeme)}
          className={`${vstupTrida} min-w-0 flex-1`}
        />
      </div>
      {otevreno && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border-2 border-inkoust bg-white shadow-denik">
          <div className="border-b border-inkoust/15 p-2">
            <input
              ref={hledaniRef}
              type="search"
              value={hledani}
              onChange={(e) => setHledani(e.target.value)}
              placeholder="Hledat zemi…"
              aria-label="Hledat zemi"
              className="min-h-[44px] w-full rounded-xl border border-pole bg-papir px-3 text-base text-inkoust placeholder:text-inkoust/40 focus:border-smrk focus:outline-none"
            />
          </div>
          <ul id={seznamId} role="listbox" aria-label="Předvolby" className="max-h-64 overflow-y-auto py-1">
            {filtrovane.length === 0 ? (
              <li className="px-3 py-3 text-sm text-inkoust/70">Žádná země neodpovídá.</li>
            ) : (
              filtrovane.map((polozka) => (
                <li key={polozka.kod}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={polozka.kod === kodZeme}
                    onClick={() => vyberZemi(polozka.kod)}
                    className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-base hover:bg-smrk/10 focus-visible:bg-smrk/10 focus-visible:outline-none [touch-action:manipulation]"
                  >
                    <span aria-hidden="true" className="w-6 shrink-0">
                      {vlajka(polozka.kod)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{polozka.nazev}</span>
                    <span className="shrink-0 font-bold tabular-nums">{polozka.predvolba}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
