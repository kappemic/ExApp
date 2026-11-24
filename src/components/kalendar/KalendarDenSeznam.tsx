import type { JSX, ReactNode } from "react";
import { casKZobrazeni } from "../../lib/evropsky-cas";
import { jeBezOmezeni } from "../../lib/expedition-utils";
import { barvaVypravy, TRIDY_BARVY, type BarvaUdalosti } from "../../lib/kalendar-barvy";
import { schuzkyDne, vypravyDne, type KalendarniUdalost } from "../../lib/kalendar";
import type { Expedition } from "../../lib/mock-expeditions";
import { pocetDni, rozlozSraz, rozsahDnu } from "../../lib/sraz";
import type { ApiSchuzka } from "../../shared/api-types";
import Ikona from "../Ikona";

const FOKUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk";

const DEN_DLOUHY = new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "long" });

/** „sobota 5. prosince“ (velkými písmeny řeší CSS). */
export function nadpisDne(datum: string): string {
  return DEN_DLOUHY.format(new Date(`${datum}T12:00:00`));
}

function sklonuj(pocet: number, jedna: string, dve: string, pet: string): string {
  if (pocet === 1) return jedna;
  return pocet >= 2 && pocet <= 4 ? dve : pet;
}

/** „3 výpravy“, „1 schůzka“, nebo „4 akce“, když jsou obě. */
export function pocetAkciDne(vypravy: number, schuzky: number): string {
  if (schuzky === 0) return `${vypravy} ${sklonuj(vypravy, "výprava", "výpravy", "výprav")}`;
  if (vypravy === 0) return `${schuzky} ${sklonuj(schuzky, "schůzka", "schůzky", "schůzek")}`;
  const celkem = vypravy + schuzky;
  return `${celkem} ${sklonuj(celkem, "akce", "akce", "akcí")}`;
}

export function kapacitaText(expedice: Expedition): string {
  return jeBezOmezeni(expedice)
    ? `${expedice.kapacita.prihlaseno} přihlášeno`
    : `${expedice.kapacita.prihlaseno} z ${expedice.kapacita.celkem}`;
}

/** Horní řádek karty výpravy: „9:30 · výprava“, u vícedenní rozsah dnů v její barvě. */
export function kdyVyprava(expedice: Expedition, sDatem = false): { text: string; barva: BarvaUdalosti | null } {
  const dni = pocetDni(expedice.datum, expedice.datumDo);
  if (dni > 1 && expedice.datumDo !== null) {
    return {
      text: `${rozsahDnu(expedice.datum, expedice.datumDo).toLocaleUpperCase("cs")} · ${dni} ${sklonuj(dni, "den", "dny", "dní")}`,
      barva: barvaVypravy(expedice.id),
    };
  }
  if (sDatem) {
    return { text: rozsahDnu(expedice.datum, null).toLocaleUpperCase("cs"), barva: barvaVypravy(expedice.id) };
  }
  const { cas } = rozlozSraz(expedice.sraz);
  return { text: cas !== null ? `${cas} · výprava` : "výprava", barva: null };
}

export function metaVyprava(expedice: Expedition): string {
  const { cas, misto } = rozlozSraz(expedice.sraz);
  return [cas !== null ? `${cas} sraz` : null, misto.length > 0 ? misto : null, kapacitaText(expedice)]
    .filter((c): c is string => c !== null)
    .join(" · ");
}

/**
 * Kompaktní karta události dne („Event · …“ v ExApp.pen): nahoře kdy,
 * vpravo šipka, pod tím název a místo. `znacka` přidá barevný čtvereček (počítač).
 */
