import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ZebrickyPage(): JSX.Element {
  const { user, isLoading } = useAuth();
  const odhlasen = !isLoading && user === null;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-inkoust/60">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="tabular-nums">02</span>
          <span>Síň slávy</span>
        </span>
        <span>ExApp · podzim 2026</span>
      </div>

      <header className="pt-4 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-inkoust/55">
          Exkluzivní přehled oddílu
        </p>
        <h1 className="font-galerie mx-auto mt-2 max-w-3xl text-[clamp(2.4rem,7vw,4.6rem)] leading-[0.95]">
          Žebříčky <span className="italic font-light">členů</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-inkoust/70">
          Přehled nejaktivnějších členů podle účasti a kilometrů. Žebříček se
          doplní ve Fázi 4 po napojení Stravy.
        </p>
      </header>

      <div className="pt-8">
        <div
          role="status"
          className="flex flex-col items-center rounded-3xl border-2 border-dashed border-inkoust/30 bg-karta px-6 py-14 text-center shadow-denik"
        >
          <div
            aria-hidden="true"
            className="oblouk-maly flex h-20 w-16 items-center justify-center border-2 border-inkoust bg-papir shadow-razitko"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7 text-smrk"
            >
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            </svg>
          </div>
          <h2 className="font-galerie mt-5 text-3xl italic">
            Zatím tu není co hodnotit
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-inkoust/70">
            Jakmile uzavřeme první výpravy, objeví se tu pořadí
            nejaktivnějších členů.
          </p>
          <p
            aria-hidden="true"
            className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/60"
          >
            exapp · žebříčky se chystají
          </p>
        </div>
        {odhlasen && (
          <section
            aria-labelledby="zebricky-prihlaseni"
            className="mt-5 rounded-3xl border-2 border-inkoust bg-inkoust p-6 text-center text-papir shadow-denik"
          >
            <h2 id="zebricky-prihlaseni" className="font-galerie text-2xl italic">
              Chceš být v žebříčku?
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-papir/75">
              Přihlas se, nebo se zaregistruj s kódem od vedoucí — pak se ti
              započítá účast na výpravách.
            </p>
            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              <Link
                to="/login"
                className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-jantar px-7 py-2 text-sm font-bold text-papir"
              >
                Přihlásit se
              </Link>
              <Link
                to="/register"
                className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-papir/40 px-7 py-2 text-sm font-semibold text-papir transition-colors hover:border-papir"
              >
                Registrace s kódem
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
