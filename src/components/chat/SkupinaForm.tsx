import { useState, type JSX } from "react";
import {
  nazevRoleSkupiny,
  vychoziPravaSkupiny,
  type PravoSkupiny,
  type SkupinaRole,
} from "../../lib/skupiny-pristup";

export interface SkupinaFormProps {
  nazev: string;
  prava: readonly PravoSkupiny[];
  ukladaSe: boolean;
  chyba: string | null;
  onZrusit: () => void;
  onUlozit: (nazev: string, prava: PravoSkupiny[]) => void;
}

function prepnout(
  prava: readonly PravoSkupiny[],
  role: SkupinaRole,
  pole: "cist" | "psat",
  hodnota: boolean,
): PravoSkupiny[] {
  return prava.map((pravo) => {
    if (pravo.role !== role) return pravo;
    if (pole === "psat") {
      return { ...pravo, psat: hodnota, cist: hodnota ? true : pravo.cist };
    }
    return { ...pravo, cist: hodnota, psat: hodnota ? pravo.psat : false };
  });
}

/** Name plus read/write checkboxes for each club role. */
export default function SkupinaForm({
  nazev,
  prava,
  ukladaSe,
  chyba,
  onZrusit,
  onUlozit,
}: SkupinaFormProps): JSX.Element {
  const [jmeno, setJmeno] = useState<string>(nazev);
  const [pravaForm, setPravaForm] = useState<PravoSkupiny[]>(
    prava.length > 0 ? prava.map((pravo) => ({ ...pravo })) : vychoziPravaSkupiny(),
  );

  return (
    <form
      className="mb-3 space-y-3 rounded-2xl border border-linka bg-papir p-3 shadow-denik"
      onSubmit={(udalost) => {
        udalost.preventDefault();
        onUlozit(jmeno, pravaForm);
      }}
    >
      <p className="text-sm font-extrabold">Skupina a přístup podle rolí</p>
      <label className="block text-sm font-bold">
        Název
        <input
          value={jmeno}
          onChange={(udalost) => setJmeno(udalost.target.value)}
          maxLength={80}
          required
          className="mt-1 w-full min-h-[44px] rounded-xl border border-pole bg-papir px-3 text-base outline-none"
        />
      </label>
      <fieldset className="min-w-0 space-y-2">
        <legend className="text-sm font-bold">Kdo skupinu vidí a kdo do ní píše</legend>
        {pravaForm.map((pravo) => (
          <div key={pravo.role} className="flex min-h-[44px] flex-wrap items-center gap-3">
            <span className="min-w-[7.5rem] text-sm font-semibold">
              {nazevRoleSkupiny(pravo.role)}
            </span>
            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pravo.cist}
                onChange={(udalost) =>
                  setPravaForm((stav) => prepnout(stav, pravo.role, "cist", udalost.target.checked))
                }
              />
              Číst
            </label>
            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pravo.psat}
                onChange={(udalost) =>
                  setPravaForm((stav) => prepnout(stav, pravo.role, "psat", udalost.target.checked))
                }
              />
              Psát
            </label>
          </div>
        ))}
      </fieldset>
      {chyba !== null && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {chyba}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={ukladaSe}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-smrk px-4 text-sm font-bold text-papir disabled:opacity-60 [touch-action:manipulation]"
        >
          {ukladaSe ? "Ukládám…" : "Uložit skupinu"}
        </button>
        <button
          type="button"
          onClick={onZrusit}
          className="bez-prejeti inline-flex min-h-[44px] items-center rounded-xl border border-linka bg-papir px-4 text-sm font-bold text-inkoust transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-linka/60 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [touch-action:manipulation]"
        >
          Zrušit
        </button>
      </div>
    </form>
  );
}
