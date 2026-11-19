import Ikona from "../components/Ikona";
import Prepinac from "../components/Prepinac";
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
    <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet zpet="/vice" zpetPopisek="Zpět na Více" titulek="Nastavení" varianta="nadpis" className="min-[90rem]:hidden" />
      <div className="hidden items-end justify-between min-[90rem]:flex">
        <h1 className="font-display text-[46px] font-bold leading-[0.98] tracking-[-1.4px] text-inkoust">Nastavení</h1>
        <button
          type="submit"
          form="nastaveni-form"
          className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-papir hover:opacity-90"
        >
          <Ikona nazev="check" className="size-4" />
          Uložit změny
        </button>
      </div>

      <form id="nastaveni-form" className="mt-6 grid gap-4 min-[90rem]:mt-8 min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:items-start min-[90rem]:gap-7" onSubmit={naUlozit}>
        <div className="flex min-w-0 flex-col gap-4 min-[90rem]:gap-5">
        <section className="rounded-2xl border border-linka bg-povrch p-5 shadow-jemny">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">Oprávnění</h2>
          <ul className="mt-4 flex flex-col divide-y divide-linka text-sm leading-relaxed text-mech [&>li]:py-3 [&>li:first-child]:pt-0 [&>li:last-child]:pb-0">
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

        <section className="rounded-2xl border border-linka bg-povrch p-5 shadow-jemny">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">Discord oznámení</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">Stav webhooku z aplikace nevidíme — přepínače jsou jen náhled.</p>
          <div className="mt-3 flex flex-col divide-y divide-linka">
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm font-medium text-inkoust">Nová výprava</span>
              <Prepinac zapnuto={discordVyprava} onZmena={setDiscordVyprava} popisek={`Discord: Nová výprava`} />
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm font-medium text-inkoust">Důležitá oznámení</span>
              <Prepinac zapnuto={discordDulezite} onZmena={setDiscordDulezite} popisek={`Discord: Důležitá oznámení`} />
            </div>
          </div>
        </section>

        </div>
        <section className="rounded-2xl border border-linka bg-povrch p-5 shadow-jemny">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">Push oznámení</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-mech">
            Push jde zapnout v nainstalované aplikaci. Na iPhonu nejdřív přidej ExApp na plochu.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={bezi}
              className="nahled-press min-h-11 rounded-xl bg-smrk px-4 text-sm font-semibold text-papir disabled:opacity-60"
              onClick={() => void prepnout(true)}
            >
              Zapnout oznámení
            </button>
            <button
              type="button"
              disabled={bezi}
              className="nahled-press min-h-11 rounded-xl border border-linka bg-povrch px-4 text-sm font-semibold text-mech hover:bg-povrch-2 disabled:opacity-60"
              onClick={() => void prepnout(false)}
            >
              Vypnout oznámení
            </button>
          </div>
        </section>

        {hlaska !== null ? (
          <p role="status" className="text-sm text-inkoust min-[90rem]:col-span-2">
            {hlaska}
          </p>
        ) : null}

        <button
          type="submit"
          className="nahled-press h-12 w-full rounded-xl bg-smrk px-4 text-sm font-semibold text-papir min-[90rem]:hidden"
        >
          Uložit změny
        </button>
      </form>
    </main>
  );
}