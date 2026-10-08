import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type MouseEvent,
} from "react";
import {
  ROLE_LIST,
  jeAktivniClen,
  jeVRade,
  jeVeVedeni,
  type Role,
  type RoleSet,
} from "../../config/roles";
import type { UserListItem } from "../../shared/api-types";
import RoleBadge from "./RoleBadge";

interface ClenDetailModalProps {
  /** `null` = dialog zavřený (komponenta renderuje nic). */
  clen: UserListItem | null;
  onZavrit: () => void;
  /**
   * Uložení role přes PATCH /api/users/:id (řeší AdminClenovePage).
   * Vrací českou chybu, nebo `null` při úspěchu.
   * Bez handleru je tlačítko Upravit neaktivní.
   */
  onUlozitRoli?: (id: string, role: Role) => Promise<string | null>;
}

const FOCUSOVATELNE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Rezim = "detail" | "upravy";

/** Jedna DB role zabalená pro je*() helpery (single-source roles.ts). */
function jakoRoleSet(role: Role): RoleSet {
  return [role];
}

/**
 * Deníkový detail člena — role=dialog + aria-modal, focus-trap, Esc,
 * klik na backdrop, křížek; po zavření vrací focus na řádek, který dialog otevřel.
 * Deníkový styl: papír, inkoustový rámeček, plochý stín (tokeny shadow-denik).
 *
 * Zdroj: živí users z GET /api/users (DB `clenove` je prázdná).
 * Editace mění jen primární roli (jedna hodnota) a ukládá ji
 * přes PATCH /api/users/:id.
 */
