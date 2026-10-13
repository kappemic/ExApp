import type { JSX } from "react";
import {
  mesicMrizkaSKontextem,
  nazevMesice,
  popisekDne,
  poziceVPasu,
  schuzkyDne,
  vypravyDne,
  type KalendarniUdalost,
  type PoziceVPasu,
} from "../../lib/kalendar";

const DNY_V_TYDNU = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

interface KalendarMesicProps {
  rok: number;
  mesic: number;
  /** Den → události (cílový měsíc + viditelné mimo-dny, viz `udalostiProMesic`). */
  udalosti: Map<string, KalendarniUdalost[]>;
  vybraneDatum: string | null;
  /** Dnešek YMD pro zvýraznění. */
  dnes: string;
  onDen: (datum: string) => void;
  onMesic: (smer: -1 | 1) => void;
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

/** Číslo dne bez kroužku: prostý span, dnes/vybráno tučně.
 * Odlišení Dnes dělá rámeček buňky (border-smrk), ne kroužek kolem čísla.
 * Precedence Selected > Today: vybraný dnes je tučně. */
function tridaCislaDne(jeDnes: boolean, vybrano: boolean): string {
  return jeDnes || vybrano ? "font-bold tabular-nums" : "tabular-nums";
}
/** Zaoblení pásu podle pozice (segment po řádcích, pilulka pro single). */
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

/**
 * KalendarMesic — měsíční mřížka Fáze 3 (Po–Ne).
 * Mřížka vždy 35 buněk (5x7), u 6týdenních měsíců 42 (6x7) —
 * dny mimo měsíc viditelné šedě (`text-mech`), neklikatelné
 * (`disabled` + `aria-disabled`), pás/tečka tlumeně (`opacity-40`).
 * Pás se počítá z plné mřížky včetně mimo-dnů, proto navazuje
 * přes hranu měsíce. Den s výpravou = propojený pás přes sousední
 * dny se stejným id (segmentovaný po řádcích), schůzka = plná tečka.
 * Mobile-first: v buňce jen číslo dne (+ pás pozadí + tečka), žádné
 * názvy výprav v žádném breakpointu (název jen v aria-label pro čtečky,
 * mimo-dny mají suffix „mimo měsíc" pro SR).
 * Grid `gap-px`, buňky `min-w-0` + `overflow-hidden`, aby pás na 360px
 * nepřetékal. Dnes = rámeček buňky (border-smrk) + tučné číslo,
 * žádný kroužek kolem čísla, žádné ikony v buňkách.
 * Precedence: vybráno > dnes > typ. Bez hex/dark, jen tokeny.
 */
export default function KalendarMesic(props: KalendarMesicProps): JSX.Element {
  const { rok, mesic, udalosti, vybraneDatum, dnes, onDen, onMesic, onDnes } =
    props;
  // Plná mřížka 35/42 YMD včetně mimo-dnů (žádné ujíždění posledního týdne).
  const bunky = mesicMrizkaSKontextem(rok, mesic);
  const mrizkaYmd = bunky.map((b) => b.ymd);
  /** Tlumený vzhled mimo-dnů: pás/tečka + číslo šedě, bez hoveru. */
  const MIMO_TRIDA = "cursor-default opacity-40 motion-reduce:transition-none";

  return (
    <div
      aria-label={`Kalendář – ${nazevMesice(rok, mesic)}`}
      className="rounded-lg border-2 border-inkoust bg-white/60 p-4 shadow-denik sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight tabular-nums">
          {nazevMesice(rok, mesic)}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Předchozí měsíc"
            aria-label="Předchozí měsíc"
            onClick={() => onMesic(-1)}
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
            title="Další měsíc"
            aria-label="Další měsíc"
            onClick={() => onMesic(1)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-papir px-3 text-lg font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            →
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Dny měsíce"
        className="mt-4"
      >
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
          {bunky.map(({ ymd: den, mimoMesic }) => {
            const denni = udalosti.get(den) ?? [];
            const vypravy = vypravyDne(denni);
            const schuzky = schuzkyDne(denni);
            const maVypravu = vypravy.length > 0;
            const vybrano = vybraneDatum === den;
            const jeDnes = dnes === den;
            const cisloDne = Number(den.slice(8, 10));
            const zakladLabel = popisekDne(den, denni, {
              mrizka: mrizkaYmd,
              mapa: udalosti,
            });
            const label = mimoMesic
              ? `${zakladLabel}, mimo měsíc`
              : zakladLabel;

            // Mimo-měsíc: šedé neklikatelné, pás/tečka tlumeně, bez onDen.
            // aria-label dál nese název pro čtečky (popisekDne neměnit),
            // vizuál je jen číslo + pás + tečka.
            // ——— Stack 2 výprav: tlačítko světlé, uvnitř 2 mini-pásy ———
            if (vypravy.length >= 2) {
              const stavTrida = mimoMesic
                ? "border-linka bg-papir text-mech"
                : vybrano
                  ? "border-inkoust bg-inkoust text-papir shadow-denik ring-2 ring-inkoust ring-offset-2 ring-offset-papir focus-visible:outline-papir"
                  : jeDnes
                    ? "border-smrk bg-papir text-inkoust shadow-denik focus-visible:outline-smrk"
                    : "border-linka bg-papir text-inkoust focus-visible:outline-smrk hover:bg-linka/60";
              return (
                <button
                  key={den}
                  type="button"
                  aria-label={label}
                  aria-pressed={mimoMesic ? undefined : vybrano}
                  aria-disabled={mimoMesic ? true : undefined}
                  aria-current={jeDnes && !vybrano ? "date" : undefined}
                  disabled={mimoMesic}
                  onClick={mimoMesic ? undefined : () => onDen(den)}
                  className={`${TLACITKO_ZAKLAD} rounded-md border-2 ${stavTrida} ${mimoMesic ? MIMO_TRIDA : ""}`}
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
              const pozice =
                poziceVPasu(vyprava.id, den, mrizkaYmd, udalosti) ?? "single";
              const stavTrida = mimoMesic
                ? "border-smrk bg-smrk"
                : vybrano
                  ? "border-smrk bg-smrk shadow-denik ring-2 ring-inkoust ring-offset-2 ring-offset-papir focus-visible:outline-papir"
                  : jeDnes
                    ? "border-smrk bg-smrk ring-1 ring-papir ring-offset-1 ring-offset-smrk focus-visible:outline-papir"
                    : "border-smrk bg-smrk focus-visible:outline-papir";
              return (
                <button
                  key={den}
                  type="button"
                  aria-label={label}
                  aria-pressed={mimoMesic ? undefined : vybrano}
                  aria-disabled={mimoMesic ? true : undefined}
                  aria-current={jeDnes && !vybrano ? "date" : undefined}
                  disabled={mimoMesic}
                  onClick={mimoMesic ? undefined : () => onDen(den)}
                  className={`${TLACITKO_ZAKLAD} border-2 text-papir ${tridaZaobleni(pozice)} ${stavTrida} ${mimoMesic ? MIMO_TRIDA : ""}`}
                >
                  <span className={tridaCislaDne(jeDnes, vybrano)}>
                    {cisloDne}
                  </span>
                  <SchuzkyTeckticky pocet={schuzky.length} uvnitrPasu />
                </button>
              );
            }

            // ——— Bez výpravy: číslo + centrované tečky schůzek ———
            const stavTrida = mimoMesic
              ? "border-linka bg-papir/60 text-mech"
              : vybrano
                ? "border-inkoust bg-inkoust text-papir shadow-denik ring-2 ring-inkoust ring-offset-2 ring-offset-papir focus-visible:outline-papir"
                : jeDnes
                  ? "border-smrk bg-papir text-inkoust shadow-denik focus-visible:outline-smrk"
                  : "border-linka bg-papir/60 text-inkoust/80 hover:bg-linka/60 focus-visible:outline-smrk";
            return (
              <button
                key={den}
                type="button"
                aria-label={label}
                aria-pressed={mimoMesic ? undefined : vybrano}
                aria-disabled={mimoMesic ? true : undefined}
                aria-current={jeDnes && !vybrano ? "date" : undefined}
                disabled={mimoMesic}
                onClick={mimoMesic ? undefined : () => onDen(den)}
                className={`${TLACITKO_ZAKLAD} rounded-md border-2 ${stavTrida} ${mimoMesic ? MIMO_TRIDA : ""}`}
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
