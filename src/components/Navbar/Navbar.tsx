import type { JSX, ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

type IkonaProps = {
  className?: string;
};

function ZakladIkony({
  className = "",
  children,
}: IkonaProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`h-6 w-6 shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

function IkonaDomu(props: IkonaProps): JSX.Element {
  return (
    <ZakladIkony {...props}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </ZakladIkony>
  );
}

function IkonaVypravy(props: IkonaProps): JSX.Element {
  return (
    <ZakladIkony {...props}>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </ZakladIkony>
  );
}

function IkonaZebricky(props: IkonaProps): JSX.Element {
  return (
    <ZakladIkony {...props}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5a1 1 0 0 0-1 1.2C3.8 9.5 5.4 11 7.5 11" />
      <path d="M17 6h2.5a1 1 0 0 1 1 1.2c-.3 2.3-1.9 3.8-4 3.8" />
    </ZakladIkony>
  );
}

function IkonaChat(props: IkonaProps): JSX.Element {
  return (
    <ZakladIkony {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z" />
      <path d="M8.5 9.5h7" />
      <path d="M8.5 12.5h4" />
    </ZakladIkony>
  );
}

function IkonaProfil(props: IkonaProps): JSX.Element {
  return (
    <ZakladIkony {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </ZakladIkony>
  );
}

function IkonaClenove(props: IkonaProps): JSX.Element {
  return (
    <ZakladIkony {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0" />
      <path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.3" />
      <path d="M17.2 14.4a5.8 5.8 0 0 1 3.6 5.1" />
    </ZakladIkony>
  );
}

function IkonaKody(props: IkonaProps): JSX.Element {
  return (
    <ZakladIkony {...props}>
      <path d="M4 8.5V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5Z" />
      <path d="M13.5 7v10" strokeDasharray="2 2" />
    </ZakladIkony>
  );
}

type PolozkaNavigace = {
  to: string;
  popisek: string;
  end?: boolean;
  Ikona: (props: IkonaProps) => JSX.Element;
};

const DESKTOP_POLOZKY: PolozkaNavigace[] = [
  { to: "/", popisek: "Domů", end: true, Ikona: IkonaDomu },
  { to: "/vypravy", popisek: "Výpravy", Ikona: IkonaVypravy },
  { to: "/zebricky", popisek: "Žebříčky", Ikona: IkonaZebricky },
  { to: "/chat", popisek: "Chat", Ikona: IkonaChat },
  { to: "/profil", popisek: "Profil", Ikona: IkonaProfil },
];

const MOBIL_POLOZKY: PolozkaNavigace[] = [
  { to: "/", popisek: "Domů", end: true, Ikona: IkonaDomu },
  { to: "/vypravy", popisek: "Výpravy", Ikona: IkonaVypravy },
  { to: "/zebricky", popisek: "Žebříčky", Ikona: IkonaZebricky },
  { to: "/profil", popisek: "Profil", Ikona: IkonaProfil },
];

const ADMIN_POLOZKA: PolozkaNavigace = {
  to: "/admin/clenove",
  popisek: "Členové",
  Ikona: IkonaClenove,
};

const KODY_POLOZKA: PolozkaNavigace = {
  to: "/admin/kody",
  popisek: "Kódy",
  Ikona: IkonaKody,
};

/** Počet nepřečtených zpráv – pouze statické UI, žádný fetch. */
const NEPRECTENYCH_ZPRAV = 3;

/**
 * Jediný zdroj pro viditelnost admin položek v navigaci.
 * Jen role ADMIN ze session (useAuth).
 */
function useVidetAdmin(): boolean {
  const { isAdmin } = useAuth();
  return isAdmin;
}

/** Bez session vidí odhlášený nic — varianta A: Navbar se vůbec nerenderuje (viz default Navbar). */
/** Filtr podle session odstraněn: odhlášený Navbar nikdy neuvidí, přihlášený vidí vše. */

function tridyDesktopOdkazu(aktivni: boolean): string {
  const zaklad =
    "flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition-colors motion-reduce:transition-none";
  if (aktivni) {
    return `${zaklad} border-inkoust bg-inkoust font-semibold text-papir`;
  }
  return `${zaklad} border-transparent font-medium text-inkoust/70 hover:border-inkoust/30 hover:text-inkoust`;
}

function tridyMobilOdkazu(aktivni: boolean): string {
  const zaklad =
    "flex min-h-[52px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] leading-none transition-colors motion-reduce:transition-none";
  if (aktivni) {
    return `${zaklad} font-bold text-inkoust`;
  }
  return `${zaklad} font-medium text-inkoust/55 hover:text-inkoust`;
}

function Tecka({ aktivni }: { aktivni: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 rounded-full transition-colors ${
        aktivni ? "bg-jantar" : "bg-inkoust/20"
      }`}
    />
  );
}

