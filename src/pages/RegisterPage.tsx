import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthRozlozeni from "../components/Auth/AuthRozlozeni";
import {
  AUTH_VSTUP,
  AUTH_VSTUP_CHYBA,
  AuthInfoKodVzat,
  AuthPrimarniTlacitko,
  AuthVstup,
  IkonaZamku,
} from "../components/Auth/authVstupy";
import VstupSNabidkou from "../components/VstupSNabidkou";
import { useAuth, type PoleRegistrace } from "../hooks/useAuth";
import { nactiSkolyTridy } from "../lib/skoly-tridy";
import { VALIDACE, VALIDACNI_ZPRAVY, normalizujKod } from "../shared/api-types";
import { VYCHOZI_KOD_ZEME, normalizujTelefon, type KodZeme } from "../shared/telefon";
import TelefonPole from "../components/profil/TelefonPole";

type ChybyPoli = Partial<Record<PoleRegistrace, string>>;

function formatKodDoZobrazeni(kod: string): string {
  if (kod.length === 0) return "EXAPP-••••";
  if (kod.length <= 4) return `EXAPP-${kod}`;
  return `EXAPP-${kod.slice(0, 4)}-${kod.slice(4)}`;
}

function Pole({
  id,
  label,
  chyba,
  children,
}: {
  id: string;
  label: string;
  chyba?: string;
  children: JSX.Element;
}): JSX.Element {
  const chybaId = `${id}-chyba`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-inkoust">
        {label}
      </label>
      {children}
      {chyba !== undefined ? (
        <p id={chybaId} role="alert" className="mt-1.5 text-xs font-bold text-red-800">
          {chyba}
        </p>
      ) : null}
    </div>
  );
}

