import type { JSX } from "react";
import Ikona from "../Ikona";
import { Link, type Location } from "react-router-dom";
import { pocetRadkuLyriky, type ApiZpevnikNavrh } from "../../shared/zpevnik";

const POPIS_PROBLEMU: Record<string, string> = {
  chybi_autor: "Chybí autor",
  chybi_text: "Text se nepovedlo přečíst",
  spatne_akordy: "Akordy nesedí na text",
  duplicita: "Tahle píseň už ve zpěvníku je",
};

function popisekZdroje(navrh: ApiZpevnikNavrh): string {
  const radku = pocetRadkuLyriky(navrh.telo);
  const radky = radku === 1 ? "řádek" : radku >= 2 && radku <= 4 ? "řádky" : "řádků";
  if (navrh.nahledUrl === null || navrh.nahledUrl.length === 0) {
    return `ručně · ${radku} ${radky}`;
  }
  return `ze souboru · ${radku} ${radky}`;
}

function formatCas(iso: string): string {
  const cas = new Date(iso).getTime();
  if (Number.isNaN(cas)) return "";
  const rozdil = Date.now() - cas;
  const dni = Math.floor(rozdil / (24 * 60 * 60 * 1000));
  if (dni < 1) return "dnes";
  if (dni === 1) return "včera";
  if (dni < 7) return `před ${dni} dny`;
  return new Date(iso).toLocaleDateString("cs-CZ");
}

export function ZpevnikKartaNavrhu({
  navrh,
  schvaluje,
  smiZahodit,
  location,
  onVydat,
  onZahodit,
  onPredUpravou,
}: {
  navrh: ApiZpevnikNavrh;
  schvaluje: boolean;
  smiZahodit: boolean;
  location: Location;
  onVydat: () => void;
  onZahodit: () => void;
  onPredUpravou: () => void;
}): JSX.Element {
  const nazev = navrh.nazev.length > 0 ? navrh.nazev : "Bez názvu";
  const autor = navrh.autor.length > 0 ? navrh.autor : "Bez autora";

  return (
    <article
      id={`navrh-${navrh.id}`}
      className="flex flex-col gap-3 p-4 min-[90rem]:flex-row min-[90rem]:items-center min-[90rem]:gap-4 min-[90rem]:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 min-[90rem]:gap-4">
        <span className="relative flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-linka bg-povrch-2 text-ink-3">
          {navrh.nahledUrl !== null && navrh.nahledUrl.length > 0 ? (
            <img src={navrh.nahledUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          ) : (
            <Ikona nazev="music" className="size-4" />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <Link
            to={`/zpevnik/navrh/${navrh.id}`}
            state={{ odkud: `${location.pathname}${location.search}` }}
            onClick={onPredUpravou}
            className="truncate text-[14.5px] font-semibold text-inkoust hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          >
            {nazev}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
            <span>
              {autor}
              {formatCas(navrh.createdAt).length > 0 && ` · ${formatCas(navrh.createdAt)}`}
            </span>
            <span className="rounded-full bg-povrch-2 px-[7px] py-0.5 text-[9.5px] font-semibold">{popisekZdroje(navrh)}</span>
          </p>
          {navrh.problem !== null && (
            <p className="text-xs font-semibold text-akcent">{POPIS_PROBLEMU[navrh.problem]}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          to={`/zpevnik/navrh/${navrh.id}`}
          state={{ odkud: `${location.pathname}${location.search}` }}
          onClick={onPredUpravou}
          className="nahled-press inline-flex h-11 flex-1 items-center justify-center rounded-[9px] border border-linka text-[12.5px] font-medium text-mech hover:bg-povrch-2 min-[90rem]:hidden"
        >
          Upravit
        </Link>
        {schvaluje && navrh.problem === null && (
          <button
            type="button"
            aria-label="Vydat"
            onClick={onVydat}
            className="nahled-press inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-smrk px-3.5 text-[12.5px] font-semibold text-papir hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-9 min-[90rem]:flex-none"
          >
            <Ikona nazev="check" className="size-[13px]" />
            Vydat
          </button>
        )}
        {smiZahodit && (
          <button
            type="button"
            aria-label="Odmítnout"
            onClick={onZahodit}
            className="nahled-press inline-flex h-11 flex-1 items-center justify-center rounded-[9px] border border-linka px-3 text-[12.5px] font-medium text-ink-3 hover:bg-povrch-2 hover:text-akcent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-9 min-[90rem]:flex-none"
          >
            Odmítnout
          </button>
        )}
      </div>
    </article>
  );
}
