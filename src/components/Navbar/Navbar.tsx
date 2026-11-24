import { useEffect, useRef, useState, type JSX, type MouseEvent, type RefObject } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import LogoKlubu from "../LogoKlubu";
import Ikona, { type NazevIkony } from "../Ikona";
import AvatarKruh from "../AvatarKruh";
import NeprectenaTecka from "../chat/NeprectenaTecka";
import BublinaListy from "./BublinaListy";
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
const SIRKA_MENU_PROFIL = 276;

function MenuRadek({
  popisek,
  onClick,
  badge,
  zvyrazneno = false,
  ikona,
}: {
  popisek: string;
  onClick: () => void;
  badge?: number | null;
  zvyrazneno?: boolean;
  ikona?: NazevIkony;
}): JSX.Element {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={`nahled-press flex h-[34px] w-full items-center gap-[9px] rounded-lg px-[9px] text-left text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none [touch-action:manipulation] ${
          zvyrazneno ? "bg-mlha font-semibold text-smrk" : "text-mech hover:bg-povrch-2"
        }`}
      >
        {ikona !== undefined ? <Ikona nazev={ikona} className={`size-[15px] ${zvyrazneno ? "text-smrk" : "text-ink-3"}`} /> : null}
        <span className="min-w-0 flex-1 truncate">{popisek}</span>
        {badge !== undefined && badge !== null && badge > 0 ? (
          <span className="inline-flex items-center justify-center rounded-full bg-akcent-100 px-[7px] py-0.5 text-[9.5px] font-semibold text-akcent">
            {badge}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function MenuOddelovac({ popisek }: { popisek: string }): JSX.Element {
  return (
    <li role="separator" className="border-t border-linka px-[9px] pb-1 pt-2">
      <span className="text-[9.5px] font-bold uppercase tracking-[1.1px] text-ink-5">{popisek}</span>
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
      <MenuRadek ikona="users" popisek="Členové" onClick={() => jdi("/cleny")} />
      <MenuRadek ikona="chart-column" popisek="Statistiky" onClick={() => jdi("/profil?tab=statistiky&pohled=klub")} />
      {jeAdmin ? (
        <>
          <MenuOddelovac popisek="Admin" />
          <MenuRadek ikona="key-round" popisek="Pozvánkové kódy" onClick={() => jdi("/admin/kody")} />
          <MenuRadek
            ikona="music"
            popisek="Návrhy písní"
            onClick={() => jdi("/zpevnik/fronta")}
            badge={pocetNavrhu}
          />
        </>
      ) : smiFrontu ? (
        <MenuRadek
          ikona="music"
          popisek="Návrhy písní"
          onClick={() => jdi("/zpevnik/fronta")}
          badge={pocetNavrhu}
        />
      ) : null}
      <MenuRadek ikona="settings" popisek="Nastavení" onClick={() => jdi("/nastaveni")} />
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
  <div className="flex flex-col gap-0.5">
    <div className="flex items-center gap-2.5 border-b border-linka px-2 pb-2.5 pt-2">
      <AvatarKruh jmeno={celeJmeno} url={user.avatarUrl} ton="moje" velikost={34} />
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold text-inkoust">{celeJmeno}</p>
        <p className="truncate text-[10.5px] text-ink-3">{user.email}</p>
      </div>
    </div>
    <ul className="flex flex-col gap-0.5">
      <MenuRadek ikona="user" popisek="Můj profil" onClick={() => jdi("/profil")} />
      <MenuRadek ikona="chart-column" popisek="Statistiky" onClick={() => jdi("/profil?tab=statistiky")} />
      <MenuRadek ikona="bell" popisek="Oznámení" onClick={() => jdi("/nastaveni")} />
      <li role="separator" aria-hidden="true" className="h-px bg-linka" />
      <MenuRadek
        ikona="log-out"
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
  if (cesta.startsWith("/cleny") || cesta === "/nastaveni") return true;
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
 * terakota na papíru + bílý kroužek `ring-papir` + tmavý obrys,
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
    "nahled-press relative flex items-center gap-[7px] rounded-[10px] px-[13px] py-[9px] before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] [&:last-child]:px-[11px] text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none [touch-action:manipulation]";
  if (aktivni) {
    return `${zaklad} font-semibold text-smrk`;
  }
  return `${zaklad} font-medium text-mech [&_svg]:text-ink-3 hover:bg-mlha/60 hover:text-inkoust`;
}

function tridyMobilOdkazu(aktivni: boolean): string {
  const zaklad =
    "nahled-press relative flex h-full min-h-11 min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] leading-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none [touch-action:manipulation]";
  if (aktivni) {
    return `${zaklad} font-semibold text-smrk`;
  }
  return `${zaklad} font-medium text-mech`;
}

/** Záložka, pod kterou adresa patří, nebo -1. Vybírá místo pro bublinu. */
function indexMobilZalozky(cesta: string, hledani: string): number {
  // Žebříčky a Profil nemají na telefonu vlastní položku, patří pod Více.
  const podVice =
    jeViceAktivni(cesta, hledani) || cesta.startsWith("/zebricky") || cesta === "/profil" || cesta === "/vice";
  return MOBIL_POLOZKY.findIndex(({ to }) =>
    to === "/vice" ? podVice : !podVice && (cesta === to || cesta.startsWith(`${to}/`)),
  );
}

/** Záložka horní lišty. Za odkazy je ještě „Více“, -1 znamená žádnou. */
function indexDesktopZalozky(cesta: string, hledani: string): number {
  if (jeViceAktivni(cesta, hledani)) return DESKTOP_POLOZKY.length;
  return DESKTOP_POLOZKY.findIndex(({ to }) => cesta === to || cesta.startsWith(`${to}/`));
}

/**
 * Vybraná záložka navigace. Po kliknutí ukazuje novou hned, i když se stránka
 * teprve stahuje. Klik platí jen do změny adresy, jinak by po návratu zpět
 * ukazoval starou záložku.
 */
function useVybranaZalozka(
  podleAdresy: number,
  adresa: string,
): { vybrana: number; naKlik: (index: number, udalost: MouseEvent) => void } {
  const [klik, setKlik] = useState<{ index: number; adresa: string } | null>(null);
  useEffect(() => {
    setKlik(null);
  }, [adresa]);
  return {
    vybrana: klik !== null && klik.adresa === adresa ? klik.index : podleAdresy,
    naKlik: (index, udalost) => {
      // Otevření v nové kartě nechá bublinu na místě.
      if (udalost.metaKey || udalost.ctrlKey || udalost.shiftKey) return;
      setKlik({ index, adresa });
    },
  };
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
  const seznamRef = useRef<HTMLDivElement>(null);
  const { vybrana, naKlik } = useVybranaZalozka(indexDesktopZalozky(pathname, search), `${pathname}${search}`);

  return (
    <nav aria-label="Hlavní navigace" className="relative hidden min-[90rem]:block min-[90rem]:justify-self-center">
      <div ref={seznamRef} className="relative z-10 flex items-center gap-0.5">
        {polozky.map(({ to, popisek, end, Ikona }, index) => {
          const jeChat: boolean = to === "/chat";
          const label: string = jeChat ? popisekChat(pocetNeprectenych) : popisek;
          const aktivni = index === vybrana;
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={jeChat ? label : undefined}
              onClick={(udalost) => naKlik(index, udalost)}
              className={tridyDesktopOdkazu(aktivni)}
            >
              <span className="flex items-center gap-[7px]">
                <span
                  className={`relative inline-flex shrink-0 [touch-action:manipulation] ${aktivni ? "lista-ikona-aktivni" : ""}`}
                >
                  <Ikona />
                  {jeChat && maNeprectene ? <ChatTecka popisek={popisek} /> : null}
                </span>
                <span>{popisek}</span>
              </span>
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
          className={tridyDesktopOdkazu(vybrana === polozky.length)}
        >
          <span className="flex items-center gap-[7px]">
            <span className={`inline-flex shrink-0 ${vybrana === polozky.length ? "lista-ikona-aktivni" : ""}`}>
              <IkonaVice />
            </span>
            <span>Více</span>
          </span>
        </button>
      </div>
      {/* Až za seznamem: ref na něj musí být při prvním vykreslení hotový. */}
      <BublinaListy seznam={seznamRef} index={vybrana} umisteni="inset-0" zaobleni="rounded-[10px]" />
    </nav>
  );
}

export function MobileBar({ pocetNeprectenych = 0 }: { pocetNeprectenych?: number } = {}): JSX.Element {
  const polozky: PolozkaNavigace[] = MOBIL_POLOZKY;
  const maNeprectene: boolean = pocetNeprectenych > 0;
  const { pathname, search } = useLocation();
  const seznamRef = useRef<HTMLUListElement>(null);
  const { vybrana, naKlik } = useVybranaZalozka(indexMobilZalozky(pathname, search), `${pathname}${search}`);

  return (
    <nav
      aria-label="Spodní navigace"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-3 pt-2 min-[90rem]:hidden"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="pointer-events-auto relative mx-auto h-14 max-w-[30rem] rounded-[28px] border border-white bg-povrch/70 p-1 shadow-[0_8px_24px_#1c261512] backdrop-blur-md">
        <ul ref={seznamRef} className="relative z-10 m-0 flex h-full list-none items-stretch gap-0.5 p-0">
          {polozky.map(({ to, popisek, end, Ikona }, index) => {
            const jeChat: boolean = to === "/chat";
            const aktivni = index === vybrana;
            return (
              <li key={to} className="min-w-0 flex-1">
                <NavLink
                  to={to}
                  end={end}
                  aria-label={jeChat ? popisekChat(pocetNeprectenych) : undefined}
                  onClick={(udalost) => naKlik(index, udalost)}
                  className={tridyMobilOdkazu(aktivni)}
                >
                  <span className={`relative inline-flex shrink-0 ${aktivni ? "lista-ikona-aktivni" : ""}`}>
                    <Ikona className="h-[22px] w-[22px]" />
                    {jeChat && maNeprectene && <ChatTecka popisek={popisek} />}
                  </span>
                  <span>{popisek}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
        {/* Až za seznamem: ref na něj musí být při prvním vykreslení hotový. */}
        <BublinaListy seznam={seznamRef} index={vybrana} umisteni="inset-1" zaobleni="rounded-full" />
      </div>
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
          className="nahled-press flex min-h-[44px] min-w-[44px] flex-col justify-center rounded-md pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          aria-label="ExApp – výpravy"
        >
          <span className="flex items-center gap-[11px]">
            <LogoKlubu velikost="sm" />
            <span className="flex flex-col">
              <span className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">ExApp</span>
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
