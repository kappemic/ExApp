import { useMemo, useState, type JSX, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { dlazdiceKolem } from "../../lib/dlazdice-mapy";
import { cestaVAplikaci, useNahledOdkazu, type NahledVeZprave } from "../../lib/nahled-odkazu";
import type { BodMapy } from "../../shared/odkazy";
import Ikona, { type NazevIkony } from "../Ikona";

const SIRKA_VYREZU = 420;

/** Výřez mapy z dlaždic OSM s bodem uprostřed, ztlumený do palety jako heatmapa. */
function VyrezMapy({ bod, vyska }: { bod: BodMapy; vyska: number }): JSX.Element {
  const { dlazdice } = useMemo(() => dlazdiceKolem(bod, SIRKA_VYREZU, vyska), [bod, vyska]);
  return (
    <span aria-hidden="true" className="relative block w-full overflow-hidden bg-povrch-2" style={{ height: vyska }}>
      <span className="absolute left-1/2 top-1/2 [filter:sepia(0.3)_saturate(0.6)]">
        {dlazdice.map((d) => (
          <img
            key={d.src}
            src={d.src}
            alt=""
            width={256}
            height={256}
            loading="lazy"
            draggable={false}
            className="absolute max-w-none opacity-80"
            style={{ left: d.x, top: d.y }}
          />
        ))}
      </span>
      {/* Hrot špendlíku sedí přesně na bodě. */}
      <svg
        viewBox="0 0 28 36"
        className="absolute left-1/2 top-1/2 h-9 w-7 -translate-x-1/2 -translate-y-full drop-shadow-[0_2px_4px_#1c261540]"
      >
        <path d="M14 35C14 35 26 22 26 13.5A12 12 0 0 0 2 13.5C2 22 14 35 14 35Z" className="fill-akcent stroke-povrch" strokeWidth={2} />
        <circle cx="14" cy="13.5" r="4.5" className="fill-povrch" />
      </svg>
      <span className="absolute bottom-0 right-0 rounded-tl-md bg-povrch/85 px-1.5 text-[9px] leading-[14px] text-ink-3">
        © OpenStreetMap
      </span>
    </span>
  );
}

function ikonaNahledu(nahled: NahledVeZprave): NazevIkony {
  if (nahled.druh === "mapa") return "map-pin";
  if (nahled.druh === "vyprava") return "compass";
  return "link";
}

function nadpisNahledu(nahled: NahledVeZprave): string {
  if (nahled.titulek !== null) return nahled.titulek;
  return nahled.druh === "mapa" ? "Místo na mapě" : nahled.web;
}

function podtitulNahledu(nahled: NahledVeZprave): string {
  if (nahled.druh === "vyprava") return nahled.popis ?? nahled.web;
  if (nahled.druh === "mapa") {
    const bod = nahled.bod === null ? null : `${nahled.bod.lat.toFixed(4)}, ${nahled.bod.lon.toFixed(4)}`;
    return [nahled.popis ?? nahled.web, bod].filter((cast) => cast !== null).join(" · ");
  }
  return nahled.web;
}

const KARTA =
  "bez-prejeti group block overflow-hidden rounded-xl border border-linka bg-povrch text-left text-inkoust no-underline hover:bg-zahlavi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]";

function Obal({ url, trida, children }: { url: string; trida: string; children: ReactNode }): JSX.Element {
  const cesta = cestaVAplikaci(url);
  if (cesta !== null) {
    return (
      <Link to={cesta} className={trida}>
        {children}
      </Link>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={trida}>
      {children}
    </a>
  );
}

/** Karta odkazu pod zprávou: mapa s bodem, obrázek stránky, nebo jen název a web. */
export function KartaOdkazu({ nahled, className = "" }: { nahled: NahledVeZprave; className?: string }): JSX.Element {
  const [rozbity, setRozbity] = useState(false);
  const obrazek = nahled.bod === null && nahled.obrazekUrl !== null && !rozbity ? nahled.obrazekUrl : null;
  return (
    <Obal url={nahled.url} trida={`${KARTA} ${className}`}>
      {nahled.bod !== null ? <VyrezMapy bod={nahled.bod} vyska={140} /> : null}
      {obrazek !== null ? (
        <img
          src={obrazek}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setRozbity(true)}
          className="block h-[140px] w-full bg-povrch-2 object-cover"
        />
      ) : null}
      <span className="flex min-w-0 items-center gap-2.5 p-2.5">
        <span
          aria-hidden="true"
          className={`flex size-8 shrink-0 items-center justify-center rounded-[9px] ${
            nahled.druh === "mapa" ? "bg-akcent-100 text-akcent" : "bg-mlha text-smrk"
          }`}
        >
          <Ikona nazev={ikonaNahledu(nahled)} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="line-clamp-2 text-[13px] font-semibold leading-[17px] [overflow-wrap:anywhere]">{nadpisNahledu(nahled)}</span>
          <span className="truncate text-[11.5px] text-ink-3">{podtitulNahledu(nahled)}</span>
        </span>
        <Ikona nazev="chevron-right" className="size-4 shrink-0 text-ink-3 transition-transform duration-150 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:translate-x-0.5" />
      </span>
    </Obal>
  );
}

/** Náhled ve zprávě. Dokud se načítá, drží místo, aby vlákno neposkočilo. */
export default function NahledOdkazu({ url, className = "" }: { url: string; className?: string }): JSX.Element | null {
  const nahled = useNahledOdkazu(url);
  if (nahled === null) return null;
  if (nahled === undefined) {
    return (
      <span
        aria-hidden="true"
        className={`block h-[54px] animate-pulse rounded-xl bg-povrch/60 motion-reduce:animate-none ${className}`}
      />
    );
  }
  return <KartaOdkazu nahled={nahled} className={className} />;
}

/** Náhled nad polem zprávy, než se odešle. Jde zavřít. */
export function NahledPredOdeslanim({ url, onZavrit }: { url: string; onZavrit: () => void }): JSX.Element | null {
  const nahled = useNahledOdkazu(url);
  if (nahled === null || nahled === undefined) return null;
  return (
    <div className="nabeh-nahoru relative mb-2 w-full max-w-[340px]">
      <KartaOdkazu nahled={nahled} />
      <button
        type="button"
        onClick={onZavrit}
        aria-label="Zavřít náhled odkazu"
        className="bez-prejeti absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-inkoust/70 text-povrch before:absolute before:-inset-2 before:content-[''] hover:bg-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
      >
        <Ikona nazev="x" className="size-3.5" />
      </button>
    </div>
  );
}
