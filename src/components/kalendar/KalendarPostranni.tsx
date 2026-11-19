import type { JSX } from "react";
import type { PolozkaAgendy } from "../../lib/agenda";
import { isoCasNaEvropsky } from "../../lib/evropsky-cas";
import { jeBezOmezeni } from "../../lib/expedition-utils";
import { barvaVypravy } from "../../lib/kalendar-barvy";
import { textOdpoctu } from "../../lib/krajina";
import { schuzkyDne, vypravyDne, type KalendarniUdalost } from "../../lib/kalendar";
import type { Expedition } from "../../lib/mock-expeditions";
import { rozlozSraz } from "../../lib/sraz";
import type { ApiSchuzka } from "../../shared/api-types";
import Ikona from "../Ikona";
import AgendaBrzy from "../vypravy-nahled/AgendaBrzy";
import ZastupnySnimek from "../vypravy-nahled/ZastupnySnimek";
import { KartaUdalosti, kdyVyprava, metaVyprava, nadpisDne, pocetAkciDne } from "./KalendarDenSeznam";

const FOKUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

/** Velká karta první výpravy vybraného dne („Day Trip Card“ v ExApp · Kalendář). */
function KartaVypravyDne({
  expedice,
  dnes,
  onDetail,
  onPrihlaseni,
}: {
  expedice: Expedition;
  dnes: string;
  onDetail: () => void;
  onPrihlaseni: () => void;
}): JSX.Element {
  const { cas, misto } = rozlozSraz(expedice.sraz);
  const { prihlaseno, celkem } = expedice.kapacita;
  const bezOmezeni = jeBezOmezeni(expedice);
  const podil = bezOmezeni || celkem <= 0 ? 0 : Math.min(1, prihlaseno / celkem);
  const probehla = expedice.datum < dnes && (expedice.datumDo ?? expedice.datum) < dnes;
  return (
    <article className="overflow-hidden rounded-2xl border border-linka bg-povrch shadow-jemny">
      <button type="button" onClick={onDetail} className={`bez-prejeti relative block h-[148px] w-full ${FOKUS}`} aria-label={`Detail výpravy ${expedice.nazev}`}>
        <ZastupnySnimek id={expedice.id} datum={expedice.datum} povolit />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-b border-black/[0.08]" />
      </button>
      <div className="flex flex-col gap-3 p-[18px]">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-akcent-100 px-2 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[1px] text-akcent">
            Výprava
          </span>
          <span className="text-[11.5px] font-medium text-ink-3 first-letter:lowercase">
            {probehla ? "proběhla" : textOdpoctu(expedice.datum, dnes, false)}
          </span>
        </div>
        <h3 className="font-display text-[22px] font-bold leading-tight tracking-[-0.5px] text-inkoust">
          {expedice.nazev}
        </h3>
        <div className="flex flex-col gap-1.5">
          {cas !== null ? (
            <p className="flex items-center gap-[7px] text-[12.5px] text-mech">
              <Ikona nazev="alarm-clock" className="size-[13px] text-salvej" />
              {cas} sraz
            </p>
          ) : null}
          {misto.length > 0 ? (
            <p className="flex items-center gap-[7px] text-[12.5px] text-mech">
              <Ikona nazev="map-pin" className="size-[13px] text-salvej" />
              {misto}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!bezOmezeni ? (
            <span aria-hidden="true" className="h-[5px] w-[88px] overflow-hidden rounded-full bg-linka">
              <span className="block h-full rounded-full bg-smrk" style={{ width: `${podil * 100}%` }} />
            </span>
          ) : null}
          <span className="text-[12.5px] font-semibold text-mech">
            {bezOmezeni ? `${prihlaseno} přihlášeno` : `${prihlaseno} z ${celkem} přihlášeno`}
          </span>
        </div>
        <button
          type="button"
          onClick={probehla ? onDetail : onPrihlaseni}
          className={`nahled-press inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-[11px] bg-akcent px-4 text-[13.5px] font-semibold text-papir ${FOKUS}`}
        >
          {probehla ? "Detail výpravy" : "Přihlásit se"}
          <Ikona nazev="arrow-right" className="size-3.5" />
        </button>
      </div>
    </article>
  );
}

/** Pravý sloupec kalendáře na počítači: vybraný den a nadcházející akce. */
export default function KalendarPostranni({
  datum,
  udalosti,
  expedicePodleId,
  schuzkyPodleId,
  agenda,
  dnes,
  onVyprava,
  onPrihlaseni,
  onSchuzka,
  onSchuzkaDetail,
  onSeznam,
}: {
  datum: string | null;
  udalosti: Map<string, KalendarniUdalost[]>;
  expedicePodleId: Map<string, Expedition>;
  schuzkyPodleId: Map<string, ApiSchuzka>;
  agenda: PolozkaAgendy[];
  dnes: string;
  onVyprava: (expedice: Expedition) => void;
  onPrihlaseni: (expedice: Expedition) => void;
  onSchuzka: (datum: string) => void;
  onSchuzkaDetail: (schuzka: ApiSchuzka, datum: string) => void;
  onSeznam: () => void;
  /** Ponecháno kvůli volajícím. */
  onKalendar?: () => void;
  datumVypravy?: (id: string) => string;
}): JSX.Element {
  const denni = datum !== null ? (udalosti.get(datum) ?? []) : [];
  const vypravy = vypravyDne(denni)
    .map((u) => expedicePodleId.get(u.id))
    .filter((e): e is Expedition => e !== undefined);
  const schuzky = schuzkyDne(denni)
    .map((u) => schuzkyPodleId.get(u.id))
    .filter((s): s is ApiSchuzka => s !== undefined);
  const [hlavni, ...dalsi] = vypravy;
  const pocet = vypravy.length + schuzky.length;

  return (
    <aside className="flex min-w-0 flex-col gap-7">
      {datum !== null ? (
        <section aria-labelledby="kalendar-vybrany-den" className="flex min-w-0 flex-col gap-3.5">
          <div className="flex items-center gap-2">
            <h2 id="kalendar-vybrany-den" className="text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3">
              {nadpisDne(datum)}
            </h2>
            {pocet > 0 ? (
              <span className="rounded-full bg-povrch-2 px-[7px] py-0.5 text-[10.5px] font-semibold text-mech">
                {pocetAkciDne(vypravy.length, schuzky.length)}
              </span>
            ) : null}
          </div>
          {pocet === 0 ? (
            <p className="rounded-2xl border border-linka bg-povrch px-4 py-5 text-center text-[13px] text-ink-3">
              V tenhle den není nic naplánovaného.
            </p>
          ) : null}
          {hlavni !== undefined ? (
            <KartaVypravyDne
              expedice={hlavni}
              dnes={dnes}
              onDetail={() => onVyprava(hlavni)}
              onPrihlaseni={() => onPrihlaseni(hlavni)}
            />
          ) : null}
          {dalsi.map((expedice) => {
            const kdy = kdyVyprava(expedice);
            return (
              <KartaUdalosti
                key={`v-${expedice.id}`}
                kdy={kdy.text}
                nazev={expedice.nazev}
                meta={metaVyprava(expedice)}
                znacka={barvaVypravy(expedice.id)}
                onClick={() => onVyprava(expedice)}
              />
            );
          })}
          {schuzky.map((schuzka) => {
            const cas = schuzka.cas !== null && schuzka.cas !== undefined ? isoCasNaEvropsky(schuzka.cas) : "";
            return (
              <KartaUdalosti
                key={`s-${schuzka.id}`}
                kdy={cas.length > 0 ? `${cas} · schůzka` : "schůzka"}
                nazev={schuzka.nazev}
                meta={schuzka.mistnost?.trim() ?? ""}
                znacka="okr"
                onClick={() => onSchuzkaDetail(schuzka, datum)}
              />
            );
          })}
        </section>
      ) : null}
      <AgendaBrzy
        id="kalendar-nadchazejici"
        nadpis="Nadcházející"
        odkazPopisek="Seznam"
        polozky={agenda}
        dnes={dnes}
        limit={5}
        onSchuzka={onSchuzka}
        onVyprava={(id) => {
          const z = expedicePodleId.get(id);
          if (z !== undefined) onVyprava(z);
        }}
        onKalendar={onSeznam}
      />
    </aside>
  );
}
