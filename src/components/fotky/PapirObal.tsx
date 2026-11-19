import { useEffect, useState, type JSX } from "react";
import Ikona from "../Ikona";
import PostupnaFotka from "./PostupnaFotka";

const LINIE =
  "repeating-linear-gradient(to bottom, transparent 0 23px, rgba(26,46,34,0.08) 23px 24px)";

interface PapirObalProps {
  src: string | null;
  /** Empty when the photo is decorative next to a visible name. */
  alt: string;
  className?: string;
  /** Prázdné album podle ExApp.pen: ikona a „Zatím žádné fotky“ místo linkovaného papíru. */
  prazdnyPopisek?: string;
}

/**
 * Cover frame. Missing or failed bytes stay as lined paper —
 * the browser's broken-image icon never shows.
 */
export default function PapirObal({
  src,
  alt,
  className = "aspect-[4/3]",
  prazdnyPopisek,
}: PapirObalProps): JSX.Element {
  const [rozbita, setRozbita] = useState<boolean>(false);

  useEffect(() => {
    setRozbita(false);
  }, [src]);

  const ukaz = src !== null && src.length > 0 && !rozbita;

  if (!ukaz && prazdnyPopisek !== undefined) {
    return (
      <div className={`relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden bg-povrch-2 ${className}`}>
        <Ikona nazev="image-plus" className="size-[22px] text-[#a9af9b]" />
        <span className="text-[12.5px] font-medium text-[#8a9179]">{prazdnyPopisek}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden bg-papir ${className}`}
      style={{ backgroundImage: LINIE }}
    >
      {ukaz ? (
        <PostupnaFotka
          src={src ?? ""}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            setRozbita(true);
          }}
        />
      ) : null}
    </div>
  );
}
