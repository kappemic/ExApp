import { useEffect, useMemo, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import {
  mapujRoliNaProfil,
  type ClenskyProfil,
} from "../config/roles";
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

type FiltrChip = "vsichni" | "aktivni" | "rada";

const CHIPY: ReadonlyArray<{ id: FiltrChip; popisek: string }> = [
  { id: "vsichni", popisek: "Všichni" },
  { id: "aktivni", popisek: "Aktivní" },
  { id: "rada", popisek: "Rada" },
];

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
  const { isAdmin, isSuperadmin } = useAuth();
  const [aktivniTab, setAktivniTab] = useState<FiltrChip>("vsichni");
  const [hledani, setHledani] = useState("");
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

  const filtrovani = useMemo(() => {
    const dotaz = hledani.trim().toLowerCase();
  const podleChipu = ((): UserListItem[] => {
      switch (aktivniTab) {
        case "aktivni":
          return clenove.filter((c) => jeAktivni(profilClena(c)));
        case "rada":
          return clenove.filter((c) => profilClena(c).funkce === "rada");
        case "vsichni":
        default:
          return clenove;
      }
    })();
    if (dotaz.length === 0) return podleChipu;
    return podleChipu.filter((c) => {
      const haystack = `${c.jmeno} ${c.email} ${c.skola} ${c.trida}`.toLowerCase();
      return haystack.includes(dotaz);
    });
  }, [aktivniTab, clenove, hledani]);

  /** Vybraný člen napříč taby — dialog zůstane otevřený i po přepnutí tabu. */
  const vybrany: UserListItem | null = useMemo(
    () => clenove.find((c) => c.id === vybranyId) ?? null,
    [clenove, vybranyId],
  );

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:max-w-2xl">
      <header className="border-b border-linka pb-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-inkoust">Členové</h1>
        <p className="mt-1 text-base text-mech">
          {stav === "hotovo" ? `${clenove.length} členů` : "Načítám seznam…"}
        </p>
        {isAdmin ? (
          <Link
            to="/admin/kody"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-smrk px-5 text-base font-bold text-papir"
          >
            Pozvat
          </Link>
        ) : null}
        <div className="mt-4">
          <label htmlFor="clenove-hledani" className="sr-only">
            Hledat členy
          </label>
          <input
            id="clenove-hledani"
            type="search"
            value={hledani}
            onChange={(e) => setHledani(e.target.value)}
            placeholder="Hledat jméno, e-mail…"
            className="min-h-11 w-full rounded-2xl border border-pole bg-povrch px-4 text-base text-inkoust placeholder:text-mech"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Filtr členů">
          {CHIPY.map((chip) => {
            const aktivni = aktivniTab === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={aktivni}
                onClick={() => setAktivniTab(chip.id)}
                className={`min-h-9 rounded-full px-4 text-sm font-bold ${
                  aktivni ? "bg-inkoust text-papir" : "border border-pole bg-papir text-inkoust"
                }`}
              >
                {chip.popisek}
              </button>
            );
          })}
        </div>
      </header>

      <div className="pt-6">
        {stav === "nacteni" && (
          <KostraRadky pocet={6} popisek="Načítám členy" sAvatarem />
        )}

        {stav === "chyba" && (
          <div
            role="alert"
            className="rounded-lg border border-linka bg-povrch px-5 py-8 text-center shadow-denik"
          >
            <p className="text-base font-bold">Seznam se nepodařilo načíst</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-inkoust/70">
              {chyba}
            </p>
            <button
              type="button"
              onClick={() => void nacist()}
              className="nahled-press nahled-prejeti mt-4 inline-flex min-h-[44px] items-center justify-center rounded border border-linka bg-papir px-5 font-bold text-inkoust"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {stav === "hotovo" && (
          <div
            role="tabpanel"
            id={`clenove-panel-${aktivniTab}`}
            aria-labelledby={`clenove-chip-${aktivniTab}`}
          >
            <div className="mt-3">
              <ClenoveTable
                clenove={[...filtrovani]}
                vybranyId={vybranyId}
                onVyber={(clen) => setVybranyId(clen.id)}
                popisek={`Seznam členů — ${CHIPY.find((c) => c.id === aktivniTab)?.popisek ?? "Všichni"}`}
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
