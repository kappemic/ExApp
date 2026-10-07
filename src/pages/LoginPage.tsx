import { useState, type FormEvent, type JSX } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, type PolePrihlaseni } from "../hooks/useAuth";

/**
 * Bezpečný návrat po loginu — jen vnitřní cesta.
 * Odmítne absolutní URL, `//evil` i prázdnou hodnotu.
 */
export function bezpecneFrom(hodnota: string | null): string {
  if (hodnota === null || !hodnota.startsWith("/") || hodnota.startsWith("//")) {
    return "/";
  }
  return hodnota;
}

const VSTUP_TRIDY =
  "min-h-[44px] w-full rounded-md border-2 border-linka bg-white px-3.5 py-2.5 text-base text-inkoust placeholder:text-inkoust/40 transition-colors focus:border-smrk focus:outline-none motion-reduce:transition-none";
const VSTUP_CHYBA_TRIDY =
  "min-h-[44px] w-full rounded-md border-2 border-red-800 bg-white px-3.5 py-2.5 text-base text-inkoust placeholder:text-inkoust/40 focus:border-red-800 focus:outline-none";

type ChybyPoli = Partial<Record<PolePrihlaseni, string>>;

/** Přihlášení e-mailem + heslem — prezentace, logika žije v useAuth. */
export default function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const navrat = bezpecneFrom(params.get("from"));
  const [email, setEmail] = useState("");
  const [heslo, setHeslo] = useState("");
  const [ukazatHeslo, setUkazatHeslo] = useState(false);
  const [chyby, setChyby] = useState<ChybyPoli>({});
  const [formChyba, setFormChyba] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (odesilaSe) return;
    setOdesilaSe(true);
    setFormChyba(null);
    const vysledek = await login({ email, heslo });
    if (vysledek.uspech) {
      navigate(navrat, { replace: true });
      return;
    }
    setChyby(vysledek.chybyPoli);
    setFormChyba(vysledek.chyba);
    setOdesilaSe(false);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <p className="text-sm font-medium text-mech">ExApp · přihlášení</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Přihlášení</h1>
      <p className="mt-2 text-base text-inkoust/75">
        Vítej zpět v ExApp. Zadej e-mail a heslo z registrace.
      </p>

      <form
        onSubmit={onSubmit}
        noValidate
        aria-describedby={formChyba !== null ? "prihlaseni-chyba" : undefined}
        className="mt-6 flex flex-col gap-4 rounded-lg border-2 border-inkoust bg-white/60 p-5 shadow-denik sm:p-6"
      >
        {formChyba !== null && (
          <p
            id="prihlaseni-chyba"
            role="alert"
            className="rounded-md border-2 border-red-800/40 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-900"
          >
            {formChyba}
          </p>
        )}

        <div>
          <label htmlFor="prihlaseni-email" className="block text-sm font-bold">
            E-mail
          </label>
          <input
            id="prihlaseni-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={chyby.email !== undefined}
            aria-describedby={chyby.email !== undefined ? "prihlaseni-email-chyba" : undefined}
            placeholder="anezka@example.cz"
            className={chyby.email !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
          />
          {chyby.email !== undefined && (
            <p id="prihlaseni-email-chyba" role="alert" className="mt-1.5 text-xs font-bold text-red-800">
              {chyby.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="prihlaseni-heslo" className="block text-sm font-bold">
            Heslo
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="prihlaseni-heslo"
              name="heslo"
              type={ukazatHeslo ? "text" : "password"}
              autoComplete="current-password"
              value={heslo}
              onChange={(e) => setHeslo(e.target.value)}
              aria-invalid={chyby.heslo !== undefined}
              aria-describedby={chyby.heslo !== undefined ? "prihlaseni-heslo-chyba" : undefined}
              placeholder="Tvoje heslo"
              className={chyby.heslo !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
            />
            <button
              type="button"
              aria-pressed={ukazatHeslo}
              aria-label={ukazatHeslo ? "Skrýt heslo" : "Zobrazit heslo"}
              onClick={() => setUkazatHeslo((v) => !v)}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md border-2 border-linka bg-papir px-3 text-sm font-bold transition-colors hover:border-inkoust motion-reduce:transition-none"
            >
              <span aria-hidden="true">{ukazatHeslo ? "⋯" : "👁"}</span>
            </button>
          </div>
          {chyby.heslo !== undefined && (
            <p id="prihlaseni-heslo-chyba" role="alert" className="mt-1.5 text-xs font-bold text-red-800">
              {chyby.heslo}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={odesilaSe}
          className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center rounded-md border-2 border-inkoust bg-smrk px-4 py-2.5 text-base font-bold text-papir transition-colors hover:bg-inkoust disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          {odesilaSe ? "Přihlašuji…" : "Přihlásit se"}
        </button>

        <p className="text-center text-sm text-inkoust/70">
          Nemáš účet?{" "}
          <Link to="/register" className="font-bold text-smrk underline underline-offset-2">
            Zaregistruj se s kódem
          </Link>
        </p>
      </form>
    </main>
  );
}