function IkonaFajfky(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5 text-smrk"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Invite-code registration — logic lives in useAuth. */
export default function RegisterPage(): JSX.Element {
  const { register, jeBootstrap, overKod } = useAuth();
  const navigate = useNavigate();
  const [jmeno, setJmeno] = useState("");
  const [prijmeni, setPrijmeni] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [kodZeme, setKodZeme] = useState<KodZeme>(VYCHOZI_KOD_ZEME);
  const [discordNick, setDiscordNick] = useState("");
  const [skola, setSkola] = useState("");
  const [trida, setTrida] = useState("");
  const [skolySeznam, setSkolySeznam] = useState<string[]>([]);
  const [tridySeznam, setTridySeznam] = useState<string[]>([]);
  const [heslo, setHeslo] = useState("");
  const [kod, setKod] = useState("");
  const [krok, setKrok] = useState<1 | 2>(1);
  const [kodOveren, setKodOveren] = useState(false);
  const [ukazatHeslo, setUkazatHeslo] = useState(false);
  const [chyby, setChyby] = useState<ChybyPoli>({});
  const [formChyba, setFormChyba] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState(false);

  useEffect(() => {
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiSkolyTridy();
      if (!zive || !vysledek.ok) return;
      setSkolySeznam(vysledek.data.skoly);
      setTridySeznam(vysledek.data.tridy);
    })();
    return () => {
      zive = false;
    };
  }, []);

  async function onOverit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (odesilaSe) return;
    if (kodOveren) {
      setKrok(2);
      return;
    }
    setOdesilaSe(true);
    setFormChyba(null);
    const vysledek = await overKod(kod);
    if (!vysledek.ok) {
      setChyby({ kod: vysledek.chyba });
      setFormChyba(vysledek.chyba);
      setOdesilaSe(false);
      return;
    }
    setChyby({});
    setKodOveren(true);
    setOdesilaSe(false);
  }

  async function vlozKod(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      setKod(normalizujKod(text));
      setFormChyba(null);
    } catch {
      setFormChyba("Kód se nepodařilo vložit. Zadej ho ručně.");
    }
  }

  function zmenitKod(): void {
    setKrok(1);
    setKodOveren(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (odesilaSe) return;
    setOdesilaSe(true);
    setFormChyba(null);
    const telefonVysledek = normalizujTelefon(telefon, kodZeme);
    if (!telefonVysledek.ok) {
      setChyby({ telefon: VALIDACNI_ZPRAVY.telefonNeplatny });
      setFormChyba("Zkontroluj zvýrazněná pole.");
      setOdesilaSe(false);
      return;
    }
    const vysledek = await register({
      jmeno,
      prijmeni: prijmeni.trim().length === 0 ? undefined : prijmeni,
      email,
      telefon: telefonVysledek.e164,
      discordNick: discordNick.trim().length === 0 ? null : discordNick,
      skola: skola.trim(),
      trida: trida.trim(),
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

  const nadpis =
    krok === 1 ? (
      <>
        <p className="text-sm font-medium text-mech">Krok 1 z 2</p>
        <h1 className="font-display mt-1 text-[28px] font-bold leading-tight tracking-tight text-inkoust">
          Zadej pozvánkový kód
        </h1>
      </>
    ) : (
      <>
        <p className="text-sm font-medium text-mech">Krok 2 z 2</p>
        <h1 className="font-display mt-1 text-[28px] font-bold leading-tight tracking-tight text-inkoust">
          Vytvoř si účet
        </h1>
      </>
    );

  return (
    <AuthRozlozeni>
      {nadpis}

      {jeBootstrap ? (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-smrk/40 bg-smrk/10 px-3.5 py-2.5 text-sm leading-relaxed text-inkoust"
        >
          Prvotní nastavení: ještě není žádný vedoucí. Vygeneruj si nejdřív kód na stránce Pozvánkové kódy a pak se
          s ním zaregistruj — tvůj účet se automaticky stane správcovským (admin).
        </p>
      ) : null}

      {krok === 1 ? (
        <form onSubmit={onOverit} noValidate className="mt-7 flex flex-col gap-4">
          {formChyba !== null ? (
            <p role="alert" className="rounded-2xl border-2 border-red-800/40 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-900">
              {formChyba}
            </p>
          ) : null}

          <Pole id="registrace-kod" label="Pozvánkový kód" chyba={chyby.kod}>
            <div className="flex gap-2">
              <input
                id="registrace-kod"
                name="kod"
                type="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                value={kod}
                onChange={(e) => {
                  setKod(normalizujKod(e.target.value));
                  if (kodOveren) setKodOveren(false);
                }}
                aria-invalid={chyby.kod !== undefined}
                aria-describedby={chyby.kod !== undefined ? "registrace-kod-chyba" : undefined}
                placeholder="EXAPP-••••"
                maxLength={VALIDACE.kodDelka}
                className={`min-h-11 min-w-0 flex-1 font-mono uppercase tracking-[0.08em] ${chyby.kod !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP}`}
              />
              <button
                type="button"
                onClick={() => void vlozKod()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-pole bg-white px-4 text-base font-semibold text-inkoust hover:border-smrk/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
              >
                Vložit
              </button>
            </div>
          </Pole>

          {kodOveren ? <AuthInfoKodVzat /> : null}

          <AuthPrimarniTlacitko type="submit" disabled={odesilaSe}>
            {odesilaSe ? "Ověřuji…" : kodOveren ? "Pokračovat" : "Ověřit kód"}
          </AuthPrimarniTlacitko>

          <p className="text-center text-sm text-mech">
            Už máš účet?{" "}
            <Link to="/login" className="font-semibold text-smrk underline underline-offset-2">
              Přihlas se
            </Link>
          </p>
        </form>
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          aria-describedby={formChyba !== null ? "registrace-chyba" : undefined}
          className="mt-7 flex flex-col gap-4"
        >
          {formChyba !== null ? (
            <p
              id="registrace-chyba"
              role="alert"
              className="rounded-2xl border-2 border-red-800/40 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-900"
            >
              {formChyba}
            </p>
          ) : null}

          <div className="rounded-2xl border border-smrk/30 bg-smrk/10 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <IkonaFajfky />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold tracking-wide text-inkoust">
                  {formatKodDoZobrazeni(kod)}
                  <span className="ml-2 font-sans font-normal text-smrk">· ověřeno</span>
                </p>
                <p className="mt-1 text-sm text-inkoust/85">
                  Školní expediční klub · <span className="font-medium text-inkoust">Člen</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={zmenitKod}
              className="mt-2 text-sm font-semibold text-smrk underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
            >
              Změnit
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                className: chyby.jmeno !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP,
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
                className: chyby.prijmeni !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP,
              }}
            />
          </div>

          <AuthVstup
            id="registrace-email"
            label="E-mail"
            chyba={chyby.email}
            ikonaVpravo={<IkonaZamku />}
            vstup={{
              name: "email",
              type: "email",
              autoComplete: "email",
              inputMode: "email",
              required: true,
              value: email,
              onChange: (e) => setEmail(e.target.value),
              placeholder: "anezka@example.cz",
              className: chyby.email !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP,
            }}
          />

          <Pole id="registrace-heslo" label="Heslo" chyba={chyby.heslo}>
            <div className="relative">
              <input
                id="registrace-heslo"
                name="heslo"
                type={ukazatHeslo ? "text" : "password"}
                autoComplete="new-password"
                required
                value={heslo}
                onChange={(e) => setHeslo(e.target.value)}
                aria-invalid={chyby.heslo !== undefined}
                aria-describedby={chyby.heslo !== undefined ? "registrace-heslo-chyba" : undefined}
                placeholder="Aspoň 8 znaků"
                maxLength={VALIDACE.hesloMaxDelka}
                className={`${chyby.heslo !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP} pr-12`}
              />
              <button
                type="button"
                aria-pressed={ukazatHeslo}
                aria-label={ukazatHeslo ? "Skrýt heslo" : "Zobrazit heslo"}
                onClick={() => setUkazatHeslo((v) => !v)}
                className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-full pr-1 text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
              >
                <IkonaZamku />
              </button>
            </div>
          </Pole>

          <Pole id="registrace-telefon" label="Telefon" chyba={chyby.telefon}>
            <TelefonPole
              id="registrace-telefon"
              name="telefon"
              hodnota={telefon}
              kodZeme={kodZeme}
              onZmena={(dalsi, zeme) => {
                setTelefon(dalsi);
                setKodZeme(zeme);
              }}
              neplatny={chyby.telefon !== undefined}
              popisChybyId={chyby.telefon !== undefined ? "registrace-telefon-chyba" : undefined}
              vstupTrida={chyby.telefon !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP}
            />
          </Pole>

          <Pole id="registrace-discord" label="Discord nick" chyba={chyby.discordNick}>
            <input
              id="registrace-discord"
              name="discordNick"
              type="text"
              autoComplete="nickname"
              spellCheck={false}
              value={discordNick}
              onChange={(e) => setDiscordNick(e.target.value)}
              aria-invalid={chyby.discordNick !== undefined}
              aria-describedby={chyby.discordNick !== undefined ? "registrace-discord-chyba" : undefined}
              placeholder="anezka_n"
              maxLength={VALIDACE.discordNickMaxDelka}
              className={chyby.discordNick !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP}
            />
          </Pole>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Pole id="registrace-skola" label="Škola" chyba={chyby.skola}>
              <VstupSNabidkou
                id="registrace-skola"
                name="skola"
                value={skola}
                onChange={setSkola}
                nabidky={skolySeznam}
                placeholder="Např. ZŠ Lesní"
                maxLength={VALIDACE.skolaMaxDelka}
                className={chyby.skola !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP}
                neplatny={chyby.skola !== undefined}
                popisId={chyby.skola !== undefined ? "registrace-skola-chyba" : undefined}
              />
            </Pole>

            <Pole id="registrace-trida" label="Třída" chyba={chyby.trida}>
              <VstupSNabidkou
                id="registrace-trida"
                name="trida"
                value={trida}
                onChange={setTrida}
                nabidky={tridySeznam}
                placeholder="Např. 5.A"
                maxLength={VALIDACE.tridaMaxDelka}
                className={chyby.trida !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP}
                neplatny={chyby.trida !== undefined}
                popisId={chyby.trida !== undefined ? "registrace-trida-chyba" : undefined}
              />
            </Pole>
          </div>

          <AuthPrimarniTlacitko type="submit" disabled={odesilaSe}>
            {odesilaSe ? "Zakládám účet…" : "Vytvořit účet"}
          </AuthPrimarniTlacitko>

          <p className="text-center text-sm text-mech">
            Už máš účet?{" "}
            <Link to="/login" className="font-semibold text-smrk underline underline-offset-2">
              Přihlas se
            </Link>
          </p>
        </form>
      )}
    </AuthRozlozeni>
  );
}