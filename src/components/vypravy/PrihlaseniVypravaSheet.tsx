import { useId, useState, type JSX } from "react";
import SpodniSheet, { PATICKA_SHEETU } from "../shell/SpodniSheet";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData, jeBezOmezeni, volnaMista } from "../../lib/expedition-utils";
import { zobrazitUzavirkuPrihlaseni } from "../../lib/vyprava-uzavirka";

const TLACITKO_ZELENE =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-smrk px-5 text-base font-semibold text-papir hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-not-allowed disabled:opacity-60";
const TLACITKO_ZRUSIT =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-pole bg-papir px-5 text-base font-semibold text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60";

export default function PrihlaseniVypravaSheet({
  otevreno,
  expedice,
  odesilaSe,
  chyba,
  onZavrit,
  onPotvrdit,
}: {
  otevreno: boolean;
  expedice: Expedition;
  odesilaSe: boolean;
  chyba: string | null;
  onZavrit: () => void;
  onPotvrdit: () => void;
}): JSX.Element {
  const popisId = useId();
  const [vzkaz, setVzkaz] = useState("");
  const volna = volnaMista(expedice);
  const bezOmezeni = jeBezOmezeni(expedice);
  return (
    <SpodniSheet otevreno={otevreno} titulek="Přihlásit se na výpravu" onZavrit={onZavrit}>
      <div className="space-y-4 pb-2">
        <p id={popisId} className="text-sm text-mech">
          {expedice.nazev} ·{" "}
          <time dateTime={expedice.datum}>{formatRozsahData(expedice.datum, expedice.datumDo)}</time>
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-2xl border border-linka bg-papir p-4 text-sm">
          <dt className="text-mech">Sraz</dt>
          <dd className="m-0 font-medium text-inkoust">{expedice.sraz}</dd>
          <dt className="text-mech">Volná místa</dt>
          <dd className="m-0 font-medium text-inkoust">
            {bezOmezeni ? "bez omezení" : volna > 0 ? `${volna}` : "žádná"}
          </dd>
          <dt className="text-mech">Uzávěrka</dt>
          <dd className="m-0 font-medium text-inkoust">
            {zobrazitUzavirkuPrihlaseni(expedice.datum)}
          </dd>
        </dl>
        <div>
          <label htmlFor={`${popisId}-vzkaz`} className="text-sm font-semibold text-inkoust">
            Vzkaz pro vedoucího (nepovinný)
          </label>
          <textarea
            id={`${popisId}-vzkaz`}
            value={vzkaz}
            onChange={(e) => setVzkaz(e.target.value)}
            rows={3}
            className="mt-1 block min-h-[88px] w-full resize-y rounded-xl border border-pole bg-papir px-3 py-2 text-base text-inkoust placeholder:text-mech"
            placeholder="Krátká poznámka…"
          />
        </div>
        {chyba !== null ? (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {chyba}
          </p>
        ) : null}
        <div className={PATICKA_SHEETU}>
          <button type="button" onClick={onZavrit} disabled={odesilaSe} className={TLACITKO_ZRUSIT}>
            Zrušit
          </button>
          <button
            type="button"
            onClick={onPotvrdit}
            disabled={odesilaSe}
            className={TLACITKO_ZELENE}
          >
            {odesilaSe ? "Přihlašuji…" : "Přihlásit se"}
          </button>
        </div>
      </div>
    </SpodniSheet>
  );
}