import { useEffect, useState, type FormEvent, type JSX } from "react";
import AvatarKruh from "../components/AvatarKruh";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import Ikona from "../components/Ikona";
import Prepinac from "../components/Prepinac";
import { chybaKombinace3D, smiNaVypravy } from "../config/roles";
import { useAuth } from "../hooks/useAuth";
import { nactiCleny } from "../lib/admin-clenove";
import type { UserListItem } from "../shared/api-types";

/** Kdo co smí. Hodnoty drží guardy na serveru, tady se jen ukazují (viz config/roles.ts). */
function opravneni(): Array<{ popisek: string; hodnota: string }> {
  const aktivni = smiNaVypravy({ clenstvi: "aktivni_clen", funkce: null, isAdmin: false });
  const jenAdmin = smiNaVypravy({ clenstvi: "clen", funkce: null, isAdmin: true });
  const kdo = aktivni ? (jenAdmin ? "Aktivní člen nebo admin" : "Aktivní člen") : "Admin";
  const funkce = chybaKombinace3D({ clenstvi: "clen", funkce: "vedeni", isAdmin: false });
  return [
    { popisek: "Výpravu smí založit", hodnota: kdo },
    { popisek: "Schůzku smí založit", hodnota: kdo },
    { popisek: "Povyšovat členy smí", hodnota: "Hlavní admin" },
    { popisek: "Profil jiného člena smí měnit", hodnota: "Hlavní admin" },
    ...(funkce === null ? [] : [{ popisek: "Vedení a radu smí mít", hodnota: "Aktivní člen" }]),
  ].slice(0, 4);
}

const DISCORD: ReadonlyArray<{ id: "vyprava" | "dulezite" | "souhrn"; nazev: string; popis: string }> = [
  { id: "vyprava", nazev: "Nová výprava", popis: "Zpráva do kanálu při založení výpravy." },
  { id: "dulezite", nazev: "Důležitá oznámení", popis: "Sraz, uzávěrka, zrušení." },
  { id: "souhrn", nazev: "Denní souhrn", popis: "Jeden přehled ráno." },
];

/**
 * Nastavení podle ExApp.pen: oprávnění (jen ke čtení, platí guardy serveru),
 * Discord oznámení a vpravo kdo má přístup do správy. Push je v Profilu.
 */
