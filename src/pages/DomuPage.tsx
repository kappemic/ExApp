import type { JSX } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthRozlozeni from "../components/Auth/AuthRozlozeni";
import { AuthNadpis } from "../components/Auth/authVstupy";
import Ikona from "../components/Ikona";
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
    <AuthRozlozeni>
      <AuthNadpis>Kronika výprav klubu</AuthNadpis>
      <div className="flex flex-col gap-3 text-[15px] leading-[23px] text-mech">
        <p>
          Plánujeme výpravy, hlídáme srazy a schováváme fotky na jedno místo. Kilometry se počítají do žebříčku.
          Před odjezdem se domlouváme v chatu.
        </p>
        <p>Účet založíš kódem od vedoucí. Kód platí deset minut.</p>
      </div>
      <div className="mt-auto flex flex-col gap-2.5 lg:mt-2">
        <Link
          to="/login"
          className="nahled-press inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-smrk px-5 text-sm font-semibold text-papir hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Přihlásit se
          <Ikona nazev="arrow-right" className="size-4" />
        </Link>
        <Link
          to="/register"
          className="nahled-press inline-flex h-12 items-center justify-center rounded-xl border border-linka bg-povrch px-5 text-sm font-semibold text-inkoust hover:bg-povrch-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Registrace s kódem
        </Link>
      </div>
    </AuthRozlozeni>
  );
}
