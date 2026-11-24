import { useId, useState, type JSX } from "react";
import {
  nazevRoleSkupiny,
  vychoziPravaSkupiny,
  type PravoSkupiny,
  type SkupinaRole,
} from "../../lib/skupiny-pristup";
import { POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import { NADPIS_ODDILU_PANELU, OBSAH_PANELU, PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";

export interface SkupinaFormProps {
  nazev: string;
  prava: readonly PravoSkupiny[];
  /** Popisek hlavního tlačítka. */
  odeslat?: string;
  /** Popisek vedlejšího tlačítka. */
  zrusit?: string;
  ukladaSe: boolean;
  chyba: string | null;
  onZrusit: () => void;
  onUlozit: (nazev: string, prava: PravoSkupiny[]) => void;
}

type Uroven = "nic" | "cist" | "psat";

const UROVNE: readonly { id: Uroven; nazev: string }[] = [
  { id: "nic", nazev: "Nevidí" },
  { id: "cist", nazev: "Čte" },
  { id: "psat", nazev: "Píše" },
];

function urovenPrava(pravo: PravoSkupiny): Uroven {
  if (pravo.psat) return "psat";
  return pravo.cist ? "cist" : "nic";
}

function nastavUroven(prava: readonly PravoSkupiny[], role: SkupinaRole, uroven: Uroven): PravoSkupiny[] {
  return prava.map((pravo) =>
    pravo.role === role ? { role, cist: uroven !== "nic", psat: uroven === "psat" } : pravo,
  );
}

/** Karta role jako ve Správě člena: s přístupem olivová mlha, bez přístupu teplý papír. */
function KartaRole({
  pravo,
  onZmena,
}: {
  pravo: PravoSkupiny;
  onZmena: (uroven: Uroven) => void;
}): JSX.Element {
  const skupinaVoleb = useId();
  const uroven = urovenPrava(pravo);
  const nazev = nazevRoleSkupiny(pravo.role);
  return (
    <div
      role="radiogroup"
      aria-label={`${nazev}: přístup ke skupině`}
      className={`flex items-center gap-2.5 rounded-[14px] py-1 pl-3 pr-1 transition-colors motion-reduce:transition-none min-[90rem]:rounded-[10px] min-[90rem]:pl-[11px] ${
        uroven === "nic" ? "bg-papir min-[90rem]:bg-povrch-2" : "bg-mlha"
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-inkoust min-[90rem]:text-[12.5px]">{nazev}</span>
      <div className="flex shrink-0 rounded-[11px] bg-povrch p-[3px] min-[90rem]:rounded-lg">
        {UROVNE.map((volba) => (
          <label key={volba.id} className="relative cursor-pointer [touch-action:manipulation]">
            <input
              type="radio"
              name={skupinaVoleb}
              checked={uroven === volba.id}
              onChange={() => onZmena(volba.id)}
              className="peer sr-only"
            />
            <span
              className={`flex h-11 w-[58px] items-center justify-center rounded-[9px] text-[13px] font-semibold transition-colors motion-reduce:transition-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-smrk min-[90rem]:h-8 min-[90rem]:rounded-md min-[90rem]:text-xs ${
                uroven !== volba.id
                  ? "text-mech hover:bg-povrch-2"
                  : volba.id === "nic"
                    ? "bg-linka text-inkoust"
                    : "bg-smrk text-povrch"
              }`}
            >
              {volba.nazev}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Název skupiny a kdo ji smí číst a kdo do ní psát. Obsah panelu, patička je jeho. */
export default function SkupinaForm({
  nazev,
  prava,
  odeslat = "Uložit změny",
  zrusit = "Zrušit",
  ukladaSe,
  chyba,
  onZrusit,
  onUlozit,
}: SkupinaFormProps): JSX.Element {
  const [jmeno, setJmeno] = useState<string>(nazev);
  const [pravaForm, setPravaForm] = useState<PravoSkupiny[]>(
    prava.length > 0 ? prava.map((pravo) => ({ ...pravo })) : vychoziPravaSkupiny(),
  );

  const nikdoNevidi = !pravaForm.some((pravo) => pravo.cist);

  return (
    <form
      onSubmit={(udalost) => {
        udalost.preventDefault();
        onUlozit(jmeno, pravaForm);
      }}
    >
      <div className={OBSAH_PANELU}>
        <div>
          <label htmlFor="skupina-nazev" className={`block ${POPISEK_POLE}`}>
            Název skupiny
          </label>
          <input
            id="skupina-nazev"
            value={jmeno}
            onChange={(udalost) => setJmeno(udalost.target.value)}
            maxLength={80}
            required
            placeholder="Např. Zimní tábor"
            autoComplete="off"
            className={`mt-1.5 min-[90rem]:mt-[5px] ${POLE_FORMULARE}`}
          />
        </div>
        <fieldset className="min-w-0">
          <legend className={`${NADPIS_ODDILU_PANELU} pb-2`}>Oprávnění rolí</legend>
          <div className="flex flex-col gap-2 min-[90rem]:gap-1.5">
            {pravaForm.map((pravo) => (
              <KartaRole
                key={pravo.role}
                pravo={pravo}
                onZmena={(uroven) => setPravaForm((stav) => nastavUroven(stav, pravo.role, uroven))}
              />
            ))}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[18px] text-mech min-[90rem]:text-[11.5px] min-[90rem]:leading-4 min-[90rem]:text-ink-3">
            Kdo má víc rolí, tomu platí nejvyšší z nich.
          </p>
          {nikdoNevidi ? (
            <p role="alert" className="mt-1 text-[13px] font-semibold text-akcent min-[90rem]:text-xs">
              Aspoň jedna role musí skupinu číst.
            </p>
          ) : null}
        </fieldset>
        {chyba !== null && (
          <p role="alert" className="text-[13px] font-semibold text-akcent">
            {chyba}
          </p>
        )}
      </div>
      <div className={PATICKA_SHEETU}>
        <button type="button" onClick={onZrusit} disabled={ukladaSe} className={TLACITKO_PATICKY_ZRUSIT}>
          {zrusit}
        </button>
        <button type="submit" disabled={ukladaSe || nikdoNevidi} className={TLACITKO_PATICKY_HLAVNI}>
          {ukladaSe ? "Ukládám…" : odeslat}
        </button>
      </div>
    </form>
  );
}
