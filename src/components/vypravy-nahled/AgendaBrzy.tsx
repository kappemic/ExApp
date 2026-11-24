import type { JSX } from "react";
import type { PolozkaAgendy } from "../../lib/agenda";
import { casKZobrazeni } from "../../lib/evropsky-cas";
import { rozlozSraz } from "../../lib/sraz";
import Ikona from "../Ikona";
import { RailKarta, RailRadek } from "./RailKarta";

const DNY = ["ne", "po", "út", "st", "čt", "pá", "so"];

function popisDne(ymd: string): { den: string; cislo: string } {
  const d = new Date(`${ymd}T12:00:00`);
  return { den: DNY[d.getDay()] ?? "", cislo: String(d.getDate()) };
}

/**
 * Nejbližší schůzky a výpravy („Rail · Agenda“ v ExApp.pen). Schůzka otevře
 * den v kalendáři, výprava svůj detail. Nejvýš `limit` řádků, sloupec nescrolluje.
 */
export default function AgendaBrzy({
  polozky,
  dnes,
  onSchuzka,
  onVyprava,
  onKalendar,
  limit = 3,
  nadpis = "Brzy",
  odkazPopisek = "Kalendář",
  id = "agenda-brzy",
}: {
  polozky: PolozkaAgendy[];
  dnes: string;
  onSchuzka: (datum: string) => void;
  onVyprava: (id: string) => void;
  onKalendar: () => void;
  /** Zůstává kvůli volajícím, okénko data paletu nepoužívá. */
  datumVypravy?: (id: string) => string;
  limit?: number;
  nadpis?: string;
  odkazPopisek?: string;
  id?: string;
}): JSX.Element {
  const viditelne = polozky.slice(0, limit);
  return (
    <RailKarta
      id={id}
      nadpis={nadpis}
      odkaz={{ popisek: odkazPopisek, onClick: onKalendar }}
      zbyva={polozky.length > limit ? polozky.length : undefined}
      onVse={onKalendar}
    >
      {polozky.length === 0 ? (
        <p className="text-[13px] text-ink-3">Další dva týdny nic v plánu.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {viditelne.map(({ datum, udalost }) => {
            const { den, cislo } = popisDne(datum);
            const jeSchuzka = udalost.typ === "schuzka";
            const cas = casKZobrazeni(udalost.cas ?? "");
            const sraz = jeSchuzka || udalost.detail === null ? null : rozlozSraz(udalost.detail);
            const casti = jeSchuzka
              ? [cas, udalost.detail]
              : sraz !== null
                ? [sraz.cas, sraz.misto.length > 0 ? `sraz ${sraz.misto}` : null]
                : [cas, "výprava"];
            const podtitul =
              casti.filter((c): c is string => typeof c === "string" && c.length > 0).join(" · ") ||
              "Schůzka";
            return (
              <RailRadek
                key={`${udalost.typ}-${udalost.id}-${datum}`}
                den={cislo}
                popisekDne={datum === dnes ? "dnes" : den}
                nazev={udalost.nazev}
                podtitul={podtitul}
                zvyraznit={!jeSchuzka}
                ikona={jeSchuzka ? undefined : <Ikona nazev="mountain" className="size-[15px] text-salvej" />}
                onClick={() => (jeSchuzka ? onSchuzka(datum) : onVyprava(udalost.id))}
              />
            );
          })}
        </ul>
      )}
    </RailKarta>
  );
}
