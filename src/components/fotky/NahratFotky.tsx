import { useRef, useState, type FormEvent, type JSX } from "react";
import { nahrajFotku, popisekPoctuFotek, type ApiAlbum } from "../../lib/alba-api";
import {
  kratkyNazevSouboru,
  type PolozkaStavuFotek,
} from "../../lib/fotky-operace-stav";
import FotkyStavPanel from "./FotkyStavPanel";
import { fotkyHoverBgSmrkPlne, fotkyTlacitkoZaklad } from "./fotky-ui";

interface NahratFotkyProps {
  alba: readonly ApiAlbum[];
  vybraneId: string;
  onVyber: (albumId: string) => void;
  onNahrano: () => void;
}

/**
 * Multi-file picker plus an album select. Each file is posted on its own
 * so a partial failure still reports how far the batch got.
 */
export default function NahratFotky({
  alba,
  vybraneId,
  onVyber,
  onNahrano,
}: NahratFotkyProps): JSX.Element {
  const vstupRef = useRef<HTMLInputElement>(null);
  const [pocet, setPocet] = useState<number>(0);
  const [odesila, setOdesila] = useState<boolean>(false);
  const [hotovoShrnuti, setHotovoShrnuti] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [operacePolozky, setOperacePolozky] = useState<readonly PolozkaStavuFotek[]>([]);
  const bezAlb = alba.length === 0;

  async function odeslat(udalost: FormEvent<HTMLFormElement>): Promise<void> {
    udalost.preventDefault();
    const soubory = vstupRef.current?.files;
    if (soubory === null || soubory === undefined || soubory.length === 0) {
      setChyba("Vyber aspoň jednu fotku.");
      setHotovoShrnuti(null);
      return;
    }
    if (vybraneId.length === 0) {
      setChyba("Vyber album, do kterého se fotky nahrají.");
      setHotovoShrnuti(null);
      return;
    }
    setOdesila(true);
    setChyba(null);
    setHotovoShrnuti(null);
    const seznam = Array.from(soubory);
    const radky: PolozkaStavuFotek[] = seznam.map((soubor, index) => ({
      id: `${index}-${soubor.name}`,
      popisek: kratkyNazevSouboru(soubor.name),
      stav: "ceka",
    }));
    setOperacePolozky(radky);

    let nahrano = 0;
    for (let index = 0; index < seznam.length; index += 1) {
      const soubor = seznam[index];
      setOperacePolozky((prev) =>
        prev.map((radek, i) =>
          i === index ? { ...radek, stav: "probiha" } : radek,
        ),
      );
      const vysledek = await nahrajFotku(vybraneId, soubor);
      if (!vysledek.ok) {
        setOperacePolozky((prev) =>
          prev.map((radek, i) =>
            i === index
              ? { ...radek, stav: "chyba", chyba: vysledek.chyba }
              : radek,
          ),
        );
        setOdesila(false);
        setChyba(
          nahrano === 0
            ? vysledek.chyba
            : `Nahráno ${nahrano} z ${seznam.length}. ${vysledek.chyba}`,
        );
        if (nahrano > 0) onNahrano();
        return;
      }
      nahrano += 1;
      setOperacePolozky((prev) =>
        prev.map((radek, i) =>
          i === index ? { ...radek, stav: "hotovo" } : radek,
        ),
      );
    }
    if (vstupRef.current !== null) vstupRef.current.value = "";
    setPocet(0);
    setOdesila(false);
    setHotovoShrnuti(`Nahráno ${popisekPoctuFotek(nahrano)}.`);
    onNahrano();
    window.setTimeout(() => {
      setOperacePolozky([]);
    }, 2400);
  }

  return (
    <>
      <form onSubmit={(udalost) => void odeslat(udalost)} className="flex flex-col gap-3">
        <div>
          <label htmlFor="fotky-soubory" className="text-sm font-bold tracking-tight">
            Fotky
          </label>
          <input
            ref={vstupRef}
            id="fotky-soubory"
            name="soubor"
            type="file"
            accept="image/*"
            multiple
            disabled={odesila || bezAlb}
            onChange={(udalost) => {
              setPocet(udalost.target.files?.length ?? 0);
              setChyba(null);
              setHotovoShrnuti(null);
            }}
            className="mt-1 block min-h-[44px] w-full text-base file:mr-3 file:inline-flex file:min-h-[44px] file:items-center file:rounded-md file:border-2 file:border-inkoust file:bg-papir file:px-3 file:text-base file:font-bold file:text-inkoust"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="fotky-album" className="text-sm font-bold tracking-tight">
              Do alba
            </label>
            <select
              id="fotky-album"
              name="album"
              value={vybraneId}
              disabled={odesila || bezAlb}
              onChange={(udalost) => {
                onVyber(udalost.target.value);
              }}
              className="mt-1 block min-h-[44px] w-full rounded-md border-2 border-inkoust bg-white/80 px-3 text-base font-bold text-inkoust"
            >
              {bezAlb ? <option value="">Žádné album</option> : null}
              {alba.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.nazev}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={odesila || bezAlb}
            className={`${fotkyTlacitkoZaklad} ${fotkyHoverBgSmrkPlne} rounded-md border-2 border-inkoust bg-smrk px-4 text-sm font-bold text-papir disabled:opacity-60`}
          >
            {odesila ? "Nahrávám…" : "Nahrát"}
          </button>
        </div>
        <p role="status" className="text-sm text-inkoust/70">
          {hotovoShrnuti ??
            (pocet === 0 ? "Můžeš vybrat víc fotek najednou." : `Vybráno: ${pocet}.`)}
        </p>
        {chyba !== null ? (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {chyba}
          </p>
        ) : null}
      </form>

      <FotkyStavPanel
        rezim="nahravani"
        polozky={operacePolozky}
        viditelny={operacePolozky.length > 0}
        probiha={odesila}
      />
    </>
  );
}