export default function NastaveniPage(): JSX.Element {
  const { user } = useAuth();
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [discord, setDiscord] = useState({ vyprava: true, dulezite: true, souhrn: false });
  const [spravci, setSpravci] = useState<UserListItem[]>([]);

  useEffect(() => {
    let zije = true;
    void nactiCleny().then((vysledek) => {
      if (!zije || !vysledek.ok) return;
      setSpravci(vysledek.data.filter((clen) => clen.isSuperadmin === true || clen.isAdmin === true));
    });
    return () => {
      zije = false;
    };
  }, []);

  function naUlozit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setHlaska("Tyhle volby se zatím neukládají.");
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 sm:max-w-[46rem] pb-6 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet zpet="/vice" zpetPopisek="Zpět na Více" titulek="Nastavení" varianta="nadpis" className="min-[90rem]:hidden" />
      <ZpetPocitac zpet="/vypravy" popisek="Zpět" />
      <div className="hidden items-end justify-between min-[90rem]:flex">
        <h1 className="font-display text-[46px] font-bold leading-[45px] tracking-[-1.4px] text-inkoust">Nastavení</h1>
        <button
          type="submit"
          form="nastaveni-form"
          className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-povrch hover:opacity-90"
        >
          <Ikona nazev="check" className="size-4" />
          Uložit změny
        </button>
      </div>

      <form
        id="nastaveni-form"
        className="mt-5 flex flex-col gap-5 min-[90rem]:mt-8 min-[90rem]:grid min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:items-start min-[90rem]:gap-7"
        onSubmit={naUlozit}
      >
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="nastaveni-opravneni" className="flex flex-col gap-5 min-[90rem]:gap-4 min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:p-5 min-[90rem]:shadow-denik">
            <h2 id="nastaveni-opravneni" className="font-display text-lg font-bold text-inkoust min-[90rem]:text-[17px] min-[90rem]:tracking-[-0.3px]">
              Oprávnění
            </h2>
            <ul className="m-0 list-none divide-y divide-linka overflow-hidden rounded-2xl border border-linka bg-povrch p-0 shadow-jemny min-[90rem]:flex min-[90rem]:flex-col min-[90rem]:gap-4 min-[90rem]:divide-y-0 min-[90rem]:overflow-visible min-[90rem]:rounded-none min-[90rem]:border-0 min-[90rem]:shadow-none">
              {opravneni().map((polozka) => (
                <li
                  key={polozka.popisek}
                  className="flex flex-col gap-1 p-3.5 min-[90rem]:flex-row min-[90rem]:items-center min-[90rem]:justify-between min-[90rem]:gap-4 min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:p-0 min-[90rem]:pb-3"
                >
                  <span className="text-sm font-semibold text-inkoust min-[90rem]:text-[12.5px] min-[90rem]:font-medium min-[90rem]:text-mech">
                    {polozka.popisek}
                  </span>
                  <span className="text-[13px] text-mech min-[90rem]:inline-flex min-[90rem]:h-[34px] min-[90rem]:items-center min-[90rem]:rounded-[9px] min-[90rem]:bg-povrch-2 min-[90rem]:px-[11px] min-[90rem]:text-xs min-[90rem]:font-medium min-[90rem]:text-inkoust">
                    {polozka.hodnota}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="nastaveni-discord" className="flex flex-col gap-5 min-[90rem]:gap-0 min-[90rem]:overflow-hidden min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:shadow-denik">
            <div className="flex items-center justify-between min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:px-5 min-[90rem]:py-4">
              <div className="flex items-center gap-[9px]">
                <h2 id="nastaveni-discord" className="font-display text-lg font-bold text-inkoust min-[90rem]:text-[17px] min-[90rem]:tracking-[-0.3px]">
                  Discord oznámení
                </h2>
              </div>
              <span className="hidden text-xs font-medium text-ink-3 min-[90rem]:inline">#oznameni</span>
            </div>
            <div className="flex flex-col gap-2.5 rounded-2xl border border-linka bg-povrch p-4 shadow-jemny min-[90rem]:hidden">
              <div className="flex items-center justify-between">
                <span className="text-[14.5px] font-semibold text-inkoust">#oznameni</span>
              </div>
              <p className="text-[13px] text-mech">Nová výprava — zpráva do kanálu při založení.</p>
              <p className="text-[13px] text-mech">Důležitá oznámení — sraz, uzávěrka, zrušení.</p>
            </div>
            <ul className="m-0 hidden list-none divide-y divide-linka p-0 min-[90rem]:block">
              {DISCORD.map((polozka) => (
                <li key={polozka.id} className="flex items-center gap-4 px-5 py-1">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-[11px]">
                    <span className="text-[13.5px] font-semibold text-inkoust">{polozka.nazev}</span>
                    <span className="text-[11.5px] text-ink-3">{polozka.popis}</span>
                  </span>
                  <Prepinac
                    zapnuto={discord[polozka.id]}
                    onZmena={(zapnuto) => setDiscord((pred) => ({ ...pred, [polozka.id]: zapnuto }))}
                    popisek={`Discord: ${polozka.nazev}`}
                  />
                </li>
              ))}
            </ul>
            <p className="hidden items-center gap-2 border-t border-linka bg-zahlavi px-5 py-3.5 text-[11.5px] text-ink-3 min-[90rem]:flex">
              <Ikona nazev="lock" className="size-3.5" />
              Webhook je uložený jen na serveru.
            </p>
          </section>
        </div>

        {spravci.length > 0 ? (
          <section aria-labelledby="nastaveni-pristup" className="hidden flex-col gap-3 rounded-2xl border border-linka bg-povrch p-5 shadow-denik min-[90rem]:flex">
            <div className="flex items-center justify-between">
              <h2 id="nastaveni-pristup" className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">
                Přístup
              </h2>
              <span aria-hidden="true" className="flex size-[26px] items-center justify-center rounded-lg bg-povrch-2 text-ink-3">
                <Ikona nazev="lock" className="size-[13px]" />
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 border-b border-linka p-0 pb-3">
              {spravci.map((clen) => (
                <li key={clen.id} className="flex items-center gap-2.5">
                  <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} ton={clen.id === user?.id ? "moje" : "cizi"} velikost={30} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-inkoust">{clen.jmeno}</span>
                  <span
                    className={`rounded-full px-2 py-[3px] text-[10px] font-semibold ${
                      clen.isSuperadmin === true ? "bg-okr-100 text-okr" : "bg-povrch-2 text-ink-3"
                    }`}
                  >
                    {clen.isSuperadmin === true ? "hlavní admin" : "admin"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hlaska !== null ? (
          <p role="status" className="text-[13px] text-mech min-[90rem]:col-span-2">
            {hlaska}
          </p>
        ) : null}

        <button type="submit" className="nahled-press h-12 w-full rounded-xl bg-smrk px-4 text-sm font-semibold text-povrch min-[90rem]:hidden">
          Uložit změny
        </button>
      </form>
    </main>
  );
}
