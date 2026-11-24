import { useEffect, useMemo, useState, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import Ikona from "../components/Ikona";
import { akordyZTela } from "../components/zpevnik/AkordovyProuzek";
import { TeloPisnePohled } from "../components/zpevnik/TeloPisnePohled";
import { PosouvaniLista, PosouvaniPilulka } from "../components/zpevnik/ZpevnikOvladaniPrecteni";
import { usePosouvani } from "../hooks/usePosouvani";
import { useAuth } from "../hooks/useAuth";
import { nactiPisen, smazPisen } from "../lib/zpevnik-api";
import { ctiPosun, zapisPosun } from "../lib/zpevnik-transpozice";
import { maAkordy, opravRozpadleAkordy, posunTelo, prvniAkord, type ApiZpevnikPisen } from "../shared/zpevnik";

function jeSchvalovatel(user: { isAdmin?: boolean; isSuperadmin?: boolean; funkce?: string | null } | null): boolean {
  if (user === null) return false;
  return user.isAdmin === true || user.isSuperadmin === true || user.funkce === "vedeni";
}

export default function ZpevnikPisenPage(): JSX.Element {
  const posouvani = usePosouvani();
  const { id } = useParams();
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

  function zmenPosun(krok: number): void {
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

  const tlacitkoPosunu =
    "nahled-press flex size-10 items-center justify-center rounded-[7px] text-mech hover:bg-povrch min-[90rem]:size-6";
  // Návrh ukazuje posun v půltónech („0“), na telefonu je u akordů.
  const stepper =
    ukazPosun && tonina !== null ? (
      <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-povrch-2 p-[3px]">
        <button type="button" aria-label="Půltón dolů" className={tlacitkoPosunu} onClick={() => zmenPosun(-1)}>
          <Ikona nazev="minus" className="size-3.5 min-[90rem]:size-3" />
        </button>
        <span className="min-w-6 text-center text-[13px] font-semibold text-inkoust min-[90rem]:text-xs" aria-label={`Tónina ${tonina}`}>
          {posun > 0 ? `+${posun}` : posun}
        </span>
        <button type="button" aria-label="Půltón nahoru" className={tlacitkoPosunu} onClick={() => zmenPosun(1)}>
          <Ikona nazev="plus" className="size-3.5 min-[90rem]:size-3" />
        </button>
      </div>
    ) : null;

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

          <div className="mt-5 flex items-center justify-between gap-3 min-[90rem]:hidden">
            <p className="text-[13px] text-mech">Text a akordy</p>
            <PosouvaniPilulka posouvani={posouvani} />
          </div>

          <div className="mt-5 min-[90rem]:mt-8 min-[90rem]:grid min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:items-start min-[90rem]:gap-7">
            <section aria-labelledby="pisen-text" className="flex flex-col gap-4 rounded-2xl border border-linka bg-povrch p-4 shadow-karta min-[90rem]:gap-5 min-[90rem]:p-5">
              <h2 id="pisen-text" className="sr-only font-display text-lg font-bold tracking-[-0.4px] text-inkoust min-[90rem]:not-sr-only">
                Text a akordy
              </h2>
              <PosouvaniLista posouvani={posouvani} />
              <div className="min-[90rem]:columns-2 min-[90rem]:gap-8 [&_*]:break-inside-avoid">
                <TeloPisnePohled telo={telo} />
              </div>
              <p className="hidden items-center gap-[7px] text-[11px] text-ink-4 min-[90rem]:flex">
                <Ikona nazev="hand" className="size-3 text-ink-5" />
                Dotyk posouvání pozastaví.
              </p>
            </section>

            {akordy.length > 0 ? (
              <aside className="mt-5 flex flex-wrap items-center gap-2 min-[90rem]:mt-0 min-[90rem]:flex-col min-[90rem]:flex-nowrap min-[90rem]:items-stretch min-[90rem]:gap-3.5 min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:p-5 ">
                <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.6px] text-ink-3 min-[90rem]:text-[10.5px] min-[90rem]:tracking-[1.2px]">
                  Akordy <span className="hidden min-[90rem]:inline">v písni</span>
                </h2>
                <ul aria-label="Akordy v písni" className="flex flex-wrap gap-2">
                  {akordy.map((akord) => (
                    <li
                      key={akord}
                      className="inline-flex size-9 items-center justify-center rounded-[10px] bg-okr-100 font-display text-sm font-bold text-okr min-[90rem]:size-[52px] min-[90rem]:rounded-xl min-[90rem]:bg-povrch-2 min-[90rem]:text-[17px] min-[90rem]:text-inkoust"
                    >
                      {akord}
                    </li>
                  ))}
                </ul>
                {stepper !== null ? (
                  <div className="ml-auto flex items-center min-[90rem]:ml-0 min-[90rem]:justify-between min-[90rem]:border-t min-[90rem]:border-linka min-[90rem]:pt-3">
                    <span className="hidden text-[12.5px] font-medium text-mech min-[90rem]:inline">Transponovat</span>
                    {stepper}
                  </div>
                ) : null}
              </aside>
            ) : null}
          </div>
        </>
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