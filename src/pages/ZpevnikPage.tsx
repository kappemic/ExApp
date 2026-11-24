import { useEffect, useMemo, useState, type JSX } from "react";
import Ikona from "../components/Ikona";
import { useNavigate } from "react-router-dom";
import PrazdnyStav from "../components/PrazdnyStav";
import { IkonaLupa, IkonaNota } from "../components/SeznamIkony";
import SpodniSheet from "../components/shell/SpodniSheet";
import { NavrhPisneForm } from "../components/zpevnik/NavrhPisneForm";
import { ZpevnikChip, ZpevnikChipLista } from "../components/zpevnik/ZpevnikChipy";
import { ZpevnikHledani } from "../components/zpevnik/ZpevnikHledani";
import { ZpevnikRadekKnihy } from "../components/zpevnik/ZpevnikRadekKnihy";
import { nactiKnihu, stahniKnihu } from "../lib/zpevnik-api";
import { obsahujeHledani, seradPisne, type ApiZpevnikPisen } from "../shared/zpevnik";
import { useNabeh } from "../lib/pohyb";

/** Client slice of the book already loaded. The API has no paging. */
const VELIKOST_STRANKY = 12;

type KategorieFiltru = "vsechny" | "taborove" | "klubove";

const KATEGORIE: readonly { id: KategorieFiltru; popisek: string }[] = [
  { id: "vsechny", popisek: "Všechny" },
  { id: "taborove", popisek: "Táborové" },
  { id: "klubove", popisek: "Klubové" },
];

