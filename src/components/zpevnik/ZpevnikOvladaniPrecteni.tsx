import type { JSX } from "react";
import Ikona from "../Ikona";
import type { Posouvani } from "../../hooks/usePosouvani";
import { MAX_RYCHLOST, MIN_RYCHLOST, popisRychlosti } from "../../lib/zpevnik-cteni";

const FOKUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/**
 * Telefon: plovoucí pilulka s rychlostí a spuštěním, drží nahoře i při posunu.
 * Za běhu zůstane z tlačítka jen ikona, aby pilulka nezakrývala text.
 */
export function PosouvaniPilulka({ posouvani }: { posouvani: Posouvani }): JSX.Element {
  const krok = `nahled-press flex size-11 items-center justify-center rounded-full disabled:opacity-40 ${FOKUS}`;
  return (
    <div
      data-posouvani=""
      className="pointer-events-auto inline-flex h-11 shrink-0 items-center rounded-full bg-smrk text-[13px] font-semibold text-povrch [touch-action:manipulation]"
    >
      <button type="button" aria-label="Zpomalit" disabled={posouvani.rychlost <= MIN_RYCHLOST} onClick={() => posouvani.zmenRychlost(-1)} className={krok}>
        <Ikona nazev="minus" className="size-3.5" />
      </button>
      <span aria-live="polite" className="min-w-10 text-center tabular-nums">
        {popisRychlosti(posouvani.rychlost)}
      </span>
      <button type="button" aria-label="Zrychlit" disabled={posouvani.rychlost >= MAX_RYCHLOST} onClick={() => posouvani.zmenRychlost(1)} className={krok}>
        <Ikona nazev="plus" className="size-3.5" />
      </button>
      <span aria-hidden="true" className="h-5 w-px bg-povrch/25" />
      <button
        type="button"
        onClick={posouvani.prepni}
        aria-label={posouvani.bezi ? "Pozastavit posouvání" : "Spustit posouvání"}
        className={`nahled-press inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full ${posouvani.bezi && posouvani.odpocet === null ? "" : "pl-3 pr-4"} ${FOKUS}`}
      >
        <Ikona nazev={posouvani.bezi ? "pause" : "play"} className={posouvani.bezi ? "size-4" : "size-3.5"} />
        {posouvani.bezi ? null : "Posouvat"}
        {posouvani.odpocet !== null ? <span className="tabular-nums">{posouvani.odpocet} s</span> : null}
      </button>
    </div>
  );
}

/** Počítač: lišta s přehrávacím tlačítkem, rychlostí a „Zastavit“. Drží pod horní lištou (76 px),
 * stín v barvě karty zakrývá text v mezeře nad ní. */
export function PosouvaniLista({ posouvani }: { posouvani: Posouvani }): JSX.Element {
  const krok = `bez-prejeti flex size-6 items-center justify-center rounded-[7px] text-mech hover:bg-povrch-2 ${FOKUS}`;
  return (
    <div data-posouvani="" className="sticky top-[88px] z-10 hidden shadow-[0_-12px_0_var(--color-povrch)] items-center gap-2.5 rounded-xl bg-povrch-2 px-2.5 py-2 min-[90rem]:flex">
      <button
        type="button"
        onClick={posouvani.prepni}
        aria-label={posouvani.bezi ? "Pozastavit posouvání" : "Spustit posouvání"}
        className={`nahled-press flex size-[30px] items-center justify-center rounded-full bg-smrk text-povrch ${FOKUS}`}
      >
        <Ikona nazev={posouvani.bezi ? "pause" : "play"} className="size-3" />
      </button>
      <span className="flex-1 text-[11.5px] font-semibold text-mech tabular-nums">
        {posouvani.odpocet !== null ? `Začne za ${posouvani.odpocet} s` : null}
      </span>
      <span className="flex items-center gap-0.5 rounded-[9px] border border-linka bg-povrch p-[3px]">
        <button type="button" aria-label="Zpomalit" onClick={() => posouvani.zmenRychlost(-1)} className={krok}>
          <Ikona nazev="minus" className="size-3" />
        </button>
        <span className="min-w-9 text-center text-[11.5px] font-semibold text-inkoust">{popisRychlosti(posouvani.rychlost)}</span>
        <button type="button" aria-label="Zrychlit" onClick={() => posouvani.zmenRychlost(1)} className={krok}>
          <Ikona nazev="plus" className="size-3" />
        </button>
      </span>
      <button
        type="button"
        onClick={posouvani.zastav}
        className={`bez-prejeti flex h-[26px] items-center rounded-lg px-[9px] text-[11.5px] font-semibold text-ink-3 hover:text-inkoust ${FOKUS}`}
      >
        Zastavit
      </button>
    </div>
  );
}
