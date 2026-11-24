import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { formatKmZaokrouhlene } from "../../lib/format-cisla";
import {
  getMojeStatistiky,
  type StatistikyResponse,
} from "../../lib/statistiky-api";
import {
  nactiStravaStav,
  presmerujNaStravuAutorizaci,
} from "../../lib/strava-api";
import type { ApiAktivita } from "../../shared/api-types";
import PrazdnyStav from "../PrazdnyStav";
import Ikona from "../Ikona";
import { useAuth } from "../../hooks/useAuth";
import { getZebricek } from "../../lib/zebricky-api";
import { IkonaGraf } from "../SeznamIkony";
import RucniZapisSheet from "./RucniZapisSheet";
import SparovatAktivituSheet from "./SparovatAktivituSheet";
import StatistikyKlub from "./StatistikyKlub";
import { ZALOZKY_DRAHA, tridaZalozky } from "../ProfilKusy";
import { useNabeh } from "../../lib/pohyb";

function formatPrevyseni(metry: number): string {
  return `${metry} m`;
}

function formatDatumRadku(datum: string | undefined): string {
  if (datum === undefined || datum.trim().length === 0) return "";
  const cas = Date.parse(datum);
  if (Number.isNaN(cas)) return datum;
  return new Date(cas).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function nazevAktivity(aktivita: ApiAktivita): string {
  const nazev = (aktivita.nazev ?? "").trim();
  if (nazev.length > 0) return nazev;
  return aktivita.expeditionId;
}

function zdrojAktivity(aktivita: ApiAktivita): string {
  if (aktivita.stravaActivityId !== null) return "Strava";
  if (aktivita.km !== null) return "Ruční zápis";
  return "Čeká na spárování";
}

function nejdelsiAktivita(aktivity: readonly ApiAktivita[]): ApiAktivita | null {
  let nej: ApiAktivita | null = null;
  for (const polozka of aktivity) {
    if (typeof polozka.km !== "number") continue;
    if (nej === null || (nej.km ?? 0) < polozka.km) nej = polozka;
  }
  return nej;
}

type Pohled = "osobni" | "klub";

const POHLEDY: readonly { id: Pohled; popisek: string }[] = [
  { id: "osobni", popisek: "Osobní" },
  { id: "klub", popisek: "Klubové" },
];

/** Statistiky: osobní (moje výpravy, Strava) a klubové (heatmapa a součty za celý klub). */
export default function StatistikyPlocha({
  strava,
}: {
  /** Karta propojení Stravy (drží ji ProfilPage kvůli návratu z autorizace). */
  strava?: ReactNode;
} = {}): JSX.Element {
  const { user } = useAuth();
  const [poradi, setPoradi] = useState<{ misto: number; z: number } | null>(null);
  const [faze, setFaze] = useState<"nacitani" | "hotovo">("nacitani");
  const [data, setData] = useState<StatistikyResponse | null>(null);
  const [stravaPropojena, setStravaPropojena] = useState<boolean | null>(null);
  const [pripojujeSe, setPripojujeSe] = useState<boolean>(false);
  const [rucniOtevren, setRucniOtevren] = useState<boolean>(false);
  const [sparovat, setSparovat] = useState<ApiAktivita | null>(null);

  async function nactiData(): Promise<void> {
    const vysledek = await getMojeStatistiky();
    setData(vysledek.data);
    setFaze("hotovo");
  }

  useEffect(() => {
    let zije = true;
    void (async (): Promise<void> => {
      await nactiData();
      const [stav, zebricek] = await Promise.all([nactiStravaStav(), getZebricek("celkem")]);
      if (!zije) return;
      setStravaPropojena(stav.ok ? stav.data.propojeno : false);
      if (zebricek.source === "db" && user !== null) {
        const misto = zebricek.data.zebricky.findIndex((radek) => radek.userId === user.id);
        if (misto >= 0) setPoradi({ misto: misto + 1, z: zebricek.data.zebricky.length });
      }
    })();
    return () => {
      zije = false;
    };
  }, []);

  async function pripojitStravu(): Promise<void> {
    setPripojujeSe(true);
    const vysledek = await presmerujNaStravuAutorizaci();
    setPripojujeSe(false);
    if (!vysledek.ok) return;
  }

  const [params, setParams] = useSearchParams();
  // Stará adresa ?tab=heatmapa vede rovnou na klubovou mapu.
  const pohled: Pohled = params.get("pohled") === "klub" || params.get("tab") === "heatmapa" ? "klub" : "osobni";
  const obsahRef = useNabeh<HTMLDivElement>(pohled === "klub" ? 1 : 0, "x");
  function nastavPohled(dalsi: Pohled): void {
    setParams(dalsi === "klub" ? { tab: "statistiky", pohled: "klub" } : { tab: "statistiky" }, { replace: true });
  }
  const nejdelsi = useMemo(
    () => (data === null ? null : nejdelsiAktivita(data.aktivity)),
    [data],
  );

  const kostra = (
      <div
        aria-busy="true"
        aria-label="Načítám statistiky"
        className="space-y-3 text-left"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-linka bg-mlha/40"
          />
        ))}
      </div>
  );
  const nacita = faze === "nacitani" || data === null;
  const maAktivity = data !== null && data.vypravy > 0;
  const rucniTlacitko = (trida: string): JSX.Element => (
    <button type="button" onClick={() => setRucniOtevren(true)} className={trida}>
      <Ikona nazev="plus" className="hidden size-4 lg:block" />
      <span className="lg:hidden">Zapsat kilometry ručně</span>
      <span className="hidden lg:inline">Zapsat kilometry</span>
    </button>
  );

  return (
    <section aria-label="Osobní statistiky" className="flex flex-col gap-5 text-left min-[90rem]:gap-8">
      <div className="flex flex-col gap-4 min-[90rem]:gap-[18px]">
      <div className="flex items-center justify-between gap-3 min-[90rem]:items-end">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
          Statistiky
        </h1>
        <div className="flex items-center gap-2.5">
          {pohled === "osobni" && stravaPropojena === false && (
            <button
              type="button"
              disabled={pripojujeSe}
              onClick={() => void pripojitStravu()}
              className="nahled-press relative inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-akcent-100 px-3 text-[12.5px] lg:h-11 font-semibold text-akcent before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] disabled:opacity-60 min-[90rem]:h-[46px] min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:px-[18px] min-[90rem]:text-sm min-[90rem]:text-inkoust"
            >
              <Ikona nazev="link-2" className="hidden size-4 text-mech min-[90rem]:block" />
              {pripojujeSe ? "Přesměrovávám…" : "Připojit Stravu"}
            </button>
          )}
          {pohled === "osobni" && maAktivity
            ? rucniTlacitko(
                "nahled-press hidden h-11 items-center gap-2 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-povrch hover:opacity-90 lg:inline-flex min-[90rem]:h-[46px]",
              )
            : null}
        </div>
      </div>

      <div role="group" aria-label="Čí statistiky" className={ZALOZKY_DRAHA}>
        {POHLEDY.map((polozka) => (
          <button
            key={polozka.id}
            type="button"
            aria-pressed={pohled === polozka.id}
            onClick={() => nastavPohled(polozka.id)}
            className={`relative before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] ${tridaZalozky(pohled === polozka.id)}`}
          >
            {polozka.popisek}
          </button>
        ))}
      </div>
      </div>

      <div ref={obsahRef}>
      {pohled === "klub" ? (
        <StatistikyKlub />
      ) : nacita || data === null ? (
        kostra
      ) : !maAktivity ? (
        <PrazdnyStav
          ikona={<IkonaGraf />}
          nadpis="Zatím bez kilometrů"
          text="Jakmile absolvuješ výpravu a zapíšou se kilometry, objeví se tu přehled."
          akce={{ popisek: "Na výpravy", odkaz: "/vypravy", varianta: "vedlejsi" }}
        />
      ) : (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
            <KartaAktivit aktivity={data.aktivity} onSparovat={(a) => setSparovat(a)} />
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <SouhrnSezony data={data} nejdelsi={nejdelsi} />
            <KartaCelkem data={data} nejdelsi={nejdelsi} poradi={poradi} />
            {stravaPropojena === true && <KartaStravaInfo />}
            {strava !== undefined ? <div className="order-5 lg:order-none">{strava}</div> : null}
          </div>
          {rucniTlacitko(
            "nahled-press order-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-mlha px-4 text-sm font-semibold text-smrk lg:hidden",
          )}
        </div>
      )}

      </div>

      <RucniZapisSheet
        otevreno={rucniOtevren}
        aktivity={data?.aktivity ?? []}
        onZavrit={() => setRucniOtevren(false)}
        onUlozeno={() => void nactiData()}
      />

      {sparovat !== null && (
        <SparovatAktivituSheet
          otevreno
          expeditionId={sparovat.expeditionId}
          nazevVypravy={nazevAktivity(sparovat)}
          datumVypravy={sparovat.datum ?? null}
          onZavrit={() => setSparovat(null)}
          onSparovano={() => void nactiData()}
        />
      )}
    </section>
  );
}

