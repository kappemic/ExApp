import { useRef, useState, type DragEvent, type JSX } from "react";
import { nahrajFotku, popisekPoctuFotek, type ApiAlbum } from "../../lib/alba-api";
import {
  kratkyNazevSouboru,
  type PolozkaStavuFotek,
} from "../../lib/fotky-operace-stav";
import FotkyStavPanel from "./FotkyStavPanel";

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

  async function odeslatSoubory(seznam: readonly File[]): Promise<void> {
    if (seznam.length === 0) {
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

  function prijmiSoubory(soubory: FileList | null): void {
    const seznam = soubory === null ? [] : Array.from(soubory).filter((soubor) => soubor.type.startsWith("image/"));
    setPocet(seznam.length);
    setChyba(null);
    setHotovoShrnuti(null);
    void odeslatSoubory(seznam);
  }

  function naPretazeni(udalost: DragEvent<HTMLLabelElement>): void {
    udalost.preventDefault();
    if (odesila || bezAlb) return;
    prijmiSoubory(udalost.dataTransfer.files);
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <label htmlFor="fotky-album" className="text-sm font-bold tracking-tight">
            Uložit do alba
          </label>
          <div className="fotky-album-vyber mt-1">
          <select
            id="fotky-album"
            name="album"
            value={vybraneId}
            disabled={odesila || bezAlb}
            onChange={(udalost) => {
              onVyber(udalost.target.value);
            }}
            className="block min-h-[44px] w-full rounded-md border-2 border-inkoust bg-papir px-3 text-base font-bold text-inkoust"
          >
            {bezAlb ? <option value="">Žádné album</option> : null}
            {alba.map((album) => (
              <option key={album.id} value={album.id}>
                {album.nazev}
              </option>
            ))}
          </select>
          </div>
        </div>
        <label
          htmlFor="fotky-soubory"
          onDragOver={(udalost) => {
            udalost.preventDefault();
          }}
          onDrop={naPretazeni}
          className={`flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-1 border-2 border-dashed border-inkoust bg-papir px-4 py-4 text-center ${
            odesila || bezAlb ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <span className="text-sm font-extrabold text-inkoust">
            {odesila ? "Nahrávám…" : "Přetáhni fotky sem"}
          </span>
          <span className="text-sm text-inkoust/70">nebo klepni a vyber je</span>
          <input
            ref={vstupRef}
            id="fotky-soubory"
            name="soubor"
            type="file"
            accept="image/*"
            multiple
            disabled={odesila || bezAlb}
            onChange={(udalost) => {
              prijmiSoubory(udalost.target.files);
            }}
            className="sr-only"
          />
        </label>
        <p role="status" className="text-sm text-inkoust/70">
          {hotovoShrnuti ??
            (pocet === 0
              ? "Můžeš vybrat celý víkend najednou. Fotky se nahrají hned po výběru."
              : odesila
                ? `Nahrávám ${pocet}…`
                : `Vybráno: ${pocet}.`)}
        </p>
        {chyba !== null ? (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {chyba}
          </p>
        ) : null}
      </div>

      <FotkyStavPanel
        rezim="nahravani"
        polozky={operacePolozky}
        viditelny={operacePolozky.length > 0}
        probiha={odesila}
      />
    </>
  );
}
