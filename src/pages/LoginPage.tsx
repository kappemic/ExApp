import { useState, type FormEvent, type JSX } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthRozlozeni from "../components/Auth/AuthRozlozeni";
import {
  AUTH_VSTUP,
  AUTH_VSTUP_CHYBA,
  AuthPrimarniTlacitko,
  AuthVstup,
  IkonaZamku,
} from "../components/Auth/authVstupy";
import { useAuth, type PolePrihlaseni } from "../hooks/useAuth";

/**
 * Safe post-login redirect — internal paths only.
 * Rejects absolute URLs, `//evil`, and empty values.
 */
export function bezpecneFrom(hodnota: string | null): string {
  if (hodnota === null || !hodnota.startsWith("/") || hodnota.startsWith("//") || hodnota === "/") {
    return "/vypravy";
  }
  return hodnota;
}

type ChybyPoli = Partial<Record<PolePrihlaseni, string>>;

/** Email + password sign-in — logic lives in useAuth. */
export default function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const navrat = bezpecneFrom(params.get("from"));
  const [email, setEmail] = useState("");
  const [heslo, setHeslo] = useState("");
  const [ukazatHeslo, setUkazatHeslo] = useState(false);
  const [zustat, setZustat] = useState(false);
  const [chyby, setChyby] = useState<ChybyPoli>({});
  const [formChyba, setFormChyba] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (odesilaSe) return;
    setOdesilaSe(true);
    setFormChyba(null);
    const vysledek = await login({ email, heslo, zustat });
    if (vysledek.uspech) {
      navigate(navrat, { replace: true });
      return;
    }
    setChyby(vysledek.chybyPoli);
    setFormChyba(vysledek.chyba);
    setOdesilaSe(false);
  }

  const hesloTridy = chyby.heslo !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP;

  return (
    <AuthRozlozeni>
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-inkoust">
        Přihlas se do klubu
      </h1>

      <form
        onSubmit={onSubmit}
        noValidate
        aria-describedby={formChyba !== null ? "prihlaseni-chyba" : undefined}
        className="mt-7 flex flex-col gap-4"
      >
        {formChyba !== null ? (
          <p
            id="prihlaseni-chyba"
            role="alert"
            className="rounded-2xl border-2 border-red-800/40 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-900"
          >
            {formChyba}
          </p>
        ) : null}

        <AuthVstup
          id="prihlaseni-email"
          label="E-mail"
          chyba={chyby.email}
          ikonaVpravo={<IkonaZamku />}
          vstup={{
            name: "email",
            type: "email",
            autoComplete: "email",
            inputMode: "email",
            value: email,
            onChange: (e) => setEmail(e.target.value),
            placeholder: "anezka@example.cz",
            className: chyby.email !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP,
          }}
        />

        <div>
          <label htmlFor="prihlaseni-heslo" className="mb-1.5 block text-sm font-semibold text-inkoust">
            Heslo
          </label>
          <div className="relative">
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
              className={`${hesloTridy} pr-12`}
            />
            <button
              type="button"
              aria-pressed={ukazatHeslo}
              aria-label={ukazatHeslo ? "Skrýt heslo" : "Zobrazit heslo"}
              onClick={() => setUkazatHeslo((v) => !v)}
              className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-full pr-1 text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none"
            >
              <IkonaZamku />
            </button>
          </div>
          {chyby.heslo !== undefined ? (
            <p id="prihlaseni-heslo-chyba" role="alert" className="mt-1.5 text-xs font-bold text-red-800">
              {chyby.heslo}
            </p>
          ) : null}
        </div>

        <label className="flex min-h-11 items-center gap-3 text-base text-inkoust">
          <input
            type="checkbox"
            checked={zustat}
            onChange={(e) => setZustat(e.target.checked)}
            className="h-5 w-5 rounded border-pole accent-smrk"
          />
          Zůstat přihlášený
        </label>

        <AuthPrimarniTlacitko type="submit" disabled={odesilaSe}>
          {odesilaSe ? "Přihlašuji…" : "Přihlásit se"}
        </AuthPrimarniTlacitko>

        <p className="text-center text-sm leading-relaxed text-mech">
          Máš pozvánkový kód od vedoucího?{" "}
          <Link to="/register" className="font-semibold text-smrk underline underline-offset-2">
            Zadej kód
          </Link>
        </p>
      </form>
    </AuthRozlozeni>
  );
}