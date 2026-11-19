import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HlavickaZpet from "../components/HlavickaZpet";
import { nactiNavrh, upravNavrh } from "../lib/zpevnik-api";
import { parsujVlozeni, textZTela } from "../shared/zpevnik";

export default function ZpevnikNavrhUpravaPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nazev, setNazev] = useState("");
  const [autor, setAutor] = useState("");
  const [text, setText] = useState("");
  const [nahled, setNahled] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  useEffect(() => {
    if (id === undefined) return;
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiNavrh(id);
      if (!zive) return;
      if (!vysledek.ok) {
        setChyba(vysledek.chyba);
        return;
      }
      setNazev(vysledek.navrh.nazev);
      setAutor(vysledek.navrh.autor);
      setText(textZTela(vysledek.navrh.telo));
      setNahled(vysledek.navrh.nahledUrl);
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
    const vysledek = await upravNavrh(id, nazev, autor, vlozeni.telo);
    setOdesila(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    void navigate("/zpevnik/fronta");
  }

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-6 sm:px-6 sm:pt-10 lg:px-8 xl:px-12">
      <HlavickaZpet zpet="/zpevnik/fronta" zpetPopisek="Zpět na návrhy" titulek="Upravit návrh" varianta="nadpis" />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {nahled !== null && nahled.length > 0 && (
          <img src={nahled} alt="Náhled nahrané stránky" className="w-full rounded-md border border-linka" />
        )}
        <form className="space-y-4" onSubmit={(udalost) => void odeslat(udalost)}>
          <label className="block text-sm font-bold" htmlFor="navrh-nazev">
            Název
            <input
              id="navrh-nazev"
              required
              value={nazev}
              onChange={(udalost) => setNazev(udalost.target.value)}
              className="mt-2 w-full rounded-md border border-linka bg-papir px-3 py-3 text-base"
            />
          </label>
          <label className="block text-sm font-bold" htmlFor="navrh-autor">
            Autor
            <input
              id="navrh-autor"
              required
              value={autor}
              onChange={(udalost) => setAutor(udalost.target.value)}
              className="mt-2 w-full rounded-md border border-linka bg-papir px-3 py-3 text-base"
            />
          </label>
          <label className="block text-sm font-bold" htmlFor="navrh-text">
            Text
            <textarea
              id="navrh-text"
              required
              rows={16}
              wrap="off"
              value={text}
              onChange={(udalost) => setText(udalost.target.value)}
              className="mt-2 w-full overflow-x-auto whitespace-pre rounded-md border border-linka bg-papir px-3 py-3 font-mono text-base"
            />
          </label>
          <p className="text-sm text-mech">Akordy piš na řádek nad slovy.</p>
          {chyba !== null && <p>{chyba}</p>}
          <button
            type="submit"
            disabled={odesila}
            className="nahled-press nahled-prejeti min-h-11 rounded-md border border-linka bg-papir px-4 py-3 text-sm font-bold text-inkoust disabled:opacity-60"
          >
            {odesila ? "Ukládám…" : "Uložit návrh"}
          </button>
        </form>
      </div>
    </main>
  );
}
