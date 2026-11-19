import type { JSX } from "react";
import {
  fotkyHoverBgJantar,
  fotkyHoverBgJantarPlne,
  fotkyHoverBgSmrk,
  fotkyHoverBgOkrPlne,
  fotkyKosAkceObal,
  fotkyTlacitkoZaklad,
} from "./fotky-ui";

interface FotkyKosHlavickaProps {
  maFotky: boolean;
  spravovaciRezim: boolean;
  vybranyPocet: number;
  pracujeSe: boolean;
  onZacniSpravovat: () => void;
  onZrusit: () => void;
  onObnovitVybrane: () => void;
  onObnovitVse: () => void;
  onSmazatNatrvaloVybrane: () => void;
  onSmazatNatrvaloVse: () => void;
}

/**
 * Admin trash actions: restore or permanently delete selected photos.
 */
export default function FotkyKosHlavicka({
  maFotky,
  spravovaciRezim,
  vybranyPocet,
  pracujeSe,
  onZacniSpravovat,
  onZrusit,
  onObnovitVybrane,
  onObnovitVse,
  onSmazatNatrvaloVybrane,
  onSmazatNatrvaloVse,
}: FotkyKosHlavickaProps): JSX.Element | null {
  if (!maFotky) return null;

  const zaklad = `${fotkyTlacitkoZaklad} min-w-0 w-full rounded-lg border px-2.5 text-center text-xs font-bold leading-tight whitespace-normal disabled:opacity-60 sm:w-auto sm:px-3 sm:text-sm`;
  const neutralni = `${zaklad} border-linka bg-povrch text-inkoust shadow-denik`;
  const spravovat = `${fotkyTlacitkoZaklad} w-auto rounded-lg border border-linka bg-papir px-3 text-sm font-bold text-inkoust shadow-denik ring-1 ring-smrk/30`;
  const obnovit = `${zaklad} border-linka bg-povrch text-inkoust shadow-denik ring-1 ring-smrk/35 ${fotkyHoverBgSmrk}`;
  const obnovitPlne = `${zaklad} border-okr bg-okr text-inkoust shadow-denik ${fotkyHoverBgOkrPlne}`;
  const destruktivniPlne = `${zaklad} border-jantar bg-jantar text-papir shadow-denik ${fotkyHoverBgJantarPlne}`;
  const destruktivniOkraj = `${zaklad} border-linka bg-povrch text-inkoust shadow-denik ring-1 ring-jantar/35 ${fotkyHoverBgJantar}`;

  if (!spravovaciRezim) {
    return (
      <button type="button" onClick={onZacniSpravovat} className={spravovat}>
        Spravovat
      </button>
    );
  }

  return (
    <div className={fotkyKosAkceObal} data-fotky-kos-akce>
      <button
        type="button"
        onClick={onZrusit}
        disabled={pracujeSe}
        className={`${neutralni} order-last col-span-2 sm:order-none sm:col-span-1`}
      >
        Zrušit
      </button>

      <div className="contents" data-fotky-kos-skupina-obnovit role="group" aria-label="Obnovit fotky">
        <button type="button" onClick={onObnovitVse} disabled={pracujeSe} className={obnovitPlne}>
          Obnovit vše
        </button>
        <button
          type="button"
          onClick={onObnovitVybrane}
          disabled={vybranyPocet === 0 || pracujeSe}
          className={obnovit}
          aria-label={
            vybranyPocet > 0 ? `Obnovit vybrané (${vybranyPocet})` : "Obnovit vybrané"
          }
        >
          Obnovit vybrané
        </button>
      </div>

      <div
        className="hidden h-6 w-px shrink-0 bg-inkoust/15 sm:block"
        aria-hidden
        data-fotky-kos-delic
      />

      <div className="contents" data-fotky-kos-skupina-smazat role="group" aria-label="Smazat natrvalo">
        <button
          type="button"
          onClick={onSmazatNatrvaloVse}
          disabled={pracujeSe}
          className={destruktivniPlne}
        >
          Smazat natrvalo vše
        </button>
        <button
          type="button"
          onClick={onSmazatNatrvaloVybrane}
          disabled={vybranyPocet === 0 || pracujeSe}
          className={destruktivniOkraj}
          aria-label={
            vybranyPocet > 0
              ? `Smazat natrvalo vybrané (${vybranyPocet})`
              : "Smazat natrvalo vybrané"
          }
        >
          Smazat natrvalo vybrané
        </button>
      </div>
    </div>
  );
}
