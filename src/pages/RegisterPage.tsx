import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import LogoKlubu from "../components/LogoKlubu";
import VstupSNabidkou from "../components/VstupSNabidkou";
import { useAuth, type PoleRegistrace } from "../hooks/useAuth";
import { nactiSkolyTridy } from "../lib/skoly-tridy";
import { VALIDACE, VALIDACNI_ZPRAVY, normalizujKod } from "../shared/api-types";
import { VYCHOZI_KOD_ZEME, normalizujTelefon, type KodZeme } from "../shared/telefon";
import TelefonPole from "../components/profil/TelefonPole";

const VSTUP_TRIDY =
  "min-h-[44px] w-full rounded-xl border border-pole bg-papir px-3.5 py-2.5 text-base text-inkoust placeholder:text-inkoust/40 transition-colors focus:border-smrk focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none";
const VSTUP_CHYBA_TRIDY =
  "min-h-[44px] w-full rounded-xl border-2 border-red-800 bg-papir px-3.5 py-2.5 text-base text-inkoust placeholder:text-inkoust/40 focus:border-red-800 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800";

type ChybyPoli = Partial<Record<PoleRegistrace, string>>;

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
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {chyba !== undefined && (
        <p id={chybaId} role="alert" className="mt-1.5 text-xs font-bold text-red-800">
          {chyba}
        </p>
      )}
    </div>
  );
}

