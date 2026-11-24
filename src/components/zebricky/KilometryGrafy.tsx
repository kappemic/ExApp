import { useLayoutEffect, useRef, type JSX } from "react";
import { formatKmZaokrouhlene } from "../../lib/format-cisla";
import { NAZVY_MESICU, type RokKm } from "../../lib/zebricky-mesice";

export interface SloupecKm {
  klic: string;
  /** Popisek pod sloupcem („říj“, „2026“). */
  popisek: string;
  /** Celý název pro čtečky („říjen 2026“). */
  nazev: string;
  km: number;
}

/**
 * Vodorovný rozestup sloupců: měsíců je vždy 12 a vejdou se i na telefon,
 * roky můžou přibývat, proto mají pevnou nejmenší šířku a graf se posouvá.
 */
export function GrafSloupce({
  sloupce,
  vybrany,
  onVyber,
  popisek,
  posuvny = false,
}: {
  sloupce: readonly SloupecKm[];
  vybrany: string | null;
  onVyber: (klic: string) => void;
  popisek: string;
  posuvny?: boolean;
}): JSX.Element {
  const maximum = sloupce.reduce((max, s) => Math.max(max, s.km), 0);
  const obalRef = useRef<HTMLDivElement | null>(null);

  // Když se sloupce nevejdou, začíná se u nejnovějších (vpravo).
  useLayoutEffect(() => {
    const obal = obalRef.current;
    if (obal !== null) obal.scrollLeft = obal.scrollWidth;
  }, [sloupce.length]);

  return (
    <div ref={obalRef} className={posuvny ? "overflow-x-auto pb-3 [scrollbar-width:thin]" : undefined}>
      <ul aria-label={popisek} className={`m-0 flex h-[220px] list-none p-0 min-[90rem]:h-[280px] ${posuvny ? "gap-2" : "gap-0.5 sm:gap-2"}`}>
        {sloupce.map((s) => {
          const prazdny = s.km === 0;
          const jeVybrany = vybrany === s.klic;
          const tmavy = vybrany === null ? s.km === maximum && maximum > 0 : jeVybrany;
          return (
            <li key={s.klic} className={`h-full flex-1 ${posuvny ? "min-w-11" : "min-w-0"}`}>
              <button
                type="button"
                disabled={prazdny}
                aria-pressed={jeVybrany}
                aria-label={`${s.nazev}: ${prazdny ? "žádné kilometry" : formatKmZaokrouhlene(s.km)}`}
                onClick={() => onVyber(s.klic)}
                className="bez-prejeti group flex h-full w-full touch-manipulation flex-col items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk disabled:cursor-default"
              >
                <span className="flex min-h-0 w-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className={`text-[11px] font-semibold min-[90rem]:text-[13px] ${tmavy ? "text-inkoust" : "text-ink-3"}`}>
                    {prazdny ? "" : Math.round(s.km)}
                  </span>
                  <span
                    className={`w-full max-w-14 rounded-t-[4px] transition-colors motion-reduce:transition-none ${
                      prazdny ? "bg-linka" : tmavy ? "bg-smrk" : "bg-salvej group-hover:bg-mech"
                    }`}
                    style={{ height: prazdny ? "2px" : `max(4px, ${(s.km / maximum) * 82}%)` }}
                  />
                </span>
                <span className={`text-[10.5px] min-[90rem]:text-xs ${jeVybrany ? "font-bold text-inkoust" : "font-medium text-ink-3"}`}>
                  {s.popisek}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Sytost buňky podle podílu na nejsilnějším měsíci. Číslo je v buňce vždy, barva jen napovídá. */
function tridaBunky(km: number, maximum: number): string {
  if (km <= 0 || maximum <= 0) return "bg-povrch-2/60 text-ink-3";
  const podil = km / maximum;
  if (podil > 0.75) return "bg-smrk text-povrch font-semibold";
  if (podil > 0.5) return "bg-salvej text-inkoust font-semibold";
  if (podil > 0.25) return "bg-salvej/55 text-inkoust font-semibold";
  return "bg-salvej/25 text-inkoust font-medium";
}

/** Roky × měsíce: stejné měsíce jsou pod sebou, celý řádek otevře rok. */
export function TabulkaMesicu({
  roky,
  onRok,
}: {
  /** Nejnovější první. */
  roky: readonly RokKm[];
  onRok: (rok: number) => void;
}): JSX.Element {
  const maximum = roky.reduce((max, r) => r.mesice.reduce((m, mesic) => Math.max(m, mesic.km), max), 0);
  return (
    <table className="w-full table-fixed border-separate border-spacing-0.5 text-center text-[10px] sm:text-xs min-[90rem]:border-spacing-1 min-[90rem]:text-[13px]">
      <caption className="sr-only">Kilometry podle roku a měsíce</caption>
      <thead>
        <tr>
          <th scope="col" className="w-9 min-[90rem]:w-14">
            <span className="sr-only">Rok</span>
          </th>
          {NAZVY_MESICU.map((nazev, index) => (
            <th key={nazev} scope="col" className="pb-1 font-medium text-ink-3">
              <span aria-hidden="true" className="sm:hidden">{index + 1}</span>
              <span aria-hidden="true" className="hidden sm:inline">{nazev === "červenec" ? "čvc" : nazev === "červen" ? "čvn" : nazev.slice(0, 3)}</span>
              <span className="sr-only">{nazev}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {roky.map((r) => (
          <tr key={r.rok} className="group relative">
            <th scope="row" className="p-0 text-left">
              <button
                type="button"
                onClick={() => onRok(r.rok)}
                aria-label={`Rok ${r.rok}, celkem ${formatKmZaokrouhlene(r.km)}`}
                className="bez-prejeti flex h-11 w-full touch-manipulation items-center text-[11px] font-semibold text-mech after:absolute after:inset-0 after:rounded-lg after:content-[''] group-hover:text-inkoust focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-smrk min-[90rem]:text-[13px]"
              >
                {r.rok}
              </button>
            </th>
            {r.mesice.map((m) => (
              <td key={m.klic} className={`h-11 rounded-md p-0 ${tridaBunky(m.km, maximum)}`}>
                {m.km > 0 ? Math.round(m.km) : <span aria-hidden="true">·</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
