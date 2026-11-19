import { useEffect, useState, type JSX } from "react";
import { SeznamIkona, SeznamKarta, SeznamRadek } from "../components/SeznamKarta";
import {
  IkonaGraf,
  IkonaInfo,
  IkonaKlic,
  IkonaLide,
  IkonaNastaveni,
  IkonaNota,
  IkonaOdhlasit,
  IkonaOtaznik,
  IkonaPohar,
  IkonaTelefon,
} from "../components/SeznamIkony";
import SpodniSheet from "../components/shell/SpodniSheet";
import PridatNaPlochuSheet from "../components/shell/PridatNaPlochuSheet";
import { useAuth } from "../hooks/useAuth";
import { popisekClena } from "../lib/clen-popisek";
import { nactiNavrhy } from "../lib/zpevnik-api";

type Sheet = "napoveda" | "o-aplikaci" | "plocha" | null;

function iniciály(jmeno: string, prijmeni?: string): string {
  const a = jmeno.trim().charAt(0).toUpperCase();
  const b = (prijmeni ?? "").trim().charAt(0).toUpperCase();
  return `${a}${b.length > 0 ? b : ""}` || "?";
}

const NADPIS_SEKCE = "px-1 text-[13px] font-semibold text-ink-3";

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
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b border-linka pb-5">
        <h1 className="font-display text-3xl font-bold tracking-tight text-inkoust">Více</h1>
      </header>

      {user !== null ? (
        <SeznamKarta popisek="Profil" className="mt-5">
          <SeznamRadek
            odkaz="/profil"
            vlevo={
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-smrk text-base font-bold text-papir"
              >
                {iniciály(user.jmeno, user.prijmeni)}
              </span>
            }
            nazev={<span className="font-display text-[17px] font-bold">{celeJmeno}</span>}
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

      <nav aria-label="Přehled klubu" className="mt-5">
        <SeznamKarta>
          <SeznamRadek odkaz="/zebricky" vlevo={<SeznamIkona><IkonaPohar /></SeznamIkona>} nazev="Žebříčky" />
          <SeznamRadek odkaz="/cleny" vlevo={<SeznamIkona><IkonaLide /></SeznamIkona>} nazev="Členové" />
          <SeznamRadek odkaz="/profil?tab=statistiky" vlevo={<SeznamIkona><IkonaGraf /></SeznamIkona>} nazev="Statistiky" />
        </SeznamKarta>
      </nav>

      <section className="mt-6" aria-labelledby="vice-sprava">
        <h2 id="vice-sprava" className={NADPIS_SEKCE}>
          {isAdmin || isSuperadmin ? "Správa klubu" : "Nastavení"}
        </h2>
        <SeznamKarta className="mt-2">
          {(isAdmin || isSuperadmin) ? (
            <SeznamRadek odkaz="/admin/kody" vlevo={<SeznamIkona><IkonaKlic /></SeznamIkona>} nazev="Pozvánkové kódy" />
          ) : null}
          {(isAdmin || isSuperadmin) && smiFrontu ? (
            <SeznamRadek
              odkaz="/zpevnik/fronta"
              vlevo={<SeznamIkona><IkonaNota /></SeznamIkona>}
              nazev="Návrhy písní"
              vpravo={
                pocetNavrhu > 0 ? (
                  <span className="rounded-full bg-akcent-100 px-2 py-0.5 text-xs font-bold text-akcent">
                    {pocetNavrhu}
                  </span>
                ) : undefined
              }
            />
          ) : null}
          <SeznamRadek odkaz="/nastaveni" vlevo={<SeznamIkona><IkonaNastaveni /></SeznamIkona>} nazev="Nastavení" />
        </SeznamKarta>
      </section>

      <section className="mt-6" aria-labelledby="vice-aplikace">
        <h2 id="vice-aplikace" className={NADPIS_SEKCE}>
          Aplikace
        </h2>
        <SeznamKarta className="mt-2">
          <SeznamRadek onClick={() => setSheet("napoveda")} otviraDialog vlevo={<SeznamIkona><IkonaOtaznik /></SeznamIkona>} nazev="Nápověda" />
          <SeznamRadek onClick={() => setSheet("o-aplikaci")} otviraDialog vlevo={<SeznamIkona><IkonaInfo /></SeznamIkona>} nazev="O ExApp" />
          <SeznamRadek onClick={() => setSheet("plocha")} otviraDialog vlevo={<SeznamIkona><IkonaTelefon /></SeznamIkona>} nazev="Přidat na plochu" />
        </SeznamKarta>
      </section>

      <button
        type="button"
        className="nahled-press mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-akcent/25 bg-akcent-100 px-4 text-base font-semibold text-akcent"
        onClick={() => odhlasit()}
      >
        <IkonaOdhlasit />
        Odhlásit se
      </button>

      <SpodniSheet
        otevreno={sheet === "napoveda"}
        titulek="Nápověda"
        onZavrit={() => setSheet(null)}
      >
        <p className="text-base leading-relaxed text-inkoust">
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
        <p className="text-base leading-relaxed text-inkoust">
          ExApp je klubová aplikace školního expedičního klubu. Drží výpravy, kalendář, fotky, zpěvník,
          chat a žebříčky na jednom místě.
        </p>
      </SpodniSheet>

      <PridatNaPlochuSheet otevreno={sheet === "plocha"} onZavrit={() => setSheet(null)} />
    </main>
  );
}