export default function ClenDetailModal({
  clen,
  onZavrit,
  onUlozitRoli,
}: ClenDetailModalProps): JSX.Element | null {
  const nadpisId: string = useId();
  const popisId: string = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const krizekRef = useRef<HTMLButtonElement>(null);
  const [rezim, setRezim] = useState<Rezim>("detail");
  const clenId: string | null = clen === null ? null : clen.id;

  useEffect(() => {
    setRezim("detail");
  }, [clenId]);

  useEffect(() => {
    if (clen === null) {
      return;
    }
    const predchoziFocus: Element | null = document.activeElement;
    krizekRef.current?.focus();

    const puvodniOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (udalost.key === "Escape") {
        udalost.stopPropagation();
        onZavrit();
        return;
      }
      if (udalost.key !== "Tab") {
        return;
      }
      const koren: HTMLDivElement | null = dialogRef.current;
      if (koren === null) {
        return;
      }
      const prvky: HTMLElement[] = Array.from(
        koren.querySelectorAll<HTMLElement>(FOCUSOVATELNE),
      );
      if (prvky.length === 0) {
        return;
      }
      const prvni: HTMLElement = prvky[0];
      const posledni: HTMLElement = prvky[prvky.length - 1];
      if (udalost.shiftKey && document.activeElement === prvni) {
        udalost.preventDefault();
        posledni.focus();
      } else if (!udalost.shiftKey && document.activeElement === posledni) {
        udalost.preventDefault();
        prvni.focus();
      }
    }

    document.addEventListener("keydown", naStiskKlavesy, true);
    return () => {
      document.removeEventListener("keydown", naStiskKlavesy, true);
      document.body.style.overflow = puvodniOverflow;
      if (predchoziFocus instanceof HTMLElement) {
        predchoziFocus.focus();
      }
    };
  }, [clen, onZavrit]);

  if (clen === null) {
    return null;
  }

  const roleSet: RoleSet = jakoRoleSet(clen.role);
  const aktivni: boolean = jeAktivniClen(roleSet);
  const rada: boolean = jeVRade(roleSet);
  const vedeni: boolean = jeVeVedeni(roleSet);
  const zarazeni: string =
    rada && vedeni ? "Rada · Vedení" : rada ? "Rada" : vedeni ? "Vedení" : "—";
  const upravy: boolean = rezim === "upravy" && onUlozitRoli !== undefined;

  function naKlikBackdropu(udalost: MouseEvent<HTMLDivElement>): void {
    if (udalost.target === udalost.currentTarget) {
      onZavrit();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 p-4 sm:items-center"
      onMouseDown={naKlikBackdropu}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={nadpisId}
        aria-describedby={popisId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border-2 border-inkoust bg-papir p-5 shadow-denik sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-inkoust pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mech">
              {upravy ? "Úprava člena" : "Detail člena"}
            </p>
            <h2
              id={nadpisId}
              className="mt-1 text-2xl font-extrabold tracking-tight"
            >
              {clen.jmeno}
            </h2>
            <p id={popisId} className="mt-1 text-sm text-inkoust/70">
              {aktivni ? "Aktivní člen" : "Člen"}
              {zarazeni === "—" ? "" : ` · ${zarazeni}`}
            </p>
          </div>
          <button
            ref={krizekRef}
            type="button"
            onClick={onZavrit}
            aria-label="Zavřít detail člena"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded border-2 border-inkoust bg-white/70 text-xl font-extrabold leading-none motion-safe:transition-colors motion-safe:hover:bg-linka/50"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {rezim === "upravy" && onUlozitRoli !== undefined ? (
          <ClenRoliForm
            key={clen.id}
            clen={clen}
            onZrusit={() => setRezim("detail")}
            onUlozitRoli={onUlozitRoli}
            onHotovo={() => setRezim("detail")}
          />
        ) : (
          <>
            <div
              className="flex flex-wrap gap-1.5 pt-4"
              aria-label="Role člena"
            >
              <RoleBadge role={clen.role} />
            </div>

            <dl className="mt-4 space-y-3 border-t border-linka pt-4 text-sm">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  Jméno
                </dt>
                <dd className="font-semibold">{clen.jmeno}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  E-mail
                </dt>
                <dd>
                  <a
                    href={`mailto:${clen.email}`}
                    className="font-semibold text-smrk underline underline-offset-2"
                  >
                    {clen.email}
                  </a>
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-2 border-t-2 border-inkoust pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onZavrit}
                className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-white/70 px-5 font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50"
              >
                Zavřít
              </button>
              <button
                type="button"
                disabled={onUlozitRoli === undefined}
                onClick={
                  onUlozitRoli === undefined
                    ? undefined
                    : () => setRezim("upravy")
                }
                title={
                  onUlozitRoli === undefined
                    ? "Editace není k dispozici"
                    : "Upravit roli člena"
                }
                className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-inkoust px-5 font-bold text-papir motion-safe:transition-colors enabled:motion-safe:hover:bg-smrk disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upravit
              </button>
            </div>
            {onUlozitRoli === undefined && (
              <p className="mt-2 text-center text-xs text-inkoust/60 sm:text-right">
                Editace není k dispozici.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editační formulář role (hranice): jedna primární role, radio seznam. */
/* ------------------------------------------------------------------ */

interface ClenRoliFormProps {
  clen: UserListItem;
  onZrusit: () => void;
  onUlozitRoli: (id: string, role: Role) => Promise<string | null>;
  onHotovo: () => void;
}

const POPIS_TRIDY =
  "mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-mech";

function ClenRoliForm({
  clen,
  onZrusit,
  onUlozitRoli,
  onHotovo,
}: ClenRoliFormProps): JSX.Element {
  const [role, setRole] = useState<Role>(clen.role);
  const [chyba, setChyba] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState<boolean>(false);
  const roleChybaId: string = useId();

  useEffect(() => {
    setRole(clen.role);
    setChyba(null);
  }, [clen]);

  async function naOdeslat(udalost: FormEvent<HTMLFormElement>): Promise<void> {
    udalost.preventDefault();
    if (ukladam) return;
    setChyba(null);
    if (role === clen.role) {
      onHotovo();
      return;
    }
    setUkladam(true);
    const vysledek: string | null = await onUlozitRoli(clen.id, role);
    setUkladam(false);
    if (vysledek !== null) {
      setChyba(vysledek);
      return;
    }
    onHotovo();
  }

  return (
    <form onSubmit={(e) => void naOdeslat(e)} noValidate className="mt-4 space-y-4">
      <fieldset>
        <legend className={POPIS_TRIDY}>Role *</legend>
        <p className="mb-2 text-xs text-inkoust/60">
          Každý uživatel má právě jednu primární roli.
        </p>
        <div className="space-y-2">
          {ROLE_LIST.map((info) => {
            const zaskrtnuto: boolean = role === info.id;
            return (
              <label
                key={info.id}
                className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded border border-linka bg-white/60 px-3 py-2 motion-safe:transition-colors motion-safe:hover:bg-linka/30"
              >
                <input
                  type="radio"
                  name="role"
                  value={info.id}
                  checked={zaskrtnuto}
                  onChange={() => setRole(info.id)}
                  disabled={ukladam}
                  aria-describedby={chyba === null ? undefined : roleChybaId}
                  className="mt-1 h-5 w-5 shrink-0 accent-smrk"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{info.nazev}</span>
                  <span className="block text-xs text-inkoust/60">
                    {info.popis}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {chyba !== null && (
          <p
            id={roleChybaId}
            role="alert"
            className="mt-2 text-sm font-semibold text-red-800"
          >
            {chyba}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 border-t-2 border-inkoust pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onZrusit}
          disabled={ukladam}
          className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-white/70 px-5 font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={ukladam}
          className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-inkoust px-5 font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-smrk disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ukladam ? "Ukládám…" : "Uložit změny"}
        </button>
      </div>
    </form>
  );
}
