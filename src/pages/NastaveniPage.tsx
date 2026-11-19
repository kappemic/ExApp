import { useState, type FormEvent, type JSX } from "react";
import HlavickaZpet from "../components/HlavickaZpet";
import { chybaKombinace3D, smiNaVypravy } from "../config/roles";
import { vypniOznameni, zapniOznameni } from "../lib/push-odber";

const AKTIVNI = smiNaVypravy({
  clenstvi: "aktivni_clen",
  funkce: null,
  isAdmin: false,
});
const ZAKLADNI = smiNaVypravy({
  clenstvi: "clen",
  funkce: null,
  isAdmin: false,
});
const JEN_ADMIN = smiNaVypravy({
  clenstvi: "clen",
  funkce: null,
  isAdmin: true,
});
const FUNKCE_BEZ_AKTIVNIHO = chybaKombinace3D({
  clenstvi: "clen",
  funkce: "vedeni",
  isAdmin: false,
});

/**
 * Read-only permissions from roles.ts, visual Discord toggles (no API), push helpers.
 */
export default function NastaveniPage(): JSX.Element {
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [bezi, setBezi] = useState(false);
  const [discordVyprava, setDiscordVyprava] = useState(true);
  const [discordDulezite, setDiscordDulezite] = useState(true);

  async function prepnout(zapnout: boolean): Promise<void> {
    if (bezi) return;
    setBezi(true);
    setHlaska(null);
    const vysledek = zapnout ? await zapniOznameni() : await vypniOznameni();
    setHlaska(
      vysledek.ok ? (zapnout ? "Oznámení jsou zapnutá." : "Oznámení jsou vypnutá.") : vysledek.chyba,
    );
    setBezi(false);
  }

  function naUlozit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setHlaska("Tyhle volby se zatím neukládají.");
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <HlavickaZpet zpet="/vice" zpetPopisek="Zpět na Více" titulek="Nastavení" varianta="nadpis" />

      <form className="mt-6 flex flex-col gap-4" onSubmit={naUlozit}>
        <section className="rounded-3xl bg-povrch p-4">
          <h2 className="font-display text-lg font-bold text-inkoust">Oprávnění</h2>
          <ul className="mt-3 flex flex-col gap-3 text-base leading-relaxed text-inkoust">
            <li>
              Výpravu zakládá aktivní člen
              {AKTIVNI ? "" : " (pravidlo teď aktivního člena nepouští)"}.
              {ZAKLADNI
                ? " Základní člen ji zakládá taky."
                : " Základní člen výpravu nezakládá."}
              {JEN_ADMIN
                ? " Samotný admin příznak na výpravu stačí."
                : " Samotný admin příznak bez aktivního členství na výpravu nestačí."}
            </li>
            <li>Schůzku zakládá stejný okruh jako výpravu: aktivní člen.</li>
            <li>
              Cizí profil upravuje hlavní admin; vlastní údaje měníš v Profilu.
            </li>
            <li>
              Hodnost mění hlavní admin.
              {FUNKCE_BEZ_AKTIVNIHO === null
                ? " Funkci smí mít i základní člen."
                : ` ${FUNKCE_BEZ_AKTIVNIHO}`}
            </li>
          </ul>
        </section>

        <section className="rounded-3xl bg-povrch p-4">
          <h2 className="font-display text-lg font-bold text-inkoust">Discord oznámení</h2>
          <p className="mt-1 text-sm text-mech">Stav webhooku z aplikace nevidíme — přepínače jsou jen náhled.</p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-papir px-4">
              <span className="text-base font-medium text-inkoust">Nová výprava</span>
              <input
                type="checkbox"
                checked={discordVyprava}
                onChange={(e) => setDiscordVyprava(e.target.checked)}
                className="h-5 w-5 accent-smrk"
              />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-papir px-4">
              <span className="text-base font-medium text-inkoust">Důležitá oznámení</span>
              <input
                type="checkbox"
                checked={discordDulezite}
                onChange={(e) => setDiscordDulezite(e.target.checked)}
                className="h-5 w-5 accent-smrk"
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl bg-povrch p-4">
          <h2 className="font-display text-lg font-bold text-inkoust">Push oznámení</h2>
          <p className="mt-2 text-base leading-relaxed text-mech">
            Push jde zapnout v nainstalované aplikaci. Na iPhonu nejdřív přidej ExApp na plochu.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={bezi}
              className="min-h-11 rounded-2xl bg-smrk px-4 text-base font-bold text-papir disabled:opacity-60"
              onClick={() => void prepnout(true)}
            >
              Zapnout oznámení
            </button>
            <button
              type="button"
              disabled={bezi}
              className="min-h-11 rounded-2xl border border-pole bg-papir px-4 text-base font-bold text-inkoust disabled:opacity-60"
              onClick={() => void prepnout(false)}
            >
              Vypnout oznámení
            </button>
          </div>
        </section>

        {hlaska !== null ? (
          <p role="status" className="text-base text-inkoust">
            {hlaska}
          </p>
        ) : null}

        <button
          type="submit"
          className="min-h-11 w-full rounded-2xl bg-smrk px-4 text-base font-bold text-papir"
        >
          Uložit změny
        </button>
      </form>
    </main>
  );
}