import type { JSX } from "react";
import {
  popisekDne,
  poziceVPasu,
  schuzkyDne,
  tydenMrizka,
  vypravyDne,
  type KalendarniUdalost,
  type PoziceVPasu,
} from "../../lib/kalendar";

const DNY_V_TYDNU = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

interface KalendarTydenProps {
  /** Libovolné datum uvnitř zobrazovaného týdne (YMD). */
  kotva: string;
  /** Den → události (jen dny týdne, viz `udalostiProTyden`). */
  udalosti: Map<string, KalendarniUdalost[]>;
  vybraneDatum: string | null;
  /** Dnešek YMD pro zvýraznění. */
  dnes: string;
  onDen: (datum: string) => void;
  onTyden: (smer: -1 | 1) => void;
  onDnes: () => void;
}

const TLACITKO_ZAKLAD =
  "relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 py-1 text-sm tabular-nums transition-colors motion-reduce:transition-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 sm:min-w-[44px] sm:px-1";

/** Plná tečka schůzky 10px. `uvnitrPasu` přidá světlý lem pro kontrast na smrku. */
function TeckaSchuzky({ uvnitrPasu }: { uvnitrPasu: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-jantar ${
        uvnitrPasu ? "ring-1 ring-papir" : ""
      }`}
    />
  );
}

/**
 * Tečky schůzek: max 2 + čítač „+N".
 * V pásu absolutně vpravo dole, bez pásu centrovaně dole.
 */
function SchuzkyTeckticky({
  pocet,
  uvnitrPasu,
}: {
  pocet: number;
  uvnitrPasu: boolean;
}): JSX.Element | null {
  if (pocet <= 0) return null;
  const viditelne = Math.min(pocet, 2);
  const zbytek = pocet - viditelne;
  if (uvnitrPasu) {
    return (
      <span
        aria-hidden="true"
        className="absolute right-1 bottom-0.5 flex items-center gap-0.5"
      >
        {Array.from({ length: viditelne }, (_, i) => (
          <TeckaSchuzky key={i} uvnitrPasu />
        ))}
        {zbytek > 0 && (
          <span className="text-[10px] leading-none font-bold tabular-nums">+{zbytek}</span>
        )}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex items-center justify-center gap-1">
      {Array.from({ length: viditelne }, (_, i) => (
        <TeckaSchuzky key={i} uvnitrPasu={false} />
      ))}
      {zbytek > 0 && (
        <span className="text-[10px] leading-none font-bold tabular-nums text-mech">
          +{zbytek}
        </span>
      )}
    </span>
  );
}

/** Číslo dne bez kroužku: prostý span, dnes/vybráno tučně. */
function tridaCislaDne(jeDnes: boolean, vybrano: boolean): string {
  return jeDnes || vybrano ? "font-bold tabular-nums" : "tabular-nums";
}
/** Zaoblení pásu podle pozice (celý týden je 1 řádka, žádný wrap). */
function tridaZaobleni(pozice: PoziceVPasu): string {
  switch (pozice) {
    case "start":
      return "rounded-l-full rounded-r-none border-r-0 sm:rounded-l-md";
    case "middle":
      return "rounded-none border-x-0";
    case "end":
      return "rounded-l-none rounded-r-full border-l-0 sm:rounded-r-md";
    case "single":
      return "rounded-full sm:rounded-md";
  }
}

const FORMAT_DEN_MESIC = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
});
const FORMAT_DEN_MESIC_ROK = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Nadpis týdne: „12. října – 18. října 2026". Nevalidní → „Týden". */
function nazevTydne(tyden: ReadonlyArray<string>): string {
  if (tyden.length !== 7) return "Týden";
  const prvni = tyden[0];
  const posledni = tyden[6];
  if (prvni === undefined || posledni === undefined) return "Týden";
  const od = new Date(`${prvni}T12:00:00`);
  const do_ = new Date(`${posledni}T12:00:00`);
  if (Number.isNaN(od.getTime()) || Number.isNaN(do_.getTime())) return "Týden";
  return `${FORMAT_DEN_MESIC.format(od)} – ${FORMAT_DEN_MESIC_ROK.format(do_)}`;
}

/**
 * KalendarTyden — týdenní řádek Po–Ne (Fáze 3, gap).
 * Stejný vizuál buněk jako `KalendarMesic`: den s výpravou = propojený
 * pás přes sousední dny se stejným id (celý týden je 1 řádka, žádný
 * wrap), schůzka = plná tečka. V buňce jen číslo dne (+ pás + tečka),
 * žádné názvy, žádné ikony, žádný kroužek (název jen v aria-label).
 * Grid `gap-px`, buňky `min-w-0` + `overflow-hidden`, 360px bez přetečení.
 * Dnes = rámeček (border-smrk) + tučné číslo, vybráno = inverze.
 * Bez hex/dark, jen tokeny.
 */
export default function KalendarTyden(props: KalendarTydenProps): JSX.Element {
  const { kotva, udalosti, vybraneDatum, dnes, onDen, onTyden, onDnes } = props;
  const tyden = tydenMrizka(kotva);
  const nazev = nazevTydne(tyden);

  return (
    <div
      aria-label={`Kalendář – týden ${nazev}`}
      className="rounded-lg border-2 border-inkoust bg-white/60 p-4 shadow-denik sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight tabular-nums">{nazev}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Předchozí týden"
            aria-label="Předchozí týden"
            onClick={() => onTyden(-1)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-papir px-3 text-lg font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            ←
          </button>
          <button
            type="button"
            onClick={onDnes}
            className="min-h-[44px] rounded-md border-2 border-inkoust bg-papir px-4 text-sm font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            Dnes
          </button>
          <button
            type="button"
            title="Další týden"
            aria-label="Další týden"
            onClick={() => onTyden(1)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-papir px-3 text-lg font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            →
          </button>
        </div>
      </div>

      <div role="group" aria-label="Dny týdne" className="mt-4">
        <div aria-hidden="true" className="grid grid-cols-7 gap-px text-center">
          {DNY_V_TYDNU.map((den) => (
            <span
              key={den}
              className="pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-mech"
            >
              {den}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px text-center">
          {tyden.map((den) => {
            const denni = udalosti.get(den) ?? [];
            const vypravy = vypravyDne(denni);
            const schuzky = schuzkyDne(denni);
            const maVypravu = vypravy.length > 0;
            const vybrano = vybraneDatum === den;
            const jeDnes = dnes === den;
            const cisloDne = Number(den.slice(8, 10));
            const label = popisekDne(den, denni, {
              mrizka: tyden,
              mapa: udalosti,
            });

            // ——— Stack 2 výprav: tlačítko světlé, uvnitř 2 mini-pásy ———
            if (vypravy.length >= 2) {
              const stavTrida = vybrano
                ? "border-inkoust bg-inkoust text-papir shadow-denik ring-2 ring-inkoust ring-offset-2 ring-offset-papir focus-visible:outline-papir"
                : jeDnes
                  ? "border-smrk bg-papir text-inkoust shadow-denik focus-visible:outline-smrk"
                  : "border-linka bg-papir text-inkoust focus-visible:outline-smrk hover:bg-linka/60";
              return (
                <button
                  key={den}
                  type="button"
                  aria-label={label}
                  aria-pressed={vybrano}
                  aria-current={jeDnes && !vybrano ? "date" : undefined}
                  onClick={() => onDen(den)}
                  className={`${TLACITKO_ZAKLAD} rounded-md border-2 ${stavTrida}`}
                >
                  <span className={tridaCislaDne(jeDnes, vybrano)}>
                    {cisloDne}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex w-full min-w-0 flex-col gap-0.5 px-0.5"
                  >
                    <span className="flex h-4 min-w-0 items-center justify-center overflow-hidden rounded-full bg-smrk px-1" />
                    <span className="flex h-4 min-w-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-smrk bg-papir px-1" />
                  </span>
                  <SchuzkyTeckticky pocet={schuzky.length} uvnitrPasu={false} />
                </button>
              );
            }

            // ——— Jedna výprava: celé tlačítko je pás (jen číslo, bez ikony) ———
            if (maVypravu) {
              const vyprava = vypravy[0];
              // `vypravy[0]` existuje díky `maVypravu`, guard pro strict TS.
              if (vyprava === undefined) return null;
              const pozice =
                poziceVPasu(vyprava.id, den, tyden, udalosti) ?? "single";
              const stavTrida = vybrano
                ? "border-smrk bg-smrk shadow-denik ring-2 ring-inkoust ring-offset-2 ring-offset-papir focus-visible:outline-papir"
                : jeDnes
                  ? "border-smrk bg-smrk ring-1 ring-papir ring-offset-1 ring-offset-smrk focus-visible:outline-papir"
                  : "border-smrk bg-smrk focus-visible:outline-papir";
              return (
                <button
                  key={den}
                  type="button"
                  aria-label={label}
                  aria-pressed={vybrano}
                  aria-current={jeDnes && !vybrano ? "date" : undefined}
                  onClick={() => onDen(den)}
                  className={`${TLACITKO_ZAKLAD} border-2 text-papir ${tridaZaobleni(pozice)} ${stavTrida}`}
                >
                  <span className={tridaCislaDne(jeDnes, vybrano)}>
                    {cisloDne}
                  </span>
                  <SchuzkyTeckticky pocet={schuzky.length} uvnitrPasu />
                </button>
              );
            }

            // ——— Bez výpravy: číslo + centrované tečky schůzek ———
            const stavTrida = vybrano
              ? "border-inkoust bg-inkoust text-papir shadow-denik ring-2 ring-inkoust ring-offset-2 ring-offset-papir focus-visible:outline-papir"
              : jeDnes
                ? "border-smrk bg-papir text-inkoust shadow-denik focus-visible:outline-smrk"
                : "border-linka bg-papir/60 text-inkoust/80 hover:bg-linka/60 focus-visible:outline-smrk";
            return (
              <button
                key={den}
                type="button"
                aria-label={label}
                aria-pressed={vybrano}
                aria-current={jeDnes && !vybrano ? "date" : undefined}
                onClick={() => onDen(den)}
                className={`${TLACITKO_ZAKLAD} rounded-md border-2 ${stavTrida}`}
              >
                <span className={tridaCislaDne(jeDnes, vybrano)}>
                  {cisloDne}
                </span>
                <SchuzkyTeckticky pocet={schuzky.length} uvnitrPasu={false} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
