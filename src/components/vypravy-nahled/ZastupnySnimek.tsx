import { useState, type JSX } from "react";
import { urlZastupneFotky, useZastupnaFotka } from "../../lib/zastupne-fotky";
import PostupnaFotka from "../fotky/PostupnaFotka";
import KrajinaVypravy from "./KrajinaVypravy";

/** Fotky, které už se jednou ukázaly. Podruhé se neprolínají. */
const ukazaneAdresy = new Set<string>();

function FotkaPresKrajinu({ src }: { src: string }): JSX.Element {
  const [hotovo, setHotovo] = useState(() => ukazaneAdresy.has(src));
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
        hotovo ? "opacity-100" : "opacity-0"
      }`}
    >
      <PostupnaFotka
        src={src}
        alt=""
        onLoad={() => {
          ukazaneAdresy.add(src);
          setHotovo(true);
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

/**
 * Stand-in picture. A finished trip never borrows one: the photo stays
 * on the trip it was taken on. The landscape stays underneath until
 * the foreign photo has loaded.
 */
export default function ZastupnySnimek({
  id,
  datum,
  povolit,
}: {
  id: string;
  datum: string;
  povolit: boolean;
}): JSX.Element {
  const zdroj = useZastupnaFotka(id, povolit);
  const src = zdroj === null ? null : urlZastupneFotky(zdroj);
  return (
    <>
      <KrajinaVypravy id={id} datum={datum} />
      {src !== null ? <FotkaPresKrajinu key={src} src={src} /> : null}
    </>
  );
}
