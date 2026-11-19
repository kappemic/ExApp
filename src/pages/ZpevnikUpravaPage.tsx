import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HlavickaZpet from "../components/HlavickaZpet";
import { nactiPisen, upravPisen } from "../lib/zpevnik-api";
import { parsujVlozeni, textZTela } from "../shared/zpevnik";

export default function ZpevnikUpravaPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nazev, setNazev] = useState("");
  const [autor, setAutor] = useState("");
  const [text, setText] = useState("");
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiPisen(id);
      if (!zive) return;
      if (!vysledek.ok) {
        setChyba(vysledek.chyba);
        return;
      }
      setNazev(vysledek.pisen.nazev);
      setAutor(vysledek.pisen.autor);
      setText(textZTela(vysledek.pisen.telo));
    })();
    return () => {
      zive = false;
    };
  }, [id]);

  async function odeslat(udalost: FormEvent): Promise<void> {
    udalost.preventDefault();
    if (id === undefined) return;
    const vlozeni = parsujVlozeni(text);
    if (!vlozeni.ok) {
      setChyba("Napiš aspoň jeden řádek textu.");
      return;
    }
    setOdesila(true);
    const vysledek = await upravPisen(id, nazev, autor, vlozeni.telo);
    setOdesila(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    void navigate(`/zpevnik/${id}`);
  }

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-6 sm:px-6 sm:pt-10 lg:px-8 xl:px-12">
      <HlavickaZpet
        zpet={id === undefined ? "/zpevnik" : `/zpevnik/${id}`}
        zpetPopisek="Zpět na píseň"
        titulek="Upravit píseň"
        varianta="nadpis"
      />
      <form className="mt-6 space-y-4" onSubmit={(udalost) => void odeslat(udalost)}>
        <label className="block text-sm font-bold" htmlFor="uprava-nazev">
          Název
          <input
            id="uprava-nazev"
            required
            value={nazev}
            onChange={(udalost) => setNazev(udalost.target.value)}
            className="mt-2 w-full rounded-md border border-linka bg-papir px-3 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-bold" htmlFor="uprava-autor">
          Autor
          <input
            id="uprava-autor"
            required
            value={autor}
            onChange={(udalost) => setAutor(udalost.target.value)}
            className="mt-2 w-full rounded-md border border-linka bg-papir px-3 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-bold" htmlFor="uprava-text">
          Text
          <textarea
            id="uprava-text"
            required
            rows={12}
            wrap="off"
            value={text}
            onChange={(udalost) => setText(udalost.target.value)}
            className="mt-2 w-full overflow-x-auto whitespace-pre rounded-md border border-linka bg-papir px-3 py-3 font-mono text-base"
          />
        </label>
        {chyba !== null && <p>{chyba}</p>}
        <button
          type="submit"
          disabled={odesila}
          className="nahled-press nahled-prejeti min-h-11 rounded-md border border-linka bg-papir px-4 py-3 text-sm font-bold text-inkoust disabled:opacity-60"
        >
          {odesila ? "Ukládám…" : "Uložit"}
        </button>
      </form>
    </main>
  );
}
