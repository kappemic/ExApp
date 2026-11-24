import { useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import HlavickaZpet, { AkceHlavicky, ZpetPocitac } from "../components/HlavickaZpet";
import Ikona from "../components/Ikona";
import ExpeditionForm, {
  type ChybyExpedice,
  type KontrolaVypravy,
} from "../components/expeditions/ExpeditionForm";
import type { SnimkyCestyVyber } from "../components/expeditions/ExpeditionForm";
import { nahrajCestaSnimky, vytvorVypravu } from "../lib/expeditions-ucast";
import type {
  UpravitExpediciRequest,
  VytvoritExpediciRequest,
} from "../shared/api-types";

const ID_FORMULARE = "nova-vyprava-form";

const POLOZKY_KONTROLY: Array<{ klic: keyof KontrolaVypravy; popisek: string }> = [
  { klic: "nazev", popisek: "Název výpravy" },
  { klic: "datum", popisek: "Datum od" },
  { klic: "sraz", popisek: "Sraz a čas" },
  { klic: "popisNeboFotky", popisek: "Popis nebo fotky" },
];

/** Kontrolní seznam v pravém sloupci („Rail · Checklist“ v ExApp.pen). */
function KontrolniSeznam({ kontrola }: { kontrola: KontrolaVypravy }): JSX.Element {
  const hotovo = POLOZKY_KONTROLY.filter((p) => kontrola[p.klic]).length;
  return (
    <section
      aria-labelledby="kontrolni-seznam"
      className="flex flex-col gap-3.5 rounded-2xl border border-linka bg-povrch p-5 shadow-karta"
    >
      <div className="flex items-center justify-between">
        <h2 id="kontrolni-seznam" className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">
          Kontrolní seznam
        </h2>
        <span className="text-[11.5px] font-semibold text-ink-3">
          {hotovo} / {POLOZKY_KONTROLY.length}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {POLOZKY_KONTROLY.map((polozka) => {
          const splneno = kontrola[polozka.klic];
          return (
            <li key={polozka.klic} className="flex items-center gap-[9px]">
              <span
                aria-hidden="true"
                className={`flex size-[18px] items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${
                  splneno ? "bg-smrk text-papir" : "border border-[#cfc9b6]"
                }`}
              >
                {splneno ? <Ikona nazev="check" className="size-[11px]" tloustka={3} /> : null}
              </span>
              <span className={`text-[12.5px] font-medium ${splneno ? "text-mech" : "text-ink-3"}`}>
                {polozka.popisek}
                <span className="sr-only">{splneno ? ", vyplněno" : ", chybí"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Nová výprava podle ExApp.pen: telefon jeden sloupec, počítač karty + kontrolní seznam. */
export default function NovaVypravaPage(): JSX.Element {
  const navigate = useNavigate();
  const [vytvariSe, setVytvariSe] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [chybyPoli, setChybyPoli] = useState<ChybyExpedice>({});
  const [kontrola, setKontrola] = useState<KontrolaVypravy>({
    nazev: false,
    datum: false,
    sraz: false,
    popisNeboFotky: false,
  });

  function naOdeslat(
    payload: VytvoritExpediciRequest | UpravitExpediciRequest,
    snimky: SnimkyCestyVyber,
  ): void {
    setVytvariSe(true);
    setChyba(null);
    setChybyPoli({});
    void (async (): Promise<void> => {
      const vysledek = await vytvorVypravu(payload as VytvoritExpediciRequest);
      setVytvariSe(false);
      if (!vysledek.ok) {
        if (vysledek.chybyPoli !== undefined) setChybyPoli(vysledek.chybyPoli);
        else setChyba(vysledek.chyba);
        return;
      }
      const tam = await nahrajCestaSnimky(vysledek.data.expedice.id, "tam", snimky.tam);
      const zpet = await nahrajCestaSnimky(vysledek.data.expedice.id, "zpet", snimky.zpet);
      if (!tam.ok || !zpet.ok) {
        /* trip exists; photos can be retried later */
      }
      navigate(`/vypravy/${vysledek.data.expedice.id}`, { replace: true });
    })();
  }

  return (
    <main className="mx-auto w-full max-w-[46rem] px-5 pb-6 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet
        zpet="/vypravy"
        zpetPopisek="Zpět na výpravy"
        titulek="Nová výprava"
        akce={<AkceHlavicky onClick={() => navigate("/vypravy")}>Zrušit</AkceHlavicky>}
        className="mb-5 min-[90rem]:hidden"
      />
      <ZpetPocitac zpet="/vypravy" popisek="Zpět na výpravy" />
      <div className="mb-5 flex items-end justify-between gap-4 min-[90rem]:mb-8">
        <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust min-[90rem]:text-[46px] min-[90rem]:leading-[45px] min-[90rem]:tracking-[-1.4px]">
          Nová výprava
        </h1>
        <div className="hidden items-center gap-2.5 min-[90rem]:flex">
          <button
            type="button"
            onClick={() => navigate("/vypravy")}
            disabled={vytvariSe}
            className="nahled-press inline-flex h-[46px] items-center rounded-xl px-2.5 text-sm font-semibold text-mech hover:bg-povrch-2 disabled:opacity-60"
          >
            Zrušit
          </button>
          <button
            type="submit"
            form={ID_FORMULARE}
            disabled={vytvariSe}
            className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-papir hover:opacity-90 disabled:opacity-60"
          >
            <Ikona nazev="check" className="size-4" />
            {vytvariSe ? "Ukládám…" : "Vytvořit výpravu"}
          </button>
        </div>
      </div>
      <div className="min-[90rem]:grid min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:items-start min-[90rem]:gap-7">
        <ExpeditionForm
          id={ID_FORMULARE}
          nadpis="Nová výprava"
          odeslatPopisek="Vytvořit výpravu"
          vychozi={null}
          odesilaSe={vytvariSe}
          serverChyba={chyba}
          serverChybyPoli={chybyPoli}
          onSubmit={naOdeslat}
          onZrusit={() => navigate("/vypravy")}
          skrytNadpis
          akceVHlavicce
          onKontrola={setKontrola}
        />
        <aside className="hidden min-[90rem]:sticky min-[90rem]:top-24 min-[90rem]:block">
          <KontrolniSeznam kontrola={kontrola} />
        </aside>
      </div>
    </main>
  );
}
