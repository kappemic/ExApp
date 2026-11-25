import { useState, type JSX, type ReactNode } from "react";
import { popisekPoctuFotek } from "../../lib/alba-api";
import { popisekNahrat } from "../../lib/nahravani-fotek";
import Ikona from "../Ikona";
import { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import PoleFotek from "./PoleFotek";

interface NahravaciFormularProps {
  id: string;
  disabled?: boolean;
  /** Další pole pod výběrem, třeba album. */
  children?: ReactNode;
  /** Předá výběr k nahrání. Vrátí hlášku, když nahrávat nejde. */
  onNahrat: (soubory: readonly File[]) => string | null;
  onZrusit: () => void;
}

/** Obsah okna „Nahrát fotky“: výběr s náhledy a patička. Průběh ukazuje album. */
export default function NahravaciFormular({
  id,
  disabled = false,
  children,
  onNahrat,
  onZrusit,
}: NahravaciFormularProps): JSX.Element {
  const [soubory, setSoubory] = useState<readonly File[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-col gap-[18px] min-[90rem]:gap-3.5">
        <PoleFotek
          id={id}
          soubory={soubory}
          disabled={disabled}
          accept="image/jpeg,image/png,image/*"
          className="rounded-2xl border border-linka bg-papir min-[90rem]:rounded-xl min-[90rem]:border-pole min-[90rem]:bg-pole-podklad"
          tridaPrazdne="gap-2 p-6 min-[90rem]:h-32 min-[90rem]:gap-[5px] min-[90rem]:p-0"
          onPridat={(nove) => {
            const obrazky = nove.filter((soubor) => soubor.type.startsWith("image/"));
            if (obrazky.length > 0) setSoubory((predchozi) => [...predchozi, ...obrazky]);
            setChyba(null);
          }}
          onOdebrat={(index) => {
            setSoubory((predchozi) => predchozi.filter((_, i) => i !== index));
          }}
        >
          <Ikona nazev="image" className="size-7 text-ink-3 min-[90rem]:hidden" />
          <Ikona nazev="image-plus" className="hidden size-5 text-ink-3 min-[90rem]:block" />
          <span className="text-sm font-semibold text-inkoust min-[90rem]:hidden">Vyber fotky z telefonu</span>
          <span className="hidden text-[12.5px] font-medium text-mech min-[90rem]:block">
            Přetáhni fotky nebo vyber z počítače
          </span>
          <span className="text-[12.5px] text-ink-3 min-[90rem]:text-[10.5px] min-[90rem]:text-ink-4">
            JPG nebo PNG, max. 8 MB na fotku
          </span>
        </PoleFotek>

        {children}

        {chyba !== null ? (
          <p role="alert" className="text-[13px] font-semibold text-akcent">
            {chyba}
          </p>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {soubory.length > 0 ? `Vybráno: ${popisekPoctuFotek(soubory.length)}.` : ""}
      </p>
      <div className={PATICKA_SHEETU} role="group" aria-label="Akce nahrání">
        <button type="button" onClick={onZrusit} className={TLACITKO_PATICKY_ZRUSIT}>
          Zrušit
        </button>
        <button
          type="button"
          disabled={disabled || soubory.length === 0}
          onClick={() => {
            setChyba(onNahrat(soubory));
          }}
          className={TLACITKO_PATICKY_HLAVNI}
        >
          {popisekNahrat(soubory.length)}
        </button>
      </div>
    </div>
  );
}
