import type { JSX } from "react";
import { Link } from "react-router-dom";
import Obraz, { variantaObrazu } from "../components/gallery/Obraz";
import { useAuth } from "../hooks/useAuth";
import { mockExpeditions } from "../lib/mock-expeditions";
import { formatCelyDatum } from "../lib/expedition-utils";

function nejblizsiVyprava() {
  const planovane = mockExpeditions
    .filter((vyprava) => vyprava.stav !== "proběhlá")
    .sort((a, b) => a.datum.localeCompare(b.datum));
  return planovane[0] ?? null;
}

function Sipka(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function DomuPage(): JSX.Element {
  const nejblizsi = nejblizsiVyprava();
  const { user, isLoading, isAdmin } = useAuth();
  const odhlasen = !isLoading && user === null;

  const celkemVyprav = mockExpeditions.length;
  const probehlych = mockExpeditions.filter((v) => v.stav === "proběhlá").length;
  const mistCelkem = mockExpeditions.reduce((s, v) => s + v.kapacita.celkem, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      {/* muzejní záhlaví */}
      <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-inkoust/60">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="tabular-nums">00</span>
          <span>Kronika oddílu</span>
        </span>
        <span>ExApp · podzim 2026</span>
      </div>

      {/* HERO */}
      <header className="pt-4 text-center sm:pt-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-inkoust/55">
          Galerie výprav · zátiší oddílu
        </p>
        <h1 className="font-galerie mx-auto mt-3 max-w-4xl text-[clamp(2.9rem,9vw,6.2rem)]">
          Esence
          <br />
          <span className="italic font-light">přírodní</span>{" "}
          <span aria-hidden="true" className="titulek-obrazek oblouk-maly">
            <Obraz varianta={1} className="h-full w-full" />
          </span>{" "}
          výpravy
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-inkoust/70">
          Objev svět krásných tras. Jediná věc na zemi,
          která tě udělá svobodným — společná cesta ven.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Link
            to="/vypravy"
            className="inline-flex min-h-[52px] items-center gap-2 rounded-full border-2 border-inkoust bg-jantar px-7 py-3 text-sm font-bold text-papir shadow-denik transition-transform hover:-translate-y-0.5"
          >
            Otevřít galerii výprav
            <Sipka />
          </Link>
          <Link
            to="/zebricky"
            className="inline-flex min-h-[52px] items-center gap-2 rounded-full border-2 border-inkoust/25 bg-transparent px-7 py-3 text-sm font-semibold text-inkoust transition-colors hover:border-inkoust"
          >
            Žebříčky členů
          </Link>
        </div>
      </header>

      {/* tři oblouky */}
      <section aria-label="Ukázka z kroniky" className="mt-10 sm:mt-14">
        <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
          {[
            { v: 2, popis: "Šumavská slať" },
            { v: 0, popis: "Hřeben Brd" },
            { v: 3, popis: "Prachovské skály" },
          ].map((o, i) => (
            <figure
              key={o.popis}
              className={`oblouk-rust oblouk-rust-${i + 1} overflow-hidden border-2 border-inkoust bg-karta shadow-denik ${
                i === 1 ? "aspect-[3/4]" : "aspect-[3/4] opacity-95 sm:aspect-[3/4]"
              }`}
            >
              <Obraz
                varianta={o.v}
                nazev={o.popis}
                className="h-full w-full"
              />
              <figcaption className="sr-only">{o.popis}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-inkoust/60">
          <span>dutch gallery · english gallery · italy gallery</span>
          <span className="hidden tabular-nums sm:inline">č. 01 — č. 03</span>
        </div>
      </section>

      {/* statistický pás */}
      <div className="mt-10 overflow-hidden border-y-2 border-inkoust py-3" aria-label="Kronika v číslech">
        <div className="marquee-stop flex w-max items-center gap-8 whitespace-nowrap text-sm font-semibold">
          {[0, 1].map((kopie) => (
            <span key={kopie} aria-hidden={kopie === 1} className="flex items-center gap-8">
              <span className="tabular-nums">{celkemVyprav} záznamů v kronice</span>
              <span aria-hidden="true" className="text-jantar">✦</span>
              <span className="tabular-nums">{probehlych} proběhlé výpravy</span>
              <span aria-hidden="true" className="text-jantar">✦</span>
              <span className="tabular-nums">{mistCelkem} míst v oddíle</span>
              <span aria-hidden="true" className="text-jantar">✦</span>
              <span className="font-galerie italic">otevřené galerie</span>
              <span aria-hidden="true" className="text-jantar">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* nejbližší výprava jako exponát */}
      <div className="grid grid-cols-1 gap-5 pt-8 lg:grid-cols-5">
        <section
          aria-labelledby="nejblizsi-vyprava"
          className="rounded-3xl border-2 border-inkoust bg-karta p-5 shadow-denik sm:p-7 lg:col-span-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-inkoust/55">
              Nejbližší výprava
            </p>
            <span className="font-galerie text-lg italic text-inkoust/50">č. 01</span>
          </div>
          {nejblizsi === null ? (
            <p role="status" className="mt-3 text-sm text-inkoust/70">
              Zatím není naplánovaná žádná výprava. Vedoucí sem brzy připíše
              první záznam.
            </p>
          ) : (
            <div className="mt-3 grid gap-5 sm:grid-cols-2 sm:items-center">
              <div className="oblouk overflow-hidden border-2 border-inkoust">
                <Obraz
                  varianta={variantaObrazu(nejblizsi.id)}
                  nazev={nejblizsi.nazev}
                  className="aspect-[3/4] w-full"
                />
              </div>
              <div>
                <h2
                  id="nejblizsi-vyprava"
                  className="font-galerie text-3xl leading-tight"
                >
                  {nejblizsi.nazev}
                </h2>
                <dl className="mt-4 space-y-1.5 border-t muzejni-linka pt-4 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-inkoust/55">Datum</dt>
                    <dd className="font-semibold">
                      <time dateTime={nejblizsi.datum}>
                        {formatCelyDatum(nejblizsi.datum)}
                      </time>
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-inkoust/55">Sraz</dt>
                    <dd>{nejblizsi.sraz}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-inkoust/55">Místa</dt>
                    <dd className="tabular-nums">
                      {nejblizsi.kapacita.prihlaseno} / {nejblizsi.kapacita.celkem} přihlášeno
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-inkoust/75">
                  {nejblizsi.popis}
                </p>
                <Link
                  to="/vypravy"
                  className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-inkoust px-6 py-2.5 text-sm font-bold text-papir transition-transform hover:-translate-y-0.5"
                >
                  Zobrazit výpravy
                  <Sipka />
                </Link>
              </div>
            </div>
          )}
        </section>

        <nav
          aria-label="Rychlé odkazy"
          className="flex flex-col gap-3 rounded-3xl border-2 border-inkoust bg-papir p-5 shadow-denik lg:col-span-2"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-inkoust/55">
            Sály galerie
          </p>
          {[
            { to: "/vypravy", cislo: "01", nazev: "Výpravy", popis: "Plánované i proběhlé akce" },
            { to: "/chat", cislo: "02", nazev: "Nástěnka", popis: "Domluva k výpravám" },
            { to: "/zebricky", cislo: "03", nazev: "Žebříčky", popis: "Nejaktivnější členové" },
          ].map((odkaz) => (
            <Link
              key={odkaz.to}
              to={odkaz.to}
              className="group flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border border-inkoust/20 bg-karta px-4 py-3 transition-colors hover:border-inkoust"
            >
              <span className="flex items-baseline gap-3">
                <span className="font-galerie text-lg italic text-inkoust/45 tabular-nums">
                  {odkaz.cislo}
                </span>
                <span>
                  <span className="block text-sm font-bold">{odkaz.nazev}</span>
                  <span className="mt-0.5 block text-xs text-inkoust/60">
                    {odkaz.popis}
                  </span>
                </span>
              </span>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-inkoust/25 transition-colors group-hover:border-inkoust group-hover:bg-jantar group-hover:text-papir"
              >
                <Sipka />
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {odhlasen && (
        <section
          aria-labelledby="prihlaseni-vyzva"
          className="mt-5 overflow-hidden rounded-3xl border-2 border-inkoust bg-inkoust p-6 text-papir shadow-denik sm:p-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-papir/60">
                Vstupenka do galerie
              </p>
              <h2 id="prihlaseni-vyzva" className="font-galerie mt-2 text-3xl leading-tight">
                Přidej se <span className="italic font-light">k výpravám</span>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-papir/75">
                Bez přihlášení vidíš jen tuhle kroniku a žebříčky. Přihlas se,
                nebo se zaregistruj s kódem od vedoucí.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <Link
                to="/login"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-jantar px-7 py-2.5 text-sm font-bold text-papir transition-transform hover:-translate-y-0.5"
              >
                Přihlásit se
                <Sipka />
              </Link>
              <Link
                to="/register"
                className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-papir/40 px-7 py-2.5 text-sm font-semibold text-papir transition-colors hover:border-papir"
              >
                Registrace s kódem
              </Link>
            </div>
          </div>
        </section>
      )}

      {isAdmin && (
        <section
          aria-labelledby="spravcovsky-nadpis"
          className="mt-5 flex flex-col gap-3 rounded-3xl border-2 border-dashed border-inkoust/40 bg-karta px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="spravcovsky-nadpis" className="font-galerie text-xl italic">
              Kurátor galerie
            </h2>
            <p className="mt-0.5 text-sm text-inkoust/70">
              Jsi vedoucí — můžeš otevřít správu členů.
            </p>
          </div>
          <Link
            to="/admin/clenove"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-inkoust bg-papir px-5 py-2 text-sm font-bold transition-colors hover:bg-linka"
          >
            Otevřít Členy
            <Sipka />
          </Link>
        </section>
      )}
    </main>
  );
}
