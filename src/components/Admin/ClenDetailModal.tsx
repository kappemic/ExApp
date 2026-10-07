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
  chybaKombinaceRole,
  jeAktivniClen,
  jeVRade,
  jeVeVedeni,
  type Role,
  type RoleSet,
} from "../../config/roles";
import { celeJmeno, type MockClen } from "../../data/mockClenove";
import { VALIDACE, VALIDACNI_ZPRAVY } from "../../shared/api-types";
import RoleBadge from "./RoleBadge";

interface ClenDetailModalProps {
  /** `null` = dialog zavřený (komponenta renderuje nic). */
  clen: MockClen | null;
  onZavrit: () => void;
  /**
   * Krok 4b: lokální uložení nad mockem (AdminClenovePage přepíše stav).
   * Bez handleru je tlačítko Upravit neaktivní.
   * Výhled: stejný tvar pošle PATCH na `clenDetailPath(id)` (viz api-types).
   */
  onSave?: (aktualizovany: MockClen) => void;
}

const FOCUSOVATELNE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const EMAIL_VZOR = /^\S+@\S+\.\S+$/;
const TELEFON_VZOR = /^[+0-9][0-9\s/().-]*$/;

type Rezim = "detail" | "upravy";

/**
 * Deníkový detail člena — role=dialog + aria-modal, focus-trap, Esc,
 * klik na backdrop, křížek; po zavření vrací focus na řádek, který dialog otevřel.
 * Deníkový styl: papír, inkoustový rámeček, plochý stín (tokeny shadow-denik).
 *
 * Krok 4b: tlačítko Upravit (aktivní při `onSave`) přepne dialog do
 * editačního formuláře — všechna pole + role checkboxy. Validace na hranici
 * formuláře (české hlášky), kombinace rolí přes `chybaKombinaceRole`
 * (single-source v config/roles.ts). Uložení volá `onSave`.
 */
