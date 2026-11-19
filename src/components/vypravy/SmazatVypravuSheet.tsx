import { useEffect, useState, type JSX } from "react";
import SpodniSheet, { PATICKA_SHEETU } from "../shell/SpodniSheet";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData } from "../../lib/expedition-utils";
import {
  nactiPoctySmazaniVypravy,
  type PoctySmazaniVypravy,
} from "../../lib/vyprava-pocty-smazani";

const TLACITKO_SMAZAT =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-akcent px-5 text-base font-semibold text-papir hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-not-allowed disabled:opacity-60";
const TLACITKO_ZRUSIT =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-pole bg-papir px-5 text-base font-semibold text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60";

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

  return (
    <SpodniSheet otevreno={otevreno} titulek="Smazat výpravu?" onZavrit={onZavrit}>
      <div className="space-y-4 pb-2">
        <p className="font-display text-lg font-bold text-inkoust">{expedice.nazev}</p>
        <p className="text-sm text-mech">
          <time dateTime={expedice.datum}>{formatRozsahData(expedice.datum, expedice.datumDo)}</time>
        </p>
        <p className="rounded-2xl border border-red-800/25 bg-red-50 px-4 py-3 text-sm leading-relaxed text-inkoust">
          Tahle akce je nevratná. Smažou se i související záznamy.
        </p>
        <ul className="space-y-1 text-sm text-mech">
          <li>{ceskyPocetZaznamu(dochazka)} docházky</li>
          <li>
            {fotky === 1 ? "1 fotka" : fotky >= 2 && fotky <= 4 ? `${fotky} fotky` : `${fotky} fotek`}
          </li>
          <li>
            {zpravy === 1 ? "1 zpráva" : zpravy >= 2 && zpravy <= 4 ? `${zpravy} zprávy` : `${zpravy} zpráv`}
          </li>
        </ul>
        {chyba !== null ? (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {chyba}
          </p>
        ) : null}
        <div className={PATICKA_SHEETU}>
          <button type="button" onClick={onZavrit} disabled={mazeSe} className={TLACITKO_ZRUSIT}>
            Zrušit
          </button>
          <button type="button" onClick={onPotvrdit} disabled={mazeSe} className={TLACITKO_SMAZAT}>
            {mazeSe ? "Mažu…" : "Smazat"}
          </button>
        </div>
      </div>
    </SpodniSheet>
  );
}