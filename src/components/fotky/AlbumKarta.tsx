import type { JSX } from "react";
import { Link } from "react-router-dom";
import {
  popisekDruhu,
  popisekPoctuFotek,
  urlObaluAlba,
  type ApiAlbum,
} from "../../lib/alba-api";
import PapirObal from "./PapirObal";
import { fotkyHoverBgPapir, fotkyStisk } from "./fotky-ui";

interface AlbumKartaProps {
  album: ApiAlbum;
}

/** One album in the grid. Expedition and extra albums share the same card. */
export default function AlbumKarta({ album }: AlbumKartaProps): JSX.Element {
  const obal = urlObaluAlba(album);
  const druh = popisekDruhu(album.druh);
  const pocet = popisekPoctuFotek(album.pocetFotek);

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-lg border-2 border-inkoust bg-white/60 shadow-denik">
      <Link
        to={`/fotky/${album.id}`}
        className={`${fotkyStisk} ${fotkyHoverBgPapir} flex h-full min-h-[44px] flex-col transition-[transform,opacity,background-color] duration-[160ms] ease-out motion-reduce:transition-none`}
      >
        <PapirObal src={obal} alt="" />
        <div className="flex flex-1 flex-col gap-1 p-3">
          <p className="text-xs font-bold tracking-wide text-mech">{druh}</p>
          <h2 className="break-words text-base font-bold leading-snug tracking-tight">
            {album.nazev}
          </h2>
          <p className="text-sm text-inkoust/70">{pocet}</p>
        </div>
      </Link>
    </li>
  );
}
