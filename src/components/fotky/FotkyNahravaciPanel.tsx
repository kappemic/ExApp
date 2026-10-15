import { useEffect, useId, useRef, useState, type JSX } from "react";
import { type ApiAlbum } from "../../lib/alba-api";
import {
  fotkyDisclosureObsah,
  fotkyDisclosurePopover,
  fotkyDisclosureSpoustec,
  fotkyNahravaciObalRozbaleny,
  fotkyNahravaciObalSbaleny,
  fotkyNahravaciSpoustice,
  fotkySmazatAlbumDiscreet,
} from "./fotky-ui";
import NahratFotky from "./NahratFotky";
import NoveAlbumForm from "./NoveAlbumForm";

type SekceNahravani = "album" | "nahravani";

interface FotkyNahravaciPanelProps {
  isAdmin: boolean;
  alba: readonly ApiAlbum[];
  vybraneId: string;
  onVyber: (albumId: string) => void;
  onNahrano: () => void;
  onVytvoreno: (album: ApiAlbum | null, nazev: string) => void;
  /** One-shot expand after navigating from album detail (desktop „Nahrát do alba"). */
  rozbalitSekci?: SekceNahravani | null;
  onRozbaleno?: () => void;
  /** When set (vlastni album), admin sees a discreet delete control under upload actions. */
  albumKeSmazani?: ApiAlbum | null;
  onSmazatAlbum?: (spoustec: HTMLElement) => void;
}

/**
 * Collapsed-by-default upload / create album controls on /fotky (progressive disclosure).
 */
export default function FotkyNahravaciPanel({
  isAdmin,
  alba,
  vybraneId,
  onVyber,
  onNahrano,
  onVytvoreno,
  rozbalitSekci = null,
  onRozbaleno,
  albumKeSmazani = null,
  onSmazatAlbum,
}: FotkyNahravaciPanelProps): JSX.Element {
  const [rozbalena, setRozbalena] = useState<SekceNahravani | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const albumObsahId = useId();
  const nahravaniObsahId = useId();

  useEffect(() => {
    if (rozbalitSekci === null || rozbalitSekci === undefined) return;
    setRozbalena(rozbalitSekci);
    onRozbaleno?.();
    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [rozbalitSekci, onRozbaleno]);

  function prepni(sekce: SekceNahravani): void {
    setRozbalena((aktualni) => (aktualni === sekce ? null : sekce));
  }

  return (
    <section
      ref={panelRef}
      id="fotky-nahravani"
      data-fotky-nahravaci-panel
      data-fotky-nahravaci-sbaleno={rozbalena === null ? "true" : "false"}
      className={
        rozbalena === null
          ? fotkyNahravaciObalSbaleny
          : `${fotkyNahravaciObalRozbaleny}${rozbalena === "album" ? " relative pb-[9.5rem] sm:pb-[8.75rem]" : ""}`
      }
    >
      <div className={fotkyNahravaciSpoustice} data-fotky-nahravaci-spoustice>
        {isAdmin ? (
          <div className="relative shrink-0" data-fotky-nove-album-blok>
            <button
              type="button"
              data-fotky-rozbal-nove-album
              aria-expanded={rozbalena === "album"}
              aria-controls={albumObsahId}
              onClick={() => {
                prepni("album");
              }}
              className={fotkyDisclosureSpoustec}
            >
              <span>Nové album</span>
              <span aria-hidden="true">{rozbalena === "album" ? "▾" : "▸"}</span>
            </button>
            {rozbalena === "album" ? (
              <div id={albumObsahId} className={fotkyDisclosurePopover}>
                <NoveAlbumForm onVytvoreno={onVytvoreno} />
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          data-fotky-rozbal-nahravani
          aria-expanded={rozbalena === "nahravani"}
          aria-controls={nahravaniObsahId}
          onClick={() => {
            prepni("nahravani");
          }}
          className={fotkyDisclosureSpoustec}
        >
          <span>Nahrát fotky</span>
          <span aria-hidden="true">{rozbalena === "nahravani" ? "▾" : "▸"}</span>
        </button>
      </div>

      {rozbalena === "nahravani" ? (
        <div id={nahravaniObsahId} className={fotkyDisclosureObsah}>
          <NahratFotky
            alba={alba}
            vybraneId={vybraneId}
            onVyber={onVyber}
            onNahrano={onNahrano}
          />
        </div>
      ) : null}
      {isAdmin &&
      albumKeSmazani !== null &&
      albumKeSmazani !== undefined &&
      albumKeSmazani.druh === "vlastni" &&
      onSmazatAlbum !== undefined ? (
        <div className="mt-1 border-t border-inkoust/10 pt-1.5" data-fotky-smazat-album-blok>
          <button
            type="button"
            data-smazat-album
            aria-label={`Smazat album ${albumKeSmazani.nazev}`}
            onClick={(udalost) => {
              onSmazatAlbum(udalost.currentTarget);
            }}
            className={fotkySmazatAlbumDiscreet}
          >
            Smazat album „{albumKeSmazani.nazev}"…
          </button>
        </div>
      ) : null}
    </section>
  );
}
