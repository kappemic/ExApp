import type { JSX } from "react";
import { Link } from "react-router-dom";
import { popisekPoctuFotek, urlObaluAlba, type ApiAlbum } from "../../lib/alba-api";
import type { VelikostAlbumu } from "../../lib/alba-prehled";
import PapirObal from "./PapirObal";
import { fotkyStisk } from "./fotky-ui";

interface AlbumKartaProps {
  album: ApiAlbum;
  /** Datum výpravy nebo „průběžně“ do řádku pod názvem. */
  datumRadek?: string | null;
  velikost?: VelikostAlbumu;
}

/** Dvě karty vedle velké jsou 16 : 9, velké tím vyjde přibližně 3 : 2. */
const OBAL_POCITAC: Record<VelikostAlbumu, string> = {
  bezna: "",
  velka: "min-[90rem]:aspect-auto min-[90rem]:h-0 min-[90rem]:min-h-[320px] min-[90rem]:grow",
  vedle: "min-[90rem]:aspect-[16/9]",
};

/**
 * Album v mřížce podle ExApp.pen. Telefon: karta, obal 3 : 2, název 13 px.
 * Počítač (1440+): obal se zaoblenými rohy bez rámečku, název s datem pod ním.
 */
export default function AlbumKarta({
  album,
  datumRadek = null,
  velikost = "bezna",
}: AlbumKartaProps): JSX.Element {
  const velka = velikost === "velka";
  const pocet = popisekPoctuFotek(album.pocetFotek);

  return (
    <li
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-linka bg-povrch shadow-karta max-[90rem]:has-[>a:focus-visible]:outline-2 max-[90rem]:has-[>a:focus-visible]:outline-offset-2 max-[90rem]:has-[>a:focus-visible]:outline-smrk min-[90rem]:overflow-visible min-[90rem]:border-0 min-[90rem]:bg-transparent min-[90rem]:shadow-none ${
        velka ? "min-[90rem]:col-span-2 min-[90rem]:row-span-2" : ""
      }`}
    >
      <Link
        to={`/fotky/${album.id}`}
        className={`${fotkyStisk} group flex min-h-[44px] flex-1 flex-col max-[90rem]:focus-visible:outline-none transition-[transform,opacity] duration-[160ms] ease-out motion-reduce:transition-none min-[90rem]:gap-3 min-[90rem]:rounded-2xl`}
      >
        <span className={`relative flex flex-col overflow-hidden min-[90rem]:rounded-2xl ${velka ? "min-[90rem]:grow" : ""}`}>
          <PapirObal
            src={urlObaluAlba(album)}
            alt=""
            prazdnyPopisek="Zatím žádné fotky"
            className={`aspect-[3/2] w-full shrink-0 min-[90rem]:transition-transform min-[90rem]:duration-300 min-[90rem]:ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:group-hover:scale-[1.02] ${OBAL_POCITAC[velikost]}`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 border-b border-black/[0.07] min-[90rem]:rounded-2xl min-[90rem]:border"
          />
        </span>
        <div className="flex flex-1 flex-col gap-[3px] p-2.5 min-[90rem]:flex-none min-[90rem]:gap-1 min-[90rem]:px-0.5 min-[90rem]:py-0">
          <h2
            className={`min-w-0 break-words font-sans text-[13px] font-semibold tracking-normal text-inkoust min-[90rem]:truncate ${
              velka
                ? "min-[90rem]:font-display min-[90rem]:text-2xl min-[90rem]:font-bold min-[90rem]:tracking-[-0.6px]"
                : "min-[90rem]:text-base min-[90rem]:tracking-[-0.1px]"
            }`}
          >
            {album.nazev}
          </h2>
          <p className="text-[11.5px] text-ink-3 min-[90rem]:text-[13px]">
            {datumRadek === null || datumRadek.length === 0 ? (
              pocet
            ) : (
              <>
                {/* Prázdné album to na počítači říká už obalem. */}
                <span className={album.pocetFotek === 0 ? "min-[90rem]:hidden" : undefined}>{pocet} · </span>
                {datumRadek}
              </>
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}
