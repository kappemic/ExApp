import type { JSX } from "react";
import { Link } from "react-router-dom";
import {
  mapujRoliNaProfil,
  type ClenskyProfil,
} from "../../config/roles";
import { OBLIBENE_BARVY, jeOblibenaBarva, type UserListItem } from "../../shared/api-types";
import { popisekClena } from "../../lib/clen-popisek";
import { zobrazeniTelefonu } from "../../shared/telefon";
import AvatarKruh from "../AvatarKruh";
import { SEZNAM_KARTA_TRIDA, SeznamSipka } from "../SeznamKarta";
import PrazdnyStav from "../PrazdnyStav";
import Strankovani from "../Strankovani";
import { useStrankovani } from "../../hooks/useStrankovani";
import { RADKU_NA_STRANKU } from "../../lib/strankovani";
import { IkonaLide } from "../SeznamIkony";
import { TlacitkoProfilu } from "../clen/ClenProfil";

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
        <span className="inline-flex min-h-[28px] items-center whitespace-nowrap rounded-full border border-linka bg-povrch px-2.5 py-0.5 text-xs font-bold text-inkoust">
          Vedení
        </span>
      )}
    </span>
  );
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
    <div className="hidden overflow-x-auto rounded-lg border border-linka bg-povrch shadow-denik min-[90rem]:block">
      <table className="w-full min-w-[880px] border-collapse text-left lg:min-w-0 lg:table-fixed">
        <colgroup className="max-lg:hidden">
          <col className="w-[30%]" />
          <col className="w-[18%]" />
          <col className="w-[22%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
        </colgroup>
        <caption className="sr-only">
          {popisek ?? "Seznam členů — jméno, kontakt, stav a zařazení"}
        </caption>
        <thead>
          <tr className="border-b border-linka bg-papir">
            <th scope="col" className="min-h-[44px] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
              Jméno
            </th>
            <th scope="col" className="min-h-[44px] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
              Telefon
            </th>
            <th scope="col" className="min-h-[44px] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
              Discord
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
          {strankovani.viditelne.map((clen) => {
            const vybran: boolean = vybranyId === clen.id;
            const profil: ClenskyProfil = profilClena(clen);
            const telefonText = zobrazeniTelefonu(clen.telefon).text;
            return (
              <tr
                key={clen.id}
                className={`border-b border-linka align-middle last:border-b-0 motion-safe:transition-colors motion-safe:hover:bg-linka/30 ${
                  vybran ? "bg-linka/50" : ""
                }`}
              >
                <th scope="row" className="min-w-0 p-1.5 sm:p-2">
                  <div className="flex items-center gap-1">
                    <TlacitkoProfilu
                      id={clen.id}
                      jmeno={clen.jmeno}
                      avatarUrl={clen.avatarUrl}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2"
                    >
                      <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} />
                      <span className="min-w-0">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="block min-w-0 max-w-[180px] truncate text-sm font-bold sm:max-w-none sm:whitespace-normal">
                            {clen.jmeno}
                          </span>
                          <KoleckoBarvy nazev={clen.oblibenaBarva ?? ""} />
                          {clen.isSuperadmin ? (
                            <span
                              title="Hlavní admin"
                              className="shrink-0 text-sm font-bold text-jantar"
                            >
                              <span aria-hidden="true">☆</span>
                              <span className="sr-only">Hlavní admin</span>
                            </span>
                          ) : profil.isAdmin ? (
                            <span
                              title="Administrátor"
                              className="shrink-0 text-sm font-bold text-jantar"
                            >
                              <span aria-hidden="true">★</span>
                              <span className="sr-only">administrátor</span>
                            </span>
                          ) : null}
                        </span>
                        <span className="block max-w-[180px] truncate text-xs font-normal text-mech sm:max-w-none sm:whitespace-normal">
                          {clen.email}
                        </span>
                      </span>
                    </TlacitkoProfilu>
                    <Link
                      to={`/cleny/${clen.id}`}
                      className="bez-prejeti nahled-press inline-flex min-h-11 shrink-0 items-center rounded px-2.5 text-xs font-extrabold text-mech [touch-action:manipulation]"
                    >
                      Karta
                    </Link>
                    <button
                      type="button"
                      onClick={() => onVyber(clen)}
                      aria-haspopup="dialog"
                      aria-label={`${clen.jmeno} — otevřít detail člena`}
                      className="bez-prejeti nahled-press inline-flex min-h-[44px] shrink-0 items-center rounded px-2.5 text-xs font-extrabold text-mech transition-[transform,background-color,color] duration-200 ease-out hover:-translate-y-px hover:bg-smrk/[0.08] hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none motion-reduce:hover:translate-y-0 [touch-action:manipulation]"
                    >
                      Detail ›
                    </button>
                  </div>
                </th>
                <td className="px-4 py-3 text-sm">
                  {telefonText.length > 0 ? telefonText : "—"}
                </td>
                <td className="px-4 py-3 text-sm">
                  {(clen.discordNick ?? "").trim().length > 0
                    ? clen.discordNick
                    : "—"}
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
