import { useMemo, useState, type JSX } from "react";
import { MOCK_CLENOVE, type MockClen } from "../data/mockClenove";
import { jeAktivniClen, jeClen, jeVeVedeni, jeVRade } from "../config/roles";
import AdminTaby, { type ClenoveTabId, type PoctyTabu } from "../components/Admin/AdminTaby";
import ClenDetailModal from "../components/Admin/ClenDetailModal";
import ClenoveTable from "../components/Admin/ClenoveTable";

const POPISKY_PANELU: Record<ClenoveTabId, string> = {
  vsichni: "Všichni členové oddílu.",
  aktivni: "Členové s aktivní účastí.",
  rada: "Členové oddílové rady.",
  vedeni: "Vedoucí oddílu.",
  clenove: "Základní členové bez aktivní účasti.",
};

/**
 * Shell /admin/clenove — 5 přepínatelných pohledů (Krok 4).
 * Guard řeší App.tsx (AdminGate), tady layout + taby + tabulka.
 *
 * Rozhodnutí o 5. tabu „Členové": ponechány Všichni / Aktivní / Rada / Vedení
 * a přidán tab Členové (= jeClen) pro symetrii — jinak by základní neaktivní
 * členové (role `clen`) nešli samostatně vyfiltrovat, jen přes „Všichni".
 * Každý tab filtruje přes role.includes(...) helpery z config/roles,
 * počty v tabech souhlasí s filtrem (stejný predikát).
 */
export default function AdminClenovePage(): JSX.Element {
  const [aktivniTab, setAktivniTab] = useState<ClenoveTabId>("vsichni");
  const [vybranyId, setVybranyId] = useState<string | null>(null);
  /** Krok 4b: lokální stav nad mockem — onSave z modalu přepíše člena. */
  const [clenove, setClenove] = useState<MockClen[]>(() => [...MOCK_CLENOVE]);

  function naUlozitClena(aktualizovany: MockClen): void {
    setClenove((predchozi: MockClen[]) =>
      predchozi.map((clen: MockClen) =>
        clen.id === aktualizovany.id ? aktualizovany : clen,
      ),
    );
  }

  const pocty: PoctyTabu = useMemo(
    () => ({
      vsichni: clenove.length,
      aktivni: clenove.filter((c) => jeAktivniClen(c.role)).length,
      rada: clenove.filter((c) => jeVRade(c.role)).length,
      vedeni: clenove.filter((c) => jeVeVedeni(c.role)).length,
      clenove: clenove.filter((c) => jeClen(c.role)).length,
    }),
    [clenove],
  );

  const filtrovani = useMemo(() => {
    switch (aktivniTab) {
      case "aktivni":
        return clenove.filter((c) => jeAktivniClen(c.role));
      case "rada":
        return clenove.filter((c) => jeVRade(c.role));
      case "vedeni":
        return clenove.filter((c) => jeVeVedeni(c.role));
      case "clenove":
        return clenove.filter((c) => jeClen(c.role));
      case "vsichni":
      default:
        return clenove;
    }
  }, [aktivniTab, clenove]);

  /** Vybraný člen napříč taby — dialog zůstane otevřený i po přepnutí tabu. */
  const vybrany: MockClen | null = useMemo(
    () => clenove.find((c) => c.id === vybranyId) ?? null,
    [clenove, vybranyId],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">
          Administrace · demo režim
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Členové
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Správa členů oddílu — přehled podle skupin, role a aktivity.
        </p>

        <AdminTaby
          aktivniTab={aktivniTab}
          pocty={pocty}
          onZmena={setAktivniTab}
        />
      </header>

      <div className="pt-6">
        <div
          role="tabpanel"
          id={`clenove-panel-${aktivniTab}`}
          aria-labelledby={`clenove-tab-${aktivniTab}`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mech">
            {POPISKY_PANELU[aktivniTab]} Položek: {pocty[aktivniTab]}
          </p>
          <div className="mt-3">
            <ClenoveTable
              clenove={[...filtrovani]}
              vybranyId={vybranyId}
              onVyber={(clen) => setVybranyId(clen.id)}
              popisek={`Seznam členů — ${POPISKY_PANELU[aktivniTab]}`}
            />
          </div>
        </div>
      </div>

      <ClenDetailModal
        clen={vybrany}
        onZavrit={() => setVybranyId(null)}
        onSave={naUlozitClena}
      />
    </main>
  );
}
