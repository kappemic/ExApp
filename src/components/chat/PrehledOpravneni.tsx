import type { JSX } from "react";
import { souhrnPrav, type ApiChatSkupina } from "../../lib/skupiny-pristup";
import { barvaAvataru } from "../AvatarKruh";
import Ikona from "../Ikona";
import { PATICKA_SHEETU, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";

/** Všechny skupiny a kdo do nich smí. Klepnutí otevře formulář skupiny. */
export default function PrehledOpravneni({
  skupiny,
  onVybrat,
  onZavrit,
}: {
  skupiny: readonly ApiChatSkupina[];
  onVybrat: (skupina: ApiChatSkupina) => void;
  onZavrit: () => void;
}): JSX.Element {
  return (
    <>
      {skupiny.length === 0 ? (
        <p role="status" className="rounded-[14px] bg-papir px-4 py-6 text-center text-[13.5px] text-mech">
          Zatím tu není žádná skupina. Založíš ji přes Napsat.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 min-[90rem]:gap-1.5">
          {skupiny.map((skupina) => {
            const { pise, cte } = souhrnPrav(skupina.prava);
            return (
              <li key={skupina.id}>
                <button
                  type="button"
                  onClick={() => onVybrat(skupina)}
                  className="bez-prejeti flex min-h-[60px] w-full items-center gap-3 rounded-[14px] bg-papir p-3 text-left hover:bg-povrch-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation] min-[90rem]:rounded-[10px] min-[90rem]:bg-povrch-2 min-[90rem]:px-[11px] min-[90rem]:py-2.5 min-[90rem]:hover:bg-linka"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[11px] text-[11.5px] font-bold text-povrch ${barvaAvataru(skupina.nazev)}`}
                  >
                    {Array.from(skupina.nazev.trim()).slice(0, 2).join("").toLocaleUpperCase("cs")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 min-[90rem]:gap-px">
                    <span className="truncate text-sm font-semibold text-inkoust min-[90rem]:text-[12.5px]">{skupina.nazev}</span>
                    <span className="text-[12.5px] text-mech min-[90rem]:text-[11px]">Píše: {pise}</span>
                    {cte !== null ? (
                      <span className="text-[12.5px] text-mech min-[90rem]:text-[11px]">Jen čte: {cte}</span>
                    ) : null}
                  </span>
                  <Ikona nazev="chevron-right" className="size-4 shrink-0 text-ink-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={PATICKA_SHEETU}>
        <button type="button" onClick={onZavrit} className={TLACITKO_PATICKY_ZRUSIT}>
          Zavřít
        </button>
      </div>
    </>
  );
}
