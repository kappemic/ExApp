import { useEffect, useRef, useState, type JSX } from "react";
import { useLocation } from "react-router-dom";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import { OdkazTlacitko, OdkazZpet, Tlacitko } from "../components/zpevnik/Tlacitka";
import { useAuth } from "../hooks/useAuth";
import { nactiNavrhy, nahrejSoubor, schvalNavrh, smazNavrh } from "../lib/zpevnik-api";
import type { ApiZpevnikNavrh } from "../shared/zpevnik";

const KLIC_MISTA = "exapp:zpevnik:fronta-misto";

function ulozMistoVeFronte(id: string): void {
  const zaznam = JSON.stringify({ y: window.scrollY, id });
  sessionStorage.setItem(KLIC_MISTA, zaznam);
}

function ctiMistoVeFronte(): { y: number; id: string } | null {
  const surove = sessionStorage.getItem(KLIC_MISTA);
  if (surove === null) return null;
  sessionStorage.removeItem(KLIC_MISTA);
  try {
    const data: unknown = JSON.parse(surove);
    if (typeof data !== "object" || data === null) return null;
    const y = (data as { y?: unknown }).y;
    const id = (data as { id?: unknown }).id;
    if (typeof y !== "number" || typeof id !== "string") return null;
    return { y, id };
  } catch {
    return null;
  }
}

const POPIS_PROBLEMU: Record<string, string> = {
  chybi_autor: "Chybí autor",
  chybi_text: "Text se nepovedlo přečíst",
  spatne_akordy: "Akordy nesedí na text",
  duplicita: "Tahle píseň už ve zpěvníku je",
};

