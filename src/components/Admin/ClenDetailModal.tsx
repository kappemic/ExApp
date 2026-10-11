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
  chybaKombinace3D,
  mapujRoliNaProfil,
  type Clenstvi,
  type ClenskyProfil,
  type Funkce,
} from "../../config/roles";
import type { UserListItem } from "../../shared/api-types";
import type { UlozitProfilVstup } from "../../lib/admin-clenove";
import RoleBadge from "./RoleBadge";

interface ClenDetailModalProps {
  /** `null` = dialog zavřený (komponenta renderuje nic). */
  clen: UserListItem | null;
  onZavrit: () => void;
  /**
   * Uložení 3D profilu přes PATCH /api/users/:id (řeší AdminClenovePage).
   * Vrací českou chybu, nebo `null` při úspěchu.
   * Bez handleru je tlačítko Upravit neaktivní.
   */
  onUlozitProfil?: (
    id: string,
    vstup: UlozitProfilVstup,
  ) => Promise<string | null>;
}

const FOCUSOVATELNE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Rezim = "detail" | "upravy";

/** 3D profil člena s fallbackem ze starého `role` (trio je optional). */
function profilClena(clen: UserListItem): ClenskyProfil {
  const profil: ClenskyProfil = mapujRoliNaProfil(clen.role);
  return {
    clenstvi: clen.clenstvi ?? profil.clenstvi,
    funkce: clen.funkce ?? profil.funkce,
    isAdmin: clen.isAdmin ?? profil.isAdmin,
  };
}

function nazevFunkce(funkce: Funkce): string {
  if (funkce === "vedeni") return "Vedení";
  if (funkce === "rada") return "Rada";
  return "Bez funkce";
}

/**
 * Deníkový detail člena — role=dialog + aria-modal, focus-trap, Esc,
 * klik na backdrop, křížek; po zavření vrací focus na řádek, který dialog otevřel.
 * Deníkový styl: papír, inkoustový rámeček, plochý stín (tokeny shadow-denik).
 *
 * Zdroj: živí users z GET /api/users (DB `clenove` je prázdná).
 * Editace mění 3D profil (členství / funkce / admin + škola / třída)
 * a ukládá ho přes PATCH /api/users/:id (`ulozProfilClena`).
 */
