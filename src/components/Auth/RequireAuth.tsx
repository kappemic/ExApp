import type { JSX, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import BezUctuOffline from "./BezUctuOffline";
import Ikona from "../Ikona";
import PrazdnyStav from "../PrazdnyStav";
import StrankaKostra from "../StrankaKostra";
import { useAuth } from "../../hooks/useAuth";

interface RequireAuthProps {
  children: ReactNode;
  /** Jen pro vedoucí. `isAdmin` zahrnuje i hlavního admina (SUPERADMIN). */
  adminOnly?: boolean;
  /** Jen pro toho, kdo smí spravovat výpravy (vedoucí a aktivní členové). */
  jenSpravceVyprav?: boolean;
  /**
   * V bootstrap režimu (ještě neexistuje žádný ADMIN) propustí i bez přihlášení.
   * Používat jen pro /admin/kody — prvotní nastavení systému.
   */
  povolitBootstrap?: boolean;
}

/**
 * RequireAuth — jediný strážce privátních rout.
 * - bootstrap režim + povolitBootstrap → propustí (prvotní nastavení, česky vysvětleno na stránce)
 * - server neodpověděl a účet v telefonu není → vysvětlení místo přihlášení
 * - bez session → redirect na /login?from=<původní cesta>
 * - bez potřebného práva (adminOnly, jenSpravceVyprav) → cedule „Nemáš přístup"
 */
export default function RequireAuth({
  children,
  adminOnly = false,
  jenSpravceVyprav = false,
  povolitBootstrap = false,
}: RequireAuthProps): JSX.Element {
  const { user, isLoading, isAdmin, isSuperadmin, muzeSpravovatVypravy, jeBootstrap, bezOvereni } = useAuth();
  const location = useLocation();

  if (isLoading) return <StrankaKostra />;

  // Bootstrap: dokud není žádný admin, je /admin/kody volně dostupná,
  // aby šel vygenerovat první pozvánkový kód.
  if (jeBootstrap && adminOnly && povolitBootstrap) {
    return <>{children}</>;
  }

  if (user === null && bezOvereni) return <BezUctuOffline />;

  if (user === null) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }

  const admin = isAdmin || isSuperadmin;
  if (adminOnly && !admin) return <NemasPristup text="Tahle stránka je jen pro vedoucí." />;
  if (jenSpravceVyprav && !admin && !muzeSpravovatVypravy) {
    return <NemasPristup text="Výpravy zakládají a uzavírají vedoucí a aktivní členové." />;
  }

  return <>{children}</>;
}

function NemasPristup({ text }: { text: string }): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-[46rem] px-5 pb-8 pt-4 sm:px-6 sm:pt-8 min-[90rem]:pt-11">
      <PrazdnyStav
        ikona={<Ikona nazev="lock" className="size-[18px]" />}
        nadpis="Nemáš přístup"
        text={text}
        akce={{ popisek: "Zpět na výpravy", odkaz: "/vypravy" }}
      />
    </main>
  );
}
