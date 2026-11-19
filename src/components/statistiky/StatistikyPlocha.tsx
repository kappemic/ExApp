import { useEffect, useMemo, useState, type JSX } from "react";
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
import { IkonaGraf } from "../SeznamIkony";
import RucniZapisSheet from "./RucniZapisSheet";
import SparovatAktivituSheet from "./SparovatAktivituSheet";

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

export default function StatistikyPlocha(): JSX.Element {
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
      const stav = await nactiStravaStav();
      if (!zije) return;
      setStravaPropojena(stav.ok ? stav.data.propojeno : false);
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

  const nejdelsi = useMemo(
    () => (data === null ? null : nejdelsiAktivita(data.aktivity)),
    [data],
  );

  if (faze === "nacitani" || data === null) {
    return (
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
  }

  return (
    <section aria-label="Osobní statistiky" className="space-y-4 text-left">
      <StatistikyNadpis
        stravaPropojena={stravaPropojena}
        pripojujeSe={pripojujeSe}
        onPripojit={() => void pripojitStravu()}
      />

      {data.vypravy === 0 ? (
        <PrazdnyStav
          ikona={<IkonaGraf />}
          nadpis="Zatím bez kilometrů"
          text="Jakmile absolvuješ výpravu a zapíšou se kilometry, objeví se tu přehled."
          akce={{ popisek: "Na výpravy", odkaz: "/vypravy", varianta: "vedlejsi" }}
        />
      ) : (
        <>
          <KartaAktivit aktivity={data.aktivity} onSparovat={(a) => setSparovat(a)} />

          <SouhrnSezony data={data} nejdelsi={nejdelsi} />

          {stravaPropojena === true && <KartaStravaInfo />}

          <button
            type="button"
            onClick={() => setRucniOtevren(true)}
            className="nahled-press inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pole bg-povrch px-4 text-sm font-semibold text-inkoust"
          >
            Zapsat kilometry ručně
          </button>
        </>
      )}

      <RucniZapisSheet
        otevreno={rucniOtevren}
        aktivity={data.aktivity}
        onZavrit={() => setRucniOtevren(false)}
        onUlozeno={() => void nactiData()}
      />

      {sparovat !== null && (
        <SparovatAktivituSheet
          otevreno
          expeditionId={sparovat.expeditionId}
          nazevVypravy={nazevAktivity(sparovat)}
          onZavrit={() => setSparovat(null)}
          onSparovano={() => void nactiData()}
        />
      )}
    </section>
  );
}

function KartaStravaInfo(): JSX.Element {
  return (
    <div className="flex gap-2.5 rounded-2xl bg-mlha p-3.5">
      <h3 className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-smrk font-display text-sm font-bold text-papir">
        S
      </h3>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-inkoust">Strava je spárovaná</p>
        <p className="mt-0.5 text-xs leading-relaxed text-mech">
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
    <div className="overflow-hidden rounded-2xl border border-linka bg-povrch shadow-[0_1px_2px_rgba(28,38,21,0.07)]">
      <ul role="list">
        {aktivity.map((aktivita, index) => {
          const meta = formatDatumRadku(aktivita.datum);
          const zdroj = zdrojAktivity(aktivita);
          const nespárováno = aktivita.km === null && aktivita.stravaActivityId === null;
          return (
            <li
              key={aktivita.id}
              className={`flex items-center gap-3 px-3.5 py-3.5 ${
                index < aktivity.length - 1 ? "border-b border-linka" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-inkoust">{nazevAktivity(aktivita)}</p>
                <p className="mt-0.5 text-xs text-mech">
                  {[meta, zdroj].filter((cast) => cast.length > 0).join(" · ")}
                </p>
              </div>
              {nespárováno ? (
                <button
                  type="button"
                  onClick={() => onSparovat(aktivita)}
                  className="nahled-press shrink-0 rounded-lg bg-smrk px-2.5 py-1.5 text-xs font-semibold text-papir"
                >
                  Spárovat
                </button>
              ) : (
                <div className="shrink-0 text-right">
                  <p className="font-display text-base font-bold tabular-nums text-inkoust">
                    {typeof aktivita.km === "number"
                      ? formatKmZaokrouhlene(aktivita.km)
                      : "—"}
                  </p>
                  <p className="text-xs tabular-nums text-mech">
                    {typeof aktivita.prevyseniM === "number"
                      ? formatPrevyseni(aktivita.prevyseniM)
                      : "—"}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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
    <div className="rounded-2xl border border-linka bg-povrch p-4">
      <p className="text-[11.5px] font-semibold text-mech">Sezóna {rok}</p>
      <div className="mt-3 flex flex-wrap justify-between gap-4">
        <div>
          <p className="font-display text-xl font-bold tabular-nums text-inkoust">
            {formatKmZaokrouhlene(data.kmCelkem)}
          </p>
          <p className="text-[11.5px] text-mech">celkem</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold tabular-nums text-inkoust">
            {formatPrevyseni(data.prevyseniCelkem)}
          </p>
          <p className="text-[11.5px] text-mech">převýšení</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold tabular-nums text-inkoust">
            {data.vypravy}
          </p>
          <p className="text-[11.5px] text-mech">výpravy</p>
        </div>
      </div>
      {nejdelsi !== null && typeof nejdelsi.km === "number" && (
        <p className="mt-3 text-[12.5px] text-mech">
          Nejdelší: {nazevAktivity(nejdelsi)} · {formatKmZaokrouhlene(nejdelsi.km)}
        </p>
      )}
    </div>
  );
}

function StatistikyNadpis({
  stravaPropojena,
  pripojujeSe,
  onPripojit,
}: {
  stravaPropojena: boolean | null;
  pripojujeSe: boolean;
  onPripojit: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-[28px] font-bold tracking-tight text-inkoust">
        Statistiky
      </h2>
      {stravaPropojena === false && (
        <button
          type="button"
          disabled={pripojujeSe}
          onClick={onPripojit}
          className="nahled-press inline-flex min-h-9 items-center justify-center rounded-xl bg-akcent-100 px-3 text-[12.5px] font-semibold text-akcent disabled:opacity-60"
        >
          {pripojujeSe ? "Přesměrovávám…" : "Připojit Stravu"}
        </button>
      )}
      {stravaPropojena === true && (
        <span className="inline-flex min-h-9 items-center rounded-xl bg-mlha px-3 text-xs font-semibold text-mech">
          Strava propojená
        </span>
      )}
    </div>
  );
}