function KartaStravaInfo(): JSX.Element {
  return (
    <div className="order-3 flex items-center gap-2.5 rounded-2xl bg-mlha p-3.5 lg:hidden">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-smrk text-povrch">
        <Ikona nazev="link-2" className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-inkoust">Strava je spárovaná</p>
        <p className="mt-0.5 text-xs text-mech">
          Nové aktivity se načtou samy. Ruční zápis zůstal pro výjimky.
        </p>
      </div>
    </div>
  );
}

function KartaAktivit({
  aktivity,
  onSparovat,
}: {
  aktivity: readonly ApiAktivita[];
  onSparovat: (aktivita: ApiAktivita) => void;
}): JSX.Element {
  return (
    <section aria-label="Výpravy a kilometry" className="order-1 overflow-hidden rounded-2xl border border-linka bg-povrch shadow-karta lg:order-none">
      <div className="hidden items-center justify-between border-b border-linka px-5 py-4 lg:flex">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">Výpravy a kilometry</h2>
        <span className="text-[11.5px] font-medium text-ink-3">
          {aktivity.length} {aktivity.length === 1 ? "záznam" : aktivity.length <= 4 ? "záznamy" : "záznamů"}
        </span>
      </div>
      <ul className="m-0 list-none divide-y divide-linka p-0">
        {aktivity.map((aktivita) => {
          const meta = formatDatumRadku(aktivita.datum);
          const zdroj = zdrojAktivity(aktivita);
          const rucne = aktivita.stravaActivityId === null;
          const nesparovano = aktivita.km === null && rucne;
          const km = typeof aktivita.km === "number" ? formatKmZaokrouhlene(aktivita.km) : "—";
          const prevyseni = typeof aktivita.prevyseniM === "number" ? formatPrevyseni(aktivita.prevyseniM) : "—";
          return (
            <li key={aktivita.id} className="flex items-center gap-3 p-3.5 lg:gap-3.5 lg:px-5">
              <div className="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-0.5">
                <p className="text-[14.5px] font-semibold text-inkoust lg:text-[13.5px]">{nazevAktivity(aktivita)}</p>
                <p className="flex items-center gap-1.5 text-xs text-ink-3 lg:text-[11.5px]">
                  {meta}
                  <span className="lg:hidden">{zdroj.length > 0 ? ` · ${zdroj}` : ""}</span>
                  {rucne ? (
                    <span className="hidden rounded-full bg-povrch-2 px-[7px] py-0.5 text-[9.5px] font-semibold text-ink-3 lg:inline">ručně</span>
                  ) : null}
                </p>
              </div>
              {nesparovano ? (
                <button
                  type="button"
                  onClick={() => onSparovat(aktivita)}
                  className="nahled-press relative inline-flex min-h-11 shrink-0 items-center rounded-[9px] bg-smrk px-3 text-[12.5px] font-semibold text-povrch min-[90rem]:min-h-9"
                >
                  Spárovat
                </button>
              ) : (
                <div className="flex shrink-0 flex-col items-end gap-0.5 lg:flex-row lg:items-baseline lg:gap-3.5">
                  <p className="font-display text-base font-bold text-inkoust lg:text-[15px]">{km}</p>
                  <p className="text-xs text-ink-3">{prevyseni}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** „Celkem“ v pravém sloupci na počítači. */
function KartaCelkem({
  data,
  nejdelsi,
  poradi,
}: {
  data: StatistikyResponse;
  nejdelsi: ApiAktivita | null;
  poradi: { misto: number; z: number } | null;
}): JSX.Element {
  const nejvic = data.aktivity.reduce((max, a) => Math.max(max, a.prevyseniM ?? 0), 0);
  const prumer = data.vypravy > 0 ? data.kmCelkem / data.vypravy : 0;
  const radky: Array<{ popisek: string; poznamka: string; hodnota: string }> = [
    {
      popisek: "Výpravy",
      poznamka: nejdelsi !== null ? `nejdelší ${nazevAktivity(nejdelsi)}` : "",
      hodnota: String(data.vypravy),
    },
    {
      popisek: "Kilometry",
      poznamka: `průměr ${prumer.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} na výpravu`,
      hodnota: formatKmZaokrouhlene(data.kmCelkem).replace(/\s*km$/, ""),
    },
    {
      popisek: "Převýšení",
      poznamka: nejvic > 0 ? `nejvíc ${formatPrevyseni(nejvic)}` : "",
      hodnota: `${data.prevyseniCelkem.toLocaleString("cs-CZ")} m`,
    },
    ...(poradi !== null
      ? [{ popisek: "Pořadí v klubu", poznamka: `z ${poradi.z} členů`, hodnota: `${poradi.misto}.` }]
      : []),
  ];
  return (
    <section aria-labelledby="statistiky-celkem" className="hidden flex-col gap-4 rounded-2xl border border-linka bg-povrch p-5 shadow-denik lg:flex">
      <h2 id="statistiky-celkem" className="font-sans text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3">
        Celkem
      </h2>
      {radky.map((radek) => (
        <div key={radek.popisek} className="flex items-end justify-between gap-3 border-b border-linka pb-3">
          <div className="flex min-w-0 flex-col gap-px">
            <span className="text-[12.5px] font-medium text-mech">{radek.popisek}</span>
            {radek.poznamka.length > 0 ? <span className="truncate text-[10.5px] text-ink-5">{radek.poznamka}</span> : null}
          </div>
          <span className="shrink-0 font-display text-xl font-bold tracking-[-0.5px] text-inkoust">{radek.hodnota}</span>
        </div>
      ))}
    </section>
  );
}

function SouhrnSezony({
  data,
  nejdelsi,
}: {
  data: StatistikyResponse;
  nejdelsi: ApiAktivita | null;
}): JSX.Element {
  const rok = new Date().getFullYear();
  return (
    <div className="order-2 flex flex-col gap-3 rounded-2xl border border-linka bg-povrch p-4 lg:hidden">
      <p className="text-[11.5px] font-semibold text-ink-3">Sezóna {rok}</p>
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="font-display text-xl font-bold text-inkoust">
            {formatKmZaokrouhlene(data.kmCelkem)}
          </p>
          <p className="text-[11.5px] text-mech">celkem</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold text-inkoust">
            {formatPrevyseni(data.prevyseniCelkem)}
          </p>
          <p className="text-[11.5px] text-mech">převýšení</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold text-inkoust">
            {data.vypravy}
          </p>
          <p className="text-[11.5px] text-mech">výpravy</p>
        </div>
      </div>
      {nejdelsi !== null && typeof nejdelsi.km === "number" && (
        <p className="text-[12.5px] text-mech">
          Nejdelší: {nazevAktivity(nejdelsi)} · {formatKmZaokrouhlene(nejdelsi.km)}
        </p>
      )}
    </div>
  );
}
