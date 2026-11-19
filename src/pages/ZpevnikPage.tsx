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
import { jeKnihaUlozena, nactiKnihu, smazUlozenouKnihu, stahniKnihu } from "../lib/zpevnik-api";
import { obsahujeHledani, seradPisne, type ApiZpevnikPisen } from "../shared/zpevnik";

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
  const [abecedne, setAbecedne] = useState(true);
  const [dotaz, setDotaz] = useState("");
  const [kategorie, setKategorie] = useState<KategorieFiltru>("vsechny");
  const [limit, setLimit] = useState(VELIKOST_STRANKY);
  const [nacitani, setNacitani] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zTelefonu, setZTelefonu] = useState(false);
  const [ulozeno, setUlozeno] = useState(false);
  const [stahuje, setStahuje] = useState(false);
  const [hlaska, setHlaska] = useState<string | null>(null);
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
      } else setChyba(vysledek.chyba);
      setUlozeno(jeKnihaUlozena());
      setNacitani(false);
    })();
    return () => {
      zive = false;
    };
  }, []);

  useEffect(() => {
    setLimit(VELIKOST_STRANKY);
  }, [dotaz, kategorie]);

  async function stahnout(): Promise<void> {
    setStahuje(true);
    setHlaska(null);
    const vysledek = await stahniKnihu();
    setStahuje(false);
    if (!vysledek.ok) {
      setHlaska(vysledek.chyba);
      return;
    }
    setPisne(seradPisne(vysledek.pisne));
    setPisneServer(vysledek.pisne);
    setChyba(null);
    setZTelefonu(false);
    setUlozeno(true);
    setHlaska("Zpěvník je v telefonu. Bez sítě se otevře tahle kopie.");
  }

  function smazat(): void {
    smazUlozenouKnihu();
    setUlozeno(false);
    setHlaska("Kopie z telefonu je smazaná.");
  }

  const kategorieVidiData = kategorie === "vsechny";

  const nalezene = useMemo(() => {
    if (!kategorieVidiData) return [];
    const zdroj = abecedne ? pisne : pisneServer;
    return zdroj.filter((pisen) => obsahujeHledani(pisen.nazev, pisen.autor, dotaz));
  }, [pisne, pisneServer, abecedne, dotaz, kategorieVidiData]);

  const viditelne = nalezene.slice(0, limit);
  const zbyva = nalezene.length - viditelne.length;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-8 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <header className="flex items-center justify-between gap-3 min-[90rem]:items-end">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[0.98] min-[90rem]:tracking-[-1.4px]">
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

      {(zTelefonu || hlaska !== null) && (
        <p className="mt-4 text-sm text-mech">
          {zTelefonu && "Teď čteš kopii z telefonu. Návrhy v ní nejsou."}
          {zTelefonu && hlaska !== null && " "}
          {hlaska}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <button
          type="button"
          className="text-mech underline-offset-2 hover:text-inkoust hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
          disabled={stahuje}
          onClick={() => void stahnout()}
        >
          {stahuje ? "Stahuji…" : ulozeno ? "Aktualizovat v telefonu" : "Stáhnout do telefonu"}
        </button>
        {ulozeno && (
          <button
            type="button"
            className="text-mech underline-offset-2 hover:text-inkoust hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
            onClick={smazat}
            disabled={stahuje}
          >
            Smazat z telefonu
          </button>
        )}
      </div>

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
        <ul className="m-0 mt-4 list-none divide-y divide-linka overflow-hidden rounded-2xl border border-linka bg-povrch p-0 shadow-jemny min-[90rem]:mt-5">
          {viditelne.map((pisen, index) => (
            <ZpevnikRadekKnihy key={pisen.id} poradi={index + 1} pisen={pisen} />
          ))}
        </ul>
      )}

      {kategorieVidiData && zbyva > 0 && (
        <button
          type="button"
          onClick={() => setLimit((stav) => stav + VELIKOST_STRANKY)}
          className="nahled-press mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-linka bg-povrch px-4 text-sm font-semibold text-mech hover:bg-povrch-2"
        >
          Načíst dalších 12 písní
          <Ikona nazev="chevron-down" className="size-4" />
        </button>
      )}

      <SpodniSheet otevreno={navrhOtevren} titulek="Návrh písně" onZavrit={() => setNavrhOtevren(false)}>
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