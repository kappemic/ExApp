import { useRef, useState, type JSX } from "react";
import { nahrajFotku } from "../../lib/alba-api";
import { fotkyTlacitkoZaklad } from "./fotky-ui";

interface FotkyNahravaciIkonaProps {
  albumId: string;
  onNahrano: () => void;
}

/** Toolbar control: pick photos and upload them into this album. */
export default function FotkyNahravaciIkona({
  albumId,
  onNahrano,
}: FotkyNahravaciIkonaProps): JSX.Element {
  const vstupRef = useRef<HTMLInputElement>(null);
  const [probiha, setProbiha] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  async function nahrej(soubory: FileList | null): Promise<void> {
    if (soubory === null || soubory.length === 0) return;
    setProbiha(true);
    setChyba(null);
    const seznam = Array.from(soubory);
    let nahrano = 0;
    for (const soubor of seznam) {
      const vysledek = await nahrajFotku(albumId, soubor);
      if (!vysledek.ok) {
        setChyba(
          nahrano === 0
            ? vysledek.chyba
            : `Nahráno ${nahrano} z ${seznam.length}. ${vysledek.chyba}`,
        );
        setProbiha(false);
        if (nahrano > 0) onNahrano();
        if (vstupRef.current !== null) vstupRef.current.value = "";
        return;
      }
      nahrano += 1;
    }
    if (vstupRef.current !== null) vstupRef.current.value = "";
    setProbiha(false);
    onNahrano();
  }

  return (
    <>
      <button
        type="button"
        aria-label={probiha ? "Nahrávám fotky" : "Nahrát fotky"}
        title={probiha ? "Nahrávám…" : "Nahrát fotky"}
        disabled={probiha}
        onClick={() => {
          vstupRef.current?.click();
        }}
        className={`${fotkyTlacitkoZaklad} nahled-press h-11 w-11 rounded-lg border-2 border-okr bg-okr p-0 text-inkoust shadow-denik disabled:opacity-60`}
      >
        <IkonaNahrat />
      </button>
      <input
        ref={vstupRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(udalost) => {
          void nahrej(udalost.target.files);
        }}
      />
      {chyba !== null ? (
        <p role="alert" className="basis-full text-right text-xs font-semibold text-red-800">
          {chyba}
        </p>
      ) : null}
    </>
  );
}

function IkonaNahrat(): JSX.Element {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M12 16V6M8 9.5 12 5.5 16 9.5M5 19h14"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
