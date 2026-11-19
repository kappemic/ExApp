import type { JSX } from "react";
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
      className="rounded-2xl border border-linka bg-povrch p-4 shadow-denik"
    >
      {navrh.nahledUrl !== null && navrh.nahledUrl.length > 0 && (
        <img
          src={navrh.nahledUrl}
          alt=""
          className="mb-3 max-h-40 w-full rounded-xl border border-linka object-cover object-top"
        />
      )}
      <h2 className="font-display text-lg font-bold text-inkoust">{nazev}</h2>
      <p className="mt-1 text-sm text-mech">
        {autor}
        {formatCas(navrh.createdAt).length > 0 && ` · ${formatCas(navrh.createdAt)}`}
      </p>
      <p className="mt-0.5 text-sm text-ink-3">{popisekZdroje(navrh)}</p>
      {navrh.problem !== null && (
        <p className="mt-2 text-sm font-semibold text-inkoust">{POPIS_PROBLEMU[navrh.problem]}</p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          to={`/zpevnik/navrh/${navrh.id}`}
          state={{ odkud: `${location.pathname}${location.search}` }}
          onClick={onPredUpravou}
          className="nahled-press inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-pole bg-papir text-sm font-bold text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
        >
          Upravit
        </Link>
        {schvaluje && navrh.problem === null && (
          <button
            type="button"
            aria-label="Vydat"
            onClick={onVydat}
            className="nahled-press inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-smrk text-sm font-bold text-papir focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          >
            Vydat
          </button>
        )}
        {smiZahodit && (
          <button
            type="button"
            aria-label="Odmítnout"
            onClick={onZahodit}
            className="nahled-press inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-akcent/25 bg-akcent-100 text-sm font-bold text-akcent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          >
            Odmítnout
          </button>
        )}
      </div>
    </article>
  );
}