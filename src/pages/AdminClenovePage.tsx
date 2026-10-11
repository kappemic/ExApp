import { useEffect, useMemo, useState, type JSX } from "react";
import {
  mapujRoliNaProfil,
  type ClenskyProfil,
} from "../config/roles";
import AdminTaby, {
  type ClenoveTabId,
  type PoctyTabu,
} from "../components/Admin/AdminTaby";
import ClenDetailModal from "../components/Admin/ClenDetailModal";
import ClenoveTable from "../components/Admin/ClenoveTable";
import {
  nactiCleny,
  ulozProfilClena,
  type UlozitProfilVstup,
} from "../lib/admin-clenove";
import type { UserListItem } from "../shared/api-types";

const POPISKY_PANELU: Record<ClenoveTabId, string> = {
  vsichni: "Všichni členové oddílu.",
  aktivni: "Členové s aktivní účastí.",
  rada: "Členové oddílové rady.",
  vedeni: "Vedoucí oddílu.",
  clenove: "Základní členové bez aktivní účasti.",
};

type StavNacteni = "nacteni" | "hotovo" | "chyba";

/** 3D profil člena s fallbackem ze starého `role` (trio je optional). */
function profilClena(clen: UserListItem): ClenskyProfil {
  const profil: ClenskyProfil = mapujRoliNaProfil(clen.role);
  return {
    clenstvi: clen.clenstvi ?? profil.clenstvi,
    funkce: clen.funkce ?? profil.funkce,
    isAdmin: clen.isAdmin ?? profil.isAdmin,
  };
}

/** Aktivní členství (brána správy výprav) — čte jen `clenstvi`. */
function jeAktivni(profil: ClenskyProfil): boolean {
  return profil.clenstvi === "aktivni_clen";
}

/**
 * Shell /admin/clenove — 5 přepínatelných pohledů nad živými users.
 * Guard řeší App.tsx (AdminGate), tady layout + taby + tabulka.
 *
 * Zdroj: GET /api/users (jen ADMIN) — DB `clenove` je prázdná,
 * zdrojem je `users` (3D trio + mirror `role`, jedna hodnota).
 * Editace profilu ukládá PATCH /api/users/:id přes `ulozProfilClena`.
 *
 * Rozhodnutí o 5. tabu „Členové": ponechány Všichni / Aktivní / Rada / Vedení
 * a tab Členové (= základní bez aktivní účasti) pro symetrii — jinak by
 * základní neaktivní členové nešli samostatně vyfiltrovat, jen přes „Všichni".
 * Každý tab filtruje přes 3D trio (`clenstvi` / `funkce`, fallback
 * `mapujRoliNaProfil` ze starého `role`),
 * počty v tabech souhlasí s filtrem (stejný predikát).
 * Admin příznak je ortogonální — do žádného tabu se nepočítá,
 * samotný admin je vidět jen ve „Všichni".
 */
export default function AdminClenovePage(): JSX.Element {
  const [aktivniTab, setAktivniTab] = useState<ClenoveTabId>("vsichni");
  const [vybranyId, setVybranyId] = useState<string | null>(null);
  const [clenove, setClenove] = useState<UserListItem[]>([]);
  const [stav, setStav] = useState<StavNacteni>("nacteni");
  const [chyba, setChyba] = useState<string>("");

  async function nacist(): Promise<void> {
    setStav("nacteni");
    setChyba("");
    const vysledek = await nactiCleny();
    if (!vysledek.ok) {
      setStav("chyba");
      setChyba(vysledek.chyba);
      return;
    }
    setClenove(vysledek.data);
    setStav("hotovo");
  }

  useEffect(() => {
    void nacist();
  }, []);

  async function naUlozitProfil(
    id: string,
    vstup: UlozitProfilVstup,
  ): Promise<string | null> {
    const vysledek = await ulozProfilClena(id, vstup);
    if (!vysledek.ok) {
      return vysledek.chyba;
    }
    setClenove((predchozi: UserListItem[]) =>
      predchozi.map((clen: UserListItem) =>
        clen.id === vysledek.data.id ? vysledek.data : clen,
      ),
    );
    return null;
  }

  const pocty: PoctyTabu = useMemo(
    () => ({
      vsichni: clenove.length,
      aktivni: clenove.filter((c) => jeAktivni(profilClena(c))).length,
      rada: clenove.filter((c) => profilClena(c).funkce === "rada").length,
      vedeni: clenove.filter((c) => profilClena(c).funkce === "vedeni").length,
      clenove: clenove.filter((c) => !jeAktivni(profilClena(c))).length,
    }),
    [clenove],
  );

  const filtrovani = useMemo(() => {
    switch (aktivniTab) {
      case "aktivni":
        return clenove.filter((c) => jeAktivni(profilClena(c)));
      case "rada":
        return clenove.filter((c) => profilClena(c).funkce === "rada");
      case "vedeni":
        return clenove.filter((c) => profilClena(c).funkce === "vedeni");
      case "clenove":
        return clenove.filter((c) => !jeAktivni(profilClena(c)));
      case "vsichni":
      default:
        return clenove;
    }
  }, [aktivniTab, clenove]);

  /** Vybraný člen napříč taby — dialog zůstane otevřený i po přepnutí tabu. */
  const vybrany: UserListItem | null = useMemo(
    () => clenove.find((c) => c.id === vybranyId) ?? null,
    [clenove, vybranyId],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Administrace</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Členové
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Správa členů oddílu — živý seznam z databáze, role a zařazení.
        </p>

        <AdminTaby
          aktivniTab={aktivniTab}
          pocty={pocty}
          onZmena={setAktivniTab}
        />
      </header>

      <div className="pt-6">
        {stav === "nacteni" && (
          <div
            role="status"
            className="rounded-lg border-2 border-dashed border-mech/40 bg-white/60 px-5 py-10 text-center shadow-denik"
          >
            <p className="text-base font-bold">Načítám členy…</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-inkoust/70">
              Chvilku vydrž, čtu živý seznam z databáze.
            </p>
          </div>
        )}

        {stav === "chyba" && (
          <div
            role="alert"
            className="rounded-lg border-2 border-inkoust bg-white/60 px-5 py-8 text-center shadow-denik"
          >
            <p className="text-base font-bold">Seznam se nepodařilo načíst</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-inkoust/70">
              {chyba}
            </p>
            <button
              type="button"
              onClick={() => void nacist()}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-inkoust px-5 font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-smrk"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {stav === "hotovo" && (
          <div
            role="tabpanel"
            id={`clenove-panel-${aktivniTab}`}
            aria-labelledby={`clenove-tab-${aktivniTab}`}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mech">
              {POPISKY_PANELU[aktivniTab]} Položek: {pocty[aktivniTab]}
            </p>
            <div className="mt-3">
              <ClenoveTable
                clenove={[...filtrovani]}
                vybranyId={vybranyId}
                onVyber={(clen) => setVybranyId(clen.id)}
                popisek={`Seznam členů — ${POPISKY_PANELU[aktivniTab]}`}
              />
            </div>
          </div>
        )}
      </div>

      <ClenDetailModal
        clen={vybrany}
        onZavrit={() => setVybranyId(null)}
        onUlozitProfil={naUlozitProfil}
      />
    </main>
  );
}
