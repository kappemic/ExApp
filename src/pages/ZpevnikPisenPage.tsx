import { useEffect, useMemo, useState, type JSX } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import HlavickaZpet from "../components/HlavickaZpet";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import { AkordovyProuzek, akordyZTela } from "../components/zpevnik/AkordovyProuzek";
import { TeloPisnePohled } from "../components/zpevnik/TeloPisnePohled";
import { ZpevnikOvladaniPrecteni } from "../components/zpevnik/ZpevnikOvladaniPrecteni";
import { useAuth } from "../hooks/useAuth";
import { nactiPisen, smazPisen } from "../lib/zpevnik-api";
import { ctiPosun, zapisPosun } from "../lib/zpevnik-transpozice";
import { maAkordy, opravRozpadleAkordy, posunTelo, prvniAkord, type ApiZpevnikPisen } from "../shared/zpevnik";

function jeSchvalovatel(user: { isAdmin?: boolean; isSuperadmin?: boolean; funkce?: string | null } | null): boolean {
  if (user === null) return false;
  return user.isAdmin === true || user.isSuperadmin === true || user.funkce === "vedeni";
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

  return (
    <main className="mx-auto w-full max-w-2xl bg-papir px-4 pb-10 pt-4 text-inkoust sm:px-6 sm:pt-6 lg:px-8">
      <HlavickaZpet
        zpet="/zpevnik"
        zpetPopisek="Zpět do zpěvníku"
        onZpet={() => void navigate("/zpevnik")}
        titulek="Zpěvník"
      />

      {chyba !== null && <p className="mt-6">{chyba}</p>}

      {pisen !== null && telo !== null && (
        <>
          <div className="mt-2 flex items-start justify-between gap-3">
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{pisen.nazev}</h1>
            {schvaluje && id !== undefined && (
              <div className="flex shrink-0 items-center gap-0.5 pt-1">
                <Link
                  to={`/zpevnik/${id}/upravit`}
                  state={{ odkud: `${location.pathname}${location.search}` }}
                  className="inline-flex min-h-11 items-center px-1.5 text-sm font-semibold text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                >
                  Upravit
                </Link>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center px-1.5 text-sm font-semibold text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                  onClick={() => setMaze(true)}
                >
                  Smazat
                </button>
              </div>
            )}
          </div>
          {pisen.autor.length > 0 && <p className="mt-1 text-sm text-mech">{pisen.autor}</p>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-mech">Text a akordy</p>
            <ZpevnikOvladaniPrecteni />
          </div>

          {ukazPosun && tonina !== null && (
            <div className="mt-3 inline-flex items-center rounded-full border border-pole bg-povrch">
              <button
                type="button"
                aria-label="Půltón dolů"
                className="h-11 w-11 rounded-full text-lg font-bold"
                onClick={() => zmenPosun(-1)}
              >
                −
              </button>
              <span className="min-w-14 text-center text-base font-extrabold">{tonina}</span>
              <button
                type="button"
                aria-label="Půltón nahoru"
                className="h-11 w-11 rounded-full text-lg font-bold"
                onClick={() => zmenPosun(1)}
              >
                +
              </button>
            </div>
          )}
        </>
      )}

      {pisen !== null && telo !== null && (
        <div className="mt-4 rounded-2xl border border-linka bg-povrch p-4 shadow-denik sm:p-5">
          <TeloPisnePohled telo={telo} />
        </div>
      )}

      {akordy.length > 0 && <AkordovyProuzek akordy={akordy} />}

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