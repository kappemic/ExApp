import { useState, type FormEvent, type JSX } from "react";
import { vytvorAlbum, type ApiAlbum } from "../../lib/alba-api";
import { POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";

interface NoveAlbumFormProps {
  onVytvoreno: (album: ApiAlbum | null, nazev: string) => void;
  onZrusit: () => void;
}

/** ADMIN control. Hidden by the parent for everyone else. */
export default function NoveAlbumForm({ onVytvoreno, onZrusit }: NoveAlbumFormProps): JSX.Element {
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
    <form onSubmit={(udalost) => void odeslat(udalost)} className="flex flex-col">
      <div>
        <label htmlFor="nove-album-nazev" className={`block ${POPISEK_POLE}`}>
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
          className={`mt-1.5 min-[90rem]:mt-[5px] ${POLE_FORMULARE}`}
        />
      </div>
      {chyba !== null ? (
        <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-akcent">
          {chyba}
        </p>
      ) : null}
      <div className={PATICKA_SHEETU}>
        <button type="button" disabled={odesila} onClick={onZrusit} className={TLACITKO_PATICKY_ZRUSIT}>
          Zrušit
        </button>
        <button type="submit" disabled={odesila} className={TLACITKO_PATICKY_HLAVNI}>
          {odesila ? "Zakládám…" : "Založit album"}
        </button>
      </div>
    </form>
  );
}
