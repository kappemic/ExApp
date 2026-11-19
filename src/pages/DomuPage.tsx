import type { JSX } from "react";
import { Link, Navigate } from "react-router-dom";
import LogoKlubu from "../components/LogoKlubu";
import StrankaKostra from "../components/StrankaKostra";
import { useAuth } from "../hooks/useAuth";

/**
 * Logged-out landing only. Signed-in members never see this page —
 * they land on /vypravy.
 */
export default function DomuPage(): JSX.Element {
  const { user, isLoading } = useAuth();

  if (isLoading) return <StrankaKostra />;

  if (user !== null) {
    return <Navigate to="/vypravy" replace />;
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
      <div className="flex items-center gap-4">
        <LogoKlubu velikost="lg" />
        <div className="min-w-0">
          <p className="font-condensed text-sm font-medium text-mech">ExApp</p>
          <h1 className="font-expanded mt-0.5 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Kronika výprav klubu
          </h1>
        </div>
      </div>
      <p className="mt-3 text-base leading-relaxed text-inkoust/80">
        Plánujeme výpravy, hlídáme srazy a schováváme fotky na jedno místo.
        Kilometry se počítají do žebříčku. Před odjezdem se domlouváme v chatu.
      </p>
      <p className="mt-3 text-base leading-relaxed text-inkoust/80">
        Účet založíš kódem od vedoucí. Kód platí deset minut.
      </p>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Link
          to="/login"
          className="nahled-press inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-okr bg-okr px-4 py-2 text-sm font-bold text-inkoust transition-colors hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Přihlásit se
        </Link>
        <Link
          to="/register"
          className="nahled-press inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-linka bg-papir px-4 py-2 text-sm font-bold transition-colors hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Registrace s kódem
        </Link>
      </div>
    </main>
  );
}
