import { useId, useState, type JSX } from "react";
import { POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import SpodniSheet, { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData, jeBezOmezeni, volnaMista } from "../../lib/expedition-utils";
import { rozlozSraz } from "../../lib/sraz";
import { zobrazitUzavirkuPrihlaseni } from "../../lib/vyprava-uzavirka";

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
  const sraz = rozlozSraz(expedice.sraz);
  const radky = [
    { popisek: "Sraz", hodnota: [sraz.misto, sraz.cas].filter((cast) => cast !== null && cast.length > 0).join(", ") },
    {
      popisek: "Volná místa",
      hodnota: bezOmezeni ? "bez omezení" : volna > 0 ? `${volna} z ${expedice.kapacita.celkem}` : "žádná",
    },
    { popisek: "Uzávěrka", hodnota: zobrazitUzavirkuPrihlaseni(expedice.datum).toLocaleLowerCase("cs") },
  ];
  return (
    <SpodniSheet
      otevreno={otevreno}
      titulek="Přihlásit se na výpravu"
      podtitul={
        <>
          {expedice.nazev} ·{" "}
          <time dateTime={expedice.datum}>{formatRozsahData(expedice.datum, expedice.datumDo)}</time>
        </>
      }
      sirka={480}
      onZavrit={onZavrit}
    >
      <dl className="flex flex-col gap-2.5 rounded-[14px] bg-papir p-3.5 min-[90rem]:gap-3.5 min-[90rem]:rounded-none min-[90rem]:bg-transparent min-[90rem]:p-0">
        {radky.map((radek) => (
          <div
            key={radek.popisek}
            className="flex items-baseline justify-between gap-4 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-[9px]"
          >
            <dt className="shrink-0 text-[13px] text-ink-3 min-[90rem]:text-[11.5px]">{radek.popisek}</dt>
            <dd className="m-0 min-w-0 text-right text-[13.5px] font-semibold text-inkoust min-[90rem]:text-xs min-[90rem]:text-mech">
              {radek.hodnota}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-[18px] min-[90rem]:mt-3.5">
        <label htmlFor={`${popisId}-vzkaz`} className={`block ${POPISEK_POLE}`}>
          Vzkaz pro vedoucího (nepovinný)
        </label>
        <textarea
          id={`${popisId}-vzkaz`}
          value={vzkaz}
          onChange={(e) => setVzkaz(e.target.value)}
          rows={1}
          className={`mt-1.5 block resize-none py-3 min-[90rem]:mt-[5px] min-[90rem]:!h-16 min-[90rem]:py-2.5 min-[90rem]:!text-xs ${POLE_FORMULARE}`}
          placeholder="Např. pojedu z Brna a vezmu auto…"
        />
      </div>
      {chyba !== null ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-akcent">
          {chyba}
        </p>
      ) : null}
      <div className={PATICKA_SHEETU}>
        <button type="button" onClick={onZavrit} disabled={odesilaSe} className={TLACITKO_PATICKY_ZRUSIT}>
          Zrušit
        </button>
        <button type="button" onClick={onPotvrdit} disabled={odesilaSe} className={TLACITKO_PATICKY_HLAVNI}>
          {odesilaSe ? "Přihlašuji…" : "Přihlásit se"}
        </button>
      </div>
    </SpodniSheet>
  );
}