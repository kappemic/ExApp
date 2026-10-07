import { useState, type JSX, type KeyboardEvent } from "react";

type ProfilTab = "prehled" | "statistiky" | "heatmapa";

const TABY: Array<{ id: ProfilTab; popisek: string }> = [
  { id: "prehled", popisek: "Přehled" },
  { id: "statistiky", popisek: "Statistiky" },
  { id: "heatmapa", popisek: "Heatmapa" },
];

const PANEL_OBSAH: Record<ProfilTab, { nadpis: string; text: string; paticka: string }> = {
  prehled: {
    nadpis: "Zatím prázdný přehled",
    text: "Tvoje účast, odznaky a poslední záznamy se tu objeví po přihlášení a prvních výpravách.",
    paticka: "exapp · přehled se chystá",
  },
  statistiky: {
    nadpis: "Zatím bez kilometrů",
    text: "Kilometry, převýšení a počet výprav doplníme ve Fázi 4 po napojení Stravy.",
    paticka: "exapp · statistiky se chystají",
  },
  heatmapa: {
    nadpis: "Mapa je zatím čistá",
    text: "Prošlé trasy a heatmapa výprav se vykreslí, jakmile spárujeme první aktivity.",
    paticka: "exapp · mapa se chystá",
  },
};

export default function ProfilPage(): JSX.Element {
  const [aktivniTab, setAktivniTab] = useState<ProfilTab>("prehled");
  const obsah = PANEL_OBSAH[aktivniTab];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const poradi = TABY.map((t) => t.id);
    const idx = poradi.indexOf(aktivniTab);
    let dalsi: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dalsi = (idx + 1) % poradi.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      dalsi = (idx - 1 + poradi.length) % poradi.length;
    else if (e.key === "Home") dalsi = 0;
    else if (e.key === "End") dalsi = poradi.length - 1;
    if (dalsi === null) return;
    e.preventDefault();
    const noveId = poradi[dalsi];
    setAktivniTab(noveId);
    document.getElementById(`tab-${noveId}`)?.focus();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">ExApp · podzim 2026</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Profil
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Tvůj přehled, statistiky a heatmapa. Podrobnosti doplní Fáze 4.
        </p>

        <div
          role="tablist"
          aria-label="Sekce profilu"
          onKeyDown={onKeyDown}
          className="mt-4 inline-flex max-w-full flex-wrap rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik"
        >
          {TABY.map((tab) => {
            const aktivni = aktivniTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={aktivni}
                aria-controls={aktivni ? `panel-${tab.id}` : undefined}
                tabIndex={aktivni ? 0 : -1}
                onClick={() => setAktivniTab(tab.id)}
                className={`min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm font-bold transition-colors ${
                  aktivni
                    ? "bg-inkoust text-papir"
                    : "text-inkoust hover:bg-linka/60"
                }`}
              >
                {tab.popisek}
              </button>
            );
          })}
        </div>
      </header>

      <div className="pt-6">
        <div
          role="tabpanel"
          id={`panel-${aktivniTab}`}
          aria-labelledby={`tab-${aktivniTab}`}
          className="rounded-lg border-2 border-inkoust bg-white/60 p-6 text-center shadow-denik"
        >
          <div
            role="status"
            className="flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-papir px-6 py-10"
          >
            <h2 className="text-lg font-bold tracking-tight">{obsah.nadpis}</h2>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
              {obsah.text}
            </p>
            <p
              aria-hidden="true"
              className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
            >
              {obsah.paticka}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
