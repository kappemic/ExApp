import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import { TeloPisnePohled } from "../components/zpevnik/TeloPisnePohled";
import { OdkazZpet } from "../components/zpevnik/Tlacitka";
import { useAuth } from "../hooks/useAuth";
import { nactiPisen, smazPisen } from "../lib/zpevnik-api";
import { ctiPosun, zapisPosun } from "../lib/zpevnik-transpozice";
import { maAkordy, opravRozpadleAkordy, posunTelo, prvniAkord, type ApiZpevnikPisen } from "../shared/zpevnik";

function jeSchvalovatel(user: { isAdmin?: boolean; isSuperadmin?: boolean; funkce?: string | null } | null): boolean {
  if (user === null) return false;
  return user.isAdmin === true || user.isSuperadmin === true || user.funkce === "vedeni";
}

const KLIC_RYCHLOSTI = "exapp:zpevnik:rychlost-posuvu";
const KLIC_STUPNICE = "exapp:zpevnik:rychlost-stupnice";
const STUPNICE = "5";
const RYCHLOST_MIN = 12;
const RYCHLOST_MAX = 130;
const RYCHLOST_VYCHOZI = 42;
/** Above 1 so the slow half of the slider moves in smaller steps. */
const RYCHLOST_KRICENI = 2;

function rychlostZTahu(tah: number): number {
  const t = Math.min(100, Math.max(0, tah)) / 100;
  return Math.round(RYCHLOST_MIN + t ** RYCHLOST_KRICENI * (RYCHLOST_MAX - RYCHLOST_MIN));
}

function tahZRychlosti(px: number): number {
  const podil = (px - RYCHLOST_MIN) / (RYCHLOST_MAX - RYCHLOST_MIN);
  const t = Math.pow(Math.min(1, Math.max(0, podil)), 1 / RYCHLOST_KRICENI);
  return Math.round(t * 100);
}

function ctiRychlost(): number {
  const stupnice = localStorage.getItem(KLIC_STUPNICE);
  const surova = localStorage.getItem(KLIC_RYCHLOSTI);
  let cislo = surova === null ? RYCHLOST_VYCHOZI : Number(surova);
  if (!Number.isFinite(cislo)) cislo = RYCHLOST_VYCHOZI;
  if (stupnice !== STUPNICE) {
    if (stupnice === "4") {
      const podil = (cislo - 14) / (140 - 14);
      const t = Math.pow(Math.min(1, Math.max(0, podil)), 1 / 1.7);
      cislo = Math.round(RYCHLOST_MIN + t ** RYCHLOST_KRICENI * (RYCHLOST_MAX - RYCHLOST_MIN));
    } else {
      cislo = RYCHLOST_VYCHOZI;
    }
    localStorage.setItem(KLIC_STUPNICE, STUPNICE);
    localStorage.setItem(KLIC_RYCHLOSTI, String(cislo));
  }
  return Math.min(RYCHLOST_MAX, Math.max(RYCHLOST_MIN, cislo));
}

/** Slider middle is 1×. Ends are 0.5× and 2×. */
function cisloRychlosti(px: number): string {
  const tah = tahZRychlosti(px);
  const nasobek = 2 ** (tah / 50 - 1);
  const zaokrouhleny = Math.round(nasobek * 10) / 10;
  const text = Number.isInteger(zaokrouhleny) ? String(zaokrouhleny) : zaokrouhleny.toFixed(1).replace(".", ",");
  return `${text}×`;
}

