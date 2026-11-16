import type { JSX, ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import StrankaKostra from "../StrankaKostra";
import { useAuth } from "../../hooks/useAuth";

interface RequireAuthProps {
  children: ReactNode;
  /** Jen pro vedoucí. `isAdmin` zahrnuje i hlavního admina (SUPERADMIN). */
  adminOnly?: boolean;
  /**
   * V bootstrap režimu (ještě neexistuje žádný ADMIN) propustí i bez přihlášení.
   * Používat jen pro /admin/kody — prvotní nastavení systému.
   */
  povolitBootstrap?: boolean;
}

/**
 * RequireAuth — jediný strážce privátních rout.
 * - bootstrap režim + povolitBootstrap → propustí (prvotní nastavení, česky vysvětleno na stránce)
 * - bez session → redirect na /login?from=<původní cesta>
 * - adminOnly bez admina ani hlavního admina → cedule „Nemáš přístup"
 */
export default function RequireAuth({
  children,
  adminOnly = false,
  povolitBootstrap = false,
}: RequireAuthProps): JSX.Element {
  const { user, isLoading, isAdmin, isSuperadmin, jeBootstrap } = useAuth();
  const location = useLocation();

  if (isLoading) return <StrankaKostra />;

  // Bootstrap: dokud není žádný admin, je /admin/kody volně dostupná,
  // aby šel vygenerovat první pozvánkový kód.
  if (jeBootstrap && adminOnly && povolitBootstrap) {
    return <>{children}</>;
  }

  if (user === null) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }

  if (adminOnly && !isAdmin && !isSuperadmin) {
    return (
      <main className="mx-auto w-full px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8 xl:px-12">
        <div
          role="alert"
          className="rounded-lg border-2 border-inkoust bg-white/60 p-6 text-center shadow-denik"
        >
          <h1 className="text-2xl font-extrabold tracking-tight">
            Nemáš přístup
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-inkoust/70">
            Tato stránka je jen pro vedoucí (admin).
          </p>
          <Link
            to="/vypravy"
            className="mt-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md border-2 border-okr bg-okr px-4 py-2 text-sm font-bold text-inkoust transition-colors hover:bg-okr-tmavy"
          >
            <span aria-hidden="true">←</span> Výpravy
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
