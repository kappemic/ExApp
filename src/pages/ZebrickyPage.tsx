import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function ZebrickyPage(): JSX.Element {
  const { user, isLoading } = useAuth();
  const odhlasen = !isLoading && user === null;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">ExApp · podzim 2026</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Žebříčky
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Přehled nejaktivnějších členů podle účasti a kilometrů. Žebříček se
          doplní ve Fázi 4 po napojení Stravy.
        </p>
      </header>

      <div className="pt-6">
        <div
          role="status"
          className="flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-white/60 px-6 py-14 text-center shadow-denik"
        >
          <div
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-inkoust bg-papir shadow-razitko"
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
          <h2 className="mt-5 text-lg font-bold tracking-tight">
            Zatím tu není co hodnotit
          </h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
            Jakmile uzavřeme první výpravy, objeví se tu pořadí
            nejaktivnějších členů.
          </p>
          <p
            aria-hidden="true"
            className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
          >
            exapp · žebříčky se chystají
          </p>
        </div>
        {odhlasen && (
          <section
            aria-labelledby="zebricky-prihlaseni"
            className="mt-5 rounded-lg border-2 border-inkoust bg-white/60 p-5 text-center shadow-denik"
          >
            <h2 id="zebricky-prihlaseni" className="text-base font-bold tracking-tight">
              Chceš být v žebříčku?
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
              Přihlas se, nebo se zaregistruj s kódem od vedoucí — pak se ti
              započítá účast na výpravách.
            </p>
            <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
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
      </div>
    </main>
  );
}
