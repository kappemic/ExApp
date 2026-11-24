import type { JSX } from "react";
import Ikona from "../Ikona";
import SpodniSheet, { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "./SpodniSheet";
import { usePwaInstalace } from "../../hooks/usePwaInstalace";

const VYHODY = ["Celá obrazovka bez adresního řádku", "Historie výprav i bez sítě"] as const;

type PridatNaPlochuSheetProps = {
  otevreno: boolean;
  onZavrit: () => void;
};

export default function PridatNaPlochuSheet({
  otevreno,
  onZavrit,
}: PridatNaPlochuSheetProps): JSX.Element {
  const { naPlose, instalace, pridejNaPlochu } = usePwaInstalace();

  async function naInstalaci(): Promise<void> {
    await pridejNaPlochu();
    onZavrit();
  }

  return (
    <SpodniSheet
      otevreno={otevreno}
      titulek="Přidat na plochu?"
      podtitul="ExApp se přidá na plochu telefonu."
      sirka={420}
      onZavrit={onZavrit}
    >
      <p className="mb-3.5 hidden text-xs leading-[18px] text-mech min-[90rem]:block">
        Bez instalace nebude historie dostupná offline.
      </p>
      <ul className="flex flex-col gap-2.5 rounded-[14px] bg-papir p-3.5 min-[90rem]:gap-3.5 min-[90rem]:bg-transparent min-[90rem]:p-0">
        {VYHODY.map((vyhoda) => (
          <li key={vyhoda} className="flex items-center gap-2 text-sm text-inkoust min-[90rem]:text-[11.5px] min-[90rem]:font-medium min-[90rem]:text-mech">
            <span className="flex shrink-0 items-center justify-center text-smrk min-[90rem]:size-[18px] min-[90rem]:rounded-full min-[90rem]:bg-mlha">
              <Ikona nazev="check" className="size-4 min-[90rem]:size-[11px]" />
            </span>
            {vyhoda}
          </li>
        ))}
      </ul>
      {naPlose ? (
        <p className="mt-[18px] text-[13.5px] leading-5 text-mech">ExApp už běží z ikony na ploše.</p>
      ) : instalace === null ? (
        <p className="mt-[18px] text-[13.5px] leading-5 text-mech min-[90rem]:text-xs min-[90rem]:leading-[18px]">
          Na iPhonu klepni na Sdílet a pak na Přidat na plochu. Jinde použij nabídku prohlížeče, až
          ikonu nabídne.
        </p>
      ) : null}
      <div className={PATICKA_SHEETU}>
        <button type="button" onClick={onZavrit} className={TLACITKO_PATICKY_ZRUSIT}>
          {naPlose ? "Zavřít" : "Teď ne"}
        </button>
        {naPlose ? null : (
          <button
            type="button"
            disabled={instalace === null}
            onClick={() => void naInstalaci()}
            className={TLACITKO_PATICKY_HLAVNI}
          >
            Nainstalovat
          </button>
        )}
      </div>
    </SpodniSheet>
  );
}