/** Registrace s pozvánkovým kódem — prezentace, logika žije v useAuth. */
export default function RegisterPage(): JSX.Element {
  const { register, jeBootstrap } = useAuth();
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
  const [ukazatHeslo, setUkazatHeslo] = useState(false);
  const [chyby, setChyby] = useState<ChybyPoli>({});
  const [formChyba, setFormChyba] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState(false);

  // Číselník pro našeptávání — jednou při mountu; chyba → tichý fallback
  // na prázdné seznamy (formulář funguje s volným textem i offline).
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

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="flex items-center gap-4">
        <LogoKlubu velikost="lg" />
        <div className="min-w-0">
          <p className="font-condensed text-sm font-medium text-mech">ExApp · registrace</p>
          <h1 className="font-expanded mt-0.5 text-3xl font-extrabold tracking-tight">Registrace</h1>
        </div>
      </div>
      <p className="mt-2 text-base text-inkoust/75">
        K založení účtu potřebuješ pozvánkový kód od vedoucí. Jeden kód platí 10
        minut pro všechny, můžeš ho použít i s ostatními.
      </p>
      {jeBootstrap && (
        <p
          role="status"
          className="mt-3 rounded-md border-2 border-smrk/40 bg-smrk/10 px-3.5 py-2.5 text-sm leading-relaxed text-inkoust"
        >
          Prvotní nastavení: ještě není žádný vedoucí. Vygeneruj si nejdřív kód
          na stránce Pozvánkové kódy a pak se s ním zaregistruj — tvůj účet se
          automaticky stane správcovským (admin).
        </p>
      )}

      <form
        onSubmit={onSubmit}
        noValidate
        aria-describedby={formChyba !== null ? "registrace-chyba" : undefined}
        className="mt-6 flex flex-col gap-4 rounded-lg border-2 border-inkoust bg-white/60 p-5 shadow-denik sm:p-6"
      >
        {formChyba !== null && (
          <p
            id="registrace-chyba"
            role="alert"
            className="rounded-md border-2 border-red-800/40 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-900"
          >
            {formChyba}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Pole id="registrace-jmeno" label="Jméno *" chyba={chyby.jmeno}>
            <input
              id="registrace-jmeno"
              name="jmeno"
              type="text"
              autoComplete="given-name"
              required
              value={jmeno}
              onChange={(e) => setJmeno(e.target.value)}
              aria-invalid={chyby.jmeno !== undefined}
              aria-describedby={chyby.jmeno !== undefined ? "registrace-jmeno-chyba" : undefined}
              placeholder="Anežka"
              maxLength={VALIDACE.jmenoMaxDelka}
              className={chyby.jmeno !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
            />
          </Pole>

          <Pole id="registrace-prijmeni" label="Příjmení" chyba={chyby.prijmeni}>
            <input
              id="registrace-prijmeni"
              name="prijmeni"
              type="text"
              autoComplete="family-name"
              value={prijmeni}
              onChange={(e) => setPrijmeni(e.target.value)}
              aria-invalid={chyby.prijmeni !== undefined}
              aria-describedby={chyby.prijmeni !== undefined ? "registrace-prijmeni-chyba" : undefined}
              placeholder="Nová"
              maxLength={VALIDACE.prijmeniMaxDelka}
              className={chyby.prijmeni !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
            />
          </Pole>
        </div>

        <Pole id="registrace-email" label="E-mail *" chyba={chyby.email}>
          <input
            id="registrace-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={chyby.email !== undefined}
            aria-describedby={chyby.email !== undefined ? "registrace-email-chyba" : undefined}
            placeholder="anezka@example.cz"
            className={chyby.email !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
          />
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
            vstupTrida={chyby.telefon !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
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
            aria-describedby={
              chyby.discordNick !== undefined ? "registrace-discord-chyba" : undefined
            }
            placeholder="anezka_n"
            maxLength={VALIDACE.discordNickMaxDelka}
            className={chyby.discordNick !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
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
              className={chyby.skola !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
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
              className={chyby.trida !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
              neplatny={chyby.trida !== undefined}
              popisId={chyby.trida !== undefined ? "registrace-trida-chyba" : undefined}
            />
          </Pole>
        </div>

        <Pole id="registrace-heslo" label="Heslo *" chyba={chyby.heslo}>
          <div className="flex gap-2">
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
              placeholder="Zvol si bezpečné heslo"
              maxLength={VALIDACE.hesloMaxDelka}
              className={chyby.heslo !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}
            />
            <button
              type="button"
              aria-pressed={ukazatHeslo}
              aria-label={ukazatHeslo ? "Skrýt heslo" : "Zobrazit heslo"}
              onClick={() => setUkazatHeslo((v) => !v)}
              className="bez-prejeti nahled-press inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md border-2 border-linka bg-papir px-3 text-sm font-bold hover:-translate-y-px hover:border-inkoust hover:bg-smrk/[0.08] motion-reduce:hover:translate-y-0"
            >
              <span aria-hidden="true">{ukazatHeslo ? "⋯" : "👁"}</span>
            </button>
          </div>
        </Pole>

        <Pole id="registrace-kod" label="Pozvánkový kód *" chyba={chyby.kod}>
          <input
            id="registrace-kod"
            name="kod"
            type="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
            value={kod}
            onChange={(e) => setKod(normalizujKod(e.target.value))}
            aria-invalid={chyby.kod !== undefined}
            aria-describedby={chyby.kod !== undefined ? "registrace-kod-chyba" : undefined}
            placeholder="Třeba K7M2PX4Q"
            maxLength={VALIDACE.kodDelka}
            inputMode="text"
            className={`font-mono uppercase tracking-[0.12em] ${chyby.kod !== undefined ? VSTUP_CHYBA_TRIDY : VSTUP_TRIDY}`}
          />
        </Pole>

        <button
          type="submit"
          disabled={odesilaSe}
          className="nahled-press mt-1 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-okr bg-okr px-4 py-2.5 text-base font-bold text-inkoust transition-colors hover:bg-okr-tmavy disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          {odesilaSe ? "Zakládám účet…" : "Zaregistrovat se"}
        </button>

        <p className="text-center text-sm text-inkoust/70">
          Už máš účet?{" "}
          <Link to="/login" className="font-bold text-smrk underline underline-offset-2">
            Přihlas se
          </Link>
        </p>
      </form>
    </main>
  );
}
