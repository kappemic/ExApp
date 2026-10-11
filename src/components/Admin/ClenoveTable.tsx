import type { JSX } from "react";
import {
  mapujRoliNaProfil,
  type ClenskyProfil,
} from "../../config/roles";
import type { UserListItem } from "../../shared/api-types";
import RoleBadge from "./RoleBadge";

interface ClenoveTableProps {
  clenove: ReadonlyArray<UserListItem>;
  /** Id právě otevřeného člena — zvýrazní řádek, jehož detail je v dialogu. */
  vybranyId?: string | null;
  /** Klik / Enter na řádek — stránka otevře ClenDetailModal. */
  onVyber: (clen: UserListItem) => void;
  popisek?: string;
}

/** 3D profil člena s fallbackem ze starého `role` (trio je optional). */
function profilClena(clen: UserListItem): ClenskyProfil {
  const profil: ClenskyProfil = mapujRoliNaProfil(clen.role);
  return {
    clenstvi: clen.clenstvi ?? profil.clenstvi,
    funkce: clen.funkce ?? profil.funkce,
    isAdmin: clen.isAdmin ?? profil.isAdmin,
  };
}

function Zarazeni({ profil }: { profil: ClenskyProfil }): JSX.Element {
  const rada: boolean = profil.funkce === "rada";
  const vedeni: boolean = profil.funkce === "vedeni";
  if (!rada && !vedeni) {
    return <span className="text-sm text-mech">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {rada && (
        <span className="inline-flex min-h-[28px] items-center whitespace-nowrap rounded-full border border-linka bg-papir px-2.5 py-0.5 text-xs font-bold text-inkoust">
          Rada
        </span>
      )}
      {vedeni && (
        <span className="inline-flex min-h-[28px] items-center whitespace-nowrap rounded-full border-2 border-inkoust bg-white/70 px-2.5 py-0.5 text-xs font-bold text-inkoust">
          Vedení
        </span>
      )}
    </span>
  );
}

function Stav({ profil }: { profil: ClenskyProfil }): JSX.Element {
  const aktivni: boolean = profil.clenstvi === "aktivni_clen";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold">
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full border border-inkoust/20 ${
          aktivni ? "bg-smrk" : "bg-linka"
        }`}
      />
      {aktivni ? "Aktivní člen" : "Člen"}
    </span>
  );
}

/**
 * Jedna znovupoužitelná tabulka pro všechny 4 taby.
 * Na mobilu horizontálně scrolluje (min-w), layout se neláme.
 * Nativní <table> = role=table zdarma, prázdný stav má role=status.
 * Řádek je klikací tlačítko (min-h 44px, aria-haspopup="dialog") —
 * klik / Enter otevře ClenDetailModal (stav drží AdminClenovePage).
 */
export default function ClenoveTable({
  clenove,
  vybranyId,
  onVyber,
  popisek,
}: ClenoveTableProps): JSX.Element {
  if (clenove.length === 0) {
    return (
      <div
        role="status"
        className="rounded-lg border-2 border-dashed border-mech/40 bg-white/60 px-5 py-10 text-center shadow-denik"
      >
        <p className="text-base font-bold">Žádní členové v této skupině</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-inkoust/70">
          V této skupině zatím nikdo není. Zkuste jinou záložku.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border-2 border-inkoust bg-white/60 shadow-denik">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">
          {popisek ?? "Seznam členů — jméno, role, stav a zařazení"}
        </caption>
        <thead>
          <tr className="border-b-2 border-inkoust bg-papir">
            <th scope="col" className="min-h-[44px] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
              Jméno
            </th>
            <th scope="col" className="min-h-[44px] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
              Role / Hodnost
            </th>
            <th scope="col" className="min-h-[44px] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
              Stav
            </th>
            <th scope="col" className="min-h-[44px] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
              Zařazení
            </th>
          </tr>
        </thead>
        <tbody>
          {clenove.map((clen) => {
            const vybran: boolean = vybranyId === clen.id;
            const profil: ClenskyProfil = profilClena(clen);
            return (
              <tr
                key={clen.id}
                className={`border-b border-linka align-middle last:border-b-0 motion-safe:transition-colors motion-safe:hover:bg-linka/30 ${
                  vybran ? "bg-linka/50" : ""
                }`}
              >
                <th scope="row" className="min-w-0 p-1.5 sm:p-2">
                  <button
                    type="button"
                    onClick={() => onVyber(clen)}
                    aria-haspopup="dialog"
                    aria-label={`${clen.jmeno} — otevřít detail člena`}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left leading-snug"
                  >
                    <span className="min-w-0">
                      <span className="block max-w-[220px] truncate text-sm font-bold sm:max-w-none sm:whitespace-normal">
                        {clen.jmeno}
                      </span>
                      <span className="block max-w-[220px] truncate text-xs font-normal text-mech sm:max-w-none sm:whitespace-normal">
                        {clen.email}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-xs font-extrabold text-mech"
                    >
                      Detail ›
                    </span>
                  </button>
                </th>
                <td className="px-4 py-3">
                  <span className="inline-flex max-w-[280px] flex-wrap gap-1.5">
                    <RoleBadge role={clen.role} />
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Stav profil={profil} />
                </td>
                <td className="px-4 py-3">
                  <Zarazeni profil={profil} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