export default function ClenDetailModal({
  clen,
  onZavrit,
  onSave,
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

  const jmeno: string = celeJmeno(clen);
  const aktivni: boolean = jeAktivniClen(clen.role);
  const rada: boolean = jeVRade(clen.role);
  const vedeni: boolean = jeVeVedeni(clen.role);
  const zarazeni: string =
    rada && vedeni ? "Rada · Vedení" : rada ? "Rada" : vedeni ? "Vedení" : "—";
  const upravy: boolean = rezim === "upravy" && onSave !== undefined;

  function naKlikBackdropu(udalost: MouseEvent<HTMLDivElement>): void {
    if (udalost.target === udalost.currentTarget) {
      onZavrit();
    }
  }

  function naUlozit(aktualizovany: MockClen): void {
    onSave?.(aktualizovany);
    setRezim("detail");
  }

  const telefonZobrazen: string = clen.telefon.trim();
  const discordZobrazen: string = clen.discordNick.trim();

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
              {jmeno}
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

        {upravy ? (
          <ClenUpravForm
            key={clen.id}
            clen={clen}
            onZrusit={() => setRezim("detail")}
            onUlozit={naUlozit}
          />
        ) : (
          <>
            <div
              className="flex flex-wrap gap-1.5 pt-4"
              aria-label="Role člena"
            >
              {clen.role.map((role) => (
                <RoleBadge key={role} role={role} />
              ))}
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
                  Příjmení
                </dt>
                <dd className="font-semibold">{clen.prijmeni}</dd>
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
                  Telefon
                </dt>
                <dd>
                  {telefonZobrazen === "" ? (
                    <span className="font-semibold text-mech">—</span>
                  ) : (
                    <a
                      href={`tel:${telefonZobrazen.replace(/\s/g, "")}`}
                      className="font-semibold text-smrk underline underline-offset-2"
                    >
                      {clen.telefon}
                    </a>
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <dt className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-mech">
                  Discord
                </dt>
                <dd className="font-semibold">
                  {discordZobrazen === "" ? (
                    <span className="text-mech">—</span>
                  ) : (
                    clen.discordNick
                  )}
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
                disabled={onSave === undefined}
                onClick={onSave === undefined ? undefined : () => setRezim("upravy")}
                title={
                  onSave === undefined
                    ? "Editace není k dispozici"
                    : "Upravit údaje člena"
                }
                className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-inkoust px-5 font-bold text-papir motion-safe:transition-colors enabled:motion-safe:hover:bg-smrk disabled:cursor-not-allowed disabled:opacity-50"
              >
                Upravit
              </button>
            </div>
            {onSave === undefined && (
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
/* Editační formulář (hranice): validace česky, role přes roles.ts.    */
/* ------------------------------------------------------------------ */

interface ClenUpravFormProps {
  clen: MockClen;
  onZrusit: () => void;
  onUlozit: (aktualizovany: MockClen) => void;
}

type ChybyFormulare = Partial<
  Record<"jmeno" | "prijmeni" | "email" | "telefon" | "discordNick" | "role", string>
>;

const VSTUP_TRIDY =
  "min-h-[44px] w-full rounded border-2 border-inkoust bg-white/80 px-3 py-2 text-sm font-semibold placeholder:font-normal placeholder:text-inkoust/40 motion-safe:transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-smrk/60";
const VSTUP_CHYBA_TRIDY = "border-red-800 focus:ring-red-800/40";
const POPIS_TRIDY =
  "mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-mech";

function ClenUpravForm({ clen, onZrusit, onUlozit }: ClenUpravFormProps): JSX.Element {
  const [jmeno, setJmeno] = useState<string>(clen.jmeno);
  const [prijmeni, setPrijmeni] = useState<string>(clen.prijmeni);
  const [email, setEmail] = useState<string>(clen.email);
  const [telefon, setTelefon] = useState<string>(clen.telefon);
  const [discordNick, setDiscordNick] = useState<string>(clen.discordNick);
  const [role, setRole] = useState<Role[]>([...clen.role]);
  const [chyby, setChyby] = useState<ChybyFormulare>({});

  const jmenoId: string = useId();
  const prijmeniId: string = useId();
  const emailId: string = useId();
  const telefonId: string = useId();
  const discordId: string = useId();
  const jmenoChybaId: string = useId();
  const prijmeniChybaId: string = useId();
  const emailChybaId: string = useId();
  const telefonChybaId: string = useId();
  const discordChybaId: string = useId();
  const roleChybaId: string = useId();

  /** Báze se chová jako radio (clen XOR aktivni-clen), nadstavbu hlídá validace. */
  function prepniRoli(volba: Role): void {
    setRole((predchozi: Role[]) => {
      if (predchozi.includes(volba)) {
        return predchozi.filter((r: Role) => r !== volba);
      }
      if (volba === "clen") {
        return [...predchozi.filter((r: Role) => r !== "aktivni-clen"), "clen"];
      }
      if (volba === "aktivni-clen") {
        return [...predchozi.filter((r: Role) => r !== "clen"), "aktivni-clen"];
      }
      return [...predchozi, volba];
    });
  }

  function validuj(
    hodnoty: Pick<MockClen, "jmeno" | "prijmeni" | "email" | "telefon" | "discordNick"> & {
      role: RoleSet;
    },
  ): ChybyFormulare {
    const nalezene: ChybyFormulare = {};
    const jmenoTrim: string = hodnoty.jmeno.trim();
    const prijmeniTrim: string = hodnoty.prijmeni.trim();
    const emailTrim: string = hodnoty.email.trim();
    const telefonTrim: string = hodnoty.telefon.trim();
    const discordTrim: string = hodnoty.discordNick.trim();

    if (jmenoTrim === "") {
      nalezene.jmeno = VALIDACNI_ZPRAVY.jmenoPovinne;
    } else if (jmenoTrim.length < VALIDACE.jmenoMinDelka) {
      nalezene.jmeno = VALIDACNI_ZPRAVY.jmenoKratke;
    } else if (jmenoTrim.length > VALIDACE.jmenoMaxDelka) {
      nalezene.jmeno = VALIDACNI_ZPRAVY.jmenoDlouhe;
    }

    if (prijmeniTrim === "") {
      nalezene.prijmeni = "Zadej příjmení.";
    } else if (prijmeniTrim.length < VALIDACE.prijmeniMinDelka) {
      nalezene.prijmeni = VALIDACNI_ZPRAVY.prijmeniKratke;
    } else if (prijmeniTrim.length > VALIDACE.prijmeniMaxDelka) {
      nalezene.prijmeni = VALIDACNI_ZPRAVY.prijmeniDlouhe;
    }

    if (emailTrim === "") {
      nalezene.email = VALIDACNI_ZPRAVY.emailPovinny;
    } else if (!EMAIL_VZOR.test(emailTrim)) {
      nalezene.email = VALIDACNI_ZPRAVY.emailNeplatny;
    }

    if (telefonTrim !== "") {
      if (telefonTrim.length > VALIDACE.telefonMaxDelka) {
        nalezene.telefon = VALIDACNI_ZPRAVY.telefonDlouhy;
      } else if (!TELEFON_VZOR.test(telefonTrim)) {
        nalezene.telefon = VALIDACNI_ZPRAVY.telefonNeplatny;
      }
    }

    if (discordTrim.length > VALIDACE.discordNickMaxDelka) {
      nalezene.discordNick = VALIDACNI_ZPRAVY.discordNickDlouhy;
    }

    const chybaRole: string | null = chybaKombinaceRole(hodnoty.role);
    if (chybaRole !== null) {
      nalezene.role = chybaRole;
    }
    return nalezene;
  }

  function naOdeslat(udalost: FormEvent<HTMLFormElement>): void {
    udalost.preventDefault();
    const hodnoty = { jmeno, prijmeni, email, telefon, discordNick, role };
    const nalezene: ChybyFormulare = validuj(hodnoty);
    setChyby(nalezene);
    if (Object.keys(nalezene).length > 0) {
      return;
    }
    const serazeneRole: Role[] = [...ROLE_LIST.map((r) => r.id)].filter((r: Role) =>
      role.includes(r),
    );
    onUlozit({
      id: clen.id,
      jmeno: jmeno.trim(),
      prijmeni: prijmeni.trim(),
      email: email.trim(),
      telefon: telefon.trim(),
      discordNick: discordNick.trim(),
      role: serazeneRole,
    });
  }

  return (
    <form onSubmit={naOdeslat} noValidate className="mt-4 space-y-4">
      <div>
        <label htmlFor={jmenoId} className={POPIS_TRIDY}>
          Jméno *
        </label>
        <input
          id={jmenoId}
          type="text"
          autoComplete="given-name"
          value={jmeno}
          onChange={(e) => setJmeno(e.target.value)}
          aria-invalid={chyby.jmeno !== undefined}
          aria-describedby={chyby.jmeno === undefined ? undefined : jmenoChybaId}
          className={`${VSTUP_TRIDY} ${chyby.jmeno === undefined ? "" : VSTUP_CHYBA_TRIDY}`}
        />
        {chyby.jmeno !== undefined && (
          <p id={jmenoChybaId} role="alert" className="mt-1 text-sm font-semibold text-red-800">
            {chyby.jmeno}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={prijmeniId} className={POPIS_TRIDY}>
          Příjmení *
        </label>
        <input
          id={prijmeniId}
          type="text"
          autoComplete="family-name"
          value={prijmeni}
          onChange={(e) => setPrijmeni(e.target.value)}
          aria-invalid={chyby.prijmeni !== undefined}
          aria-describedby={chyby.prijmeni === undefined ? undefined : prijmeniChybaId}
          className={`${VSTUP_TRIDY} ${chyby.prijmeni === undefined ? "" : VSTUP_CHYBA_TRIDY}`}
        />
        {chyby.prijmeni !== undefined && (
          <p id={prijmeniChybaId} role="alert" className="mt-1 text-sm font-semibold text-red-800">
            {chyby.prijmeni}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={emailId} className={POPIS_TRIDY}>
          E-mail *
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={chyby.email !== undefined}
          aria-describedby={chyby.email === undefined ? undefined : emailChybaId}
          className={`${VSTUP_TRIDY} ${chyby.email === undefined ? "" : VSTUP_CHYBA_TRIDY}`}
        />
        {chyby.email !== undefined && (
          <p id={emailChybaId} role="alert" className="mt-1 text-sm font-semibold text-red-800">
            {chyby.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={telefonId} className={POPIS_TRIDY}>
          Telefon
        </label>
        <input
          id={telefonId}
          type="tel"
          autoComplete="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          aria-invalid={chyby.telefon !== undefined}
          aria-describedby={chyby.telefon === undefined ? undefined : telefonChybaId}
          className={`${VSTUP_TRIDY} ${chyby.telefon === undefined ? "" : VSTUP_CHYBA_TRIDY}`}
        />
        {chyby.telefon !== undefined && (
          <p id={telefonChybaId} role="alert" className="mt-1 text-sm font-semibold text-red-800">
            {chyby.telefon}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={discordId} className={POPIS_TRIDY}>
          Discord
        </label>
        <input
          id={discordId}
          type="text"
          autoComplete="off"
          value={discordNick}
          onChange={(e) => setDiscordNick(e.target.value)}
          aria-invalid={chyby.discordNick !== undefined}
          aria-describedby={chyby.discordNick === undefined ? undefined : discordChybaId}
          className={`${VSTUP_TRIDY} ${chyby.discordNick === undefined ? "" : VSTUP_CHYBA_TRIDY}`}
        />
        {chyby.discordNick !== undefined && (
          <p id={discordChybaId} role="alert" className="mt-1 text-sm font-semibold text-red-800">
            {chyby.discordNick}
          </p>
        )}
      </div>

      <fieldset>
        <legend className={POPIS_TRIDY}>Role *</legend>
        <p className="mb-2 text-xs text-inkoust/60">
          Základ právě jedna (člen, nebo aktivní člen). Rada a vedení jen
          s aktivním členem. Admin se do exkluzivity nepočítá.
        </p>
        <div className="space-y-2">
          {ROLE_LIST.map((info) => {
            const zaskrtnuto: boolean = role.includes(info.id);
            return (
              <label
                key={info.id}
                className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded border border-linka bg-white/60 px-3 py-2 motion-safe:transition-colors motion-safe:hover:bg-linka/30"
              >
                <input
                  type="checkbox"
                  checked={zaskrtnuto}
                  onChange={() => prepniRoli(info.id)}
                  aria-describedby={chyby.role === undefined ? undefined : roleChybaId}
                  className="mt-1 h-5 w-5 shrink-0 accent-smrk"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{info.nazev}</span>
                  <span className="block text-xs text-inkoust/60">{info.popis}</span>
                </span>
              </label>
            );
          })}
        </div>
        {chyby.role !== undefined && (
          <p id={roleChybaId} role="alert" className="mt-2 text-sm font-semibold text-red-800">
            {chyby.role}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 border-t-2 border-inkoust pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onZrusit}
          className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-white/70 px-5 font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/50"
        >
          Zrušit
        </button>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center justify-center rounded border-2 border-inkoust bg-inkoust px-5 font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-smrk"
        >
          Uložit změny
        </button>
      </div>
    </form>
  );
}
