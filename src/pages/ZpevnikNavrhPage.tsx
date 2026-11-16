import { useState, type FormEvent, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import { OdkazZpet } from "../components/zpevnik/Tlacitka";
import { vytvorNavrh } from "../lib/zpevnik-api";
import { parsujVlozeni } from "../shared/zpevnik";

export default function ZpevnikNavrhPage(): JSX.Element {
  const navigate = useNavigate();
  const [nazev, setNazev] = useState("");
  const [autor, setAutor] = useState("");
  const [text, setText] = useState("");
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);

  async function odeslat(udalost: FormEvent): Promise<void> {
    udalost.preventDefault();
    const vlozeni = parsujVlozeni(text);
    if (!vlozeni.ok) {
      setChyba("Napiš aspoň jeden řádek textu.");
      return;
    }
    setOdesila(true);
    setChyba(null);
    const vysledek = await vytvorNavrh(nazev, autor, vlozeni.telo);
    setOdesila(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    void navigate("/zpevnik/fronta");
  }

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-6 sm:px-6 sm:pt-10 lg:px-8 xl:px-12">
      <OdkazZpet to="/zpevnik">Zpět do zpěvníku</OdkazZpet>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Nová píseň</h1>
      <p className="mt-2 text-sm text-mech">
        Akordy napiš na řádek nad text, do stejného sloupce jako slabika.
      </p>
      <form className="mt-6 space-y-4" onSubmit={(udalost) => void odeslat(udalost)}>
        <label className="block text-sm font-bold" htmlFor="nazev-pisne">
          Název
          <input
            id="nazev-pisne"
            required
            value={nazev}
            onChange={(udalost) => setNazev(udalost.target.value)}
            className="mt-2 w-full rounded-md border border-linka bg-papir px-3 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-bold" htmlFor="autor-pisne">
          Autor
          <input
            id="autor-pisne"
            required
            value={autor}
            onChange={(udalost) => setAutor(udalost.target.value)}
            className="mt-2 w-full rounded-md border border-linka bg-papir px-3 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-bold" htmlFor="text-pisne">
          Text
          <textarea
            id="text-pisne"
            required
            rows={12}
            wrap="off"
            value={text}
            onChange={(udalost) => setText(udalost.target.value)}
            className="mt-2 w-full overflow-x-auto whitespace-pre rounded-md border border-linka bg-papir px-3 py-3 font-mono text-base"
          />
        </label>
        {chyba !== null && <p className="text-inkoust">{chyba}</p>}
        <button
          type="submit"
          disabled={odesila}
          className="nahled-press nahled-prejeti min-h-11 rounded-md border-2 border-inkoust bg-papir px-4 py-3 text-sm font-bold text-inkoust disabled:opacity-60"
        >
          {odesila ? "Posílám…" : "Poslat ke schválení"}
        </button>
      </form>
    </main>
  );
}
