import type { JSX } from "react";
import Ikona from "../Ikona";
import { Link } from "react-router-dom";
import type { ClenskyProfil } from "../../config/roles";
import type { UserListItem } from "../../shared/api-types";
import { popisekClena, profilClena } from "../../lib/clen-popisek";
import AvatarKruh from "../AvatarKruh";
import { useAuth } from "../../hooks/useAuth";
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
  /** Otevře Správu člena. Bez ní (není hlavní admin) vede poslední sloupec na profil. */
  onSpravovat?: (clen: UserListItem) => void;
  popisek?: string;
  /** Počet výprav podle id člena (ze žebříčku). */
  vypravyClena?: ReadonlyMap<string, number>;
}

/**
 * Jedna znovupoužitelná tabulka pro všechny 4 taby.
 * Pod 1440 px seznam řádků (avatar, jméno, zařazení, ›) podle návrhu, žádný
 * vodorovný scroll. Od 1440 px tabulka se všemi sloupci.
 * Nativní <table> = role=table zdarma, prázdný stav má role=status.
 * Jméno vede na profil člena, „…" v posledním sloupci otevře Správu člena
 * (stav drží AdminClenovePage).
 */
export default function ClenoveTable({
  clenove,
  vybranyId,
  onSpravovat,
  popisek,
  vypravyClena,
}: ClenoveTableProps): JSX.Element {
  const { user } = useAuth();
  const mojeId = user?.id ?? null;
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
          <li key={clen.id} className={`min-w-0 ${vybran ? "bg-mlha/60" : ""}`}>
            <Link
              to={`/cleny/${clen.id}`}
              className="nahled-press bez-prejeti flex min-h-[64px] min-w-0 items-center gap-3 px-3.5 py-3 [touch-action:manipulation] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
            >
              <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} ton="barevny" velikost={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="min-w-0 truncate text-[14.5px] font-semibold text-inkoust">{clen.jmeno}</span>
                <span className="block truncate text-xs text-ink-3">{popisekClena(profil, clen.isSuperadmin === true)}</span>
              </span>
              <SeznamSipka />
            </Link>
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-hidden rounded-2xl border border-linka bg-povrch shadow-karta min-[90rem]:block">
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
          <tr className="h-11 border-b border-linka bg-zahlavi text-[10.5px] font-bold uppercase tracking-[1.1px] text-ink-3">
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
            const funkce = profil.funkce === "vedeni" ? "Vedení" : profil.funkce === "rada" ? "Člen rady" : null;
            const admin = clen.isSuperadmin ? "Hlavní admin" : profil.isAdmin ? "Admin" : null;
            return (
              <tr
                key={clen.id}
                className={`h-[68px] border-b border-linka align-middle last:border-b-0 motion-safe:transition-colors hover:bg-povrch-2/60 ${vybran ? "bg-zahlavi" : ""}`}
              >
                <th scope="row" className="pl-5 font-normal">
                  <Link
                    to={`/cleny/${clen.id}`}
                    className="bez-prejeti flex min-w-0 items-center gap-[11px] rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
                  >
                    <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} ton={clen.id === mojeId ? "moje" : "cizi"} velikost={34} />
                    <span className="min-w-0 truncate text-sm font-semibold text-inkoust">{clen.jmeno}</span>
                  </Link>
                </th>
                <td className="truncate pl-4 text-[11.5px] text-ink-3">{clen.email}</td>
                <td className={`pl-4 text-[12.5px] ${profil.clenstvi === "aktivni_clen" ? "font-semibold text-inkoust" : "text-mech"}`}>
                  {profil.clenstvi === "aktivni_clen" ? "Aktivní člen" : "Člen"}
                </td>
                <td className="pl-4">
                  {funkce !== null ? (
                    <span className="inline-flex rounded-full bg-povrch-2 px-2 py-[3px] text-[10.5px] font-semibold text-mech">{funkce}</span>
                  ) : (
                    <span className="text-[12.5px] text-[#c3c7b6]">—</span>
                  )}
                </td>
                <td className="pl-4">
                  {admin !== null ? (
                    <span
                      className={`inline-flex rounded-full px-2 py-[3px] text-[10.5px] font-semibold ${
                        clen.isSuperadmin ? "bg-okr-100 text-okr" : "bg-mlha text-smrk"
                      }`}
                    >
                      {admin}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-[#c3c7b6]">—</span>
                  )}
                </td>
                <td className="pl-4 font-display text-[15px] font-bold text-inkoust">
                  {vypravyClena?.get(clen.id) ?? 0}
                </td>
                <td className="pr-3 text-right">
                  {onSpravovat !== undefined ? (
                    <button
                      type="button"
                      onClick={() => onSpravovat(clen)}
                      aria-haspopup="dialog"
                      aria-label={`${clen.jmeno}, správa člena`}
                      className="bez-prejeti inline-flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-povrch-2 hover:text-inkoust focus-visible:outline-2 focus-visible:outline-smrk"
                    >
                      <Ikona nazev="ellipsis" className="size-[15px]" />
                    </button>
                  ) : (
                    <Link
                      to={`/cleny/${clen.id}`}
                      aria-label={`${clen.jmeno}, profil člena`}
                      className="bez-prejeti inline-flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-povrch-2 hover:text-inkoust focus-visible:outline-2 focus-visible:outline-smrk"
                    >
                      <Ikona nazev="chevron-right" className="size-[15px]" />
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {strankovani.pocet > 1 ? (
        <div className="flex h-[52px] items-center justify-between border-t border-linka bg-zahlavi px-5">
          <p className="text-xs text-ink-3">
            {strankovani.viditelne.length} z {clenove.length} členů
          </p>
          <Strankovani
            cislo={strankovani.cislo}
            pocet={strankovani.pocet}
            onZmena={strankovani.nastav}
            popisek="Stránky tabulky členů"
          />
        </div>
      ) : null}
    </div>
    <Strankovani
      cislo={strankovani.cislo}
      pocet={strankovani.pocet}
      onZmena={strankovani.nastav}
      popisek="Stránky seznamu členů"
      className="mt-4 min-[90rem]:hidden"
    />
    </>
  );
}
