import type { JSX } from "react";
import Ikona, { type NazevIkony } from "../Ikona";
import { Link, type Location } from "react-router-dom";
import { pocetRadkuLyriky, type ApiZpevnikNavrh } from "../../shared/zpevnik";

const POPIS_PROBLEMU: Record<string, string> = {
  chybi_autor: "Chybí autor",
  chybi_text: "Text se nepovedlo přečíst",
  spatne_akordy: "Akordy nesedí na text",
  duplicita: "Tahle píseň už ve zpěvníku je",
};

/** „ručně“, „z fotky“, „z PDF“ a zvlášť počet řádků. */
function zdrojNavrhu(navrh: ApiZpevnikNavrh): { popisek: string; ikona: NazevIkony } {
  if (navrh.nahledUrl !== null && navrh.nahledUrl.length > 0) {
    const pdf = /\.pdf(\?|$)/i.test(navrh.nahledUrl ?? "");
    return pdf ? { popisek: "z PDF", ikona: "file-text" } : { popisek: "z fotky", ikona: "image" };
  }
  return { popisek: "ručně", ikona: "music" };
}

function pocetRadku(navrh: ApiZpevnikNavrh): string {
  const radku = pocetRadkuLyriky(navrh.telo);
  return `${radku} ${radku === 1 ? "řádek" : radku >= 2 && radku <= 4 ? "řádky" : "řádků"}`;
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

  const zdroj = zdrojNavrhu(navrh);
  const kdy = formatCas(navrh.createdAt);
  const kdo = kdy.length > 0 ? `${autor} · ${kdy}` : autor;
  return (
    <article
      id={`navrh-${navrh.id}`}
      className="flex flex-col gap-2.5 rounded-2xl border border-linka bg-povrch p-4 shadow-jemny min-[90rem]:flex-row min-[90rem]:items-center min-[90rem]:gap-4 min-[90rem]:rounded-none min-[90rem]:border-0 min-[90rem]:bg-transparent min-[90rem]:px-5 min-[90rem]:shadow-none"
    >
      <span className="relative hidden h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-linka bg-povrch-2 text-ink-3 min-[90rem]:flex">
        {navrh.nahledUrl !== null && navrh.nahledUrl.length > 0 ? (
          <img src={navrh.nahledUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        ) : (
          <Ikona nazev={zdroj.ikona} className="size-4" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 min-[90rem]:gap-[3px]">
        <Link
          to={`/zpevnik/navrh/${navrh.id}`}
          state={{ odkud: `${location.pathname}${location.search}` }}
          onClick={onPredUpravou}
          className="truncate font-display text-lg font-bold text-inkoust hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:font-sans min-[90rem]:text-[14.5px] min-[90rem]:font-semibold"
        >
          {nazev}
        </Link>
        <p className="text-[12.5px] text-ink-3 min-[90rem]:hidden">{kdo}</p>
        <p className="text-[12.5px] text-mech min-[90rem]:hidden">
          {zdroj.popisek} · {pocetRadku(navrh)}
        </p>
        <p className="hidden items-center gap-2 text-[11.5px] text-ink-3 min-[90rem]:flex">
          {kdo}
          <span className="rounded-full bg-povrch-2 px-[7px] py-0.5 text-[9.5px] font-semibold">{zdroj.popisek}</span>
          <span className="text-ink-5">{pocetRadku(navrh)}</span>
        </p>
        {navrh.problem !== null && (
          <p className="text-xs font-semibold text-akcent">{POPIS_PROBLEMU[navrh.problem]}</p>
        )}
      </div>
      <div className="flex gap-2">
        {schvaluje && navrh.problem === null && (
          <button
            type="button"
            aria-label="Vydat"
            onClick={onVydat}
            className="nahled-press relative inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-smrk px-3.5 text-[13.5px] font-semibold text-povrch before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[''] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-9 min-[90rem]:flex-none min-[90rem]:rounded-[9px] min-[90rem]:text-[12.5px]"
          >
            <Ikona nazev="check" className="hidden size-[13px] min-[90rem]:block" />
            Vydat
          </button>
        )}
        {smiZahodit && (
          <button
            type="button"
            aria-label="Odmítnout"
            onClick={onZahodit}
            className="nahled-press relative inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-akcent-100 px-3 text-[13.5px] font-semibold text-akcent before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-9 min-[90rem]:flex-none min-[90rem]:rounded-[9px] min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-transparent min-[90rem]:text-[12.5px] min-[90rem]:font-medium min-[90rem]:text-ink-3 min-[90rem]:hover:text-akcent"
          >
            Odmítnout
          </button>
        )}
      </div>
    </article>
  );
}
