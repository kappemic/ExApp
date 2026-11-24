import { useState, type FormEvent, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import AuthRozlozeni from "../components/Auth/AuthRozlozeni";
import {
  AuthChyba,
  AuthHeslo,
  AuthKdeKodVzit,
  AuthNadpis,
  AuthOdkaz,
  AuthPole,
  AuthPrimarniTlacitko,
  AuthSpodek,
  AuthVstup,
} from "../components/Auth/authVstupy";
import Ikona from "../components/Ikona";
import { useAuth, type PoleRegistrace } from "../hooks/useAuth";
import { VALIDACE, normalizujKod } from "../shared/api-types";

type ChybyPoli = Partial<Record<PoleRegistrace, string>>;

/**
 * Registrace na pozvánkový kód, logika je v useAuth. Telefon, Discord, školu
 * a třídu návrh nemá, doplňují se v profilu (na serveru jsou nepovinné).
 */
export default function RegisterPage(): JSX.Element {
  const { register, jeBootstrap, overKod } = useAuth();
  const navigate = useNavigate();
  const [jmeno, setJmeno] = useState("");
  const [prijmeni, setPrijmeni] = useState("");
  const [email, setEmail] = useState("");
  const [heslo, setHeslo] = useState("");
  const [kod, setKod] = useState("");
  const [krok, setKrok] = useState<1 | 2>(1);
  const [ukazatHeslo, setUkazatHeslo] = useState(false);
  const [chyby, setChyby] = useState<ChybyPoli>({});
  const [formChyba, setFormChyba] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState(false);

  async function onOverit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (odesilaSe) return;
    setOdesilaSe(true);
    setFormChyba(null);
    const vysledek = await overKod(kod);
    if (!vysledek.ok) {
      setChyby({ kod: vysledek.chyba });
      setOdesilaSe(false);
      return;
    }
    setChyby({});
    setKrok(2);
    setOdesilaSe(false);
  }

  async function vlozKod(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      setKod(normalizujKod(text).slice(0, VALIDACE.kodDelka));
      setChyby({});
      setFormChyba(null);
    } catch {
      setFormChyba("Kód se nepodařilo vložit. Zadej ho ručně.");
    }
  }

  function zmenitKod(): void {
    setKrok(1);
    setFormChyba(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (odesilaSe) return;
    setOdesilaSe(true);
    setFormChyba(null);
    const vysledek = await register({
      jmeno,
      prijmeni: prijmeni.trim().length === 0 ? undefined : prijmeni,
      email,
      heslo,
      kod,
    });
    if (vysledek.uspech) {
      navigate("/vypravy", { replace: true });
      return;
    }
    setChyby(vysledek.chybyPoli);
    setFormChyba(vysledek.chyba);
    setOdesilaSe(false);
  }

  const chybaKodu = chyby.kod;

  return (
    <AuthRozlozeni>
      <AuthNadpis krok={`Krok ${krok} z 2`}>{krok === 1 ? "Zadej pozvánkový kód" : "Vytvoř si účet"}</AuthNadpis>

      {jeBootstrap ? (
        <p role="status" className="rounded-2xl bg-mlha p-3.5 text-[12.5px] leading-[18px] text-mech lg:rounded-[14px]">
          Prvotní nastavení: ještě není žádný vedoucí. Vygeneruj si nejdřív kód na stránce Pozvánkové kódy a pak se
          s ním zaregistruj — tvůj účet se automaticky stane správcovským (admin).
        </p>
      ) : null}

      {krok === 1 ? (
        <form onSubmit={onOverit} noValidate className="flex flex-1 flex-col gap-5 lg:flex-none lg:gap-[22px]">
          {formChyba !== null ? <AuthChyba>{formChyba}</AuthChyba> : null}

          <AuthPole id="registrace-kod" label="Pozvánkový kód" chyba={chybaKodu}>
            <div
              className={`flex h-14 items-center gap-2 rounded-xl border bg-povrch pl-3.5 pr-3 transition-colors motion-reduce:transition-none focus-within:ring-2 focus-within:ring-smrk/25 lg:gap-2.5 lg:pl-4 ${
                chybaKodu !== undefined ? "border-akcent" : "border-pole focus-within:border-smrk"
              }`}
            >
              <input
                id="registrace-kod"
                name="kod"
                type="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                value={kod}
                onChange={(e) => setKod(normalizujKod(e.target.value))}
                aria-invalid={chybaKodu !== undefined}
                aria-describedby={chybaKodu !== undefined ? "registrace-kod-chyba" : undefined}
                placeholder="••••••••"
                maxLength={VALIDACE.kodDelka}
                className="h-full min-w-0 flex-1 bg-transparent font-display text-xl font-semibold uppercase tracking-[1.4px] text-inkoust placeholder:text-ink-4 focus:outline-none lg:text-[22px] lg:tracking-[1.6px]"
              />
              <button
                type="button"
                onClick={() => void vlozKod()}
                className="nahled-press relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-mlha px-2.5 text-xs font-semibold text-smrk before:absolute before:-inset-1 hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk lg:h-8"
              >
                <Ikona nazev="clipboard" className="size-3.5" />
                Vložit
              </button>
            </div>
          </AuthPole>

          <AuthKdeKodVzit />

          <AuthSpodek>
            <AuthPrimarniTlacitko type="submit" disabled={odesilaSe}>
              {odesilaSe ? "Ověřuji…" : "Ověřit kód"}
            </AuthPrimarniTlacitko>
            <AuthOdkaz otazka="Už máš účet?" odkaz="Přihlásit se" cil="/login" />
          </AuthSpodek>
        </form>
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          aria-describedby={formChyba !== null ? "registrace-chyba" : undefined}
          className="flex flex-1 flex-col gap-[18px] lg:flex-none lg:gap-[22px]"
        >
          {formChyba !== null ? <AuthChyba id="registrace-chyba">{formChyba}</AuthChyba> : null}

          <div className="flex items-center gap-2.5 rounded-2xl bg-mlha p-3 lg:gap-3 lg:rounded-[14px] lg:p-3.5">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-smrk text-povrch">
              <Ikona nazev="check" className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="font-display text-sm font-bold tracking-[0.2px] text-smrk lg:text-[15px] lg:tracking-[0.3px]">{kod} · ověřeno</p>
              <p className="text-xs text-mech">
                Školní expediční klub · <span className="hidden lg:inline">role </span>Člen
              </p>
            </div>
            <button
              type="button"
              onClick={zmenitKod}
              className="-my-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-smrk hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
            >
              Změnit
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AuthVstup
              id="registrace-jmeno"
              label="Jméno"
              chyba={chyby.jmeno}
              vstup={{
                name: "jmeno",
                type: "text",
                autoComplete: "given-name",
                required: true,
                value: jmeno,
                onChange: (e) => setJmeno(e.target.value),
                placeholder: "Anežka",
                maxLength: VALIDACE.jmenoMaxDelka,
              }}
            />
            <AuthVstup
              id="registrace-prijmeni"
              label="Příjmení"
              chyba={chyby.prijmeni}
              vstup={{
                name: "prijmeni",
                type: "text",
                autoComplete: "family-name",
                value: prijmeni,
                onChange: (e) => setPrijmeni(e.target.value),
                placeholder: "Nová",
                maxLength: VALIDACE.prijmeniMaxDelka,
              }}
            />
          </div>

          <AuthVstup
            id="registrace-email"
            label="E-mail"
            chyba={chyby.email}
            ikona="mail"
            vstup={{
              name: "email",
              type: "email",
              autoComplete: "email",
              inputMode: "email",
              required: true,
              value: email,
              onChange: (e) => setEmail(e.target.value),
              placeholder: "jmeno@email.cz",
            }}
          />

          <AuthHeslo
            id="registrace-heslo"
            chyba={chyby.heslo}
            ukazat={ukazatHeslo}
            onUkazat={() => setUkazatHeslo((v) => !v)}
            vstup={{
              name: "heslo",
              autoComplete: "new-password",
              required: true,
              value: heslo,
              onChange: (e) => setHeslo(e.target.value),
              placeholder: "Aspoň 8 znaků",
              maxLength: VALIDACE.hesloMaxDelka,
            }}
          />

          <AuthSpodek>
            <AuthPrimarniTlacitko type="submit" disabled={odesilaSe} sipka={false}>
              {odesilaSe ? "Zakládám účet…" : "Vytvořit účet"}
            </AuthPrimarniTlacitko>
            <AuthOdkaz otazka="Už máš účet?" odkaz="Přihlásit se" cil="/login" />
          </AuthSpodek>
        </form>
      )}
    </AuthRozlozeni>
  );
}
