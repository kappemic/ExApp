import type { JSX } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Logged-out landing only. Signed-in members never see this page —
 * they land on /vypravy.
 */
export default function DomuPage(): JSX.Element {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <p
          aria-busy="true"
          className="rounded-lg border-2 border-inkoust bg-white/60 p-6 text-center shadow-denik"
        >
          Načítám…
        </p>
      </main>
    );
  }

  if (user !== null) {
    return <Navigate to="/vypravy" replace />;
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
      <p className="text-sm font-medium text-mech">ExApp</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Kronika výprav klubu
      </h1>
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
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-smrk px-4 py-2 text-sm font-bold text-papir transition-colors hover:bg-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Přihlásit se
        </Link>
        <Link
          to="/register"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-papir px-4 py-2 text-sm font-bold transition-colors hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Registrace s kódem
        </Link>
      </div>
    </main>
  );
}
