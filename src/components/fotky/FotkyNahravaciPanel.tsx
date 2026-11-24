import { useEffect, useRef, useState, type JSX } from "react";
import { type ApiAlbum } from "../../lib/alba-api";
import { useAuth } from "../../hooks/useAuth";
import SpodniSheet from "../shell/SpodniSheet";
import { fotkyNahravaciObalSbaleny, fotkySmazatAlbumDiscreet } from "./fotky-ui";
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
  rozbalitSekci?: SekceNahravani | null;
  onRozbaleno?: () => void;
  albumKeSmazani?: ApiAlbum | null;
  onSmazatAlbum?: (spoustec: HTMLElement) => void;
  nahravaniOtevreno?: boolean;
  onNahravaniOtevreno?: (otevreno: boolean) => void;
  albumFormOtevreno?: boolean;
  onAlbumFormOtevreno?: (otevreno: boolean) => void;
}

/** Sheets for upload and new album; triggers live in FotkyPage header. */
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
  nahravaniOtevreno: nahravaniVne,
  onNahravaniOtevreno,
  albumFormOtevreno: albumFormVne,
  onAlbumFormOtevreno,
}: FotkyNahravaciPanelProps): JSX.Element {
  const { user } = useAuth();
  const prihlasen = user !== null;
  const [nahravaniVnitr, setNahravaniVnitr] = useState(false);
  const [albumFormVnitr, setAlbumFormVnitr] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const nahravaniOtevreno = nahravaniVne ?? nahravaniVnitr;
  const setNahravaniOtevreno = onNahravaniOtevreno ?? setNahravaniVnitr;
  const albumFormOtevreno = albumFormVne ?? albumFormVnitr;
  const setAlbumFormOtevreno = onAlbumFormOtevreno ?? setAlbumFormVnitr;

  useEffect(() => {
    if (rozbalitSekci === null || rozbalitSekci === undefined) return;
    if (rozbalitSekci === "nahravani" && !prihlasen) return;
    if (rozbalitSekci === "nahravani") {
      setNahravaniOtevreno(true);
    } else {
      setAlbumFormOtevreno(true);
    }
    onRozbaleno?.();
    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [onRozbaleno, prihlasen, rozbalitSekci, setAlbumFormOtevreno, setNahravaniOtevreno]);

  return (
    <section
      ref={panelRef}
      id="fotky-nahravani"
      data-fotky-nahravaci-panel
      data-fotky-nahravaci-sbaleno={!nahravaniOtevreno && !albumFormOtevreno ? "true" : "false"}
      className={fotkyNahravaciObalSbaleny}
    >
      <SpodniSheet
        otevreno={albumFormOtevreno}
        titulek="Přidat album"
        sirka={440}
        onZavrit={() => {
          setAlbumFormOtevreno(false);
        }}
      >
        <NoveAlbumForm
          onZrusit={() => {
            setAlbumFormOtevreno(false);
          }}
          onVytvoreno={(album, nazev) => {
            setAlbumFormOtevreno(false);
            onVytvoreno(album, nazev);
          }}
        />
      </SpodniSheet>

      <SpodniSheet
        otevreno={nahravaniOtevreno}
        titulek="Nahrát fotky"
        podtitul={alba.find((polozka) => polozka.id === vybraneId)?.nazev ?? "Vyber album níže."}
        onZavrit={() => {
          setNahravaniOtevreno(false);
        }}
      >
        <NahratFotky
          isAdmin={isAdmin}
          onNoveAlbum={
            isAdmin
              ? () => {
                  setNahravaniOtevreno(false);
                  setAlbumFormOtevreno(true);
                }
              : undefined
          }
          alba={alba}
          vybraneId={vybraneId}
          onVyber={onVyber}
          onNahrano={onNahrano}
          onZrusit={() => {
            setNahravaniOtevreno(false);
          }}
        />
      </SpodniSheet>

      {albumKeSmazani !== null &&
      albumKeSmazani !== undefined &&
      albumKeSmazani.druh === "vlastni" &&
      onSmazatAlbum !== undefined ? (
        <div className="mt-1 border-t border-pole pt-1.5" data-fotky-smazat-album-blok>
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