import { useEffect, useMemo, useState, type JSX } from "react";
import Ikona from "../components/Ikona";
import { getZebricek } from "../lib/zebricky-api";
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

  const [vypravyClena, setVypravyClena] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    let zive = true;
    void getZebricek("celkem").then((vysledek) => {
      if (!zive) return;
      setVypravyClena(new Map(vysledek.data.zebricky.map((r) => [r.userId, r.vypravy])));
    });
    return () => {
      zive = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-4 sm:px-6 sm:pt-8 lg:max-w-2xl min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <header className="flex flex-col gap-5 min-[90rem]:gap-8">
        <div className="flex items-center justify-between gap-3 min-[90rem]:items-end">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[0.98] min-[90rem]:tracking-[-1.4px]">
              Členové
            </h1>
            <p className="text-xs text-ink-3 min-[90rem]:hidden">
              {stav === "hotovo" ? `${clenove.length} členů` : "Načítám seznam…"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
          <div className="relative hidden w-[232px] min-[90rem]:block">
            <label htmlFor="clenove-hledani-pc" className="sr-only">
              Hledat členy
            </label>
            <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
              <Ikona nazev="search" className="size-4 min-[90rem]:size-[17px]" />
            </span>
            <input
              id="clenove-hledani-pc"
              type="search"
              value={hledani}
              onChange={(e) => setHledani(e.target.value)}
              placeholder="Hledat člena"
              className="h-11 w-full rounded-xl border border-linka bg-povrch pl-10 pr-3.5 text-base text-inkoust placeholder:text-[#9aa189] focus:border-pole min-[90rem]:h-[46px] min-[90rem]:text-sm min-[90rem]:placeholder:text-ink-3"
            />
          </div>
            {isAdmin ? (
              <Link
                to="/admin/kody"
                className="nahled-press inline-flex h-11 items-center gap-1.5 rounded-xl bg-smrk px-3.5 text-[13.5px] font-semibold text-papir hover:opacity-90 min-[90rem]:h-[46px] min-[90rem]:gap-2 min-[90rem]:px-[18px] min-[90rem]:text-sm"
              >
                <Ikona nazev="user-plus" className="size-4" />
                Pozvat
              </Link>
            ) : null}
          </div>
        </div>
          <div className="relative min-[90rem]:hidden">
            <label htmlFor="clenove-hledani" className="sr-only">
              Hledat členy
            </label>
            <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
              <Ikona nazev="search" className="size-4 min-[90rem]:size-[17px]" />
            </span>
            <input
              id="clenove-hledani"
              type="search"
              value={hledani}
              onChange={(e) => setHledani(e.target.value)}
              placeholder="Hledat člena"
              className="h-11 w-full rounded-xl border border-linka bg-povrch pl-10 pr-3.5 text-base text-inkoust placeholder:text-[#9aa189] focus:border-pole min-[90rem]:h-[46px] min-[90rem]:text-sm min-[90rem]:placeholder:text-ink-3"
            />
          </div>
        <div className="flex items-center justify-between gap-3 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:pb-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtr členů">
            {CHIPY.map((chip) => {
              const aktivni = aktivniTab === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  id={`clenove-chip-${chip.id}`}
                  aria-selected={aktivni}
                  onClick={() => setAktivniTab(chip.id)}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors min-[90rem]:h-auto min-[90rem]:px-3.5 min-[90rem]:py-2 ${
                    aktivni
                      ? "border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-inkoust"
                      : "border-linka bg-povrch font-medium text-mech hover:bg-povrch-2 min-[90rem]:bg-transparent"
                  }`}
                >
                  {chip.popisek}
                </button>
              );
            })}
          </div>
          <p className="hidden text-[13px] font-medium text-ink-3 min-[90rem]:block">
            {stav === "hotovo" ? `${clenove.length} členů` : ""}
          </p>
        </div>
      </header>

      <div className="pt-5 min-[90rem]:pt-8">
        {stav === "nacteni" && (
          <KostraRadky pocet={6} popisek="Načítám členy" sAvatarem />
        )}

        {stav === "chyba" && (
          <div
            role="alert"
            className="rounded-2xl border border-linka bg-povrch px-5 py-8 text-center shadow-jemny"
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
            <div>
              <ClenoveTable
                vypravyClena={vypravyClena}
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
