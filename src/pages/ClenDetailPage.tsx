import { useEffect, useState, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import HlavickaZpet, { AkceHlavicky, ZpetPocitac } from "../components/HlavickaZpet";
import PrazdnyStav from "../components/PrazdnyStav";
import { DlazdiceStatu, IdentitaProfilu, KARTA_UDAJU, ProfilovaKarta, RadekUdaje, ZALOZKY_DRAHA, tridaZalozky } from "../components/ProfilKusy";
import Ikona from "../components/Ikona";
import { barvaAvataru } from "../components/AvatarKruh";
import { formatCelyDatum } from "../lib/expedition-utils";
import { IkonaKompas } from "../components/SeznamIkony";
import { useAuth } from "../hooks/useAuth";
import { apiBase } from "../lib/api-base";
import { popisekClena, profilClena } from "../lib/clen-popisek";
import { inicialyProAvatar } from "../lib/storage/avatar";
import SpravaClena from "../components/Admin/SpravaClena";
import { nactiCleny } from "../lib/admin-clenove";
import { formatKmZaokrouhlene } from "../lib/format-cisla";
import { getZebricek } from "../lib/zebricky-api";
import { expediceListUrl, type UserListItem } from "../shared/api-types";
import { klicSoukromehoChatu } from "../shared/soukromy-klic";
import { zobrazeniTelefonu } from "../shared/telefon";
import { useNabeh } from "../lib/pohyb";

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

function StavVypravy({ probehla }: { probehla: boolean }): JSX.Element {
  return (
    <span
      className={`shrink-0 rounded-full px-[9px] py-1 text-[11px] font-semibold ${probehla ? "bg-povrch-2 text-mech" : "bg-mlha text-smrk"}`}
    >
      {probehla ? "Proběhla" : "Jede"}
    </span>
  );
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
  const [zalozka, setZalozka] = useState<"prehled" | "vypravy">("prehled");
  const zalozkaRef = useNabeh<HTMLDivElement>(zalozka);
  const navigate = useNavigate();
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

  const chatCil = ((): string => {
    if (user === null || clen === null) return "/chat";
    const klic = klicSoukromehoChatu(user.id, clen.id);
    if (klic === null) return "/chat";
    return `/chat?konverzace=${encodeURIComponent(klic)}`;
  })();

  const otevriSpravu = (): void => setSprava(true);
  const dnes = new Date().toISOString().slice(0, 10);
  const kmText = souhrn === null ? "—" : formatKmZaokrouhlene(souhrn.km).replace(/\s*km$/, "");
  const zakladna = clen !== null && profilClena(clen).clenstvi === "aktivni_clen" ? "Aktivní člen" : "Člen";
  const serazeneVypravy = [...(vypravy ?? [])].sort((a, b) => b.datum.localeCompare(a.datum));
  const jsemTo = user !== null && clen !== null && user.id === clen.id;

  return (
    <main className="mx-auto w-full max-w-lg px-5 pb-6 sm:max-w-[46rem] pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet
        zpet="/cleny"
        zpetPopisek="Zpět na členy"
        titulek="Člen"
        className="min-[90rem]:hidden"
        akce={
          isSuperadmin && clen !== null ? (
            <AkceHlavicky onClick={otevriSpravu}>Spravovat</AkceHlavicky>
          ) : undefined
        }
      />

      {stav === "nacteni" ? <p className="mt-6 text-sm text-mech">Načítám člena…</p> : null}

      {stav === "chyba" ? (
        <p role="alert" className="mt-6 text-sm font-semibold text-inkoust">
          {chyba}
        </p>
      ) : null}

      {stav === "hotovo" && clen !== null ? (
        <article className="mt-5 min-[90rem]:mt-0">
          {/* Telefon */}
          <div className="flex flex-col gap-5 min-[90rem]:hidden">
            <IdentitaProfilu
              inicialy={inicialyProAvatar(clen.jmeno)}
              url={clen.avatarUrl}
              jmeno={clen.jmeno}
              podtitul={clen.email}
              stitek={popisekClena(profilClena(clen), clen.isSuperadmin)}
              barva={barvaAvataru(clen.jmeno)}
            />
            <div className="grid grid-cols-3 gap-2">
              <DlazdiceStatu popisek="Výprav" hodnota={souhrn === null ? "—" : String(souhrn.vypravy)} />
              <DlazdiceStatu popisek="Kilometrů" hodnota={kmText} />
              <DlazdiceStatu popisek="Fotek" hodnota={String(clen.pocetFotek)} />
            </div>
            {!jsemTo ? (
              <section className="flex flex-col gap-2.5 rounded-2xl border border-linka bg-povrch p-4 shadow-jemny">
                <h3 className="font-sans text-[15px] font-semibold tracking-normal text-inkoust">Soukromá zpráva</h3>
                <p className="text-[13px] leading-[18px] text-mech">Otevře soukromý chat. Uvidíte ho jen vy dva.</p>
                <Link
                  to={chatCil}
                  className="nahled-press inline-flex h-11 w-full items-center justify-center rounded-xl bg-smrk px-4 text-sm font-semibold text-povrch"
                >
                  Napsat zprávu
                </Link>
              </section>
            ) : null}
            <ul aria-label="Údaje člena" className={KARTA_UDAJU}>
              <RadekUdaje popisek="E-mail" hodnota={clen.email} />
              <RadekUdaje popisek="Telefon" hodnota={zobrazeniTelefonu(clen.telefon).text} />
              <RadekUdaje popisek="Discord nick" hodnota={clen.discordNick ?? ""} />
              <RadekUdaje popisek="Škola" hodnota={clen.skola} />
              <RadekUdaje popisek="Třída" hodnota={clen.trida} />
              <RadekUdaje popisek="Datum narození" hodnota={clen.narozeniny === null ? "" : formatujDen(clen.narozeniny)} />
              <RadekUdaje popisek="Role" hodnota={popisekClena(profilClena(clen), clen.isSuperadmin)} />
              <RadekUdaje popisek="Základna" hodnota={zakladna} />
            </ul>
            {vypravy !== null && vypravy.length > 0 ? (
              <section className="overflow-hidden rounded-2xl border border-linka bg-povrch">
                <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
                  <h2 className="font-display text-base font-bold text-inkoust">Výpravy</h2>
                  <span className="text-[13px] font-medium text-ink-3">{vypravy.length}</span>
                </div>
                <ul className="m-0 list-none divide-y divide-linka p-0">
                  {serazeneVypravy.map((vyprava) => (
                    <li key={vyprava.id}>
                      <Link
                        to={`/vypravy/${encodeURIComponent(vyprava.id)}`}
                        className="nahled-press flex min-h-11 items-center gap-3 px-3.5 py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-[13.5px] font-semibold text-inkoust">{vyprava.nazev}</span>
                          <span className="text-xs text-ink-3">{formatujDen(vyprava.datum)}</span>
                        </span>
                        <StavVypravy probehla={vyprava.datum.slice(0, 10) < dnes} />
                        <Ikona nazev="chevron-right" className="size-4 text-ink-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {isSuperadmin ? (
              <button
                type="button"
                className="nahled-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-linka bg-povrch px-4 text-sm font-semibold text-inkoust"
                onClick={otevriSpravu}
              >
                <Ikona nazev="settings-2" className="size-4 text-mech" />
                Spravovat člena
              </button>
            ) : null}
          </div>

          {/* Počítač */}
          <div className="hidden min-[90rem]:block">
            <ZpetPocitac zpet="/cleny" popisek="Zpět" />
            <div className="flex items-end justify-between gap-6">
              <div className="flex min-w-0 flex-col gap-3">
                <h1 className="font-display text-[46px] font-bold leading-[45px] tracking-[-1.4px] text-inkoust">{clen.jmeno}</h1>
                <nav aria-label="Cesta" className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Link to="/cleny" className="text-ink-3 hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk">
                    Členové
                  </Link>
                  <Ikona nazev="chevron-right" className="size-3 text-ink-3" />
                  <span className="text-mech">Profil člena</span>
                </nav>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                {isSuperadmin ? (
                  <button
                    type="button"
                    onClick={otevriSpravu}
                    className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl border border-linka bg-povrch px-4 text-sm font-semibold text-inkoust hover:bg-povrch-2"
                  >
                    <Ikona nazev="settings-2" className="size-4 text-mech" />
                    Spravovat
                  </button>
                ) : null}
                {!jsemTo ? (
                  <Link
                    to={chatCil}
                    className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-povrch hover:opacity-90"
                  >
                    <Ikona nazev="message-circle" className="size-4" />
                    Napsat
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-[340px_minmax(0,1fr)] items-start gap-7">
              <ProfilovaKarta
                inicialy={inicialyProAvatar(clen.jmeno)}
                url={clen.avatarUrl}
                barva={`${barvaAvataru(clen.jmeno)} text-povrch`}
                jmeno={clen.jmeno}
                email={clen.email}
                stitky={[
                  { text: popisekClena(profilClena(clen), clen.isSuperadmin), ton: "neutralni" },
                  ...(zakladna !== popisekClena(profilClena(clen), clen.isSuperadmin) ? [{ text: zakladna, ton: "smrk" as const }] : []),
                ]}
                cisla={[
                  { popisek: "Výprav", hodnota: souhrn === null ? "—" : String(souhrn.vypravy) },
                  { popisek: "Kilometry", hodnota: kmText },
                  { popisek: "Fotky", hodnota: String(clen.pocetFotek) },
                ]}
              />
              <div className="flex min-w-0 flex-col gap-5">
                <div role="tablist" aria-label="Části profilu" className={ZALOZKY_DRAHA}>
                  {(["prehled", "vypravy"] as const).map((id) => (
                    <button key={id} type="button" role="tab" aria-selected={zalozka === id} onClick={() => setZalozka(id)} className={tridaZalozky(zalozka === id)}>
                      {id === "prehled" ? "Přehled" : "Výpravy"}
                    </button>
                  ))}
                </div>
                <div ref={zalozkaRef} className="flex min-w-0 flex-col gap-5">
                <section className="overflow-hidden rounded-2xl border border-linka bg-povrch shadow-denik">
                  <h2 className="border-b border-linka px-5 py-[18px] font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">
                    {zalozka === "prehled" ? "Poslední výpravy" : "Výpravy"}
                  </h2>
                  {serazeneVypravy.length === 0 ? (
                    <PrazdnyStav ikona={<IkonaKompas />} nadpis="Zatím žádná výprava" text="Až se člen přihlásí na výpravu, objeví se tady." vzhled="vlozeny" />
                  ) : (
                    <ul className="m-0 list-none divide-y divide-linka p-0">
                      {(zalozka === "prehled" ? serazeneVypravy.slice(0, 4) : serazeneVypravy).map((vyprava) => (
                        <li key={vyprava.id}>
                          <Link
                            to={`/vypravy/${encodeURIComponent(vyprava.id)}`}
                            className="bez-prejeti flex items-center gap-4 px-5 py-4 hover:bg-povrch-2/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-[13.5px] font-semibold text-inkoust">{vyprava.nazev}</span>
                              <span className="text-xs text-ink-3">{formatCelyDatum(vyprava.datum)}</span>
                            </span>
                            <StavVypravy probehla={vyprava.datum.slice(0, 10) < dnes} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {zalozka === "prehled" ? (
                  <section className="flex flex-col gap-4 rounded-2xl border border-linka bg-povrch p-5 shadow-denik">
                    <h2 className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">Kontakt</h2>
                    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-4">
                      {(
                        [
                          ["Jméno", clen.jmeno.split(" ")[0] ?? ""],
                          ["Příjmení", clen.jmeno.split(" ").slice(1).join(" ")],
                          ["E-mail", clen.email],
                          ["Telefon", zobrazeniTelefonu(clen.telefon).text],
                          ["Datum narození", clen.narozeniny === null ? "" : formatujDen(clen.narozeniny)],
                          ["Discord nick", clen.discordNick ?? ""],
                          ["Škola", clen.skola],
                          ["Třída", clen.trida],
                        ] as const
                      ).map(([popisek, hodnota]) => (
                        <div key={popisek} className="flex min-w-0 flex-col gap-1.5">
                          <dt className="text-[11.5px] font-semibold text-mech">{popisek}</dt>
                          <dd className="m-0 min-w-0 break-words text-[13.5px] text-inkoust">{hodnota.trim().length > 0 ? hodnota : "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}
                </div>
                <div className="flex justify-end">
                  <Link to="/cleny" className="inline-flex h-11 items-center px-2.5 text-sm font-semibold text-mech hover:text-inkoust">
                    Zpět na členy
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </article>
      ) : null}

      <SpravaClena
        clen={sprava && isSuperadmin ? clen : null}
        onZavrit={() => setSprava(false)}
        onUlozeno={setClen}
        onSmazano={() => navigate("/cleny", { replace: true })}
      />
    </main>
  );
}
