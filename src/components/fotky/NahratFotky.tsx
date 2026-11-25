import { useState, type JSX } from "react";
import type { ApiAlbum } from "../../lib/alba-api";
import { nahrajDoAlba } from "../../lib/nahravani-fotek";
import Ikona from "../Ikona";
import VyberPole from "../VyberPole";
import { POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import NahravaciFormular from "./NahravaciFormular";

/** Hodnota volby „Nové album“ ve výběru alba. */
const NOVE_ALBUM = "__nove";

interface NahratFotkyProps {
  /** Náhled alba výpravy smí měnit jen admin. */
  isAdmin: boolean;
  alba: readonly ApiAlbum[];
  vybraneId: string;
  onVyber: (albumId: string) => void;
  /** Nahrávání začalo, okno se má zavřít a ukázat album. */
  onZacato: (albumId: string) => void;
  /** Založení alba přímo z výběru (telefon nemá vlastní tlačítko). */
  onNoveAlbum?: () => void;
  onZrusit: () => void;
}

/**
 * Upload sheet body: pick files, choose album, confirm with footer actions.
 * Progress is shown in the album itself, see `NahravaniVAlbu`.
 */
export default function NahratFotky({
  isAdmin,
  alba,
  vybraneId,
  onVyber,
  onZacato,
  onNoveAlbum,
  onZrusit,
}: NahratFotkyProps): JSX.Element {
  const [jakoNahled, setJakoNahled] = useState(false);
  const bezAlb = alba.length === 0;
  const album = alba.find((polozka) => polozka.id === vybraneId) ?? null;
  const expeditionId = album?.druh === "vyprava" ? album.expeditionId : null;

  return (
    <NahravaciFormular
      id="fotky-soubory"
      disabled={bezAlb}
      onZrusit={onZrusit}
      onNahrat={(soubory) => {
        if (vybraneId.length === 0) return "Vyber album, do kterého se fotky nahrají.";
        nahrajDoAlba(vybraneId, soubory, {
          prvniJakoNahledVypravy: jakoNahled && isAdmin ? expeditionId : null,
        });
        onZacato(vybraneId);
        return null;
      }}
    >
      <div className="min-w-0 min-[90rem]:flex min-[90rem]:items-center min-[90rem]:gap-2.5">
        <label htmlFor="fotky-album" className={`block ${POPISEK_POLE}`}>
          Album
        </label>
        <div className="mt-1.5 min-w-0 min-[90rem]:mt-0 min-[90rem]:flex-1">
          <VyberPole
            id="fotky-album"
            value={vybraneId}
            disabled={bezAlb && onNoveAlbum === undefined}
            onChange={(hodnota) => {
              if (hodnota === NOVE_ALBUM) onNoveAlbum?.();
              else onVyber(hodnota);
            }}
            prazdnyPopisek={bezAlb ? "Žádné album" : "Vyber album"}
            className={`${POLE_FORMULARE} min-[90rem]:!h-[38px] min-[90rem]:!rounded-[9px] min-[90rem]:!border-transparent min-[90rem]:!bg-povrch-2 min-[90rem]:!px-[11px] min-[90rem]:!text-xs min-[90rem]:font-medium`}
            volby={[
              ...(onNoveAlbum !== undefined ? [{ value: NOVE_ALBUM, popisek: "+ Nové album" }] : []),
              ...alba.map((polozka) => ({ value: polozka.id, popisek: polozka.nazev })),
            ]}
          />
        </div>
      </div>

      {isAdmin && expeditionId !== null ? (
        <label className="hidden cursor-pointer items-center gap-[9px] text-[11.5px] text-mech min-[90rem]:flex">
          <input
            type="checkbox"
            checked={jakoNahled}
            onChange={(udalost) => setJakoNahled(udalost.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-povrch peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-smrk ${
              jakoNahled ? "bg-smrk" : "border border-pole"
            }`}
          >
            {jakoNahled ? <Ikona nazev="check" className="size-[11px]" tloustka={3} /> : null}
          </span>
          Použít první fotku jako náhled alba
        </label>
      ) : null}
    </NahravaciFormular>
  );
}
