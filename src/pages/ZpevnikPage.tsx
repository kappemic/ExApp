import { useEffect, useMemo, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { OdkazTlacitko, Tlacitko } from "../components/zpevnik/Tlacitka";
import { jeKnihaUlozena, nactiKnihu, smazUlozenouKnihu, stahniKnihu } from "../lib/zpevnik-api";
import { obsahujeHledani, seradPisne, type ApiZpevnikPisen } from "../shared/zpevnik";

export default function ZpevnikPage(): JSX.Element {
  const [pisne, setPisne] = useState<ApiZpevnikPisen[]>([]);
  const [dotaz, setDotaz] = useState("");
  const [nacitani, setNacitani] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zTelefonu, setZTelefonu] = useState(false);
  const [ulozeno, setUlozeno] = useState(false);
  const [stahuje, setStahuje] = useState(false);
  const [hlaska, setHlaska] = useState<string | null>(null);

  useEffect(() => {
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiKnihu();
      if (!zive) return;
      if (vysledek.ok) {
        setPisne(seradPisne(vysledek.pisne));
        setZTelefonu(vysledek.zdroj === "telefon");
      } else setChyba(vysledek.chyba);
      setUlozeno(jeKnihaUlozena());
      setNacitani(false);
    })();
    return () => {
      zive = false;
    };
  }, []);

  async function stahnout(): Promise<void> {
    setStahuje(true);
    setHlaska(null);
    const vysledek = await stahniKnihu();
    setStahuje(false);
    if (!vysledek.ok) {
      setHlaska(vysledek.chyba);
      return;
    }
    setPisne(seradPisne(vysledek.pisne));
    setChyba(null);
    setZTelefonu(false);
    setUlozeno(true);
    setHlaska("Zpěvník je v telefonu. Bez sítě se otevře tahle kopie.");
  }

  function smazat(): void {
    smazUlozenouKnihu();
    setUlozeno(false);
    setHlaska("Kopie z telefonu je smazaná.");
  }

  const viditelne = useMemo(
    () => pisne.filter((pisen) => obsahujeHledani(pisen.nazev, pisen.autor, dotaz)),
    [pisne, dotaz],
  );

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-6 sm:px-6 sm:pt-10 lg:px-8 xl:px-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Školní expediční klub</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Zpěvník</h1>
        <div className="mt-4 flex flex-wrap gap-3">
          <OdkazTlacitko to="/zpevnik/navrh" varianta="hlavni">
            Nová píseň
          </OdkazTlacitko>
          <OdkazTlacitko to="/zpevnik/fronta" varianta="vedlejsi">
            Návrhy
          </OdkazTlacitko>
          <Tlacitko varianta="vedlejsi" onClick={() => void stahnout()} disabled={stahuje}>
            {stahuje ? "Stahuji…" : ulozeno ? "Aktualizovat v telefonu" : "Stáhnout do telefonu"}
          </Tlacitko>
          {ulozeno && (
            <Tlacitko varianta="tichy" onClick={smazat} disabled={stahuje}>
              Smazat z telefonu
            </Tlacitko>
          )}
        </div>
        {zTelefonu && (
          <p className="mt-4 text-sm text-mech">Teď čteš kopii z telefonu. Návrhy v ní nejsou.</p>
        )}
        {hlaska !== null && <p className="mt-4 text-sm text-inkoust">{hlaska}</p>}
      </header>
      <label className="mt-6 block text-sm font-bold text-inkoust" htmlFor="hledani-zpevniku">
        Hledat
        <input
          id="hledani-zpevniku"
          value={dotaz}
          onChange={(udalost) => setDotaz(udalost.target.value)}
          placeholder="Název nebo autor"
          className="mt-2 w-full rounded-md border border-linka bg-papir px-3 py-3 text-base text-inkoust"
        />
      </label>
      {nacitani && <p className="mt-8 text-mech">Načítám zpěvník…</p>}
      {chyba !== null && <p className="mt-8 text-inkoust">{chyba}</p>}
      {!nacitani && chyba === null && viditelne.length === 0 && (
        <p className="mt-8 text-mech">Žádná píseň.</p>
      )}
      <ul className="mt-6 space-y-3">
        {viditelne.map((pisen) => (
          <li key={pisen.id}>
            <Link
              to={`/zpevnik/${pisen.id}`}
              className="nahled-press flex min-h-14 items-center justify-between gap-3 rounded-md border-2 border-linka bg-papir px-3 py-3 [touch-action:manipulation] hover:border-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
            >
              <span>
                <span className="block font-bold text-inkoust">{pisen.nazev}</span>
                <span className="block text-sm text-mech">{pisen.autor}</span>
              </span>
              <span className="inline-flex min-h-11 shrink-0 items-center rounded-md border-2 border-inkoust px-3 text-sm font-bold text-inkoust">
                Otevřít
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
