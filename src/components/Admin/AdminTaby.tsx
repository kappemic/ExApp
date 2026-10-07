import type { JSX, KeyboardEvent } from "react";

export type ClenoveTabId = "vsichni" | "aktivni" | "rada" | "vedeni" | "clenove";

export interface ClenoveTab {
  id: ClenoveTabId;
  popisek: string;
}

export const CLENOVE_TABY: readonly ClenoveTab[] = [
  { id: "vsichni", popisek: "Všichni" },
  { id: "aktivni", popisek: "Aktivní" },
  { id: "rada", popisek: "Rada" },
  { id: "vedeni", popisek: "Vedení" },
  { id: "clenove", popisek: "Členové" },
] as const;

export type PoctyTabu = Record<ClenoveTabId, number>;

interface AdminTabyProps {
  aktivniTab: ClenoveTabId;
  pocty: PoctyTabu;
  onZmena: (tab: ClenoveTabId) => void;
  idPrefix?: string;
}

/**
 * Záložky seznamu členů — exapp „rejstřík" s počty.
 * Scrollovatelné na mobilu, min. 44px touch target, plná klávesnice
 * (šipky / Home / End), viditelný focus řeší globální :focus-visible.
 */
export default function AdminTaby({
  aktivniTab,
  pocty,
  onZmena,
  idPrefix = "clenove",
}: AdminTabyProps): JSX.Element {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const poradi = CLENOVE_TABY.map((t) => t.id);
    const idx = poradi.indexOf(aktivniTab);
    let dalsi: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dalsi = (idx + 1) % poradi.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      dalsi = (idx - 1 + poradi.length) % poradi.length;
    else if (e.key === "Home") dalsi = 0;
    else if (e.key === "End") dalsi = poradi.length - 1;
    if (dalsi === null) return;
    e.preventDefault();
    const noveId = poradi[dalsi];
    onZmena(noveId);
    document.getElementById(`${idPrefix}-tab-${noveId}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Skupiny členů"
      onKeyDown={onKeyDown}
      className="mt-4 flex max-w-full items-stretch gap-1 overflow-x-auto rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik sm:flex-wrap"
    >
      {CLENOVE_TABY.map((tab) => {
        const aktivni = aktivniTab === tab.id;
        const pocet = pocty[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={aktivni}
            aria-controls={aktivni ? `${idPrefix}-panel-${tab.id}` : undefined}
            tabIndex={aktivni ? 0 : -1}
            onClick={() => onZmena(tab.id)}
            className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded px-4 py-2 text-sm font-bold transition-colors ${
              aktivni
                ? "bg-inkoust text-papir"
                : "text-inkoust hover:bg-linka/60"
            }`}
          >
            {tab.popisek}
            <span
              aria-label={`${pocet} členů – ${tab.popisek}`}
              className={`inline-flex min-h-[24px] min-w-[28px] items-center justify-center rounded-full border px-1.5 text-xs font-extrabold tabular-nums ${
                aktivni
                  ? "border-papir/40 bg-papir/15 text-papir"
                  : "border-linka bg-papir text-mech"
              }`}
            >
              {pocet}
            </span>
          </button>
        );
      })}
    </div>
  );
}
