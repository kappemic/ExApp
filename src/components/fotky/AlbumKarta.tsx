import type { JSX } from "react";
import { Link } from "react-router-dom";
import { popisekPoctuFotek, urlObaluAlba, type ApiAlbum } from "../../lib/alba-api";
import Ikona from "../Ikona";
import PapirObal from "./PapirObal";
import { fotkyStisk } from "./fotky-ui";

interface AlbumKartaProps {
  album: ApiAlbum;
  /** Optional expedition date for the meta row (vypravová alba). */
  datumRadek?: string | null;
}

function popisekMetaAlba(album: ApiAlbum, datumRadek?: string | null): string {
  const pocet = popisekPoctuFotek(album.pocetFotek);
  if (album.druh === "vlastni") return `${pocet} · průběžně`;
  if (datumRadek !== undefined && datumRadek !== null && datumRadek.length > 0) {
    return `${pocet} · ${datumRadek}`;
  }
  return pocet;
}

/**
 * Album v mřížce podle ExApp.pen. Telefon: obal 108 px, název 13 px.
 * Počítač (1440+): obal 200 px, název 15,5 px se šipkou „↗“.
 */
export default function AlbumKarta({ album, datumRadek = null }: AlbumKartaProps): JSX.Element {
  const obal = urlObaluAlba(album);
  const meta = popisekMetaAlba(album, datumRadek);

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-linka bg-povrch">
      <Link
        to={`/fotky/${album.id}`}
        className={`${fotkyStisk} group flex h-full min-h-[44px] flex-col transition-[transform,opacity] duration-[160ms] ease-out motion-reduce:transition-none`}
      >
        <span className="relative block">
          <PapirObal
            src={obal}
            alt=""
            prazdnyPopisek="Zatím žádné fotky"
            className="h-[108px] w-full shrink-0 min-[90rem]:h-[200px]"
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-b border-black/[0.07]" />
        </span>
        <div className="flex flex-1 flex-col gap-[3px] p-2.5 min-[90rem]:gap-1.5 min-[90rem]:px-4 min-[90rem]:pb-4 min-[90rem]:pt-[15px]">
          <span className="flex min-w-0 items-center justify-between gap-2.5">
            <h2 className="min-w-0 break-words text-[13px] font-semibold leading-snug text-inkoust min-[90rem]:truncate min-[90rem]:text-[15.5px] min-[90rem]:tracking-[-0.1px]">
              {album.nazev}
            </h2>
            <Ikona nazev="arrow-up-right" className="hidden size-[15px] text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 min-[90rem]:block" />
          </span>
          <p className="text-[11.5px] text-ink-3 min-[90rem]:text-[12.5px]">{meta}</p>
        </div>
      </Link>
    </li>
  );
}
