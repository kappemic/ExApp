import type { JSX } from "react";
import {
  fotkyHoverBgJantar,
  fotkyHoverBgJantarPlne,
  fotkyTlacitkoZaklad,
} from "./fotky-ui";

interface FotkyMazaciHlavickaProps {
  isAdmin: boolean;
  maFotky: boolean;
  mazaciRezim: boolean;
  vybranyPocet: number;
  mazeSe: boolean;
  onZacniMazani: () => void;
  onZrusMazani: () => void;
  onSmazatVybrane: () => void;
  onSmazatVse: () => void;
}

/**
 * Admin delete controls for a top bar next to close.
 * "Smazat vše" is shown only in delete mode.
 */
export default function FotkyMazaciHlavicka({
  isAdmin,
  maFotky,
  mazaciRezim,
  vybranyPocet,
  mazeSe,
  onZacniMazani,
  onZrusMazani,
  onSmazatVybrane,
  onSmazatVse,
}: FotkyMazaciHlavickaProps): JSX.Element | null {
  if (!isAdmin || !maFotky) return null;

  const zaklad = `${fotkyTlacitkoZaklad} w-full rounded-full border-2 px-3 text-sm font-bold disabled:opacity-60 sm:w-auto`;
  const destruktivni = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik ring-1 ring-jantar/35 ${fotkyHoverBgJantar}`;
  const destruktivniPlne = `${zaklad} border-inkoust bg-jantar text-papir shadow-denik ${fotkyHoverBgJantarPlne}`;
  const neutralni = `${zaklad} border-inkoust bg-papir text-inkoust shadow-denik`;

  if (!mazaciRezim) {
    return (
      <button type="button" onClick={onZacniMazani} className={destruktivni}>
        Smazat
      </button>
    );
  }

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:min-w-[11rem]"
      data-fotky-mazaci-akce
    >
      <button type="button" onClick={onZrusMazani} disabled={mazeSe} className={neutralni}>
        Zrušit
      </button>
      <button type="button" onClick={onSmazatVse} disabled={mazeSe} className={destruktivniPlne}>
        Smazat vše
      </button>
      <button
        type="button"
        onClick={onSmazatVybrane}
        disabled={vybranyPocet === 0 || mazeSe}
        className={destruktivni}
      >
        Smazat vybrané
      </button>
    </div>
  );
}
