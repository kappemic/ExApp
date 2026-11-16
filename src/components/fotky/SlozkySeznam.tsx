import { useState, type JSX } from "react";
import { Link } from "react-router-dom";
import {
  popisekDruhu,
  popisekPoctuFotek,
  type ApiAlbum,
} from "../../lib/alba-api";
import { rozdelAlbaSidebar } from "../../lib/sbaleny-seznam";
import { FOTKY_FOCUS, fotkyHoverBgLinka, fotkyStisk } from "./fotky-ui";

interface SlozkySeznamProps {
  alba: readonly ApiAlbum[];
  aktivniId: string | undefined;
}

/**
 * Scrollable album list for the Fotky master–detail layout (lg+).
 * Expedition albums collapse after the first few. User albums and trash stay visible.
 * Markup exposes the „Složky“ label for layout contract tests.
 */
export default function SlozkySeznam({ alba, aktivniId }: SlozkySeznamProps): JSX.Element {
  const [vysunuto, setVysunuto] = useState(false);
  const rozdelene = rozdelAlbaSidebar(alba, aktivniId);

  return (
    <nav
      aria-label="Složky"
      className="flex min-h-0 flex-col rounded-lg border-2 border-inkoust bg-white/60 shadow-denik"
    >
      <div className="border-b-2 border-inkoust px-3 py-2.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-mech">Složky</h2>
      </div>
      <ul className="max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain p-2">
        {rozdelene.vypravyViditelne.map((album) => (
          <PolozkaSlozky key={`${album.druh}:${album.id}`} album={album} aktivni={album.id === aktivniId} />
        ))}
        {rozdelene.vypravySkryte.length > 0 ? (
          <li className="min-w-0 py-1">
            <button
              type="button"
              data-slozky-vysunout-vypravy
              aria-expanded={vysunuto}
              onClick={() => setVysunuto((pred) => !pred)}
              className={`${fotkyStisk} ${FOTKY_FOCUS} flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border-2 border-dashed border-inkoust/35 px-3 text-left text-sm font-bold text-mech`}
            >
              <span>
                {vysunuto
                  ? "Zasunout výpravy"
                  : `Vysunout další výpravy (${rozdelene.vypravySkryte.length})`}
              </span>
              <span aria-hidden="true">{vysunuto ? "▾" : "▸"}</span>
            </button>
          </li>
        ) : null}
        {vysunuto
          ? rozdelene.vypravySkryte.map((album) => (
              <PolozkaSlozky
                key={`${album.druh}:${album.id}`}
                album={album}
                aktivni={album.id === aktivniId}
              />
            ))
          : null}
        {rozdelene.vlastni.map((album) => (
          <PolozkaSlozky key={`${album.druh}:${album.id}`} album={album} aktivni={album.id === aktivniId} />
        ))}
        {rozdelene.kos.map((album) => (
          <PolozkaSlozky key={`${album.druh}:${album.id}`} album={album} aktivni={album.id === aktivniId} />
        ))}
      </ul>
    </nav>
  );
}

function PolozkaSlozky({
  album,
  aktivni,
}: {
  album: ApiAlbum;
  aktivni: boolean;
}): JSX.Element {
  return (
    <li className="min-w-0">
      <Link
        to={`/fotky/${album.id}`}
        aria-current={aktivni ? "page" : undefined}
        className={`${fotkyStisk} flex min-h-[44px] min-w-0 flex-col gap-0.5 rounded-md border-2 px-3 py-2.5 text-left transition-[background-color,border-color,opacity] duration-[160ms] ease-out motion-reduce:transition-none ${FOTKY_FOCUS} ${
          aktivni
            ? "border-inkoust bg-papir shadow-denik"
            : `border-transparent bg-transparent ${fotkyHoverBgLinka} [@media(hover:hover)_and_(pointer:fine)]:hover:border-inkoust/25`
        }`}
      >
        <span
          className={`text-[11px] font-bold uppercase tracking-wide ${
            album.druh === "kos" ? "text-jantar" : "text-mech"
          }`}
        >
          {popisekDruhu(album.druh)}
        </span>
        <span className="break-words text-sm font-bold leading-snug tracking-tight text-inkoust">
          {album.nazev}
        </span>
        <span className="text-xs text-inkoust/65">{popisekPoctuFotek(album.pocetFotek)}</span>
      </Link>
    </li>
  );
}
