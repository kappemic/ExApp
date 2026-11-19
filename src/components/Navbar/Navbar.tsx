import { useEffect, useRef, useState, type JSX, type RefObject } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import LogoKlubu from "../LogoKlubu";
import Ikona from "../Ikona";
import AvatarKruh from "../AvatarKruh";
import NeprectenaTecka from "../chat/NeprectenaTecka";
import NavigacniRozbalovak from "./NavigacniRozbalovak";
import { popisekNeprectenych } from "../../hooks/useUnreadExpeditions";
import { useKonverzacePrehled } from "../../hooks/useKonverzacePrehled";
import { useAuth } from "../../hooks/useAuth";
import { nactiNavrhy } from "../../lib/zpevnik-api";
import { inicialyProAvatar } from "../../lib/storage/avatar";

type IkonaProps = {
  className?: string;
};

/* Lucide ikony z návrhu (App Header a Spodní lišta v ExApp.pen). */
const IkonaVypravy = ({ className = "size-4" }: IkonaProps): JSX.Element => <Ikona nazev="compass" className={className} />;
const IkonaFotky = ({ className = "size-4" }: IkonaProps): JSX.Element => <Ikona nazev="images" className={className} />;
const IkonaZpevnik = ({ className = "size-4" }: IkonaProps): JSX.Element => <Ikona nazev="music" className={className} />;
const IkonaChat = ({ className = "size-4" }: IkonaProps): JSX.Element => <Ikona nazev="message-circle" className={className} />;
const IkonaZebricky = ({ className = "size-4" }: IkonaProps): JSX.Element => <Ikona nazev="trophy" className={className} />;
const IkonaVice = ({ className = "size-4" }: IkonaProps): JSX.Element => <Ikona nazev="ellipsis" className={className} />;

type PolozkaNavigace = {
  to: string;
  popisek: string;
  end?: boolean;
  Ikona: (props: IkonaProps) => JSX.Element;
};

const DESKTOP_POLOZKY: PolozkaNavigace[] = [
  { to: "/vypravy", popisek: "Výpravy", Ikona: IkonaVypravy },
  { to: "/fotky", popisek: "Fotky", Ikona: IkonaFotky },
  { to: "/zebricky", popisek: "Žebříčky", Ikona: IkonaZebricky },
  { to: "/zpevnik", popisek: "Zpěvník", Ikona: IkonaZpevnik },
  { to: "/chat", popisek: "Chat", Ikona: IkonaChat },
];

const SIRKA_MENU_VICE = 268;
const SIRKA_MENU_PROFIL = 268;

