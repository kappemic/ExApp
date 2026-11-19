import { useRef, useState, type DragEvent, type JSX } from "react";
import { nahrajFotku, popisekPoctuFotek, type ApiAlbum } from "../../lib/alba-api";
import {
  kratkyNazevSouboru,
  type PolozkaStavuFotek,
} from "../../lib/fotky-operace-stav";
import FotkyStavPanel from "./FotkyStavPanel";
import {
  fotkyHoverBgSmrk,
  fotkyTlacitkoPrimarni,
  fotkyTlacitkoSekundarni,
} from "./fotky-ui";

interface NahratFotkyProps {
  alba: readonly ApiAlbum[];
  vybraneId: string;
  onVyber: (albumId: string) => void;
  onNahrano: () => void;
  onZrusit: () => void;
}

/**
 * Upload sheet body: pick files, choose album, confirm with footer actions.
 */
export default function NahratFotky({
  alba,
  vybraneId,
  onVyber,
  onNahrano,
  onZrusit,
}: NahratFotkyProps): JSX.Element {
  const vstupRef = useRef<HTMLInputElement>(null);
  const [vybraneSoubory, setVybraneSoubory] = useState<readonly File[]>([]);
  const [odesila, setOdesila] = useState<boolean>(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [operacePolozky, setOperacePolozky] = useState<readonly PolozkaStavuFotek[]>([]);
  const bezAlb = alba.length === 0;

  async function odeslatSoubory(seznam: readonly File[]): Promise<void> {
    if (seznam.length === 0) {
      setChyba("Vyber aspoň jednu fotku.");
      return;
    }
    if (vybraneId.length === 0) {
      setChyba("Vyber album, do kterého se fotky nahrají.");
      return;
    }
    setOdesila(true);
    setChyba(null);
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
        prev.map((radek, i) => (i === index ? { ...radek, stav: "probiha" } : radek)),
      );
      const vysledek = await nahrajFotku(vybraneId, soubor);
      if (!vysledek.ok) {
        setOperacePolozky((prev) =>
          prev.map((radek, i) =>
            i === index ? { ...radek, stav: "chyba", chyba: vysledek.chyba } : radek,
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
        prev.map((radek, i) => (i === index ? { ...radek, stav: "hotovo" } : radek)),
      );
    }
    if (vstupRef.current !== null) vstupRef.current.value = "";
    setVybraneSoubory([]);
    setOdesila(false);
    onNahrano();
    onZrusit();
    window.setTimeout(() => {
      setOperacePolozky([]);
    }, 400);
  }

  function prijmiSoubory(soubory: FileList | null): void {
    const seznam =
      soubory === null ? [] : Array.from(soubory).filter((soubor) => soubor.type.startsWith("image/"));
    setVybraneSoubory(seznam);
    setChyba(null);
  }

  function naPretazeni(udalost: DragEvent<HTMLLabelElement>): void {
    udalost.preventDefault();
    if (odesila || bezAlb) return;
    prijmiSoubory(udalost.dataTransfer.files);
  }

  const pocet = vybraneSoubory.length;
  const popisekOdeslat =
    pocet === 0
      ? "Nahrát"
      : pocet === 1
        ? "Nahrát 1 fotku"
        : pocet < 5
          ? `Nahrát ${pocet} fotky`
          : `Nahrát ${pocet} fotek`;

  return (
    <div className="flex flex-col gap-4 pb-1">
      <p className="text-sm text-mech">
        {alba.find((polozka) => polozka.id === vybraneId)?.nazev ?? "Vyber album níže."}
      </p>

      <label
        htmlFor="fotky-soubory"
        onDragOver={(udalost) => {
          udalost.preventDefault();
        }}
        onDrop={naPretazeni}
        className={`flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-pole bg-papir px-4 py-6 text-center ${
          odesila || bezAlb ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <span className="text-sm font-semibold text-inkoust">Vyber fotky z telefonu</span>
        <span className="text-[12.5px] text-ink-3">JPG nebo PNG, max. 8 MB na fotku</span>
        <input
          ref={vstupRef}
          id="fotky-soubory"
          name="soubor"
          type="file"
          accept="image/jpeg,image/png,image/*"
          multiple
          disabled={odesila || bezAlb}
          onChange={(udalost) => {
            prijmiSoubory(udalost.target.files);
          }}
          className="sr-only"
        />
      </label>

      <div className="min-w-0">
        <label htmlFor="fotky-album" className="text-[11.5px] font-medium text-mech">
          Album
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
            className="block min-h-11 w-full rounded-[11px] border border-pole bg-papir px-3.5 text-base text-inkoust"
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

      {pocet > 0 ? (
        <p role="status" className="text-sm text-mech">
          Vybráno: {popisekPoctuFotek(pocet)}.
        </p>
      ) : null}

      {chyba !== null ? (
        <p role="alert" className="text-sm font-semibold text-akcent">
          {chyba}
        </p>
      ) : null}

      <FotkyStavPanel
        rezim="nahravani"
        polozky={operacePolozky}
        viditelny={operacePolozky.length > 0}
        probiha={odesila}
      />

      <div
        className="sticky bottom-0 -mx-4 flex gap-2 border-t border-pole bg-povrch px-4 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3"
        role="group"
        aria-label="Akce nahrání"
      >
        <button
          type="button"
          disabled={odesila}
          onClick={onZrusit}
          className={`${fotkyTlacitkoSekundarni} min-h-11 flex-1`}
        >
          Zrušit
        </button>
        <button
          type="button"
          disabled={odesila || pocet === 0 || bezAlb}
          onClick={() => {
            void odeslatSoubory(vybraneSoubory);
          }}
          className={`${fotkyTlacitkoPrimarni} ${fotkyHoverBgSmrk} min-h-11 flex-1`}
        >
          {odesila ? "Nahrávám…" : popisekOdeslat}
        </button>
      </div>
    </div>
  );
}