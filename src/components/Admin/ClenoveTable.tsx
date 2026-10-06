import type { JSX } from "react";
import {
  jeAktivniClen,
  jeVRade,
  jeVeVedeni,
  type RoleSet,
} from "../../config/roles";
import RoleBadge from "./RoleBadge";

interface ClenoveTableProps {
  clenove: ReadonlyArray<{
    readonly id: string;
    readonly jmeno: string;
    readonly role: RoleSet;
  }>;
  popisek?: string;
}

function Zarazeni({ role }: { role: RoleSet }): JSX.Element {
  const rada: boolean = jeVRade(role);
  const vedeni: boolean = jeVeVedeni(role);
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

function Stav({ role }: { role: RoleSet }): JSX.Element {
  const aktivni: boolean = jeAktivniClen(role);
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
 */
export default function ClenoveTable({ clenove, popisek }: ClenoveTableProps): JSX.Element {
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
          {clenove.map((clen) => (
            <tr
              key={clen.id}
              className="border-b border-linka align-middle last:border-b-0 motion-safe:transition-colors motion-safe:hover:bg-linka/30"
            >
              <th scope="row" className="min-w-0 px-4 py-3 text-sm font-bold leading-snug">
                <span className="block max-w-[220px] truncate sm:max-w-none sm:whitespace-normal">
                  {clen.jmeno}
                </span>
              </th>
              <td className="px-4 py-3">
                <span className="inline-flex max-w-[280px] flex-wrap gap-1.5">
                  {clen.role.map((r) => (
                    <RoleBadge key={r} role={r} />
                  ))}
                </span>
              </td>
              <td className="px-4 py-3">
                <Stav role={clen.role} />
              </td>
              <td className="px-4 py-3">
                <Zarazeni role={clen.role} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
