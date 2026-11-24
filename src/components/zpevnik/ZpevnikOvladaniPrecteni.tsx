import type { JSX } from "react";
import Ikona from "../Ikona";
import { popisRychlosti, type Posouvani } from "../../hooks/usePosouvani";

const FOKUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/** Telefon: jedna pilulka „1,0× Zastavit“ vedle „Text a akordy“. */
export function PosouvaniPilulka({ posouvani }: { posouvani: Posouvani }): JSX.Element {
  return (
    <button
      type="button"
      data-posouvani=""
      onClick={posouvani.prepni}
      aria-pressed={posouvani.bezi}
      className={`nahled-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[18px] bg-smrk px-3 text-[12.5px] font-semibold text-povrch ${FOKUS}`}
    >
      <Ikona nazev={posouvani.bezi ? "pause" : "play"} className="size-3.5" />
      {popisRychlosti(posouvani.rychlost)} {posouvani.bezi ? "Zastavit" : "Posouvat"}
    </button>
  );
}

/** Počítač: lišta s přehrávacím tlačítkem, rychlostí a „Zastavit“. */
export function PosouvaniLista({ posouvani }: { posouvani: Posouvani }): JSX.Element {
  const krok = `bez-prejeti flex size-6 items-center justify-center rounded-[7px] text-mech hover:bg-povrch-2 ${FOKUS}`;
  return (
    <div data-posouvani="" className="hidden items-center gap-2.5 rounded-xl bg-povrch-2 px-2.5 py-2 min-[90rem]:flex">
      <button
        type="button"
        onClick={posouvani.prepni}
        aria-label={posouvani.bezi ? "Pozastavit posouvání" : "Spustit posouvání"}
        className={`nahled-press flex size-[30px] items-center justify-center rounded-full bg-smrk text-povrch ${FOKUS}`}
      >
        <Ikona nazev={posouvani.bezi ? "pause" : "play"} className="size-3" />
      </button>
      <span className="flex-1" />
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
