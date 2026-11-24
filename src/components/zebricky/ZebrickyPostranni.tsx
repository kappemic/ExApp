import { useEffect, useMemo, useState, type JSX } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Ikona from "../Ikona";
import { formatKmNaDesetinu } from "../../lib/format-cisla";
import { getTrasyZebricku } from "../../lib/zebricky-api";
import { kmPodleMesicu, type MesicKm } from "../../lib/zebricky-mesice";
import type { ZebrickyTrasa } from "../../shared/api-types";

const VYSKA_SLOUPCE = 76;
const VIDITELNYCH = 3;

function datumCiselne(ymd: string): string {
  return ymd.slice(0, 10).split("-").reverse().map((cast) => String(Number(cast))).join(". ");
}

/** Sloupcový graf kilometrů, sdílí ho Žebříčky a klubové statistiky. */
export function SloupceKm({ mesice }: { mesice: readonly MesicKm[] }): JSX.Element {
  const maximum = mesice.reduce((max, m) => Math.max(max, m.km), 0);
  return (
    <ul className="m-0 flex h-[120px] list-none items-end gap-3 p-0">
      {mesice.map((m) => (
        <li key={m.klic} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[7px]">
          <span className="text-[11px] font-semibold text-ink-3">
            {Math.round(m.km)}
            <span className="sr-only"> km</span>
          </span>
          <span
            aria-hidden="true"
            className={`w-full rounded-md ${m.km === maximum && maximum > 0 ? "bg-smrk" : "bg-salvej"}`}
            style={{ height: maximum > 0 ? Math.max(4, Math.round((m.km / maximum) * VYSKA_SLOUPCE)) : 4 }}
          />
          <span className="text-[10.5px] font-medium text-ink-3">{m.popisek}</span>
        </li>
      ))}
    </ul>
  );
}

/** Odkaz z malého grafu na stránku se všemi měsíci, drží zvolené období. */
export function OdkazKilometry({ obdobi, className = "" }: { obdobi: string; className?: string }): JSX.Element {
  const location = useLocation();
  return (
    <Link
      to={obdobi === "celkem" ? "/zebricky/kilometry" : `/zebricky/kilometry?rok=${encodeURIComponent(obdobi)}`}
      state={{ odkud: `${location.pathname}${location.search}` }}
      className={`bez-prejeti flex min-h-11 items-center justify-center gap-1.5 border-t border-linka text-[11.5px] font-semibold text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk ${className}`}
    >
      Všechny měsíce
      <Ikona nazev="arrow-right" className="size-3 text-ink-3" />
    </Link>
  );
}

/**
 * Pravý sloupec Žebříčků na počítači podle ExApp.pen: „Km podle měsíců“
 * a „Ušlé výpravy“ (tři položky, pak „Zobrazit všech N“).
 */
export default function ZebrickyPostranni({ obdobi }: { obdobi: string }): JSX.Element | null {
  const navigate = useNavigate();
  const [trasy, setTrasy] = useState<ZebrickyTrasa[] | null>(null);
  const [vse, setVse] = useState(false);

  useEffect(() => {
    let zive = true;
    setTrasy(null);
    setVse(false);
    void (async (): Promise<void> => {
      const vysledek = await getTrasyZebricku(obdobi);
      if (!zive) return;
      setTrasy(
        vysledek.source === "fallback"
          ? []
          : [...vysledek.data.trasy].sort((a, b) => b.datum.localeCompare(a.datum)),
      );
    })();
    return () => {
      zive = false;
    };
  }, [obdobi]);

  const mesice = useMemo(() => kmPodleMesicu(trasy ?? []), [trasy]);

  if (trasy === null) {
    return <div aria-busy="true" aria-label="Načítám ušlé výpravy" className="h-64 animate-pulse rounded-2xl bg-[#ede8d9] motion-reduce:animate-none" />;
  }
  if (trasy.length === 0) return null;
  const viditelne = vse ? trasy : trasy.slice(0, VIDITELNYCH);

  return (
    <aside className="flex min-w-0 flex-col gap-5">
      <section aria-labelledby="km-podle-mesicu" className="flex flex-col gap-3.5 rounded-2xl border border-linka bg-povrch p-5 shadow-denik">
        <h2 id="km-podle-mesicu" className="font-sans text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3">
          Km podle měsíců
        </h2>
        <SloupceKm mesice={mesice} />
        <OdkazKilometry obdobi={obdobi} className="-mb-3" />
      </section>

      <section aria-labelledby="usle-vypravy" className="flex flex-col gap-3.5 rounded-2xl border border-linka bg-povrch p-5 shadow-denik">
        <div className="flex items-center justify-between gap-3">
          <h2 id="usle-vypravy" className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">
            Ušlé výpravy
          </h2>
          <span className="text-[11.5px] font-semibold text-ink-3">{trasy.length}</span>
        </div>
        <ul className={`m-0 flex list-none flex-col gap-3.5 p-0 ${vse ? "posuvnik max-h-[420px] overflow-y-auto" : ""}`}>
          {viditelne.map((trasa, i) => (
            <li key={trasa.id} className="border-b border-linka pb-[13px] pt-px last:border-b-0 last:pb-px">
              <button
                type="button"
                onClick={() => navigate(`/vypravy/${encodeURIComponent(trasa.id)}`)}
                className="bez-prejeti flex w-full items-center gap-2.5 rounded-lg text-left hover:bg-povrch-2/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
              >
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${i === 0 ? "bg-akcent" : "bg-salvej"}`} />
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="text-[13px] font-semibold leading-[17px] text-inkoust">{trasa.nazev}</span>
                  <span className="text-[11.5px] text-ink-3">
                    {datumCiselne(trasa.datum)}
                    {trasa.km !== null ? ` · ${formatKmNaDesetinu(trasa.km)}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!vse && trasy.length > VIDITELNYCH ? (
          <button
            type="button"
            onClick={() => setVse(true)}
            className="bez-prejeti -mb-3 flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-linka text-[11.5px] font-semibold text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          >
            Zobrazit všech {trasy.length}
            <Ikona nazev="arrow-right" className="size-3 text-ink-3" />
          </button>
        ) : null}
      </section>
    </aside>
  );
}
