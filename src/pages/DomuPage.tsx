import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { mockExpeditions } from "../lib/mock-expeditions";
import { formatCelyDatum } from "../lib/expedition-utils";

function nejblizsiVyprava() {
  const planovane = mockExpeditions
    .filter((vyprava) => vyprava.stav !== "proběhlá")
    .sort((a, b) => a.datum.localeCompare(b.datum));
  return planovane[0] ?? null;
}

export default function DomuPage(): JSX.Element {
  const nejblizsi = nejblizsiVyprava();
  const { user, isLoading, isAdmin } = useAuth();
  const odhlasen = !isLoading && user === null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">ExApp · podzim 2026</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Domů
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Nástěnka ExApp. Nejbližší výprava a rychlé odkazy na chat
          a žebříčky.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 pt-6 lg:grid-cols-3">
        <section
          aria-labelledby="nejblizsi-vyprava"
          className="rounded-lg border-2 border-inkoust bg-white/60 p-5 shadow-denik lg:col-span-2"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mech">
            Nejbližší výprava
          </p>
          {nejblizsi === null ? (
            <p role="status" className="mt-3 text-sm text-inkoust/70">
              Zatím není naplánovaná žádná výprava. Vedoucí sem brzy připíše
              první záznam.
            </p>
          ) : (
            <div className="mt-3">
              <h2
                id="nejblizsi-vyprava"
                className="text-xl font-bold tracking-tight"
              >
                {nejblizsi.nazev}
              </h2>
              <p className="mt-1.5 text-sm text-inkoust/75">
                <time dateTime={nejblizsi.datum}>
                  {formatCelyDatum(nejblizsi.datum)}
                </time>
                {" · "}
                {nejblizsi.sraz}
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inkoust/80">
                {nejblizsi.popis}
              </p>
              <Link
                to="/vypravy"
                className="mt-4 inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-md border-2 border-inkoust bg-smrk px-4 py-2 text-sm font-bold text-papir transition-colors hover:bg-inkoust"
              >
                Zobrazit výpravy
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </section>

        <nav
          aria-label="Rychlé odkazy"
          className="flex flex-col gap-4 rounded-lg border-2 border-inkoust bg-papir p-5 shadow-denik"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mech">
            Rychlé odkazy
          </p>
          <Link
            to="/chat"
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border-2 border-linka bg-white/60 px-4 py-3 text-sm font-bold transition-colors hover:border-inkoust"
          >
            <span>
              Chat
              <span className="mt-0.5 block text-xs font-normal text-inkoust/65">
                Domluva k výpravám
              </span>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            to="/zebricky"
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border-2 border-linka bg-white/60 px-4 py-3 text-sm font-bold transition-colors hover:border-inkoust"
          >
            <span>
              Žebříčky
              <span className="mt-0.5 block text-xs font-normal text-inkoust/65">
                Nejaktivnější členové
              </span>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>

      {odhlasen && (
        <section
          aria-labelledby="prihlaseni-vyzva"
          className="mt-5 rounded-lg border-2 border-inkoust bg-white/60 p-5 shadow-denik"
        >
          <h2 id="prihlaseni-vyzva" className="text-base font-bold tracking-tight">
            Přidej se k výpravám
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-inkoust/70">
            Bez přihlášení vidíš jen tuhle nástěnku a žebříčky. Přihlas se,
            nebo se zaregistruj s kódem od vedoucí.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-smrk px-4 py-2 text-sm font-bold text-papir transition-colors hover:bg-inkoust"
            >
              Přihlásit se
            </Link>
            <Link
              to="/register"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-papir px-4 py-2 text-sm font-bold transition-colors hover:bg-linka"
            >
              Registrace s kódem
            </Link>
          </div>
        </section>
      )}

      {isAdmin && (
        <section
          aria-labelledby="spravcovsky-nadpis"
          className="mt-5 flex flex-col gap-3 rounded-lg border-2 border-inkoust bg-white/60 px-5 py-4 shadow-denik sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="spravcovsky-nadpis" className="text-sm font-bold">
              Správa oddílu
            </h2>
            <p className="mt-0.5 text-sm text-inkoust/70">
              Jsi vedoucí — můžeš otevřít správu členů.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/admin/clenove"
              className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-md border-2 border-inkoust bg-papir px-4 py-2 text-sm font-bold transition-colors hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none"
            >
              Otevřít Členy <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      )}

      <div
        role="status"
        className="mt-5 rounded-lg border-2 border-dashed border-inkoust/30 bg-white/60 px-6 py-8 text-center shadow-denik"
      >
        <p className="text-sm font-bold">Zatím tu není nic dalšího</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
          Novinky z oddílu a pozvánky na akce se tu objeví s dalšími kroky.
        </p>
      </div>
    </main>
  );
}
