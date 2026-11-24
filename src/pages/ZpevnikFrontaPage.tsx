import { useEffect, useMemo, useState, type JSX } from "react";
import Ikona from "../components/Ikona";
import { useLocation, Link } from "react-router-dom";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import PrazdnyStav from "../components/PrazdnyStav";
import { IkonaNota } from "../components/SeznamIkony";
import { ZpevnikChip, ZpevnikChipLista } from "../components/zpevnik/ZpevnikChipy";
import { ZpevnikKartaNavrhu } from "../components/zpevnik/ZpevnikKartaNavrhu";
import { useAuth } from "../hooks/useAuth";
import { nactiNavrhy, schvalNavrh, smazNavrh } from "../lib/zpevnik-api";
import type { ApiZpevnikNavrh } from "../shared/zpevnik";

const KLIC_MISTA = "exapp:zpevnik:fronta-misto";

type FiltrFronty = "vse" | "rucne" | "fotka" | "pdf";

const FILTRY: readonly { id: FiltrFronty; popisek: string }[] = [
  { id: "vse", popisek: "Vše" },
  { id: "rucne", popisek: "Ručně" },
  { id: "fotka", popisek: "Z fotky" },
  { id: "pdf", popisek: "Z PDF" },
];

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

function jeZeSouboru(navrh: ApiZpevnikNavrh): boolean {
  return navrh.nahledUrl !== null && navrh.nahledUrl.length > 0;
}

function odpovidaFiltru(navrh: ApiZpevnikNavrh, filtr: FiltrFronty): boolean {
  if (filtr === "vse") return true;
  if (filtr === "rucne") return !jeZeSouboru(navrh);
  if (filtr === "fotka" || filtr === "pdf") return jeZeSouboru(navrh);
  return true;
}

function smiZahoditNavrh(
  user: { id?: string; isAdmin?: boolean; isSuperadmin?: boolean; funkce?: string | null } | null,
  navrh: ApiZpevnikNavrh,
): boolean {
  if (user === null) return false;
  const schvaluje =
    user.isAdmin === true || user.isSuperadmin === true || user.funkce === "vedeni";
  if (schvaluje) return true;
  return navrh.navrhovatelId !== null && navrh.navrhovatelId === user.id;
}

export default function ZpevnikFrontaPage(): JSX.Element {
  const { user } = useAuth();
  const schvaluje =
    user?.isAdmin === true || user?.isSuperadmin === true || user?.funkce === "vedeni";
  const [navrhy, setNavrhy] = useState<ApiZpevnikNavrh[]>([]);
  const [filtr, setFiltr] = useState<FiltrFronty>("vse");
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacteno, setNacteno] = useState(false);
  const location = useLocation();

  const viditelne = useMemo(
    () => navrhy.filter((navrh) => odpovidaFiltru(navrh, filtr)),
    [navrhy, filtr],
  );

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

  return (
    <main className="mx-auto w-full max-w-[46rem] px-5 pb-6 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet zpet="/zpevnik" zpetPopisek="Zpět do zpěvníku" titulek="Návrhy písní" varianta="nadpis" className="min-[90rem]:hidden" />
      <ZpetPocitac zpet="/zpevnik" popisek="Zpět do zpěvníku" />
      <div className="hidden items-end justify-between min-[90rem]:flex">
        <h1 className="font-display text-[46px] font-bold leading-[45px] tracking-[-1.4px] text-inkoust">Návrhy písní</h1>
        <Link
          to="/zpevnik"
          className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl border border-linka bg-povrch px-[18px] text-sm font-semibold text-inkoust hover:bg-povrch-2"
        >
          <Ikona nazev="book-open" className="size-4 text-mech" />
          Zpěvník
        </Link>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 min-[90rem]:mt-8 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4">
        <ZpevnikChipLista>
          {FILTRY.map((polozka) => (
            <ZpevnikChip key={polozka.id} vybrany={filtr === polozka.id} onClick={() => setFiltr(polozka.id)}>
              {polozka.popisek}
            </ZpevnikChip>
          ))}
        </ZpevnikChipLista>
        <p className="hidden shrink-0 text-[13px] font-medium text-ink-3 min-[90rem]:block">
          {viditelne.length} {viditelne.length === 1 ? "návrh" : viditelne.length >= 2 && viditelne.length <= 4 ? "návrhy" : "návrhů"}
        </p>
      </div>

      {chyba !== null && <p className="mt-4 text-inkoust">{chyba}</p>}

      {nacteno && viditelne.length === 0 && chyba === null && (
        <PrazdnyStav
          className="mt-6"
          ikona={<IkonaNota />}
          nadpis={
            filtr === "vse"
              ? "Žádné návrhy ke schválení"
              : filtr === "rucne"
                ? "Žádný ručně zadaný návrh"
                : "Žádný návrh ze souboru"
          }
          text={
            filtr === "vse"
              ? "Nové návrhy písní od členů se objeví tady."
              : "V ostatních filtrech můžou čekat další."
          }
          akce={
            filtr === "vse"
              ? { popisek: "Zpět do zpěvníku", odkaz: "/zpevnik", varianta: "vedlejsi" }
              : { popisek: "Zobrazit vše", onClick: () => setFiltr("vse"), varianta: "vedlejsi" }
          }
        />
      )}

      <ul className={`m-0 mt-5 flex list-none flex-col gap-3 p-0 min-[90rem]:mt-8 min-[90rem]:gap-0 min-[90rem]:divide-y min-[90rem]:divide-linka min-[90rem]:overflow-hidden min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:shadow-denik ${viditelne.length === 0 ? "hidden" : ""}`}>
        {viditelne.map((navrh) => (
          <li key={navrh.id}>
            <ZpevnikKartaNavrhu
              navrh={navrh}
              schvaluje={schvaluje}
              smiZahodit={smiZahoditNavrh(user, navrh)}
              location={location}
              onVydat={() => void schval(navrh.id)}
              onZahodit={() => void zahod(navrh.id)}
              onPredUpravou={() => ulozMistoVeFronte(navrh.id)}
            />
          </li>
        ))}
      </ul>

      {schvaluje && viditelne.length > 0 ? (
        <p className="mt-8 hidden items-center gap-2 rounded-2xl bg-povrch-2 p-4 text-[12.5px] leading-[18px] text-mech shadow-denik min-[90rem]:flex">
          <Ikona nazev="info" className="size-[15px] shrink-0 text-ink-3" />
          Vydáním se píseň přesune do zpěvníku. Odmítnutí ji smaže bez zprávy.
        </p>
      ) : null}

    </main>
  );
}