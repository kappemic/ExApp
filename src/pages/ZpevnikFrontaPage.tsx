import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import Ikona from "../components/Ikona";
import { useLocation, Link } from "react-router-dom";
import ConfirmDialog from "../components/kalendar/ConfirmDialog";
import HlavickaZpet from "../components/HlavickaZpet";
import PrazdnyStav from "../components/PrazdnyStav";
import { IkonaNota } from "../components/SeznamIkony";
import { ZpevnikChip, ZpevnikChipLista } from "../components/zpevnik/ZpevnikChipy";
import { ZpevnikKartaNavrhu } from "../components/zpevnik/ZpevnikKartaNavrhu";
import { useAuth } from "../hooks/useAuth";
import { nactiNavrhy, nahrejSoubor, schvalNavrh, smazNavrh } from "../lib/zpevnik-api";
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
  const [nahrava, setNahrava] = useState(false);
  const [nacteno, setNacteno] = useState(false);
  const [mazeVse, setMazeVse] = useState(false);
  const souborVstup = useRef<HTMLInputElement>(null);
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

  async function zverejniVse(): Promise<void> {
    const hotove = viditelne.filter((navrh) => navrh.problem === null);
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
    const vse = [...viditelne];
    setMazeVse(false);
    setChyba(null);
    const ids = new Set(vse.map((navrh) => navrh.id));
    setNavrhy((stav) => stav.filter((navrh) => !ids.has(navrh.id)));
    const selhani: ApiZpevnikNavrh[] = [];
    await Promise.all(
      vse.map(async (navrh) => {
        const vysledek = await smazNavrh(navrh.id);
        if (!vysledek.ok) selhani.push(navrh);
      }),
    );
    if (selhani.length > 0) {
      setNavrhy((stav) => [...selhani, ...stav]);
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
    <main className="mx-auto w-full max-w-2xl px-5 pb-8 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet zpet="/zpevnik" zpetPopisek="Zpět do zpěvníku" titulek="Návrhy písní" varianta="nadpis" className="min-[90rem]:hidden" />
      <div className="hidden items-end justify-between min-[90rem]:flex">
        <h1 className="font-display text-[46px] font-bold leading-[0.98] tracking-[-1.4px] text-inkoust">Návrhy písní</h1>
        <Link
          to="/zpevnik"
          className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl border border-linka bg-povrch px-[18px] text-sm font-semibold text-inkoust hover:bg-povrch-2"
        >
          <Ikona nazev="book-open" className="size-4 text-mech" />
          Zpěvník
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 min-[90rem]:mt-8 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4">
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

      {schvaluje && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
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
            className="inline-flex min-h-9 items-center font-medium text-mech underline-offset-2 hover:text-inkoust hover:underline disabled:opacity-50"
          >
            {nahrava ? "Nahrávám…" : "Nahrát PDF nebo fotku"}
          </button>
          <button
            type="button"
            disabled={viditelne.every((navrh) => navrh.problem !== null)}
            onClick={() => void zverejniVse()}
            className="inline-flex min-h-9 items-center font-medium text-mech underline-offset-2 hover:text-inkoust hover:underline disabled:opacity-50"
          >
            Vydat vše
          </button>
          <button
            type="button"
            disabled={viditelne.length === 0}
            onClick={() => setMazeVse(true)}
            className="inline-flex min-h-9 items-center font-medium text-mech underline-offset-2 hover:text-inkoust hover:underline disabled:opacity-50"
          >
            Odmítnout vše
          </button>
        </div>
      )}

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

      <ul className={`m-0 mt-4 list-none divide-y divide-linka overflow-hidden rounded-2xl border border-linka bg-povrch p-0 shadow-jemny min-[90rem]:mt-5 ${viditelne.length === 0 ? "hidden" : ""}`}>
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