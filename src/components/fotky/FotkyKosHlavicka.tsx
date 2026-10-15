import type { JSX } from "react";
import {
  fotkyHoverBgJantar,
  fotkyHoverBgJantarPlne,
  fotkyHoverBgSmrk,
  fotkyHoverBgSmrkPlne,
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

  const zaklad = `${fotkyTlacitkoZaklad} rounded-full border-2 px-3 text-sm font-bold disabled:opacity-60 max-sm:min-h-[40px] max-sm:min-w-0 max-sm:px-2.5 max-sm:text-xs`;
  const neutralni = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik`;
  const spravovat = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik ring-1 ring-smrk/30`;
  const obnovit = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik ring-1 ring-smrk/35 ${fotkyHoverBgSmrk}`;
  const obnovitPlne = `${zaklad} border-inkoust bg-smrk text-papir shadow-denik ${fotkyHoverBgSmrkPlne}`;
  const destruktivniPlne = `${zaklad} border-inkoust bg-jantar text-papir shadow-denik ${fotkyHoverBgJantarPlne}`;
  const destruktivniOkraj = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik ring-1 ring-jantar/35 ${fotkyHoverBgJantar}`;

  if (!spravovaciRezim) {
    return (
      <button type="button" onClick={onZacniSpravovat} className={`${spravovat} w-full sm:w-auto`}>
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
        className={`${neutralni} w-full shrink-0 sm:w-auto`}
      >
        Zrušit
      </button>

      <div
        className="grid w-full min-w-0 grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:items-center sm:gap-2"
        data-fotky-kos-skupina-obnovit
        role="group"
        aria-label="Obnovit fotky"
      >
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
          <span className="sm:hidden">Vybrané</span>
          <span className="hidden sm:inline">Obnovit vybrané</span>
        </button>
      </div>

      <div
        className="hidden h-6 w-px shrink-0 bg-inkoust/15 sm:block"
        aria-hidden
        data-fotky-kos-delic
      />

      <div
        className="grid w-full min-w-0 grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:items-center sm:gap-2"
        data-fotky-kos-skupina-smazat
        role="group"
        aria-label="Smazat natrvalo"
      >
        <button
          type="button"
          onClick={onSmazatNatrvaloVse}
          disabled={pracujeSe}
          className={destruktivniPlne}
        >
          <span className="sm:hidden">Natrvalo vše</span>
          <span className="hidden sm:inline">Smazat natrvalo vše</span>
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
          <span className="sm:hidden">Natrvalo vybr.</span>
          <span className="hidden sm:inline">Smazat natrvalo vybrané</span>
        </button>
      </div>
    </div>
  );
}
