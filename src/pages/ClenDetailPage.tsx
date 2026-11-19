import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Link, useParams } from "react-router-dom";
import HlavickaZpet, { AkceHlavicky } from "../components/HlavickaZpet";
import PrazdnyStav from "../components/PrazdnyStav";
import { DlazdiceStatu, IdentitaProfilu, RadekUdaje } from "../components/ProfilKusy";
import { SEZNAM_KARTA_TRIDA, SeznamKarta, SeznamRadek } from "../components/SeznamKarta";
import { IkonaKompas } from "../components/SeznamIkony";
import SpodniSheet, { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../components/shell/SpodniSheet";
import {
  chybaKombinace3D,
  mapujRoliNaProfil,
  type Clenstvi,
  type ClenskyProfil,
  type Funkce,
} from "../config/roles";
import { useAuth } from "../hooks/useAuth";
import { apiBase } from "../lib/api-base";
import { popisekClena } from "../lib/clen-popisek";
import { inicialyProAvatar } from "../lib/storage/avatar";
import { nactiCleny, ulozProfilClena } from "../lib/admin-clenove";
import { formatKmZaokrouhlene } from "../lib/format-cisla";
import { getZebricek } from "../lib/zebricky-api";
import { expediceListUrl, type UserListItem } from "../shared/api-types";
import { klicSoukromehoChatu } from "../shared/soukromy-klic";

type VypravaRadka = { id: string; nazev: string; datum: string };

type Souhrn = { vypravy: number; km: number } | null;

function formatujDen(iso: string): string {
  const [rok, mesic, den] = iso.slice(0, 10).split("-");
  if (rok === undefined || mesic === undefined || den === undefined) return iso;
  const denCislo = Number(den);
  const mesicCislo = Number(mesic);
  if (!Number.isFinite(denCislo) || !Number.isFinite(mesicCislo)) return iso;
  return `${denCislo}. ${mesicCislo}. ${rok}`;
}

async function nactiVypravyClena(
  userId: string,
): Promise<{ ok: true; expedice: VypravaRadka[] } | { ok: false }> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false };
  try {
    const odpoved = await fetch(`${zaklad}${expediceListUrl({ ucastnik: userId })}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!odpoved.ok) return { ok: false };
    const telo: unknown = await odpoved.json();
    if (typeof telo !== "object" || telo === null) return { ok: false };
    const expedice = (telo as { expedice?: unknown }).expedice;
    if (!Array.isArray(expedice)) return { ok: false };
    const radky: VypravaRadka[] = [];
    for (const polozka of expedice) {
      if (typeof polozka !== "object" || polozka === null) continue;
      const zaznam = polozka as Record<string, unknown>;
      if (
        typeof zaznam["id"] !== "string" ||
        typeof zaznam["nazev"] !== "string" ||
        typeof zaznam["datum"] !== "string"
      ) {
        continue;
      }
      radky.push({
        id: zaznam["id"],
        nazev: zaznam["nazev"],
        datum: zaznam["datum"],
      });
    }
    return { ok: true, expedice: radky };
  } catch {
    return { ok: false };
  }
}

export default function ClenDetailPage(): JSX.Element {
  const { id } = useParams();
  const { user, isSuperadmin } = useAuth();
  const [clen, setClen] = useState<UserListItem | null>(null);
  const [stav, setStav] = useState<"nacteni" | "hotovo" | "chyba">("nacteni");
  const [chyba, setChyba] = useState("");
  const [souhrn, setSouhrn] = useState<Souhrn>(null);
  const [vypravy, setVypravy] = useState<VypravaRadka[] | null>(null);
  const [sprava, setSprava] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [chybaRole, setChybaRole] = useState<string | null>(null);
  const [clenstvi, setClenstvi] = useState<Clenstvi>("clen");
  const [funkce, setFunkce] = useState<Funkce>(null);
  const [jeAdmin, setJeAdmin] = useState(false);
  const [jeHlavni, setJeHlavni] = useState(false);

  function profilZE(clenPolozka: UserListItem): ClenskyProfil {
    const zaklad = mapujRoliNaProfil(clenPolozka.role);
    return {
      clenstvi: clenPolozka.clenstvi ?? zaklad.clenstvi,
      funkce: clenPolozka.funkce ?? zaklad.funkce,
      isAdmin: clenPolozka.isAdmin ?? zaklad.isAdmin,
    };
  }

  function naplnSpravu(polozka: UserListItem): void {
    const profil = profilZE(polozka);
    setClenstvi(profil.clenstvi);
    setFunkce(profil.funkce);
    setJeAdmin(profil.isAdmin || polozka.isSuperadmin);
    setJeHlavni(polozka.isSuperadmin);
  }

  useEffect(() => {
    const hledane = id ?? "";
    if (hledane.length === 0) {
      setStav("chyba");
      setChyba("Člen nenalezen.");
      return;
    }
    let zive = true;
    setStav("nacteni");
    void (async (): Promise<void> => {
      const vysledek = await nactiCleny();
      if (!zive) return;
      if (!vysledek.ok) {
        setStav("chyba");
        setChyba(vysledek.chyba);
        return;
      }
      const nalezeny = vysledek.data.find((polozka) => polozka.id === hledane) ?? null;
      if (nalezeny === null) {
        setStav("chyba");
        setChyba("Člen nenalezen.");
        return;
      }
      setClen(nalezeny);
      naplnSpravu(nalezeny);
      setStav("hotovo");

      const zebricek = await getZebricek("celkem");
      if (!zive) return;
      if (zebricek.source === "db") {
        const radek = zebricek.data.zebricky.find((polozka) => polozka.userId === hledane);
        if (
          radek !== undefined &&
          typeof radek.vypravy === "number" &&
          typeof radek.km === "number"
        ) {
          setSouhrn({ vypravy: radek.vypravy, km: radek.km });
        }
      }

      const seznam = await nactiVypravyClena(hledane);
      if (!zive) return;
      setVypravy(seznam.ok ? seznam.expedice : null);
    })();
    return () => {
      zive = false;
    };
  }, [id]);

  async function naUlozitRoli(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (clen === null || ukladam) return;
    const kombinace = chybaKombinace3D({
      clenstvi,
      funkce,
      isAdmin: jeAdmin || jeHlavni,
    });
    if (kombinace !== null) {
      setChybaRole(kombinace);
      return;
    }
    setUkladam(true);
    setChybaRole(null);
    const vysledek = await ulozProfilClena(clen.id, {
      clenstvi,
      funkce,
      isAdmin: jeAdmin || jeHlavni,
      isSuperadmin: jeHlavni,
    });
    setUkladam(false);
    if (!vysledek.ok) {
      setChybaRole(vysledek.chyba);
      return;
    }
    setClen(vysledek.data);
    naplnSpravu(vysledek.data);
    setSprava(false);
  }

  const chatCil = ((): string => {
    if (user === null || clen === null) return "/chat";
    const klic = klicSoukromehoChatu(user.id, clen.id);
    if (klic === null) return "/chat";
    return `/chat?konverzace=${encodeURIComponent(klic)}`;
  })();

  const otevriSpravu = (): void => {
    if (clen === null) return;
    naplnSpravu(clen);
    setChybaRole(null);
    setSprava(true);
  };
  const dnes = new Date().toISOString().slice(0, 10);
  const jsemTo = user !== null && clen !== null && user.id === clen.id;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <HlavickaZpet
        zpet="/cleny"
        zpetPopisek="Zpět na členy"
        titulek="Člen"
        akce={
          isSuperadmin && clen !== null ? (
            <AkceHlavicky onClick={otevriSpravu}>Spravovat</AkceHlavicky>
          ) : undefined
        }
      />

      {stav === "nacteni" ? (
        <p className="mt-6 text-base text-mech">Načítám člena…</p>
      ) : null}

      {stav === "chyba" ? (
        <p role="alert" className="mt-6 text-base font-bold text-inkoust">
          {chyba}
        </p>
      ) : null}

      {stav === "hotovo" && clen !== null ? (
        <article className="mt-4">
          <IdentitaProfilu
            inicialy={inicialyProAvatar(clen.jmeno)}
            jmeno={clen.jmeno}
            podtitul={clen.email}
            stitek={popisekClena(profilZE(clen), clen.isSuperadmin)}
          />

          <div className="grid grid-cols-3 gap-2">
            <DlazdiceStatu popisek="Výprav" hodnota={souhrn === null ? "—" : String(souhrn.vypravy)} />
            <DlazdiceStatu
              popisek="Kilometrů"
              hodnota={souhrn === null ? "—" : formatKmZaokrouhlene(souhrn.km).replace(/\s*km$/, "")}
            />
            <DlazdiceStatu popisek="Fotek" hodnota={String(clen.pocetFotek)} />
          </div>

          {!jsemTo ? (
            <section className="mt-4 rounded-2xl border border-linka bg-povrch p-4">
              <h3 className="font-display text-[17px] font-bold text-inkoust">Soukromá zpráva</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-3">
                Otevře se vaše společná konverzace v chatu.
              </p>
              <Link
                to={chatCil}
                className="nahled-press mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-smrk px-4 text-[15px] font-semibold text-papir"
              >
                Napsat zprávu
              </Link>
            </section>
          ) : null}

          <ul aria-label="Údaje člena" className={`mt-4 ${SEZNAM_KARTA_TRIDA}`}>
            <RadekUdaje popisek="E-mail" hodnota={clen.email} />
            <RadekUdaje popisek="Telefon" hodnota={clen.telefon ?? ""} />
            <RadekUdaje popisek="Discord nick" hodnota={clen.discordNick ?? ""} />
            <RadekUdaje popisek="Škola" hodnota={clen.skola} />
            <RadekUdaje popisek="Třída" hodnota={clen.trida} />
            <RadekUdaje
              popisek="Narozeniny"
              hodnota={clen.narozeniny === null ? "" : formatujDen(clen.narozeniny)}
            />
          </ul>

          {vypravy !== null ? (
            <section className="mt-6">
              <h2 className="px-1 font-display text-[17px] font-bold text-inkoust">Výpravy</h2>
              {vypravy.length === 0 ? (
                <PrazdnyStav
                  className="mt-2"
                  ikona={<IkonaKompas />}
                  nadpis="Zatím žádná výprava"
                  text="Až se člen přihlásí na výpravu, objeví se tady."
                />
              ) : (
                <SeznamKarta popisek="Výpravy člena" className="mt-2">
                  {vypravy.map((vyprava) => {
                    const probehla = vyprava.datum.slice(0, 10) < dnes;
                    return (
                      <SeznamRadek
                        key={vyprava.id}
                        odkaz={`/vypravy?vyprava=${encodeURIComponent(vyprava.id)}`}
                        nazev={vyprava.nazev}
                        podtitul={formatujDen(vyprava.datum)}
                        vpravo={
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                              probehla ? "bg-povrch-2 text-ink-3" : "bg-mlha text-smrk"
                            }`}
                          >
                            {probehla ? "Proběhla" : "Jede"}
                          </span>
                        }
                      />
                    );
                  })}
                </SeznamKarta>
              )}
            </section>
          ) : null}

          {isSuperadmin ? (
            <button
              type="button"
              className="nahled-press mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-linka bg-povrch px-4 text-[15px] font-semibold text-inkoust"
              onClick={otevriSpravu}
            >
              Spravovat člena
            </button>
          ) : null}
        </article>
      ) : null}

      <SpodniSheet
        otevreno={sprava && isSuperadmin && clen !== null}
        titulek="Správa člena"
        onZavrit={() => setSprava(false)}
      >
        <form className="flex flex-col gap-3" onSubmit={(event) => void naUlozitRoli(event)}>
          <label htmlFor="sprava-clenstvi" className="text-sm font-bold">
            Členství
          </label>
          <select
            id="sprava-clenstvi"
            value={clenstvi}
            onChange={(e) => {
              const nove = e.target.value === "aktivni_clen" ? "aktivni_clen" : "clen";
              setClenstvi(nove);
              if (nove === "clen") setFunkce(null);
            }}
            className="min-h-11 w-full rounded-2xl border border-pole bg-papir px-3 text-base text-inkoust"
          >
            <option value="clen">Člen</option>
            <option value="aktivni_clen">Aktivní člen</option>
          </select>
          <label htmlFor="sprava-funkce" className="text-sm font-bold">
            Funkce
          </label>
          <select
            id="sprava-funkce"
            value={funkce ?? ""}
            disabled={clenstvi === "clen"}
            onChange={(e) => {
              const v = e.target.value;
              setFunkce(v === "rada" ? "rada" : v === "vedeni" ? "vedeni" : null);
            }}
            className="min-h-11 w-full rounded-2xl border border-pole bg-papir px-3 text-base text-inkoust disabled:opacity-50"
          >
            <option value="">Bez funkce</option>
            <option value="rada">Rada</option>
            <option value="vedeni">Vedení</option>
          </select>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={jeAdmin}
              disabled={jeHlavni}
              onChange={(e) => setJeAdmin(e.target.checked)}
            />
            Admin
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={jeHlavni}
              onChange={(e) => {
                const zapnuto = e.target.checked;
                setJeHlavni(zapnuto);
                if (zapnuto) setJeAdmin(true);
              }}
            />
            Hlavní admin
          </label>
          {chybaRole !== null ? (
            <p role="alert" className="text-base text-inkoust">
              {chybaRole}
            </p>
          ) : null}
          <div className={PATICKA_SHEETU}>
            <button
              type="button"
              onClick={() => setSprava(false)}
              className={TLACITKO_PATICKY_ZRUSIT}
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={ukladam}
              className={TLACITKO_PATICKY_HLAVNI}
            >
              {ukladam ? "Ukládám…" : "Uložit"}
            </button>
          </div>
        </form>
      </SpodniSheet>
    </main>
  );
}
