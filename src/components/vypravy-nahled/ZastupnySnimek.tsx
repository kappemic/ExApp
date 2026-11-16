import type { JSX } from "react";
import { urlZastupneFotky, useZastupnaFotka } from "../../lib/zastupne-fotky";
import PostupnaFotka from "../fotky/PostupnaFotka";
import KrajinaVypravy from "./KrajinaVypravy";

/**
 * Stand-in picture. A finished trip never borrows one: the photo stays
 * on the trip it was taken on. Until a foreign photo loads, the landscape shows.
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
  if (zdroj === null) {
    return <KrajinaVypravy id={id} datum={datum} />;
  }
  return (
    <PostupnaFotka
      src={urlZastupneFotky(zdroj)}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
