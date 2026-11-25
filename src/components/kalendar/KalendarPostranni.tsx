import type { JSX, ReactNode } from "react";
import { casKZobrazeni } from "../../lib/evropsky-cas";
import { jeBezOmezeni } from "../../lib/expedition-utils";
import { barvaVypravy } from "../../lib/kalendar-barvy";
import { textOdpoctu } from "../../lib/krajina";
import { schuzkyDne, vypravyDne, type KalendarniUdalost } from "../../lib/kalendar";
import type { Expedition } from "../../lib/mock-expeditions";
import { pocetDni, rozlozSraz } from "../../lib/sraz";
import type { ApiSchuzka } from "../../shared/api-types";
import Ikona from "../Ikona";
import { RailKarta, RailRadek } from "../vypravy-nahled/RailKarta";
import ZastupnySnimek from "../vypravy-nahled/ZastupnySnimek";
import { kapacitaText, KartaUdalosti, kdyVyprava, nadpisDne } from "./KalendarDenSeznam";
import { useNabeh } from "../../lib/pohyb";

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
    <article className="overflow-hidden rounded-2xl border border-linka bg-povrch shadow-denik">
      <button type="button" onClick={onDetail} className={`bez-prejeti relative block aspect-[16/9] w-full overflow-hidden ${FOKUS}`} aria-label={`Detail výpravy ${expedice.nazev}`}>
        <ZastupnySnimek id={expedice.id} datum={expedice.datum} povolit={!probehla && expedice.stav !== "proběhlá"} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-b border-black/[0.08]" />
      </button>
      <div className="flex flex-col gap-3 p-[18px]">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-akcent-100 px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[1px] text-akcent">
            Výprava
          </span>
          <span className="text-[11.5px] font-medium text-ink-3">
            {probehla ? "proběhla" : textOdpoctu(expedice.datum, dnes, false).toLowerCase()}
          </span>
        </div>
        <h3 className="font-display text-[22px] font-bold leading-6 tracking-[-0.5px] text-inkoust">
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
            <span aria-hidden="true" className="h-[5px] w-16 overflow-hidden rounded-full bg-[#e9e4d5]">
              <span className="block h-full rounded-full bg-smrk" style={{ width: `${podil * 100}%` }} />
            </span>
          ) : null}
          <span className="text-xs font-semibold text-mech">
            {bezOmezeni ? `${prihlaseno} přihlášeno` : `${prihlaseno} z ${celkem}`}
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

const DNY = ["ne", "po", "út", "st", "čt", "pá", "so"];

function denVTydnu(ymd: string): string {
  return DNY[new Date(`${ymd}T12:00:00`).getDay()] ?? "";
}

/** „Nadcházející“ pod vybraným dnem: jeden řádek za den, u vícedenní počet dnů v okénku. */
function NadchazejiciVypravy({
  vypravy,
  vybranyDen,
  onVyprava,
  onSeznam,
  limit = 5,
}: {
  vypravy: readonly Expedition[];
  vybranyDen: string | null;
  onVyprava: (expedice: Expedition) => void;
  onSeznam: () => void;
  limit?: number;
}): JSX.Element {
  const radky: Array<{ vyprava: Expedition; dni: number; dalsi: number }> = [];
  for (const vyprava of vypravy) {
    const dni = pocetDni(vyprava.datum, vyprava.datumDo);
    const stejny = dni === 1 ? radky.find((r) => r.dni === 1 && r.vyprava.datum === vyprava.datum) : undefined;
    if (stejny !== undefined) stejny.dalsi += 1;
    else radky.push({ vyprava, dni, dalsi: 0 });
  }
  return (
    <RailKarta id="kalendar-nadchazejici" nadpis="Nadcházející" odkaz={{ popisek: "Seznam", onClick: onSeznam }}>
      {radky.length === 0 ? (
        <p className="text-[13px] text-ink-3">Žádná výprava zatím není v plánu.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {radky.slice(0, limit).map(({ vyprava, dni, dalsi }) => {
            const { cas, misto } = rozlozSraz(vyprava.sraz);
            const konec = vyprava.datumDo;
            const podtitul =
              dalsi > 0
                ? [`${dalsi + 1} ${dalsi + 1 <= 4 ? "výpravy" : "výprav"}`, cas !== null ? `od ${cas}` : ""]
                : dni > 1 && konec !== null
                  ? [`${denVTydnu(vyprava.datum)}–${denVTydnu(konec)}`, misto]
                  : [cas ?? "", misto];
            return (
              <RailRadek
                key={vyprava.id}
                den={String(Number(vyprava.datum.slice(8, 10)))}
                popisekDne={dni > 1 ? `${dni} ${dni <= 4 ? "dny" : "dní"}` : denVTydnu(vyprava.datum)}
                nazev={vyprava.nazev}
                podtitul={podtitul.filter((c) => c.length > 0).join(" · ")}
                zvyraznit={vyprava.datum === vybranyDen ? "akcent" : false}
                onClick={() => onVyprava(vyprava)}
              />
            );
          })}
        </ul>
      )}
    </RailKarta>
  );
}

/** Pravý sloupec kalendáře na počítači: vybraný den a nadcházející akce. */
export default function KalendarPostranni({
  datum,
  udalosti,
  expedicePodleId,
  schuzkyPodleId,
  nadchazejici,
  akce,
  dnes,
  onVyprava,
  onPrihlaseni,
  onSchuzkaDetail,
  onSeznam,
}: {
  datum: string | null;
  udalosti: Map<string, KalendarniUdalost[]>;
  expedicePodleId: Map<string, Expedition>;
  schuzkyPodleId: Map<string, ApiSchuzka>;
  /** Nadcházející výpravy podle data, pravý sloupec ukáže nejvýš pět dnů. */
  nadchazejici: readonly Expedition[];
  /** Tři tečky vpravo v hlavičce dne. */
  akce?: ReactNode;
  dnes: string;
  onVyprava: (expedice: Expedition) => void;
  onPrihlaseni: (expedice: Expedition) => void;
  onSchuzkaDetail: (schuzka: ApiSchuzka, datum: string) => void;
  onSeznam: () => void;
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

  const denRef = useNabeh<HTMLElement>(datum ?? "", "x");

  return (
    <aside className="flex min-w-0 flex-col gap-7">
      {datum !== null ? (
        <section ref={denRef} aria-labelledby="kalendar-vybrany-den" className="flex min-w-0 flex-col gap-3.5">
          <div className="flex items-center gap-2">
            <h2 id="kalendar-vybrany-den" className="text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3">
              {nadpisDne(datum)}
            </h2>
            {pocet > 0 ? (
              <span className="rounded-full bg-povrch-2 px-[7px] py-0.5 text-[10.5px] font-semibold text-mech">
                {pocet} {pocet === 1 || pocet > 4 ? (pocet === 1 ? "akce" : "akcí") : "akce"}
              </span>
            ) : null}
            {akce !== undefined ? <span className="ml-auto">{akce}</span> : null}
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
                meta={[rozlozSraz(expedice.sraz).misto, kapacitaText(expedice)].filter((c) => c.length > 0).join(" · ")}
                znacka={barvaVypravy(expedice.id)}
                onClick={() => onVyprava(expedice)}
              />
            );
          })}
          {schuzky.map((schuzka) => {
            const cas = schuzka.cas !== null && schuzka.cas !== undefined ? casKZobrazeni(schuzka.cas) : "";
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
      <NadchazejiciVypravy
        vypravy={nadchazejici}
        vybranyDen={datum}
        onVyprava={onVyprava}
        onSeznam={onSeznam}
      />
    </aside>
  );
}