export default function ZpevnikPage(): JSX.Element {
  const navigate = useNavigate();
  const [pisne, setPisne] = useState<ApiZpevnikPisen[]>([]);
  const [pisneServer, setPisneServer] = useState<ApiZpevnikPisen[]>([]);
  const [abecedne, setAbecedne] = useState(false);
  const [dotaz, setDotaz] = useState("");
  const [kategorie, setKategorie] = useState<KategorieFiltru>("vsechny");
  const [limit, setLimit] = useState(VELIKOST_STRANKY);
  const [nacitani, setNacitani] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zTelefonu, setZTelefonu] = useState(false);
  const seznamRef = useNabeh<HTMLUListElement>(`${kategorie}-${String(abecedne)}-${String(nacitani)}`, "zadna");
  const [navrhOtevren, setNavrhOtevren] = useState(false);

  useEffect(() => {
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiKnihu();
      if (!zive) return;
      if (vysledek.ok) {
        setPisne(seradPisne(vysledek.pisne));
        setPisneServer(vysledek.pisne);
        setZTelefonu(vysledek.zdroj === "telefon");
        // Kopie pro čtení bez sítě se ukládá sama, tlačítko návrh nemá.
        if (vysledek.zdroj !== "telefon") void stahniKnihu();
      } else setChyba(vysledek.chyba);
      setNacitani(false);
    })();
    return () => {
      zive = false;
    };
  }, []);

  useEffect(() => {
    setLimit(VELIKOST_STRANKY);
  }, [dotaz, kategorie]);

  const kategorieVidiData = kategorie === "vsechny";

  const nalezene = useMemo(() => {
    if (!kategorieVidiData) return [];
    const zdroj = abecedne ? pisne : pisneServer;
    return zdroj.filter((pisen) => obsahujeHledani(pisen.nazev, pisen.autor, dotaz));
  }, [pisne, pisneServer, abecedne, dotaz, kategorieVidiData]);

  const viditelne = nalezene.slice(0, limit);
  const zbyva = nalezene.length - viditelne.length;

  return (
    <main className="mx-auto w-full max-w-[46rem] px-5 pb-6 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <header className="flex items-center justify-between gap-3 min-[90rem]:items-end">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
            Zpěvník
          </h1>
          <p className="text-xs text-ink-3 min-[90rem]:hidden">
            {nacitani ? "Načítám…" : `${pisne.length} písní`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="hidden w-[232px] min-[90rem]:block">
            <ZpevnikHledani id="hledani-zpevniku-pc" value={dotaz} onChange={setDotaz} />
          </div>
          <button
            type="button"
            onClick={() => setNavrhOtevren(true)}
            className="nahled-press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-smrk px-3.5 text-[13.5px] font-semibold text-papir hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-[46px] min-[90rem]:gap-2 min-[90rem]:px-[18px] min-[90rem]:text-sm"
          >
            <Ikona nazev="plus" className="size-4" />
            <span className="min-[90rem]:hidden">Přidat</span>
            <span className="hidden min-[90rem]:inline">Přidat píseň</span>
          </button>
        </div>
      </header>

      <div className="mt-5 flex flex-col gap-5 min-[90rem]:mt-8">
        <div className="min-[90rem]:hidden">
          <ZpevnikHledani id="hledani-zpevniku" value={dotaz} onChange={setDotaz} />
        </div>
        <div className="flex items-center justify-between gap-3 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4">
          <ZpevnikChipLista>
            {KATEGORIE.map((polozka) => (
              <ZpevnikChip
                key={polozka.id}
                vybrany={kategorie === polozka.id}
                onClick={() => setKategorie(polozka.id)}
              >
                {polozka.popisek}
              </ZpevnikChip>
            ))}
            <span className="hidden min-[90rem]:contents">
              <ZpevnikChip vybrany={abecedne} onClick={() => setAbecedne((pred) => !pred)}>
                Podle abecedy
              </ZpevnikChip>
            </span>
          </ZpevnikChipLista>
          <p className="hidden shrink-0 text-[13px] font-medium text-ink-3 min-[90rem]:block">
            {nacitani ? "" : `${pisne.length} písní`}
          </p>
        </div>
      </div>

      {zTelefonu && <p className="mt-4 text-[13px] text-mech">Teď čteš kopii z telefonu. Návrhy v ní nejsou.</p>}

      {chyba !== null && <p className="mt-6 text-inkoust">{chyba}</p>}
      {nacitani && chyba === null && <p className="mt-8 text-mech">Načítám zpěvník…</p>}

      {!nacitani && chyba === null && !kategorieVidiData && (
        <PrazdnyStav
          className="mt-6"
          ikona={<IkonaNota />}
          nadpis={kategorie === "taborove" ? "Táborové písně tu zatím nejsou" : "Klubové písně tu zatím nejsou"}
          text="Ostatní písně najdeš mezi všemi."
          akce={{ popisek: "Zobrazit všechny", onClick: () => setKategorie("vsechny"), varianta: "vedlejsi" }}
        />
      )}

      {!nacitani && chyba === null && kategorieVidiData && nalezene.length === 0 &&
        (dotaz.trim().length > 0 ? (
          <PrazdnyStav
            className="mt-6"
            ikona={<IkonaLupa />}
            nadpis="Nic jsme nenašli"
            text={`Pro „${dotaz.trim()}“ ve zpěvníku nic není.`}
            akce={{ popisek: "Zrušit hledání", onClick: () => setDotaz(""), varianta: "vedlejsi" }}
          />
        ) : (
          <PrazdnyStav
            className="mt-6"
            ikona={<IkonaNota />}
            nadpis="Zatím žádná píseň"
            text="Až někdo navrhne první píseň a vedoucí ji vydá, objeví se tady."
            akce={{ popisek: "Navrhnout píseň", onClick: () => setNavrhOtevren(true) }}
          />
        ))}

      {kategorieVidiData && viditelne.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-linka bg-povrch shadow-karta min-[90rem]:mt-8">
          <ul ref={seznamRef} className="m-0 list-none divide-y divide-linka p-0">
            {viditelne.map((pisen, index) => (
              <ZpevnikRadekKnihy key={pisen.id} poradi={index + 1} pisen={pisen} />
            ))}
          </ul>
          {zbyva > 0 ? (
            <button
              type="button"
              onClick={() => setLimit((stav) => stav + VELIKOST_STRANKY)}
              className="bez-prejeti hidden h-[50px] w-full items-center justify-center border-t border-linka bg-zahlavi text-[12.5px] font-semibold text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk min-[90rem]:flex"
            >
              Načíst dalších 12 písní
            </button>
          ) : null}
        </div>
      )}

      {kategorieVidiData && zbyva > 0 && (
        <button
          type="button"
          onClick={() => setLimit((stav) => stav + VELIKOST_STRANKY)}
          className="nahled-press mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-povrch-2 px-4 text-[13.5px] font-semibold text-mech min-[90rem]:hidden"
        >
          Načíst dalších 12 písní
          <Ikona nazev="chevron-down" className="size-4" />
        </button>
      )}

      <SpodniSheet otevreno={navrhOtevren} titulek="Návrh písně" sirka={560} onZavrit={() => setNavrhOtevren(false)}>
        <NavrhPisneForm
          onZavrit={() => setNavrhOtevren(false)}
          onHotovo={() => {
            setNavrhOtevren(false);
            void navigate("/zpevnik/fronta");
          }}
        />
      </SpodniSheet>
    </main>
  );
}