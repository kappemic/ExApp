import { useEffect, useMemo, useState, type CSSProperties, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import Ikona from "../components/Ikona";
import SpodniSheet from "../components/shell/SpodniSheet";
import { akordyZTela } from "../components/zpevnik/AkordovyProuzek";
import { Krokovac } from "../components/zpevnik/Krokovac";
import { TeloPisnePohled } from "../components/zpevnik/TeloPisnePohled";
import { PosouvaniLista, PosouvaniPilulka } from "../components/zpevnik/ZpevnikOvladaniPrecteni";
import { ZpevnikZobrazeni } from "../components/zpevnik/ZpevnikZobrazeni";
import { usePosouvani } from "../hooks/usePosouvani";
import { useAuth } from "../hooks/useAuth";
import { nactiPisen, smazPisen } from "../lib/zpevnik-api";
import { ctiNastaveni, zapisNastaveni, type NastaveniCteni } from "../lib/zpevnik-cteni";
import { ctiPosun, zapisPosun } from "../lib/zpevnik-transpozice";
import { maAkordy, opravRozpadleAkordy, pocetRadkuLyriky, posunTelo, prvniAkord, type ApiZpevnikPisen } from "../shared/zpevnik";

function jeSchvalovatel(user: { isAdmin?: boolean; isSuperadmin?: boolean; funkce?: string | null } | null): boolean {
  if (user === null) return false;
  return user.isAdmin === true || user.isSuperadmin === true || user.funkce === "vedeni";
}

/** Delší píseň by se ve dvou sloupcích nevešla na obrazovku a při posouvání by se musela vracet nahoru. */
const RADKU_DO_DVOU_SLOUPCU = 30;

export default function ZpevnikPisenPage(): JSX.Element {
  const { id } = useParams();
  const [nastaveni, setNastaveni] = useState<NastaveniCteni>(() => ctiNastaveni(localStorage));
  const [zobrazeni, setZobrazeni] = useState(false);
  const posouvani = usePosouvani(id, nastaveni.prodleva);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const schvaluje = jeSchvalovatel(user);
  const [pisen, setPisen] = useState<ApiZpevnikPisen | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [posun, setPosun] = useState(0);
  const [maze, setMaze] = useState(false);

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

  function zmenPosun(krok: -1 | 1): void {
    if (id === undefined || pisen === null) return;
    const dalsi = posun + krok;
    setPosun(dalsi);
    zapisPosun(localStorage, id, dalsi);
  }

  const telo = useMemo(
    () => (pisen === null ? null : posunTelo(opravRozpadleAkordy(pisen.telo), posun)),
    [pisen, posun],
  );
  const tonina = telo === null ? null : prvniAkord(telo);
  const ukazPosun = pisen !== null && maAkordy(pisen.telo);
  const akordy = telo === null ? [] : akordyZTela(telo);

  function zmenNastaveni(dalsi: NastaveniCteni): void {
    setNastaveni(dalsi);
    zapisNastaveni(localStorage, dalsi);
  }

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

  const dvaSloupce = telo !== null && pocetRadkuLyriky(telo) <= RADKU_DO_DVOU_SLOUPCU;
  const posunPopis = posun > 0 ? `+${posun}` : `${posun}`;

  function transpozice(hodnota: string): JSX.Element | null {
    if (!ukazPosun || tonina === null || !nastaveni.akordy) return null;
    return <Krokovac hodnota={hodnota} popisHodnoty={`Tónina ${tonina}`} dolu="Půltón dolů" nahoru="Půltón nahoru" onKrok={zmenPosun} />;
  }

  return (
    <main className="mx-auto w-full max-w-[46rem] bg-papir px-5 pb-6 pt-4 text-inkoust sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet
        zpet="/zpevnik"
        zpetPopisek="Zpět do zpěvníku"
        onZpet={() => void navigate("/zpevnik")}
        titulek="Zpěvník"
        className="min-[90rem]:hidden"
        akce={
          schvaluje && id !== undefined ? (
            <Link
              to={`/zpevnik/${id}/upravit`}
              state={{ odkud: `${location.pathname}${location.search}` }}
              className="nahled-press inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-smrk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
            >
              Upravit
            </Link>
          ) : undefined
        }
      />

      <ZpetPocitac zpet="/zpevnik" popisek="Zpět do zpěvníku" />

      {chyba !== null && <p className="mt-6">{chyba}</p>}

      {pisen !== null && telo !== null && (
        <>
          <div className="mt-5 flex items-start justify-between gap-3 min-[90rem]:mt-0 min-[90rem]:items-end">
            <div className="min-w-0">
              <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
                {pisen.nazev}
              </h1>
              {pisen.autor.length > 0 && <p className="mt-1 text-[13px] text-ink-3 min-[90rem]:mt-3 min-[90rem]:text-[15px] min-[90rem]:text-mech">{pisen.autor}</p>}
            </div>
            {schvaluje && id !== undefined && (
              <div className="hidden shrink-0 items-center gap-2.5 min-[90rem]:flex">
                <button
                  type="button"
                  className="nahled-press inline-flex min-h-11 items-center rounded-xl px-2 text-[13px] font-semibold text-mech hover:text-inkoust min-[90rem]:h-[46px] min-[90rem]:px-3 min-[90rem]:text-sm"
                  onClick={() => setMaze(true)}
                >
                  Smazat
                </button>
                <Link
                  to={`/zpevnik/${id}/upravit`}
                  state={{ odkud: `${location.pathname}${location.search}` }}
                  className="nahled-press inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[13px] font-semibold text-smrk min-[90rem]:h-[46px] min-[90rem]:bg-smrk min-[90rem]:px-[18px] min-[90rem]:text-sm min-[90rem]:text-papir"
                >
                  <Ikona nazev="pencil" className="hidden size-4 min-[90rem]:block" />
                  Upravit
                </Link>
              </div>
            )}
          </div>

          {/* Telefon: tónina a zobrazení hned pod nadpisem. */}
          <div className="mt-4 flex items-center justify-between gap-2 min-[90rem]:hidden">
            {transpozice(posun === 0 ? (tonina ?? "") : `${tonina ?? ""} ${posunPopis}`) ?? <span />}
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setZobrazeni(true)}
              className="nahled-press inline-flex h-11 items-center gap-2 rounded-xl border border-linka bg-povrch px-3.5 text-[13px] font-semibold text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
            >
              <Ikona nazev="a-large-small" className="size-[18px]" />
              Zobrazení
            </button>
          </div>

          <p className="mt-3 flex h-11 items-center text-[13px] text-mech max-[23rem]:invisible min-[90rem]:hidden">Text a akordy</p>
          {/* Přímý potomek <main>, aby pilulka držela nahoře po celou délku písně. */}
          <div className="pointer-events-none sticky top-[calc(env(safe-area-inset-top,0px)+8px)] z-20 -mt-11 flex justify-end min-[90rem]:hidden">
            <PosouvaniPilulka posouvani={posouvani} />
          </div>

          <div className="mt-4 min-[90rem]:mt-8 min-[90rem]:grid min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:items-start min-[90rem]:gap-7">
            <section aria-labelledby="pisen-text" className="flex flex-col gap-4 rounded-2xl border border-linka bg-povrch p-4 shadow-karta min-[90rem]:gap-5 min-[90rem]:p-5">
              <h2 id="pisen-text" className="sr-only font-display text-lg font-bold tracking-[-0.4px] text-inkoust min-[90rem]:not-sr-only">
                Text a akordy
              </h2>
              <PosouvaniLista posouvani={posouvani} />
              <div
                className={dvaSloupce ? "min-[90rem]:columns-2 min-[90rem]:gap-8" : ""}
                style={{ "--pismo": nastaveni.pismo } as CSSProperties}
              >
                <TeloPisnePohled telo={telo} akordy={nastaveni.akordy} />
              </div>
              <p className="hidden items-center gap-[7px] text-[11px] text-ink-4 min-[90rem]:flex">
                <Ikona nazev="hand" className="size-3 text-ink-5" />
                Dotyk nebo kolečko posouvání podrží, po puštění jede dál.
              </p>
            </section>

            <aside className="hidden flex-col gap-3.5 rounded-2xl border border-linka bg-povrch p-5 min-[90rem]:sticky min-[90rem]:top-[88px] min-[90rem]:flex">
              {akordy.length > 0 && nastaveni.akordy ? (
                <>
                  <h2 className="font-sans text-[10.5px] font-bold uppercase tracking-[1.2px] text-ink-3">Akordy v písni</h2>
                  <ul aria-label="Akordy v písni" className="flex flex-wrap gap-2">
                    {akordy.map((akord) => (
                      <li
                        key={akord}
                        className="inline-flex h-[52px] min-w-[52px] items-center justify-center rounded-xl bg-povrch-2 px-2.5 font-display text-[17px] font-bold text-inkoust"
                      >
                        {akord}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t border-linka pt-3">
                    <span className="text-[12.5px] font-medium text-mech">Transponovat</span>
                    {transpozice(posunPopis)}
                  </div>
                </>
              ) : null}
              <div className={akordy.length > 0 && nastaveni.akordy ? "border-t border-linka pt-3" : ""}>
                <ZpevnikZobrazeni nastaveni={nastaveni} onZmena={zmenNastaveni} sAkordy={ukazPosun} />
              </div>
            </aside>
          </div>
        </>
      )}

      <SpodniSheet otevreno={zobrazeni} titulek="Zobrazení" podtitul="Platí pro všechny písně v tomhle zařízení." onZavrit={() => setZobrazeni(false)}>
        <ZpevnikZobrazeni nastaveni={nastaveni} onZmena={zmenNastaveni} sAkordy={ukazPosun} />
      </SpodniSheet>

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