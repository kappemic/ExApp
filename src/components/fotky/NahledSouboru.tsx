import { useEffect, useState, type JSX } from "react";
import Ikona from "../Ikona";

/** Čtvercový náhled vybraného souboru. Formát, který prohlížeč neumí (HEIC), ukáže název. */
export default function NahledSouboru({
  soubor,
  className = "",
}: {
  soubor: File;
  className?: string;
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [rozbity, setRozbity] = useState(false);

  useEffect(() => {
    const adresa = URL.createObjectURL(soubor);
    setUrl(adresa);
    setRozbity(false);
    return () => {
      URL.revokeObjectURL(adresa);
    };
  }, [soubor]);

  if (rozbity) {
    return (
      <span
        className={`flex size-full flex-col items-center justify-center gap-1 bg-povrch-2 px-1 text-ink-3 ${className}`}
      >
        <Ikona nazev="image" className="size-5 shrink-0" />
        <span className="w-full truncate text-center text-[10px]">{soubor.name}</span>
      </span>
    );
  }
  if (url === null) return <span className={`block size-full bg-povrch-2 ${className}`} />;
  return (
    <img
      src={url}
      alt=""
      decoding="async"
      draggable={false}
      onError={() => setRozbity(true)}
      className={`size-full object-cover ${className}`}
    />
  );
}
