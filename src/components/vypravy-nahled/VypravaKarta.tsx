import type { JSX } from "react";
import VypravaNahled from "../expeditions/VypravaNahled";
import { useNahledFotkaId } from "../../hooks/useNahledFotkaId";
import type { Expedition } from "../../lib/mock-expeditions";
import { formatRozsahData, jeBezOmezeni } from "../../lib/expedition-utils";

/** Closed-trip card from the journal guide: square frame, 4:3 photo, no shadow. */
export default function VypravaKarta({
  expedice,
  neprecteno,
  onDetail,
}: {
  expedice: Expedition;
  neprecteno: boolean;
  onDetail: (expedice: Expedition) => void;
}): JSX.Element {
  const fotkaId = useNahledFotkaId(expedice.id, expedice.nahledFotkaId);
  const kapacita = jeBezOmezeni(expedice)
    ? `${expedice.kapacita.prihlaseno} přihlášeno`
    : `${expedice.kapacita.prihlaseno}/${expedice.kapacita.celkem}`;

  return (
    <button
      type="button"
      onClick={() => onDetail(expedice)}
      aria-label={`Detail výpravy ${expedice.nazev}`}
      className="nahled-press nahled-karta flex h-full w-full flex-col border border-[hsl(var(--foreground))] bg-[hsl(var(--card))] text-left text-[hsl(var(--foreground))]"
    >
      <span className="nahled-karta-foto relative block aspect-[4/3] overflow-hidden border-b border-[hsl(var(--foreground))]">
        <VypravaNahled expeditionId={expedice.id} fotkaId={fotkaId} probehla />
      </span>
      <span className="flex min-w-0 flex-1 flex-col p-4">
        <span className="flex min-w-0 items-start gap-2">
          <span className="font-expanded min-w-0 flex-1 text-lg font-extrabold leading-tight tracking-tight">
            {expedice.nazev}
          </span>
          {neprecteno ? (
            <span className="shrink-0 pt-1 font-condensed text-[11px] uppercase tracking-[0.18em]">
              nové
            </span>
          ) : null}
        </span>
        <time
          dateTime={expedice.datum}
          className="mt-2 block font-condensed text-xs uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]"
        >
          {formatRozsahData(expedice.datum, expedice.datumDo)}
        </time>
        <span className="mt-2 line-clamp-3 text-sm leading-relaxed">
          {expedice.popis}
        </span>
        <span className="mt-3 block text-sm">
          <span className="font-condensed text-[11px] font-semibold uppercase tracking-[0.2em]">
            Sraz
          </span>{" "}
          {expedice.sraz}
        </span>
        <span className="mt-auto pt-4 font-condensed text-xs uppercase tracking-[0.18em]">
          {kapacita} · archiv
        </span>
      </span>
    </button>
  );
}