function MenuRadek({
  popisek,
  onClick,
  badge,
  zvyrazneno = false,
}: {
  popisek: string;
  onClick: () => void;
  badge?: number | null;
  zvyrazneno?: boolean;
}): JSX.Element {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={`nahled-press flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none [touch-action:manipulation] ${
          zvyrazneno ? "bg-mlha font-semibold text-smrk" : "text-inkoust hover:bg-mlha/60"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{popisek}</span>
        {badge !== undefined && badge !== null && badge > 0 ? (
          <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-smrk px-1.5 text-[11px] font-semibold tabular-nums text-papir">
            {badge}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function MenuOddelovac({ popisek }: { popisek: string }): JSX.Element {
  return (
    <li role="separator" className="px-3 pb-1 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-mech">{popisek}</span>
    </li>
  );
}

function MenuVice({ onZavrit }: { onZavrit: () => void }): JSX.Element {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperadmin } = useAuth();
  const [pocetNavrhu, setPocetNavrhu] = useState<number | null>(null);
  const jeAdmin = isAdmin || isSuperadmin;
  const smiFrontu =
    user?.isAdmin === true || user?.isSuperadmin === true || user?.funkce === "vedeni";

  useEffect(() => {
    if (!jeAdmin && !smiFrontu) return;
    let zivy = true;
    void nactiNavrhy().then((vysledek) => {
      if (!zivy || !vysledek.ok) return;
      setPocetNavrhu(vysledek.navrhy.length);
    });
    return () => {
      zivy = false;
    };
  }, [jeAdmin, smiFrontu]);

  function jdi(cesta: string): void {
    onZavrit();
    void navigate(cesta);
  }

  return (
    <ul className="flex flex-col gap-0.5">
      <MenuRadek popisek="Členové" onClick={() => jdi("/cleny")} />
      <MenuRadek popisek="Statistiky" onClick={() => jdi("/profil?tab=statistiky")} />
      {jeAdmin ? (
        <>
          <MenuOddelovac popisek="Admin" />
          <MenuRadek popisek="Pozvánkové kódy" onClick={() => jdi("/admin/kody")} />
          <MenuRadek
            popisek="Návrhy písní"
            onClick={() => jdi("/zpevnik/fronta")}
            badge={pocetNavrhu}
          />
        </>
      ) : smiFrontu ? (
        <MenuRadek
          popisek="Návrhy písní"
          onClick={() => jdi("/zpevnik/fronta")}
          badge={pocetNavrhu}
        />
      ) : null}
      <MenuRadek popisek="Nastavení" onClick={() => jdi("/nastaveni")} />
    </ul>
  );
}

function MenuProfil({ onZavrit }: { onZavrit: () => void }): JSX.Element {
  const navigate = useNavigate();
  const { user, odhlasit } = useAuth();
  if (user === null) return <span />;

  const celeJmeno = `${user.jmeno} ${user.prijmeni ?? ""}`.trim();

  function jdi(cesta: string): void {
    onZavrit();
    void navigate(cesta);
  }

  return (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-3 px-2 pb-2 pt-1">
      <AvatarKruh jmeno={celeJmeno} url={user.avatarUrl} />
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-semibold text-inkoust">{celeJmeno}</p>
        <p className="truncate text-[12px] font-medium text-mech">{user.email}</p>
      </div>
    </div>
    <ul className="flex flex-col gap-0.5 border-t border-linka pt-1">
      <MenuRadek popisek="Můj profil" onClick={() => jdi("/profil")} />
      <MenuRadek popisek="Statistiky" onClick={() => jdi("/profil?tab=statistiky")} />
      <MenuRadek popisek="Oznámení" onClick={() => jdi("/nastaveni")} />
      <MenuRadek
        popisek="Odhlásit se"
        onClick={() => {
          onZavrit();
          void odhlasit();
        }}
      />
    </ul>
  </div>
  );
}

function jeViceAktivni(cesta: string, hledani: string): boolean {
  if (cesta === "/cleny" || cesta === "/nastaveni") return true;
  if (cesta === "/admin/kody" || cesta === "/zpevnik/fronta") return true;
  if (cesta === "/profil" && hledani.includes("tab=statistiky")) return true;
  return false;
}

/** Phone bar: five pen targets. Members and codes stay on the desktop bar until /vice exists. */
const MOBIL_POLOZKY: PolozkaNavigace[] = [
  { to: "/vypravy", popisek: "Výpravy", Ikona: IkonaVypravy },
  { to: "/fotky", popisek: "Fotky", Ikona: IkonaFotky },
  { to: "/zpevnik", popisek: "Zpěvník", Ikona: IkonaZpevnik },
  { to: "/chat", popisek: "Chat", Ikona: IkonaChat },
  { to: "/vice", popisek: "Více", Ikona: IkonaVice },
];

/**
 * Badge nepřečtených zpráv v navigaci.
 * Jediný zdroj je přehled konverzací (polling 30 s + event po přečtení),
 * takže kolečko u Chatu svítí i bez otevření /chat — skupiny, výpravy i soukromé.
 */

/** Dynamický label: „Chat“ vs „Chat, 3 nepřečtené zprávy“. */
function popisekChat(pocet: number): string {
  if (pocet <= 0) return "Chat";
  return `Chat, ${popisekNeprectenych(pocet)}`;
}

/**
 * Červená tečka u Chatu — reuse `NeprectenaTecka` (8px `nadpis`,
 * red-800 na papíru + bílý kroužek `ring-papir` + tmavý obrys,
 * takže není jen barvou; `pointer-events-none` drží 44px tap-target).
 * Pozice: absolutně vpravo nahoře u ikony, mobil i desktop stejně.
 */
function ChatTecka({ popisek }: { popisek: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-1.5 -top-1.5 flex shrink-0"
    >
      <NeprectenaTecka viditelna velikost="nadpis" nazevVypravy={popisek} />
    </span>
  );
}

function tridyDesktopOdkazu(aktivni: boolean): string {
  const zaklad =
    "nahled-press flex min-h-11 items-center gap-[7px] rounded-[10px] px-[13px] py-[9px] [&:last-child]:px-[11px] text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none [touch-action:manipulation]";
  if (aktivni) {
    return `${zaklad} bg-mlha font-semibold text-smrk`;
  }
  return `${zaklad} font-medium text-mech [&_svg]:text-ink-3 hover:bg-mlha/60 hover:text-inkoust`;
}

function tridyMobilOdkazu(aktivni: boolean): string {
  const zaklad =
    "nahled-press flex min-h-11 min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-3xl px-1 text-[10px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none [touch-action:manipulation]";
  if (aktivni) {
    return `${zaklad} bg-mlha font-semibold text-smrk`;
  }
  return `${zaklad} font-medium text-mech`;
}

export function TopBar({
  pocetNeprectenych = 0,
  viceOtevreno,
  onVicePrepnout,
  viceKotvaRef,
}: {
  pocetNeprectenych?: number;
  viceOtevreno: boolean;
  onVicePrepnout: () => void;
  viceKotvaRef: RefObject<HTMLButtonElement | null>;
}): JSX.Element {
  const polozky: PolozkaNavigace[] = DESKTOP_POLOZKY;
  const maNeprectene: boolean = pocetNeprectenych > 0;
  const { pathname, search } = useLocation();
  const viceAktivni = jeViceAktivni(pathname, search);

  return (
    <nav aria-label="Hlavní navigace" className="hidden items-center gap-1 min-[90rem]:flex min-[90rem]:justify-self-center">
      {polozky.map(({ to, popisek, end, Ikona }) => {
        const jeChat: boolean = to === "/chat";
        const label: string = jeChat ? popisekChat(pocetNeprectenych) : popisek;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={jeChat ? label : undefined}
            className={({ isActive }) => tridyDesktopOdkazu(isActive)}
          >
            {() => (
              <span className="flex items-center gap-[7px]">
                <span className="relative inline-flex shrink-0 [touch-action:manipulation]">
                  <Ikona />
                  {jeChat && maNeprectene ? <ChatTecka popisek={popisek} /> : null}
                </span>
                <span>{popisek}</span>
              </span>
            )}
          </NavLink>
        );
      })}
      <button
        ref={viceKotvaRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={viceOtevreno}
        aria-controls="menu-vice"
        onClick={onVicePrepnout}
        className={tridyDesktopOdkazu(viceAktivni)}
      >
        <span className="flex items-center gap-[7px]">
          <IkonaVice />
          <span>Více</span>
        </span>
      </button>
    </nav>
  );
}

export function MobileBar({ pocetNeprectenych = 0 }: { pocetNeprectenych?: number } = {}): JSX.Element {
  const polozky: PolozkaNavigace[] = MOBIL_POLOZKY;
  const maNeprectene: boolean = pocetNeprectenych > 0;

  return (
    <nav
      aria-label="Spodní navigace"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-3 pt-2 min-[90rem]:hidden"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
    >
      <ul className="pointer-events-auto mx-auto flex h-14 items-stretch gap-0.5 rounded-[28px] border border-white bg-povrch/70 p-1 shadow-[0_8px_24px_rgba(28,38,21,0.07)] backdrop-blur-md">
        {polozky.map(({ to, popisek, end, Ikona }) => {
          const jeChat: boolean = to === "/chat";
          return (
            <li key={to} className="min-w-0 flex-1">
              <NavLink
                to={to}
                end={end}
                aria-label={jeChat ? popisekChat(pocetNeprectenych) : undefined}
                className={({ isActive }) => tridyMobilOdkazu(isActive)}
              >
                {() => (
                  <>
                    <span className="relative inline-flex shrink-0">
                      <Ikona className="h-[22px] w-[22px]" />
                      {jeChat && maNeprectene && <ChatTecka popisek={popisek} />}
                    </span>
                    <span>{popisek}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Stav přihlášení v hlavičce — obdoba GET /me. Renderuje se jen pro přihlášené (Navbar pro odhlášené vrací null). */
export function AppHeader({
  pocetNeprectenych = 0,
}: {
  pocetNeprectenych?: number;
} = {}): JSX.Element {
  const { user, isLoading } = useAuth();
  const jmeno = user?.jmeno.trim() ?? "";
  const [viceOtevreno, setViceOtevreno] = useState(false);
  const [profilOtevreno, setProfilOtevreno] = useState(false);
  const viceKotvaRef = useRef<HTMLButtonElement>(null);
  const profilKotvaRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    setViceOtevreno(false);
    setProfilOtevreno(false);
  }, [pathname]);

  function zavriVse(): void {
    setViceOtevreno(false);
    setProfilOtevreno(false);
  }

  return (
    <>
      <header className="sticky top-0 z-40 hidden h-[76px] items-center border-b border-linka bg-povrch px-10 min-[90rem]:grid min-[90rem]:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Link
          to="/vypravy"
          className="nahled-press flex min-h-[44px] min-w-[44px] flex-col justify-center rounded-md px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          aria-label="ExApp – výpravy"
        >
          <span className="flex items-center gap-[11px]">
            <LogoKlubu velikost="sm" />
            <span className="flex flex-col">
              <span className="font-display text-[17px] font-bold leading-tight tracking-[-0.3px] text-inkoust">ExApp</span>
              <span className="text-[11px] font-medium tracking-[0.3px] text-ink-3">Školní expediční klub</span>
            </span>
          </span>
        </Link>
        <TopBar
          pocetNeprectenych={pocetNeprectenych}
          viceOtevreno={viceOtevreno}
          onVicePrepnout={() => {
            setProfilOtevreno(false);
            setViceOtevreno((stav) => !stav);
          }}
          viceKotvaRef={viceKotvaRef}
        />
        <div className="justify-self-end">
          {!isLoading && user !== null ? (
            <button
              ref={profilKotvaRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={profilOtevreno}
              aria-controls="menu-profil"
              aria-label="Účet a profil"
              onClick={() => {
                setViceOtevreno(false);
                setProfilOtevreno((stav) => !stav);
              }}
              className="nahled-press flex min-h-[44px] min-w-[44px] items-center py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
            >
              <span className="flex items-center gap-2 rounded-full bg-povrch-2 py-1 pl-1 pr-2">
                {user.avatarUrl !== null && user.avatarUrl !== undefined && user.avatarUrl.length > 0 ? (
                  <span className="flex size-7 items-center justify-center overflow-hidden rounded-full [&>*]:scale-[0.78]">
                    <AvatarKruh jmeno={`${user.jmeno} ${user.prijmeni ?? ""}`.trim()} url={user.avatarUrl} />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full bg-smrk text-[11px] font-semibold tracking-[0.2px] text-papir"
                  >
                    {inicialyProAvatar(user.jmeno, user.prijmeni)}
                  </span>
                )}
                <span className="text-[13px] font-medium text-inkoust">{jmeno}</span>
                <Ikona nazev="chevron-down" className="size-3.5 text-ink-3" />
              </span>
            </button>
          ) : null}
        </div>
      </header>
      <NavigacniRozbalovak
        otevreno={viceOtevreno}
        onZavrit={() => setViceOtevreno(false)}
        kotvaRef={viceKotvaRef}
        sirka={SIRKA_MENU_VICE}
        popisek="Menu Více"
      >
        <div id="menu-vice">
          <MenuVice onZavrit={zavriVse} />
        </div>
      </NavigacniRozbalovak>
      <NavigacniRozbalovak
        otevreno={profilOtevreno}
        onZavrit={() => setProfilOtevreno(false)}
        kotvaRef={profilKotvaRef}
        sirka={SIRKA_MENU_PROFIL}
        zarovnani="end"
        popisek="Menu profil"
      >
        <div id="menu-profil">
          <MenuProfil onZavrit={zavriVse} />
        </div>
      </NavigacniRozbalovak>
    </>
  );
}

export default function Navbar(): JSX.Element | null {
  const { user, isLoading } = useAuth();
  const { pocetNeprectenych } = useKonverzacePrehled();
  if (isLoading || user === null) {
    return null;
  }
  return (
    <>
      <AppHeader pocetNeprectenych={pocetNeprectenych} />
      <MobileBar pocetNeprectenych={pocetNeprectenych} />
    </>
  );
}
