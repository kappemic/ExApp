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
  smazClena,
  ulozProfilClena,
  type UlozitProfilVstup,
} from "../lib/admin-clenove";
import { KostraRadky } from "../components/StrankaKostra";
import { useAuth } from "../hooks/useAuth";
import type { UserListItem } from "../shared/api-types";

const POPISKY_PANELU: Record<ClenoveTabId, string> = {
  vsichni: "Všichni členové klubu.",
  aktivni: "Členové s aktivní účastí.",
  rada: "Členové klubové rady.",
  vedeni: "Vedoucí klubu.",
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
 * Shell /cleny — 5 přepínatelných pohledů nad živými users.
 * Guard: přihlášení (RequireAuth). Stránku vidí i běžný admin.
 * Úpravy a mazání cizích profilů jen hlavní admin (`isSuperadmin`).
 * Jméno a barva vlastního profilu jdou přes PATCH /api/me, ne tudy.
 *
 * Zdroj: GET /api/users (jen ADMIN) — DB `clenove` je prázdná,
 * zdrojem je `users` (3D trio + mirror `role`, jedna hodnota).
 * Editace profilu ukládá PATCH /api/users/:id přes `ulozProfilClena`.
 * Smazání účtu jde přes DELETE /api/users/:id (`smazClena`).
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
  const { isSuperadmin } = useAuth();
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

  async function naOdstranit(id: string): Promise<string | null> {
    const vysledek = await smazClena(id);
    if (!vysledek.ok) {
      return vysledek.chyba;
    }
    setClenove((predchozi: UserListItem[]) =>
      predchozi.filter((clen: UserListItem) => clen.id !== id),
    );
    setVybranyId(null);
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
    <main className="mx-auto w-full px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8 xl:px-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Klub</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Členové
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Kontakty a zařazení členů klubu.
        </p>

        <AdminTaby
          aktivniTab={aktivniTab}
          pocty={pocty}
          onZmena={setAktivniTab}
        />
      </header>

      <div className="pt-6">
        {stav === "nacteni" && (
          <KostraRadky pocet={6} popisek="Načítám členy" sAvatarem />
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
              className="nahled-press nahled-prejeti mt-4 inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-papir px-5 font-bold text-inkoust"
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
        onUlozitProfil={isSuperadmin ? naUlozitProfil : undefined}
        onOdstranit={isSuperadmin ? naOdstranit : undefined}
      />
    </main>
  );
}
