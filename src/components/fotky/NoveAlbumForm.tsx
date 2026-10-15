import { useState, type FormEvent, type JSX } from "react";
import { vytvorAlbum, type ApiAlbum } from "../../lib/alba-api";
import { fotkyHoverBgSmrkPlne, fotkyTlacitkoZaklad } from "./fotky-ui";

interface NoveAlbumFormProps {
  onVytvoreno: (album: ApiAlbum | null, nazev: string) => void;
}

/** ADMIN control. Hidden by the parent for everyone else. */
export default function NoveAlbumForm({ onVytvoreno }: NoveAlbumFormProps): JSX.Element {
  const [nazev, setNazev] = useState<string>("");
  const [odesila, setOdesila] = useState<boolean>(false);
  const [chyba, setChyba] = useState<string | null>(null);

  async function odeslat(udalost: FormEvent<HTMLFormElement>): Promise<void> {
    udalost.preventDefault();
    const cisty = nazev.trim();
    if (cisty.length === 0) {
      setChyba("Zadej název alba.");
      return;
    }
    setOdesila(true);
    setChyba(null);
    const vysledek = await vytvorAlbum(cisty);
    setOdesila(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    setNazev("");
    onVytvoreno(vysledek.data, cisty);
  }

  return (
    <form onSubmit={(udalost) => void odeslat(udalost)} className="flex flex-col gap-1.5">
      <div>
        <label htmlFor="nove-album-nazev" className="text-sm font-bold tracking-tight">
          Název alba
        </label>
        <input
          id="nove-album-nazev"
          name="nazev"
          type="text"
          value={nazev}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="done"
          disabled={odesila}
          onChange={(udalost) => {
            setNazev(udalost.target.value);
          }}
          className="mt-1 block min-h-[44px] w-full rounded-md border-2 border-inkoust bg-white/80 px-3 text-base text-inkoust"
        />
      </div>
      <button
        type="submit"
        disabled={odesila}
        className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgSmrkPlne} w-auto self-start rounded-md border-2 border-inkoust bg-smrk px-4 text-sm font-bold text-papir disabled:opacity-60`}
      >
        {odesila ? "Zakládám…" : "Založit album"}
      </button>
      {chyba !== null ? (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {chyba}
        </p>
      ) : null}
    </form>
  );
}
