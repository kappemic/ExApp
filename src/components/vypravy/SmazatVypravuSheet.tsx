import { useEffect, useState, type JSX } from "react";
import Ikona from "../Ikona";
import SpodniSheet, { PATICKA_SHEETU, TLACITKO_PATICKY_SMAZAT, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData } from "../../lib/expedition-utils";
import {
  nactiPoctySmazaniVypravy,
  type PoctySmazaniVypravy,
} from "../../lib/vyprava-pocty-smazani";

function ceskyPocetZaznamu(n: number): string {
  if (n === 1) return "1 záznam";
  if (n >= 2 && n <= 4) return `${n} záznamy`;
  return `${n} záznamů`;
}

export default function SmazatVypravuSheet({
  otevreno,
  expedice,
  pocetUcastniku,
  mazeSe,
  chyba,
  onZavrit,
  onPotvrdit,
}: {
  otevreno: boolean;
  expedice: Expedition;
  pocetUcastniku: number;
  mazeSe: boolean;
  chyba: string | null;
  onZavrit: () => void;
  onPotvrdit: () => void;
}): JSX.Element {
  const [pocty, setPocty] = useState<PoctySmazaniVypravy | null>(null);
  useEffect(() => {
    if (!otevreno) {
      setPocty(null);
      return;
    }
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiPoctySmazaniVypravy(expedice.id, pocetUcastniku);
      if (zive) setPocty(vysledek);
    })();
    return () => {
      zive = false;
    };
  }, [otevreno, expedice.id, pocetUcastniku]);

  const dochazka = pocty?.dochazka ?? pocetUcastniku;
  const fotky = pocty?.fotky ?? 0;
  const zpravy = pocty?.zpravy ?? 0;

  const souvisejici = [
    `${ceskyPocetZaznamu(dochazka)} docházky`,
    `${fotky === 1 ? "1 fotka" : fotky >= 2 && fotky <= 4 ? `${fotky} fotky` : `${fotky} fotek`} v albu`,
    `${zpravy === 1 ? "1 zpráva" : zpravy >= 2 && zpravy <= 4 ? `${zpravy} zprávy` : `${zpravy} zpráv`} v diskuzi`,
  ];

  return (
    <SpodniSheet
      otevreno={otevreno}
      titulek="Smazat výpravu?"
      podtitul={
        <>
          {expedice.nazev} ·{" "}
          <time dateTime={expedice.datum}>{formatRozsahData(expedice.datum, expedice.datumDo)}</time>
        </>
      }
      sirka={440}
      onZavrit={onZavrit}
    >
      <div className="flex flex-col gap-[18px] min-[90rem]:gap-3.5">
        <div className="flex gap-2.5 min-[90rem]:rounded-[10px] min-[90rem]:bg-[#fbede7] min-[90rem]:p-3">
          <Ikona nazev="triangle-alert" className="hidden size-[15px] text-akcent min-[90rem]:block" />
          <p className="text-[13.5px] leading-5 text-mech min-[90rem]:text-[11.5px] min-[90rem]:leading-[17px] min-[90rem]:text-[#7a3a1b]">
            Smazáním zmizí i docházka, fotky a diskuze k výpravě. Akce se nedá vrátit.
          </p>
        </div>
        <ul className="flex flex-col gap-2 rounded-[14px] bg-akcent-100 p-3.5 min-[90rem]:gap-[7px] min-[90rem]:bg-transparent min-[90rem]:p-0">
          {souvisejici.map((radek) => (
            <li
              key={radek}
              className="flex items-center gap-2 text-[13.5px] font-semibold text-akcent min-[90rem]:text-[11.5px] min-[90rem]:font-normal min-[90rem]:text-ink-3"
            >
              <span aria-hidden="true" className="hidden size-[5px] shrink-0 rounded-full bg-ink-5 min-[90rem]:block" />
              {radek}
            </li>
          ))}
        </ul>
        {chyba !== null ? (
          <p role="alert" className="text-[13px] font-semibold text-akcent">
            {chyba}
          </p>
        ) : null}
      </div>
      <div className={PATICKA_SHEETU}>
        <button type="button" onClick={onZavrit} disabled={mazeSe} className={TLACITKO_PATICKY_ZRUSIT}>
          Zrušit
        </button>
        <button type="button" onClick={onPotvrdit} disabled={mazeSe} className={TLACITKO_PATICKY_SMAZAT}>
          {mazeSe ? "Mažu…" : "Smazat"}
        </button>
      </div>
    </SpodniSheet>
  );
}