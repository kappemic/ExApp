import type { JSX } from "react";
import type { PolozkaAgendy } from "../../lib/agenda";
import { isoCasNaEvropsky } from "../../lib/evropsky-cas";
import { paletaVypravy } from "../../lib/krajina";
import ZastupnySnimek from "./ZastupnySnimek";

const DNY = ["ne", "po", "út", "st", "čt", "pá", "so"];

function popisDne(ymd: string): { den: string; cislo: string } {
  const d = new Date(`${ymd}T12:00:00`);
  return { den: DNY[d.getDay()] ?? "", cislo: String(d.getDate()) };
}

/**
 * Nejbližší schůzky a výpravy (C2). Schůzka otevře den v kalendáři,
 * výprava svůj detail. Na desktopu stojí ve sloupci vpravo.
 */
export default function AgendaBrzy({
  polozky,
  dnes,
  onSchuzka,
  onVyprava,
  onKalendar,
  datumVypravy,
}: {
  polozky: PolozkaAgendy[];
  dnes: string;
  onSchuzka: (datum: string) => void;
  onVyprava: (id: string) => void;
  onKalendar: () => void;
  /** Datum začátku výpravy, aby paleta seděla s ostatními náhledy. */
  datumVypravy: (id: string) => string;
}): JSX.Element {
  return (
    <section aria-labelledby="agenda-brzy" className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="agenda-brzy" className="text-2xl font-bold text-inkoust">
          Brzy
        </h2>
        <button
          type="button"
          onClick={onKalendar}
          className="bez-prejeti min-h-[44px] rounded-xl px-3 text-sm font-semibold text-smrk hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Kalendář
        </button>
      </div>
      {polozky.length === 0 ? (
        <p className="mt-2 text-base text-mech">Další dva týdny nic v plánu.</p>
      ) : (
        <ul className="m-0 mt-2 list-none p-0">
          {polozky.map(({ datum, udalost }) => {
            const { den, cislo } = popisDne(datum);
            const jeSchuzka = udalost.typ === "schuzka";
            const jeDnes = datum === dnes;
            return (
              <li key={`${udalost.typ}-${udalost.id}-${datum}`} className="border-t border-linka first:border-t-0">
                <button
                  type="button"
                  onClick={() => (jeSchuzka ? onSchuzka(datum) : onVyprava(udalost.id))}
                  className="bez-prejeti flex min-h-[64px] w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left hover:bg-mlha/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                >
                  <span className="flex w-10 shrink-0 flex-col items-center leading-none">
                    <span className="text-xs font-medium text-mech">{jeDnes ? "dnes" : den}</span>
                    <span className="font-display mt-1 text-xl font-bold text-inkoust">{cislo}</span>
                  </span>
                  {jeSchuzka ? (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-pole bg-papir text-smrk">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <circle cx="9" cy="8" r="3.2" />
                        <path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0" />
                        <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.3" />
                        <path d="M17.2 14.4a5.8 5.8 0 0 1 3.6 5.1" />
                      </svg>
                    </span>
                  ) : (
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                      <ZastupnySnimek id={udalost.id} datum={datumVypravy(udalost.id)} povolit />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-inkoust">
                      {udalost.nazev}
                    </span>
                    <span
                      className="block truncate text-sm text-mech"
                      style={jeSchuzka ? undefined : { color: paletaVypravy(udalost.id, datumVypravy(udalost.id)).akcent }}
                    >
                      {jeSchuzka
                        ? [isoCasNaEvropsky(udalost.cas ?? ""), udalost.detail].filter((cast) => cast !== null && cast !== undefined && cast.length > 0).join(" · ") || "Schůzka"
                        : `Výprava${udalost.detail !== null ? `, sraz ${udalost.detail}` : ""}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