function IkonaPalec({ dolu = false }: { dolu?: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`h-5 w-5 shrink-0 ${dolu ? "rotate-180" : ""}`}
    >
      <path d="M7 10v11" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

export default function ZpevnikFrontaPage(): JSX.Element {
  const { user } = useAuth();
  const schvaluje =
    user?.isAdmin === true || user?.isSuperadmin === true || user?.funkce === "vedeni";
  const [navrhy, setNavrhy] = useState<ApiZpevnikNavrh[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nahrava, setNahrava] = useState(false);
  const [nacteno, setNacteno] = useState(false);
  const [mazeVse, setMazeVse] = useState(false);
  const souborVstup = useRef<HTMLInputElement>(null);
  const location = useLocation();

  function odeber(id: string): void {
    setNavrhy((stav) => stav.filter((navrh) => navrh.id !== id));
  }

  function vrat(navrh: ApiZpevnikNavrh): void {
    setNavrhy((stav) => (stav.some((polozka) => polozka.id === navrh.id) ? stav : [navrh, ...stav]));
  }

  async function nacti(): Promise<void> {
    const vysledek = await nactiNavrhy();
    if (vysledek.ok) {
      setNavrhy(vysledek.navrhy);
      setChyba(null);
    } else {
      setChyba(vysledek.chyba);
    }
    setNacteno(true);
  }

  useEffect(() => {
    void nacti();
  }, []);

  useEffect(() => {
    if (!nacteno) return;
    const misto = ctiMistoVeFronte();
    if (misto === null) return;
    const vratit = (): void => {
      window.scrollTo(0, Math.max(0, misto.y));
      const karta = document.getElementById(`navrh-${misto.id}`);
      if (karta !== null && Math.abs(window.scrollY - misto.y) > 80) {
        karta.scrollIntoView({ block: "center" });
      }
    };
    window.setTimeout(vratit, 0);
  }, [nacteno]);

  async function schval(id: string): Promise<void> {
    const navrh = navrhy.find((polozka) => polozka.id === id);
    odeber(id);
    const vysledek = await schvalNavrh(id);
    if (!vysledek.ok) {
      if (navrh !== undefined) vrat(navrh);
      setChyba(vysledek.chyba);
    }
  }

  async function zahod(id: string): Promise<void> {
    const navrh = navrhy.find((polozka) => polozka.id === id);
    odeber(id);
    const vysledek = await smazNavrh(id);
    if (!vysledek.ok) {
      if (navrh !== undefined) vrat(navrh);
      setChyba(vysledek.chyba);
    }
  }

  async function zverejniVse(): Promise<void> {
    const hotove = navrhy.filter((navrh) => navrh.problem === null);
    if (hotove.length === 0) {
      setChyba("Nejdřív doplň návrhy, které ještě nejdou zveřejnit.");
      return;
    }
    setChyba(null);
    setNavrhy((stav) => stav.filter((navrh) => navrh.problem !== null));
    const selhani: ApiZpevnikNavrh[] = [];
    await Promise.all(
      hotove.map(async (navrh) => {
        const vysledek = await schvalNavrh(navrh.id);
        if (!vysledek.ok) selhani.push(navrh);
      }),
    );
    if (selhani.length > 0) {
      setNavrhy((stav) => [...selhani, ...stav]);
      setChyba("Některé písně se nepodařilo zveřejnit.");
    }
  }

  async function zamitniVse(): Promise<void> {
    const vse = navrhy;
    setMazeVse(false);
    setChyba(null);
    setNavrhy([]);
    const selhani: ApiZpevnikNavrh[] = [];
    await Promise.all(
      vse.map(async (navrh) => {
        const vysledek = await smazNavrh(navrh.id);
        if (!vysledek.ok) selhani.push(navrh);
      }),
    );
    if (selhani.length > 0) {
      setNavrhy(selhani);
      setChyba("Některé návrhy se nepodařilo zamítnout.");
    }
  }

  async function nahrej(soubor: File | undefined): Promise<void> {
    if (soubor === undefined) return;
    setNahrava(true);
    setChyba(null);
    const vysledek = await nahrejSoubor(soubor);
    setNahrava(false);
    if (!vysledek.ok) setChyba(vysledek.chyba);
    else setNavrhy((stav) => [...vysledek.navrhy, ...stav]);
  }

  return (
    <main className="mx-auto w-full px-4 pb-8 pt-6 sm:px-6 sm:pt-10 lg:px-8 xl:px-12">
      <OdkazZpet to="/zpevnik">Zpět do zpěvníku</OdkazZpet>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Návrhy</h1>
      {schvaluje && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            ref={souborVstup}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,.pdf"
            className="sr-only"
            disabled={nahrava}
            onChange={(udalost) => {
              const soubor = udalost.target.files?.[0];
              udalost.target.value = "";
              void nahrej(soubor);
            }}
          />
          <button
            type="button"
            disabled={nahrava}
            onClick={() => souborVstup.current?.click()}
            className="nahled-press nahled-prejeti inline-flex min-h-11 cursor-pointer items-center rounded-md border-2 border-inkoust bg-papir px-4 text-sm font-bold text-inkoust disabled:opacity-50"
          >
            {nahrava ? "Nahrávám…" : "Nahrát PDF nebo fotku"}
          </button>
          <Tlacitko
            varianta="hlavni"
            className="gap-1.5"
            aria-label="Zveřejnit vše"
            onClick={() => void zverejniVse()}
            disabled={navrhy.every((navrh) => navrh.problem !== null)}
          >
            <IkonaPalec />
            vše
          </Tlacitko>
          <Tlacitko
            varianta="vedlejsi"
            className="gap-1.5"
            aria-label="Zamítnout vše"
            onClick={() => setMazeVse(true)}
            disabled={navrhy.length === 0}
          >
            <IkonaPalec dolu />
            vše
          </Tlacitko>
        </div>
      )}
      {chyba !== null && <p className="mt-4">{chyba}</p>}
      {navrhy.length === 0 && chyba === null && <p className="mt-6 text-mech">Žádný návrh.</p>}
      <ul className="mt-6 space-y-4">
        {navrhy.map((navrh) => (
          <li id={`navrh-${navrh.id}`} key={navrh.id} className="rounded-md border border-linka p-4">
            {navrh.nahledUrl !== null && navrh.nahledUrl.length > 0 && (
              <img
                src={navrh.nahledUrl}
                alt=""
                className="mb-3 max-h-48 w-auto rounded-md border border-linka"
              />
            )}
            <p className="font-bold">{navrh.nazev.length > 0 ? navrh.nazev : "Bez názvu"}</p>
            <p className="text-sm text-mech">{navrh.autor.length > 0 ? navrh.autor : "Bez autora"}</p>
            {navrh.problem !== null && (
              <p className="mt-1 text-sm font-bold text-inkoust">{POPIS_PROBLEMU[navrh.problem]}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <OdkazTlacitko
                to={`/zpevnik/navrh/${navrh.id}`}
                varianta="vedlejsi"
                state={{ odkud: `${location.pathname}${location.search}` }}
                onClick={() => ulozMistoVeFronte(navrh.id)}
              >
                Upravit
              </OdkazTlacitko>
              {schvaluje && navrh.problem === null && (
                <Tlacitko varianta="hlavni" aria-label="Zveřejnit" onClick={() => void schval(navrh.id)}>
                  <IkonaPalec />
                </Tlacitko>
              )}
              <Tlacitko
                varianta="vedlejsi"
                aria-label={schvaluje ? "Zamítnout" : "Stáhnout"}
                onClick={() => void zahod(navrh.id)}
              >
                {schvaluje ? <IkonaPalec dolu /> : "Stáhnout"}
              </Tlacitko>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        otevreno={mazeVse}
        nadpis="Zamítnout všechny návrhy?"
        popis="Z fronty zmizí všechny nahrané písně. Do zpěvníku se nedostanou."
        potvrditPopisek="Ano, zamítnout vše"
        onZrusit={() => setMazeVse(false)}
        onPotvrdit={() => void zamitniVse()}
      />
    </main>
  );
}

