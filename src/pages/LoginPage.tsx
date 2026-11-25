import { useState, type FormEvent, type JSX } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AuthRozlozeni from "../components/Auth/AuthRozlozeni";
import {
  AuthChyba,
  AuthHeslo,
  AuthNadpis,
  AuthOdkaz,
  AuthPrimarniTlacitko,
  AuthSpodek,
  AuthVstup,
} from "../components/Auth/authVstupy";
import Ikona from "../components/Ikona";
import { useAuth, type PolePrihlaseni } from "../hooks/useAuth";
import { useSpojeni } from "../lib/spojeni";

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
  const { login, user } = useAuth();
  const spojeno = useSpojeni();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const navrat = bezpecneFrom(params.get("from"));
  const [email, setEmail] = useState("");
  const [heslo, setHeslo] = useState("");
  const [ukazatHeslo, setUkazatHeslo] = useState(false);
  const [zustat, setZustat] = useState(true);
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

  // Session se mohla ověřit až tady, třeba po návratu sítě.
  if (user !== null) return <Navigate to={navrat} replace />;

  return (
    <AuthRozlozeni>
      <AuthNadpis>Přihlas se do klubu</AuthNadpis>

      {spojeno ? null : (
        <p role="status" className="rounded-[10px] bg-mlha p-3 text-[13px] leading-[18px] text-inkoust">
          Nejde se spojit se serverem. Přihlášení potřebuje připojení k internetu.
        </p>
      )}

      <form
        onSubmit={onSubmit}
        noValidate
        aria-describedby={formChyba !== null ? "prihlaseni-chyba" : undefined}
        className="flex flex-1 flex-col gap-5 lg:flex-none lg:gap-[22px]"
      >
        {formChyba !== null ? <AuthChyba id="prihlaseni-chyba">{formChyba}</AuthChyba> : null}

        <AuthVstup
          id="prihlaseni-email"
          label="E-mail"
          chyba={chyby.email}
          ikona="mail"
          vstup={{
            name: "email",
            type: "email",
            autoComplete: "email",
            inputMode: "email",
            value: email,
            onChange: (e) => setEmail(e.target.value),
            placeholder: "jmeno@email.cz",
          }}
        />

        <AuthHeslo
          id="prihlaseni-heslo"
          chyba={chyby.heslo}
          ukazat={ukazatHeslo}
          onUkazat={() => setUkazatHeslo((v) => !v)}
          vstup={{
            name: "heslo",
            autoComplete: "current-password",
            value: heslo,
            onChange: (e) => setHeslo(e.target.value),
            placeholder: "••••••••",
          }}
        />

        <label className="-my-3 flex min-h-11 cursor-pointer items-center gap-2 self-start text-[12.5px] text-mech lg:font-medium">
          <input
            type="checkbox"
            checked={zustat}
            onChange={(e) => setZustat(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-povrch peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-smrk lg:size-[18px] lg:rounded-[5px] ${
              zustat ? "bg-smrk" : "border border-pole bg-povrch"
            }`}
          >
            {zustat ? <Ikona nazev="check" className="size-3 lg:size-[11px]" tloustka={3} /> : null}
          </span>
          Zůstat přihlášený
        </label>

        <AuthSpodek>
          <AuthPrimarniTlacitko type="submit" disabled={odesilaSe}>
            {odesilaSe ? "Přihlašuji…" : "Přihlásit se"}
          </AuthPrimarniTlacitko>
          <AuthOdkaz otazka="Máš pozvánkový kód od vedoucího?" odkaz="Zadej kód" cil="/register" />
        </AuthSpodek>
      </form>
    </AuthRozlozeni>
  );
}