export default function ClenDetailModal({
  clen,
  onZavrit,
  onUlozitProfil,
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

  const profil: ClenskyProfil = profilClena(clen);
  const aktivni: boolean = profil.clenstvi === "aktivni_clen";
  const zarazeni: string =
    profil.funkce === "rada"
      ? "Rada"
      : profil.funkce === "vedeni"
        ? "Vedení"
        : "—";
  const upravy: boolean = rezim === "upravy" && onUlozitProfil !== undefined;

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
              {profil.isAdmin ? " · Admin" : ""}
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

        {rezim === "upravy" && onUlozitProfil !== undefined ? (
          <ClenProfilForm
            key={clen.id}
            clen={clen}
            onZrusit={() => setRezim("detail")}
            onUlozitProfil={onUlozitProfil}
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
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  Členství
                </dt>
                <dd className="font-semibold">
                  {aktivni ? "Aktivní člen" : "Člen"}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  Funkce
                </dt>
                <dd className="font-semibold">{nazevFunkce(profil.funkce)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  Admin
                </dt>
                <dd className="font-semibold">
                  {profil.isAdmin ? "Ano" : "Ne"}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  Škola
                </dt>
                <dd className="text-inkoust/70">—</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  Třída
                </dt>
                <dd className="text-inkoust/70">—</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-inkoust/60">
              Seznam školu a třídu nenese — vyplníš je v úpravách.
            </p>

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
                disabled={onUlozitProfil === undefined}
                onClick={
                  onUlozitProfil === undefined
                    ? undefined
                    : () => setRezim("upravy")
                }
                title={
                  onUlozitProfil === undefined
                    ? "Editace není k dispozici"
                    : "Upravit profil člena"
                }
                className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-inkoust px-5 font-bold text-papir motion-safe:transition-colors enabled:motion-safe:hover:bg-smrk disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
              >
                Upravit
              </button>
            </div>
            {onUlozitProfil === undefined && (
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
/* Editační formulář profilu (hranice): členství + funkce + admin +     */
/* škola/třída. Funkce jen s aktivním členem (`chybaKombinace3D`).      */
/* ------------------------------------------------------------------ */

interface ClenProfilFormProps {
  clen: UserListItem;
  onZrusit: () => void;
  onUlozitProfil: (
    id: string,
    vstup: UlozitProfilVstup,
  ) => Promise<string | null>;
  onHotovo: () => void;
}

const POPIS_TRIDY =
  "mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-mech";

const CLENSTVI_VOLBY: ReadonlyArray<{
  id: Clenstvi;
  nazev: string;
  popis: string;
}> = [
  { id: "clen", nazev: "Člen", popis: "Základní člen oddílu." },
  {
    id: "aktivni_clen",
    nazev: "Aktivní člen",
    popis: "Pravidelně jezdí na výpravy — smí je i spravovat.",
  },
];

function ClenProfilForm({
  clen,
  onZrusit,
  onUlozitProfil,
  onHotovo,
}: ClenProfilFormProps): JSX.Element {
  const puvodni: ClenskyProfil = profilClena(clen);
  const [clenstvi, setClenstvi] = useState<Clenstvi>(puvodni.clenstvi);
  const [funkce, setFunkce] = useState<Funkce>(puvodni.funkce);
  const [adminPriznak, setAdminPriznak] = useState<boolean>(puvodni.isAdmin);
  const [skola, setSkola] = useState<string>("");
  const [trida, setTrida] = useState<string>("");
  const [chyba, setChyba] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState<boolean>(false);
  const profilChybaId: string = useId();
  const skolaId: string = useId();
  const tridaId: string = useId();
  const funkceId: string = useId();

  useEffect(() => {
    const aktualni: ClenskyProfil = profilClena(clen);
    setClenstvi(aktualni.clenstvi);
    setFunkce(aktualni.funkce);
    setAdminPriznak(aktualni.isAdmin);
    setSkola("");
    setTrida("");
    setChyba(null);
  }, [clen]);

  // Funkci smí mít jen aktivní člen — při přepnutí na člena spadne na null.
  function naZmenuClenstvi(nove: Clenstvi): void {
    setClenstvi(nove);
    if (nove === "clen") {
      setFunkce(null);
    }
  }

  const chybaKombinace: string | null = chybaKombinace3D({
    clenstvi,
    funkce,
    isAdmin: adminPriznak,
  });

  async function naOdeslat(udalost: FormEvent<HTMLFormElement>): Promise<void> {
    udalost.preventDefault();
    if (ukladam) return;
    setChyba(null);
    if (chybaKombinace !== null) {
      setChyba(chybaKombinace);
      return;
    }
    const skolaCista: string = skola.trim();
    const tridaCista: string = trida.trim();
    const trioStejne: boolean =
      clenstvi === puvodni.clenstvi &&
      funkce === puvodni.funkce &&
      adminPriznak === puvodni.isAdmin;
    // Škola/třída se posílá jen vyplněná (seznam je nenese — prázdná by mazala).
    if (trioStejne && skolaCista.length === 0 && tridaCista.length === 0) {
      onHotovo();
      return;
    }
    const vstup: UlozitProfilVstup = {
      clenstvi,
      funkce,
      isAdmin: adminPriznak,
    };
    if (skolaCista.length > 0) vstup.skola = skolaCista;
    if (tridaCista.length > 0) vstup.trida = tridaCista;
    setUkladam(true);
    const vysledek: string | null = await onUlozitProfil(clen.id, vstup);
    setUkladam(false);
    if (vysledek !== null) {
      setChyba(vysledek);
      return;
    }
    onHotovo();
  }

  return (
    <form onSubmit={(e) => void naOdeslat(e)} noValidate className="mt-4 space-y-5">
      <fieldset>
        <legend className={POPIS_TRIDY}>Členství *</legend>
        <div className="space-y-2">
          {CLENSTVI_VOLBY.map((volba) => {
            const zaskrtnuto: boolean = clenstvi === volba.id;
            return (
              <label
                key={volba.id}
                className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded border border-linka bg-white/60 px-3 py-2 motion-safe:transition-colors motion-safe:hover:bg-linka/30"
              >
                <input
                  type="radio"
                  name="clenstvi"
                  value={volba.id}
                  checked={zaskrtnuto}
                  onChange={() => naZmenuClenstvi(volba.id)}
                  disabled={ukladam}
                  aria-describedby={chyba === null ? undefined : profilChybaId}
                  className="mt-1 h-5 w-5 shrink-0 accent-smrk"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{volba.nazev}</span>
                  <span className="block text-xs text-inkoust/60">
                    {volba.popis}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor={funkceId} className={POPIS_TRIDY}>
          Funkce
        </label>
        <select
          id={funkceId}
          value={funkce ?? ""}
          onChange={(e) => {
            const hodnota: string = e.target.value;
            setFunkce(
              hodnota === "vedeni" ? "vedeni" : hodnota === "rada" ? "rada" : null,
            );
          }}
          disabled={ukladam || clenstvi === "clen"}
          aria-describedby={chybaKombinace === null ? undefined : profilChybaId}
          title={
            clenstvi === "clen"
              ? "Funkci může mít jen aktivní člen"
              : "Vyber funkci člena"
          }
          className="block min-h-[44px] w-full rounded border border-linka bg-white/60 px-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Bez funkce</option>
          <option value="vedeni">Vedení</option>
          <option value="rada">Rada</option>
        </select>
        <p className="mt-1 text-xs text-inkoust/60">
          {clenstvi === "clen"
            ? "Funkci (vedení/rada) může mít jen aktivní člen."
            : "Nadstavba k aktivnímu členství — vedení, nebo rada."}
        </p>
      </div>

      <div className="flex min-h-[44px] items-center justify-between gap-3 rounded border border-linka bg-white/60 px-3 py-2">
        <label htmlFor={`${funkceId}-admin`} className="min-w-0">
          <span className="block text-sm font-bold">Admin</span>
          <span className="block text-xs text-inkoust/60">
            Technický příznak — správa členů a kódů.
          </span>
        </label>
        <input
          id={`${funkceId}-admin`}
          type="checkbox"
          role="switch"
          aria-checked={adminPriznak}
          checked={adminPriznak}
          onChange={(e) => setAdminPriznak(e.target.checked)}
          disabled={ukladam}
          className="h-6 w-6 shrink-0 accent-smrk"
        />
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor={skolaId} className={POPIS_TRIDY}>
            Škola
          </label>
          <input
            id={skolaId}
            type="text"
            value={skola}
            onChange={(e) => setSkola(e.target.value)}
            disabled={ukladam}
            maxLength={120}
            autoComplete="off"
            placeholder="Nevyplněno"
            className="block min-h-[44px] w-full rounded border border-linka bg-white/60 px-3 text-base placeholder:text-inkoust/40"
          />
        </div>
        <div>
          <label htmlFor={tridaId} className={POPIS_TRIDY}>
            Třída
          </label>
          <input
            id={tridaId}
            type="text"
            value={trida}
            onChange={(e) => setTrida(e.target.value)}
            disabled={ukladam}
            maxLength={120}
            autoComplete="off"
            placeholder="Nevyplněno"
            className="block min-h-[44px] w-full rounded border border-linka bg-white/60 px-3 text-base placeholder:text-inkoust/40"
          />
        </div>
        <p className="text-xs text-inkoust/60">
          Seznam školu a třídu nenese — vyplněním se nastaví (posílá se jen
          neprázdné, max 120 znaků).
        </p>
      </div>

      {chyba !== null && (
        <p
          id={profilChybaId}
          role="alert"
          className="text-sm font-semibold text-red-800"
        >
          {chyba}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t-2 border-inkoust pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onZrusit}
          disabled={ukladam}
          className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-white/70 px-5 font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50 disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={ukladam || chybaKombinace !== null}
          title={
            chybaKombinace !== null
              ? chybaKombinace
              : "Uložit profil člena"
          }
          className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-inkoust px-5 font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-smrk disabled:cursor-not-allowed disabled:opacity-50 [touch-action:manipulation]"
        >
          {ukladam ? "Ukládám…" : "Uložit změny"}
        </button>
      </div>
    </form>
  );
}
