import { useEffect, useState, type JSX } from "react";
import { SeznamIkona, SeznamKarta, SeznamRadek } from "../components/SeznamKarta";
import Ikona from "../components/Ikona";
import SpodniSheet from "../components/shell/SpodniSheet";
import { useAuth } from "../hooks/useAuth";
import { popisekClena } from "../lib/clen-popisek";
import { nactiNavrhy } from "../lib/zpevnik-api";

type Sheet = "napoveda" | "o-aplikaci" | null;

function iniciály(jmeno: string, prijmeni?: string): string {
  const a = jmeno.trim().charAt(0).toUpperCase();
  const b = (prijmeni ?? "").trim().charAt(0).toUpperCase();
  return `${a}${b.length > 0 ? b : ""}` || "?";
}

const NADPIS_SEKCE = "font-sans text-[11.5px] font-semibold tracking-[0.6px] text-ink-3";

/**
 * More menu (phone tab). Install prompt is only the browser event.
 */
export default function VicePage(): JSX.Element {
  const { user, odhlasit, isAdmin, isSuperadmin } = useAuth();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pocetNavrhu, setPocetNavrhu] = useState(0);

  const smiFrontu =
    user?.isAdmin === true || user?.isSuperadmin === true || user?.funkce === "vedeni";

  useEffect(() => {
    if (!smiFrontu) return;
    let zije = true;
    void nactiNavrhy().then((vysledek) => {
      if (!zije || !vysledek.ok) return;
      setPocetNavrhu(vysledek.navrhy.length);
    });
    return () => {
      zije = false;
    };
  }, [smiFrontu]);

  const celeJmeno =
    user === null
      ? "Profil"
      : [user.jmeno, user.prijmeni].filter((d) => (d ?? "").trim().length > 0).join(" ");

  return (
    <main className="mx-auto w-full max-w-lg px-5 pb-6 pt-4 sm:max-w-[46rem] sm:px-6 sm:pt-8">
      <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust">Více</h1>

      {user !== null ? (
        <SeznamKarta popisek="Profil" className="mt-6">
          <SeznamRadek
            odkaz="/profil"
            vlevo={
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-smrk text-[15px] font-semibold text-povrch"
              >
                {iniciály(user.jmeno, user.prijmeni)}
              </span>
            }
            nazev={<span className="text-base">{celeJmeno}</span>}
            podtitul={`${popisekClena(
              {
                clenstvi: user.clenstvi ?? "clen",
                funkce: user.funkce ?? null,
                isAdmin: user.isAdmin === true,
              },
              user.isSuperadmin === true,
            )} · Školní expediční klub`}
          />
        </SeznamKarta>
      ) : null}

      <nav aria-label="Přehled klubu" className="mt-6">
        <SeznamKarta>
          <SeznamRadek odkaz="/zebricky" vlevo={<SeznamIkona><Ikona nazev="trophy" className="size-4" /></SeznamIkona>} nazev={<span className="text-[15px] font-medium">Žebříčky</span>} />
          <SeznamRadek odkaz="/cleny" vlevo={<SeznamIkona><Ikona nazev="users" className="size-4" /></SeznamIkona>} nazev={<span className="text-[15px] font-medium">Členové</span>} />
          <SeznamRadek odkaz="/profil?tab=statistiky&pohled=klub" vlevo={<SeznamIkona><Ikona nazev="chart-column" className="size-4" /></SeznamIkona>} nazev={<span className="text-[15px] font-medium">Statistiky</span>} />
        </SeznamKarta>
      </nav>

      <section className="mt-6" aria-labelledby="vice-sprava">
        <h2 id="vice-sprava" className={NADPIS_SEKCE}>
          {smiFrontu ? "Správa klubu" : "Nastavení"}
        </h2>
        <SeznamKarta className="mt-2">
          {(isAdmin || isSuperadmin) ? (
            <SeznamRadek odkaz="/admin/kody" vlevo={<SeznamIkona><Ikona nazev="key-round" className="size-4" /></SeznamIkona>} nazev={<span className="text-[15px] font-medium">Pozvánkové kódy</span>} />
          ) : null}
          {smiFrontu ? (
            <SeznamRadek
              odkaz="/zpevnik/fronta"
              vlevo={<SeznamIkona><Ikona nazev="music" className="size-4" /></SeznamIkona>}
              nazev={<span className="text-[15px] font-medium">Návrhy písní</span>}
              vpravo={
                pocetNavrhu > 0 ? (
                  <span className="inline-flex h-[22px] items-center rounded-[11px] bg-akcent-100 px-2 text-xs font-semibold text-akcent">
                    {pocetNavrhu}
                  </span>
                ) : undefined
              }
            />
          ) : null}
          <SeznamRadek odkaz="/nastaveni" vlevo={<SeznamIkona><Ikona nazev="settings" className="size-4" /></SeznamIkona>} nazev={<span className="text-[15px] font-medium">Nastavení</span>} />
        </SeznamKarta>
      </section>

      <section className="mt-6" aria-labelledby="vice-aplikace">
        <h2 id="vice-aplikace" className={NADPIS_SEKCE}>
          Aplikace
        </h2>
        <SeznamKarta className="mt-2">
          <SeznamRadek onClick={() => setSheet("napoveda")} otviraDialog vlevo={<SeznamIkona ton="svetly"><Ikona nazev="info" className="size-4" /></SeznamIkona>} nazev="Nápověda" />
          <SeznamRadek onClick={() => setSheet("o-aplikaci")} otviraDialog vlevo={<SeznamIkona ton="svetly"><Ikona nazev="info" className="size-4" /></SeznamIkona>} nazev="O ExApp" />
        </SeznamKarta>
      </section>

      <button
        type="button"
        className="nahled-press mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-akcent-100 px-4 text-sm font-semibold text-akcent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-akcent"
        onClick={() => odhlasit()}
      >
        <Ikona nazev="log-out" className="size-4" />
        Odhlásit se
      </button>

      <SpodniSheet
        otevreno={sheet === "napoveda"}
        titulek="Nápověda"
        onZavrit={() => setSheet(null)}
      >
        <p className="text-[13.5px] leading-5 text-mech">
          Výpravy a schůzky jsou na první záložce. Fotky, zpěvník a chat mají vlastní záložky dole.
          Žebříčky, členové a statistiky jsou tady ve Více. Profil otevřeš řádkem nahoře nebo ikonou
          vpravo nahoře.
        </p>
      </SpodniSheet>

      <SpodniSheet
        otevreno={sheet === "o-aplikaci"}
        titulek="O ExApp"
        onZavrit={() => setSheet(null)}
      >
        <p className="text-[13.5px] leading-5 text-mech">
          ExApp je klubová aplikace školního expedičního klubu. Drží výpravy, kalendář, fotky, zpěvník,
          chat a žebříčky na jednom místě.
        </p>
      </SpodniSheet>

    </main>
  );
}