export function KartaUdalosti({
  kdy,
  barvaKdy,
  nazev,
  meta,
  znacka,
  sipka = true,
  onClick,
}: {
  kdy: string;
  barvaKdy?: BarvaUdalosti | null;
  nazev: string;
  meta: string;
  znacka?: BarvaUdalosti;
  /** Šipka vpravo nahoře, karty dalších výprav ji nemají. */
  sipka?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bez-prejeti flex w-full flex-col gap-2 rounded-2xl border border-linka bg-povrch p-3.5 text-left shadow-jemny hover:bg-povrch-2/50 ${FOKUS}`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {znacka !== undefined ? (
            <span aria-hidden="true" className={`block size-2 shrink-0 rounded-sm ${TRIDY_BARVY[znacka].znacka}`} />
          ) : null}
          <span
            className={`truncate text-[11px] font-bold tracking-[0.3px] min-[90rem]:text-[11.5px] min-[90rem]:font-semibold min-[90rem]:tracking-normal ${
              barvaKdy !== undefined && barvaKdy !== null ? TRIDY_BARVY[barvaKdy].text : "text-mech"
            }`}
          >
            {kdy}
          </span>
        </span>
        {sipka ? <Ikona nazev="chevron-right" className="size-4 text-ink-3" /> : null}
      </span>
      <span className="font-display text-base font-bold text-inkoust">{nazev}</span>
      {meta.length > 0 ? <span className="text-[13px] text-mech min-[90rem]:text-[12.5px]">{meta}</span> : null}
    </button>
  );
}

/** Velká karta výpravy s tlačítkem Přihlásit se („Event · Hlavní“). */
function VelkaKarta({
  expedice,
  onVyprava,
  onPrihlaseni,
}: {
  expedice: Expedition;
  onVyprava: (expedice: Expedition) => void;
  onPrihlaseni: (expedice: Expedition) => void;
}): JSX.Element {
  const kdy = kdyVyprava(expedice);
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-linka bg-povrch p-4 shadow-jemny">
      <p className={`text-[11px] font-bold tracking-[0.4px] ${kdy.barva !== null ? TRIDY_BARVY[kdy.barva].text : "text-mech"}`}>
        {kdy.text}
      </p>
      <button
        type="button"
        onClick={() => onVyprava(expedice)}
        className={`bez-prejeti text-left font-display text-lg font-bold text-inkoust ${FOKUS}`}
      >
        {expedice.nazev}
      </button>
      <p className="text-[13px] text-mech">{metaVyprava(expedice)}</p>
      <button
        type="button"
        onClick={() => onPrihlaseni(expedice)}
        className={`nahled-press inline-flex h-11 w-full items-center justify-center rounded-xl bg-smrk px-4 text-sm font-semibold text-povrch ${FOKUS}`}
      >
        Přihlásit se
      </button>
    </article>
  );
}

/** Seznam pod kalendářem na telefonu pro vybraný den („Day Events“ v Telefon · Kalendář). */
export default function KalendarDenSeznam({
  datum,
  udalosti,
  expedicePodleId,
  schuzkyPodleId,
  onVyprava,
  onSchuzka,
  onPrihlaseni,
  dalsiVypravy = [],
  akce,
}: {
  /** Výpravy po vybraném dni, pod jeho událostmi (nejvýš tři). */
  dalsiVypravy?: readonly Expedition[];
  /** Tři tečky vedle nadpisu dne. */
  akce?: ReactNode;
  datum: string;
  udalosti: KalendarniUdalost[];
  expedicePodleId: Map<string, Expedition>;
  schuzkyPodleId: Map<string, ApiSchuzka>;
  onVyprava: (expedice: Expedition) => void;
  onSchuzka: (schuzka: ApiSchuzka) => void;
  onPrihlaseni: (expedice: Expedition) => void;
}): JSX.Element {
  const vypravy = vypravyDne(udalosti)
    .map((u) => expedicePodleId.get(u.id))
    .filter((e): e is Expedition => e !== undefined);
  const schuzky = schuzkyDne(udalosti)
    .map((u) => schuzkyPodleId.get(u.id))
    .filter((s): s is ApiSchuzka => s !== undefined);
  const [hlavni, ...dalsi] = vypravy;
  const vDni = new Set(vypravy.map((v) => v.id));
  const nasledujici = dalsiVypravy.filter((v) => v.datum > datum && !vDni.has(v.id)).slice(0, 3);

  return (
    <section aria-labelledby="kalendar-den-seznam" className="mt-5 flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="kalendar-den-seznam" className="text-[11px] font-bold tracking-[0.4px] text-okr">
          <span className="uppercase">{nadpisDne(datum)}</span>
          {vypravy.length + schuzky.length > 0 ? ` · ${pocetAkciDne(vypravy.length, schuzky.length)}` : ""}
        </h2>
        {akce}
      </div>
      {hlavni === undefined && schuzky.length === 0 ? (
        <p className="rounded-2xl border border-linka bg-povrch px-4 py-5 text-center text-[13px] text-ink-3">
          V tenhle den není nic naplánovaného.
        </p>
      ) : null}
      {hlavni !== undefined ? (
        <VelkaKarta expedice={hlavni} onVyprava={onVyprava} onPrihlaseni={onPrihlaseni} />
      ) : null}
      {dalsi.map((expedice) => {
        const kdy = kdyVyprava(expedice);
        return (
          <KartaUdalosti
            key={`v-${expedice.id}`}
            kdy={kdy.text}
            barvaKdy={kdy.barva}
            nazev={expedice.nazev}
            meta={metaVyprava(expedice)}
            onClick={() => onVyprava(expedice)}
          />
        );
      })}
      {schuzky.map((schuzka) => {
        const cas = schuzka.cas !== null && schuzka.cas !== undefined ? casKZobrazeni(schuzka.cas) : "";
        return (
          <KartaUdalosti
            key={`s-${schuzka.id}-${datum}`}
            kdy={cas.length > 0 ? `${cas} · schůzka` : "schůzka"}
            barvaKdy="okr"
            nazev={schuzka.nazev}
            meta={schuzka.mistnost?.trim() ?? ""}
            onClick={() => onSchuzka(schuzka)}
          />
        );
      })}
      {nasledujici.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-5">
          {nasledujici.map((expedice, i) =>
            i === 0 ? (
              <VelkaKarta key={expedice.id} expedice={expedice} onVyprava={onVyprava} onPrihlaseni={onPrihlaseni} />
            ) : (
              <KartaUdalosti
                key={expedice.id}
                kdy={kdyVyprava(expedice, true).text}
                barvaKdy={barvaVypravy(expedice.id)}
                nazev={expedice.nazev}
                meta={metaVyprava(expedice)}
                sipka={false}
                onClick={() => onVyprava(expedice)}
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
