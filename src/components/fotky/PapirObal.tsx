import { useEffect, useState, type JSX } from "react";

const LINIE =
  "repeating-linear-gradient(to bottom, transparent 0 23px, rgba(26,46,34,0.08) 23px 24px)";

interface PapirObalProps {
  src: string | null;
  /** Empty when the photo is decorative next to a visible name. */
  alt: string;
  className?: string;
}

/**
 * Cover frame. Missing or failed bytes stay as lined paper —
 * the browser's broken-image icon never shows.
 */
export default function PapirObal({
  src,
  alt,
  className = "aspect-[4/3]",
}: PapirObalProps): JSX.Element {
  const [rozbita, setRozbita] = useState<boolean>(false);

  useEffect(() => {
    setRozbita(false);
  }, [src]);

  const ukaz = src !== null && src.length > 0 && !rozbita;

  return (
    <div
      className={`relative w-full overflow-hidden bg-papir ${className}`}
      style={{ backgroundImage: LINIE }}
    >
      {ukaz ? (
        <img
          src={src}
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