export default function ZpevnikPisenPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const schvaluje = jeSchvalovatel(user);
  const [pisen, setPisen] = useState<ApiZpevnikPisen | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [posun, setPosun] = useState(0);
  const [maze, setMaze] = useState(false);
  const [jede, setJede] = useState(false);
  const [nabidniNavrat, setNabidniNavrat] = useState(false);
  const [rychlost, setRychlost] = useState(ctiRychlost);
  const uzVratil = useRef(false);

  useEffect(() => {
    if (id === undefined) return;
    setPosun(ctiPosun(localStorage, id));
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiPisen(id);
      if (!zive) return;
      if (vysledek.ok) setPisen(vysledek.pisen);
      else setChyba(vysledek.chyba);
    })();
    return () => {
      zive = false;
    };
  }, [id]);

  function zmenPosun(krok: number): void {
    if (id === undefined || pisen === null) return;
    const dalsi = posun + krok;
    setPosun(dalsi);
    zapisPosun(localStorage, id, dalsi);
  }

  function zmenRychlost(hodnota: number): void {
    setRychlost(hodnota);
    localStorage.setItem(KLIC_RYCHLOSTI, String(hodnota));
  }

  function zpatkyNahoru(): void {
    uzVratil.current = true;
    setNabidniNavrat(false);
    window.scrollTo(0, 0);
    setJede(true);
  }

  useEffect(() => {
    if (!jede) return;
    let ramecek = 0;
    let minule = performance.now();
    let zbytek = 0;
    let ocekavane = window.scrollY;
    const dvaSloupce = (): boolean =>
      window.matchMedia("(min-width: 1024px)").matches && document.querySelector("[data-dva-sloupce]") !== null;
    const krok = (ted: number): void => {
      const dt = Math.min(ted - minule, 48);
      minule = ted;
      zbytek += (rychlost * dt) / 1000;
      const px = Math.floor(zbytek);
      if (px > 0) {
        window.scrollBy(0, px);
        zbytek -= px;
        ocekavane = window.scrollY;
      }
      const dokument = document.documentElement;
      const kratky = dokument.scrollHeight <= window.innerHeight + 4;
      const dole = window.scrollY + window.innerHeight >= dokument.scrollHeight - 4;
      if (dole) {
        if (!kratky && dvaSloupce() && !uzVratil.current) setNabidniNavrat(true);
        setJede(false);
        return;
      }
      ramecek = window.requestAnimationFrame(krok);
    };
    ramecek = window.requestAnimationFrame(krok);
    const naScroll = (): void => {
      if (window.scrollY < ocekavane - 2) setJede(false);
    };
    const koleckemNahoru = (udalost: WheelEvent): void => {
      if (udalost.deltaY < 0) setJede(false);
    };
    let dotykY = 0;
    const dotykZacatek = (udalost: TouchEvent): void => {
      dotykY = udalost.touches[0]?.clientY ?? 0;
    };
    const dotykTah = (udalost: TouchEvent): void => {
      const y = udalost.touches[0]?.clientY ?? dotykY;
      if (y > dotykY + 8) setJede(false);
      dotykY = y;
    };
    window.addEventListener("scroll", naScroll, { passive: true });
    window.addEventListener("wheel", koleckemNahoru, { passive: true });
    window.addEventListener("touchstart", dotykZacatek, { passive: true });
    window.addEventListener("touchmove", dotykTah, { passive: true });
    return () => {
      window.cancelAnimationFrame(ramecek);
      window.removeEventListener("scroll", naScroll);
      window.removeEventListener("wheel", koleckemNahoru);
      window.removeEventListener("touchstart", dotykZacatek);
      window.removeEventListener("touchmove", dotykTah);
    };
  }, [jede, rychlost]);

  const telo = useMemo(
    () => (pisen === null ? null : posunTelo(opravRozpadleAkordy(pisen.telo), posun)),
    [pisen, posun],
  );
  const tonina = telo === null ? null : prvniAkord(telo);
  const ukazPosun = pisen !== null && maAkordy(pisen.telo);

  async function smazat(): Promise<void> {
    if (id === undefined) return;
    const vysledek = await smazPisen(id);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      setMaze(false);
      return;
    }
    void navigate("/zpevnik");
  }

  return (
    <main className="mx-auto w-full bg-papir px-2 pb-8 pt-6 text-inkoust sm:px-6 sm:pt-10 lg:px-10 lg:pb-12 xl:px-14">
      <div className="flex items-center justify-between gap-3">
        <OdkazZpet to="/zpevnik">Zpět do zpěvníku</OdkazZpet>
        {schvaluje && id !== undefined && pisen !== null && (
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to={`/zpevnik/${id}/upravit`}
              state={{ odkud: `${location.pathname}${location.search}` }}
              className="inline-flex min-h-11 items-center px-1.5 text-sm font-semibold text-mech transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:text-inkoust focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk"
            >
              Upravit
            </Link>
            <button
              type="button"
              className="inline-flex min-h-11 items-center px-1.5 text-sm font-semibold text-mech transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:text-inkoust focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk"
              onClick={() => setMaze(true)}
            >
              Smazat
            </button>
          </div>
        )}
      </div>
      {chyba !== null && <p className="mt-6">{chyba}</p>}
      {pisen !== null && telo !== null && (
        <>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{pisen.nazev}</h1>
          <p className="mt-1 text-mech">{pisen.autor}</p>
          <div className="mt-4 flex min-w-0 max-w-full flex-wrap items-center gap-3">
            {ukazPosun && tonina !== null && (
              <div className="inline-flex items-center rounded-full border-2 border-inkoust bg-papir">
                <button
                  type="button"
                  aria-label="Půltón dolů"
                  className="h-11 w-11 rounded-full text-lg font-bold transition-transform duration-100 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                  onClick={() => zmenPosun(-1)}
                >
                  −
                </button>
                <span className="min-w-14 text-center text-base font-extrabold">{tonina}</span>
                <button
                  type="button"
                  aria-label="Půltón nahoru"
                  className="h-11 w-11 rounded-full text-lg font-bold transition-transform duration-100 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                  onClick={() => zmenPosun(1)}
                >
                  +
                </button>
              </div>
            )}
            <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-3xl border-2 border-linka bg-papir py-1 pl-1 pr-3 lg:inline-flex lg:w-auto lg:flex-nowrap lg:rounded-full">
              <button
                type="button"
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-bold transition-[transform,background-color,color] duration-200 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  jede ? "bg-inkoust text-papir" : "text-inkoust"
                }`}
                onClick={() => {
                  setJede((stav) => {
                    if (!stav) {
                      uzVratil.current = false;
                      setNabidniNavrat(false);
                    }
                    return !stav;
                  });
                }}
              >
                {jede ? "Zastavit" : "Posouvat"}
              </button>
              <label className="flex min-w-0 flex-1 items-center gap-2 pr-1 text-xs font-bold text-mech">
                Rychlost
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={tahZRychlosti(rychlost)}
                  aria-label="Rychlost posouvání"
                  aria-valuetext={cisloRychlosti(rychlost)}
                  onChange={(udalost) => zmenRychlost(rychlostZTahu(Number(udalost.target.value)))}
                  className="h-11 w-full min-w-0 flex-1 accent-inkoust lg:w-64"
                />
                <span className="w-11 shrink-0 text-right tabular-nums">{cisloRychlosti(rychlost)}</span>
              </label>
            </div>
          </div>
          <div className="mt-8">
            <TeloPisnePohled telo={telo} />
          </div>
        </>
      )}
      {nabidniNavrat && (
        <button
          type="button"
          aria-label="Nahoru"
          className="group fixed left-1/2 z-30 -translate-x-1/2 p-2 text-inkoust lg:bottom-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]"
          onClick={zpatkyNahoru}
        >
          <span className="block transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-y-1">
            <svg viewBox="0 0 24 24" className="h-10 w-10 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-active:scale-[0.97] motion-reduce:transition-none motion-reduce:group-active:scale-100" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V6" />
              <path d="M6 12l6-7 6 7" />
            </svg>
          </span>
        </button>
      )}
      <ConfirmDialog
        otevreno={maze}
        nadpis="Smazat píseň?"
        popis="Z knihy zmizí. Návrh se z toho neudělá."
        potvrditPopisek="Ano, smazat"
        onZrusit={() => setMaze(false)}
        onPotvrdit={() => void smazat()}
      />
    </main>
  );
}
