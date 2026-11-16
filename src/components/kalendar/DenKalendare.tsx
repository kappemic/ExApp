import type { JSX } from "react";
import { paletaVypravy } from "../../lib/krajina";
import {
  schuzkyDne,
  vypravyDne,
  type KalendarniUdalost,
  type PoziceVPasu,
} from "../../lib/kalendar";

export const DNY_V_TYDNU = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

/** Kolik pruhů výprav se do buňky vejde, zbytek je „+N“. */
const MAX_PRUHU = 2;

/** Řádek zkratek dnů nad mřížkou. */
export function HlavickaDnu(): JSX.Element {
  return (
    <div aria-hidden="true" className="grid grid-cols-7 text-center">
      {DNY_V_TYDNU.map((den) => (
        <span key={den} className="pb-2 text-[13px] font-medium text-mech lg:pl-2 lg:text-left">
          {den}
        </span>
      ))}
    </div>
  );
}

/** Akcent výpravy a jeho jemný podklad (barvy palety výpravy podle ročního období). */
function barvyVypravy(id: string, datum: string): { akcent: string; podklad: string } {
  const akcent = paletaVypravy(id, datum).akcent;
  return { akcent, podklad: `color-mix(in oklab, ${akcent} 16%, white)` };
}

/**
 * Tvar pruhu podle pozice v pásu. Pruh vede od kraje ke kraji buňky,
 * takže navazuje na sousední den. Začátek a konec odsazené a zaoblené.
 */
function tvarPruhu(pozice: PoziceVPasu): string {
  switch (pozice) {
    case "start":
      return "ml-1 rounded-l-md";
    case "middle":
      return "";
    case "end":
      return "mr-1 rounded-r-md";
    case "single":
      return "mx-1 rounded-md";
  }
}

function TeckySchuzek({ pocet }: { pocet: number }): JSX.Element | null {
  if (pocet <= 0) return null;
  const viditelne = Math.min(pocet, 2);
  const zbytek = pocet - viditelne;
  return (
    <span aria-hidden="true" className="flex items-center justify-center gap-1 px-0.5 lg:justify-start lg:px-2">
      {Array.from({ length: viditelne }, (_, i) => (
        <span key={i} className="inline-block h-2 w-2 shrink-0 rounded-full bg-okr" />
      ))}
      {zbytek > 0 ? (
        <span className="text-[10px] font-semibold leading-none tabular-nums text-mech">+{zbytek}</span>
      ) : null}
      <span className="hidden text-[12px] font-medium text-jantar lg:inline">
        {pocet === 1 ? "schůzka" : `${pocet} schůzky`}
      </span>
    </span>
  );
}

/**
 * Buňka dne (C2), sdílená měsícem i týdnem. Každá výprava je vlastní pruh
 * v barvě své palety, který navazuje přes sousední dny; souběžné výpravy
 * leží pod sebou. Na úzké šířce nese pruh zkratku názvu, od `lg` jen
 * na začátku pásu. Schůzka je okrová tečka. Dnešek tmavé kolečko,
 * vybraný den olivový prstenec. Den mimo měsíc je tlumený a otevře den.
 * Název události nese vždy jen `aria-label`, vizuál je doplněk.
 */
export function DenKalendare({
  den,
  udalosti,
  pozicePro,
  vybrano,
  jeDnes,
  mimoMesic = false,
  zacatekRadku,
  label,
  onDen,
  datumVypravy,
}: {
  den: string;
  udalosti: ReadonlyArray<KalendarniUdalost>;
  /** Pozice dne v pásu dané výpravy. */
  pozicePro: (idVypravy: string) => PoziceVPasu;
  vybrano: boolean;
  jeDnes: boolean;
  mimoMesic?: boolean;
  /** Pondělí: název pruhu se zopakuje i na začátku nového řádku. */
  zacatekRadku: boolean;
  label: string;
  onDen: (datum: string) => void;
  datumVypravy: (id: string) => string;
}): JSX.Element {
  // Stabilní pořadí: dřív začínající výprava nahoře, aby pruhy nepřeskakovaly.
  const vypravy = [...vypravyDne(udalosti)].sort((a, b) => {
    const rozdil = datumVypravy(a.id).localeCompare(datumVypravy(b.id));
    return rozdil !== 0 ? rozdil : a.id.localeCompare(b.id);
  });
  const schuzky = schuzkyDne(udalosti);
  const cislo = Number(den.slice(8, 10));
  const viditelne = vypravy.slice(0, MAX_PRUHU);
  const navic = vypravy.length - viditelne.length;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={vybrano}
      aria-current={jeDnes && !vybrano ? "date" : undefined}
      onClick={() => onDen(den)}
      className={`bez-prejeti relative flex min-h-[56px] min-w-0 flex-col items-stretch justify-start gap-1 overflow-hidden bg-papir pb-1.5 pt-1.5 text-sm tabular-nums text-inkoust transition-colors motion-reduce:transition-none [touch-action:manipulation] hover:bg-mlha/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk sm:min-h-[64px] lg:min-h-[96px] ${
        vybrano ? "ring-2 ring-inset ring-smrk" : ""
      }`}
    >
      <span
        className={`mx-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full lg:mx-0 lg:ml-1.5 ${
          jeDnes
            ? "bg-inkoust font-semibold text-papir"
            : mimoMesic
              ? "font-medium text-pole"
              : vypravy.length > 0 || vybrano
                ? "font-semibold"
                : ""
        }`}
      >
        {cislo}
      </span>
      {viditelne.length > 0 ? (
        <span aria-hidden="true" className="flex w-full min-w-0 flex-col gap-0.5">
          {viditelne.map((v) => {
            const pozice = pozicePro(v.id);
            const barvy = barvyVypravy(v.id, datumVypravy(v.id));
            const nazev = pozice === "start" || pozice === "single" || zacatekRadku;
            return (
              <span
                key={v.id}
                className={`flex h-5 min-w-0 items-center px-1 lg:h-6 lg:px-1.5 ${tvarPruhu(pozice)}`}
                style={{ backgroundColor: barvy.podklad, color: barvy.akcent }}
              >
                {nazev ? (
                  <span className="min-w-0 truncate text-left text-[11px] font-semibold leading-none">
                    {v.nazev}
                  </span>
                ) : null}
              </span>
            );
          })}
          {navic > 0 ? (
            <span className="px-1 text-left text-[10px] font-semibold leading-none text-mech lg:px-2">+{navic}</span>
          ) : null}
        </span>
      ) : null}
      <TeckySchuzek pocet={schuzky.length} />
    </button>
  );
}
