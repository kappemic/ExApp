import { useEffect, useMemo, useState, type JSX } from "react";
import {
  jeAktivniClen,
  jeClen,
  jeVeVedeni,
  jeVRade,
  type Role,
  type RoleSet,
} from "../config/roles";
import AdminTaby, {
  type ClenoveTabId,
  type PoctyTabu,
} from "../components/Admin/AdminTaby";
import ClenDetailModal from "../components/Admin/ClenDetailModal";
import ClenoveTable from "../components/Admin/ClenoveTable";
import { nactiCleny, ulozRoliClena } from "../lib/admin-clenove";
import type { UserListItem } from "../shared/api-types";

const POPISKY_PANELU: Record<ClenoveTabId, string> = {
  vsichni: "Všichni členové oddílu.",
  aktivni: "Členové s aktivní účastí.",
  rada: "Členové oddílové rady.",
  vedeni: "Vedoucí oddílu.",
  clenove: "Základní členové bez aktivní účasti.",
};

type StavNacteni = "nacteni" | "hotovo" | "chyba";

/** Jedna DB role zabalená pro je*() helpery (single-source roles.ts). */
function jakoRoleSet(role: Role): RoleSet {
  return [role];
}

/**
 * Shell /admin/clenove — 5 přepínatelných pohledů nad živými users.
 * Guard řeší App.tsx (AdminGate), tady layout + taby + tabulka.
 *
 * Zdroj: GET /api/users (jen ADMIN) — DB `clenove` je prázdná,
 * zdrojem je `users` (primární `role`, jedna hodnota).
 * Editace role ukládá PATCH /api/users/:id.
 *
 * Rozhodnutí o 5. tabu „Členové": ponechány Všichni / Aktivní / Rada / Vedení
 * a tab Členové (= jeClen) pro symetrii — jinak by základní neaktivní
 * členové (role `clen`) nešli samostatně vyfiltrovat, jen přes „Všichni".
 * Každý tab filtruje přes role helpery z config/roles
 * (jedna role zabalená jako `[u.role]`),
 * počty v tabech souhlasí s filtrem (stejný predikát).
 * Role `admin` je vidět jen ve „Všichni" (není v žádné hodnostní skupině).
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

  async function naUlozitRoli(
    id: string,
    role: Role,
  ): Promise<string | null> {
    const vysledek = await ulozRoliClena(id, role);
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
      aktivni: clenove.filter((c) => jeAktivniClen(jakoRoleSet(c.role))).length,
      rada: clenove.filter((c) => jeVRade(jakoRoleSet(c.role))).length,
      vedeni: clenove.filter((c) => jeVeVedeni(jakoRoleSet(c.role))).length,
      clenove: clenove.filter((c) => jeClen(jakoRoleSet(c.role))).length,
    }),
    [clenove],
  );

  const filtrovani = useMemo(() => {
    switch (aktivniTab) {
      case "aktivni":
        return clenove.filter((c) => jeAktivniClen(jakoRoleSet(c.role)));
      case "rada":
        return clenove.filter((c) => jeVRade(jakoRoleSet(c.role)));
      case "vedeni":
        return clenove.filter((c) => jeVeVedeni(jakoRoleSet(c.role)));
      case "clenove":
        return clenove.filter((c) => jeClen(jakoRoleSet(c.role)));
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
        onUlozitRoli={naUlozitRoli}
      />
    </main>
  );
}
