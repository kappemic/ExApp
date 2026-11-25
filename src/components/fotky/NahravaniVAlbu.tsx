import type { JSX } from "react";
import { kratkyNazevSouboru } from "../../lib/fotky-operace-stav";
import { useNahravaniAlba, zavriNahravani, zkusNahratZnovu } from "../../lib/nahravani-fotek";
import { fotkyTlacitkoPrimarni, fotkyTlacitkoSekundarni } from "./fotky-ui";
import FotkyStavPanel from "./FotkyStavPanel";

/** Průběh nahrávání nad otevřeným albem. Když se nic nenahrává, nekreslí nic. */
export default function NahravaniVAlbu({
  albumId,
  nadDialogem = false,
}: {
  albumId: string;
  /** Galerie výpravy je dialog, panel patří nad ni. */
  nadDialogem?: boolean;
}): JSX.Element | null {
  const stav = useNahravaniAlba(albumId);
  if (stav === null) return null;

  const maChyby = stav.fotky.some((fotka) => fotka.stav === "chyba");
  const kUzavreni = !stav.probiha && (maChyby || stav.chybaNahledu !== null);

  return (
    <FotkyStavPanel
      rezim="nahravani"
      polozky={stav.fotky.map((fotka) => ({
        id: fotka.id,
        popisek: kratkyNazevSouboru(fotka.soubor.name),
        stav: fotka.stav,
        ...(fotka.chyba !== undefined ? { chyba: fotka.chyba } : {}),
      }))}
      viditelny
      probiha={stav.probiha}
      nadDialogem={nadDialogem}
      paticka={
        kUzavreni ? (
          <>
            {stav.chybaNahledu !== null ? (
              <p role="alert" className="w-full text-xs leading-snug text-red-900/90">
                Fotky jsou nahrané. {stav.chybaNahledu}
              </p>
            ) : null}
            {maChyby ? (
              <button
                type="button"
                onClick={() => {
                  zkusNahratZnovu(albumId);
                }}
                className={fotkyTlacitkoPrimarni}
              >
                Zkusit znovu
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                zavriNahravani(albumId);
              }}
              className={fotkyTlacitkoSekundarni}
            >
              Zavřít
            </button>
          </>
        ) : undefined
      }
    />
  );
}