export function TopBar(): JSX.Element {
  const videtAdmin = useVidetAdmin();
  const polozky: PolozkaNavigace[] = [
    ...DESKTOP_POLOZKY,
    ...(videtAdmin ? [KODY_POLOZKA, ADMIN_POLOZKA] : []),
  ];

  return (
    <nav aria-label="Hlavní navigace" className="hidden items-center gap-1 lg:flex">
      {polozky.map(({ to, popisek, end }, index) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => tridyDesktopOdkazu(isActive)}
        >
          <span aria-hidden="true" className="text-[11px] tabular-nums opacity-50">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{popisek}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function MobileBar(): JSX.Element {
  const videtAdmin = useVidetAdmin();
  const polozky: PolozkaNavigace[] = [
    ...MOBIL_POLOZKY,
    ...(videtAdmin ? [KODY_POLOZKA, ADMIN_POLOZKA] : []),
  ];

  return (
    <nav
      aria-label="Spodní navigace"
      className="fixed inset-x-3 bottom-3 z-40 rounded-3xl border-2 border-inkoust bg-karta/95 shadow-denik backdrop-blur lg:hidden"
    >
      <ul
        style={{ gridTemplateColumns: `repeat(${polozky.length}, minmax(0, 1fr))` }}
        className="mx-auto grid w-full max-w-6xl gap-1 px-2 pb-[env(safe-area-inset-bottom)] pt-2"
      >
        {polozky.map(({ to, popisek, end, Ikona }) => (
          <li key={to} className="min-w-0">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => tridyMobilOdkazu(isActive)}
            >
              {({ isActive }) => (
                <>
                  <Ikona className={isActive ? "h-5 w-5" : "h-5 w-5"} />
                  <span>{popisek}</span>
                  <Tecka aktivni={isActive} />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Stav přihlášení v hlavičce — obdoba GET /me. Renderuje se jen pro přihlášené (Navbar pro odhlášené vrací null). */
function AuthCluster(): JSX.Element | null {
  const { user, isLoading, odhlasit } = useAuth();

  if (isLoading) {
    return (
      <span aria-hidden="true" className="hidden h-8 w-20 animate-pulse rounded-full bg-linka sm:block" />
    );
  }

  if (user === null) {
    // Nedosažitelné: Navbar se pro odhlášené vůbec nerenderuje (varianta A).
    return null;
  }

  // Jediná interaktivní cesta na /profil vede přes položku „Profil" v menu
  // (TopBar / MobileBar s IkonaProfil). Hlavička ukazuje jen Odhlásit — žádné jméno/čip.
  return (
    <button
      type="button"
      onClick={odhlasit}
      title="Odhlásit se"
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-inkoust/25 px-4 py-2 text-xs font-semibold text-inkoust/75 transition-colors hover:border-inkoust hover:text-inkoust motion-reduce:transition-none"
    >
      Odhlásit
    </button>
  );
}

export function AppHeader(): JSX.Element {
  const { user } = useAuth();
  const prihlasen = user !== null;
  return (
    <header className="sticky top-0 z-40 border-b-2 border-inkoust bg-papir/95 backdrop-blur">
      {/* muzejní páska */}
      <div className="border-b muzejni-linka">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-1.5 text-[11px] font-medium tracking-wide text-inkoust/60 sm:px-6">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="tabular-nums">00</span>
            <span className="hidden sm:inline">Kronika oddílu</span>
            <span className="sm:hidden">Kronika</span>
          </span>
          <span className="tabular-nums">podzim 2026 · galerie výprav</span>
        </div>
      </div>
      <div className="mx-auto flex h-[72px] w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link
          to="/"
          className="flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-md px-1 py-1"
          aria-label="ExApp – domů"
        >
          <span
            aria-hidden="true"
            className="oblouk-maly flex h-11 w-9 items-center justify-center border-2 border-inkoust bg-smrk font-galerie text-xl italic text-papir"
          >
            E
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-galerie text-[26px] italic text-inkoust">
              ExApp
            </span>
            <span className="mt-1 text-[11px] font-medium tracking-wide text-inkoust/60">
              galerie výprav
            </span>
          </span>
        </Link>

        <TopBar />

        <div className="flex items-center gap-1">
          <AuthCluster />
          {prihlasen && (
            <NavLink
              to="/chat"
              aria-label={`Chat, ${NEPRECTENYCH_ZPRAV} nepřečtené zprávy`}
              className={({ isActive }: { isActive: boolean }) =>
                `relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border p-2.5 transition-colors lg:hidden ${
                  isActive
                    ? "border-inkoust bg-inkoust text-papir"
                    : "border-inkoust/25 text-inkoust hover:border-inkoust"
                }`
              }
            >
              <IkonaChat className="h-5 w-5" />
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-inkoust bg-jantar px-1 text-[10px] font-bold leading-none text-papir"
              >
                {NEPRECTENYCH_ZPRAV}
              </span>
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}

export default function Navbar(): JSX.Element | null {
  const { user, isLoading } = useAuth();
  // Varianta A: odhlášený nevidí vůbec nic — ani logo, ani TopBar/MobileBar.
  // Během načítání session (isLoading) taky nic nerenderujeme, ať neproblikne navigace.
  if (isLoading || user === null) {
    return null;
  }
  return (
    <>
      <AppHeader />
      <MobileBar />
    </>
  );
}
