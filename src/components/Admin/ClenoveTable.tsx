import type { JSX } from "react";
import Ikona from "../Ikona";
import { Link } from "react-router-dom";
import {
  mapujRoliNaProfil,
  type ClenskyProfil,
} from "../../config/roles";
import { OBLIBENE_BARVY, jeOblibenaBarva, type UserListItem } from "../../shared/api-types";
import { popisekClena } from "../../lib/clen-popisek";
import AvatarKruh from "../AvatarKruh";
import { SEZNAM_KARTA_TRIDA, SeznamSipka } from "../SeznamKarta";
import PrazdnyStav from "../PrazdnyStav";
import Strankovani from "../Strankovani";
import { useStrankovani } from "../../hooks/useStrankovani";
import { RADKU_NA_STRANKU } from "../../lib/strankovani";
import { IkonaLide } from "../SeznamIkony";

interface ClenoveTableProps {
  clenove: ReadonlyArray<UserListItem>;
  /** Id právě otevřeného člena — zvýrazní řádek, jehož detail je v dialogu. */
  vybranyId?: string | null;
  /** Klik / Enter na řádek — stránka otevře ClenDetailModal. */
  onVyber: (clen: UserListItem) => void;
  popisek?: string;
  /** Počet výprav podle id člena (ze žebříčku). */
  vypravyClena?: ReadonlyMap<string, number>;
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


/** Color dot beside a member name. The Czech name stays for screen readers. */
function KoleckoBarvy({ nazev }: { nazev: string }): JSX.Element | null {
  if (!jeOblibenaBarva(nazev)) return null;
  const hex = OBLIBENE_BARVY.find((barva) => barva.nazev === nazev)?.hex;
  const popisek = nazev.charAt(0).toLocaleUpperCase("cs-CZ") + nazev.slice(1);
  return (
    <span title={popisek} className="inline-flex shrink-0">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 rounded-full border border-linka"
        style={{ backgroundColor: hex }}
      />
      <span className="sr-only">{popisek}</span>
    </span>
  );
}


/**
 * Jedna znovupoužitelná tabulka pro všechny 4 taby.
 * Pod 1440 px seznam řádků (avatar, jméno, zařazení, ›) podle návrhu, žádný
 * vodorovný scroll. Od 1440 px tabulka se všemi sloupci.
 * Nativní <table> = role=table zdarma, prázdný stav má role=status.
 * Řádek je klikací tlačítko (min-h 44px, aria-haspopup="dialog") —
 * klik / Enter otevře ClenDetailModal (stav drží AdminClenovePage).
 */
export default function ClenoveTable({
  clenove,
  vybranyId,
  onVyber,
  popisek,
  vypravyClena,
}: ClenoveTableProps): JSX.Element {
  const strankovani = useStrankovani(clenove, RADKU_NA_STRANKU, `${popisek ?? ""}:${clenove.length}`);
  if (clenove.length === 0) {
    return (
      <PrazdnyStav
        ikona={<IkonaLide />}
        nadpis="Žádní členové v této skupině"
        text="V této skupině zatím nikdo není. Zkus jinou záložku nebo pozvi nováčka."
      />
    );
  }

  return (
    <>
    <ul
      aria-label={popisek ?? "Seznam členů"}
      className={`${SEZNAM_KARTA_TRIDA} min-[90rem]:hidden`}
    >
      {strankovani.viditelne.map((clen) => {
        const profil: ClenskyProfil = profilClena(clen);
        const vybran: boolean = vybranyId === clen.id;
        return (
          <li
            key={clen.id}
            className={`flex min-w-0 items-center ${vybran ? "bg-mlha/60" : ""}`}
          >
            <Link
              to={`/cleny/${clen.id}`}
              className="bez-prejeti flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-3.5 pr-1 [touch-action:manipulation] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
            >
              <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-[15px] font-semibold text-inkoust">
                    {clen.jmeno}
                  </span>
                  <KoleckoBarvy nazev={clen.oblibenaBarva ?? ""} />
                </span>
                <span className="block truncate text-[13px] text-ink-3">
                  {popisekClena(profil, clen.isSuperadmin === true)}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => onVyber(clen)}
              aria-haspopup="dialog"
              aria-label={`${clen.jmeno}, správa člena`}
              className="bez-prejeti inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-xs font-bold text-mech [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-smrk"
            >
              Správa
            </button>
            <span className="pr-3.5">
              <SeznamSipka />
            </span>
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-hidden rounded-2xl border border-linka bg-povrch shadow-jemny min-[90rem]:block">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">
          {popisek ?? "Seznam členů — jméno, e-mail, členství, funkce, admin a výpravy"}
        </caption>
        <colgroup>
          <col className="w-[260px]" />
          <col />
          <col className="w-32" />
          <col className="w-[126px]" />
          <col className="w-[108px]" />
          <col className="w-[84px]" />
          <col className="w-[46px]" />
        </colgroup>
        <thead>
          <tr className="h-11 border-b border-linka bg-[#fbf8ef] text-[10.5px] font-bold uppercase tracking-[0.8px] text-ink-3">
            <th scope="col" className="pl-5 font-bold">Člen</th>
            <th scope="col" className="pl-4 font-bold">E-mail</th>
            <th scope="col" className="pl-4 font-bold">Základna</th>
            <th scope="col" className="pl-4 font-bold">Rada / vedení</th>
            <th scope="col" className="pl-4 font-bold">Admin</th>
            <th scope="col" className="pl-4 font-bold">Výpravy</th>
            <th scope="col"><span className="sr-only">Karta</span></th>
          </tr>
        </thead>
        <tbody>
          {strankovani.viditelne.map((clen) => {
            const vybran: boolean = vybranyId === clen.id;
            const profil: ClenskyProfil = profilClena(clen);
            const funkce = profil.funkce === "vedeni" ? "Vedení" : profil.funkce === "rada" ? "Rada" : null;
            const admin = clen.isSuperadmin ? "Hlavní admin" : profil.isAdmin ? "Admin" : null;
            return (
              <tr
                key={clen.id}
                className={`h-[68px] border-b border-linka align-middle last:border-b-0 motion-safe:transition-colors hover:bg-povrch-2/60 ${vybran ? "bg-[#fbf8ef]" : ""}`}
              >
                <th scope="row" className="pl-5 font-normal">
                  <Link
                    to={`/cleny/${clen.id}`}
                    className="bez-prejeti flex min-w-0 items-center gap-[11px] rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                  >
                    <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} ton="barevny" velikost={34} />
                    <span className="min-w-0 truncate text-sm font-semibold text-inkoust">{clen.jmeno}</span>
                    <KoleckoBarvy nazev={clen.oblibenaBarva ?? ""} />
                  </Link>
                </th>
                <td className="truncate pl-4 text-[11.5px] text-ink-3">{clen.email}</td>
                <td className="pl-4 text-[12.5px] font-semibold text-inkoust">
                  {profil.clenstvi === "aktivni_clen" ? "Aktivní člen" : "Člen"}
                </td>
                <td className="pl-4">
                  {funkce !== null ? (
                    <span className="rounded-full bg-povrch-2 px-2 py-[3px] text-[10.5px] font-semibold text-mech">{funkce}</span>
                  ) : (
                    <span className="text-[12.5px] text-ink-3">—</span>
                  )}
                </td>
                <td className="pl-4">
                  {admin !== null ? (
                    <span className="rounded-full bg-mlha px-2 py-[3px] text-[10.5px] font-semibold text-smrk">{admin}</span>
                  ) : (
                    <span className="text-[12.5px] text-ink-3">—</span>
                  )}
                </td>
                <td className="pl-4 font-display text-[15px] font-bold tabular-nums text-inkoust">
                  {vypravyClena?.get(clen.id) ?? 0}
                </td>
                <td className="pr-3 text-right">
                  <button
                    type="button"
                    onClick={() => onVyber(clen)}
                    aria-haspopup="dialog"
                    aria-label={`${clen.jmeno}, správa člena`}
                    className="bez-prejeti inline-flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-povrch-2 hover:text-inkoust focus-visible:outline-2 focus-visible:outline-smrk"
                  >
                    <Ikona nazev="chevron-right" className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <Strankovani
      cislo={strankovani.cislo}
      pocet={strankovani.pocet}
      onZmena={strankovani.nastav}
      popisek="Stránky seznamu členů"
      className="mt-4"
    />
    </>
  );
}
