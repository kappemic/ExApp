import { useEffect, useId, useState, type JSX } from "react";
import {
  ulozAktivituRucne,
  type RucniAktivitaVysledek,
} from "../../lib/expedice-aktivita";
import {
  druhStravaChyby,
  jeStravaNedostupnaVetev,
  muzeOpakovatStravaChybu,
  nactiNeparovaneAktivity,
  odpojAktivitu,
  sparujAktivitu,
  type NeparovanaAktivita,
} from "../../lib/strava-api";
import type { ApiErrorCode } from "../../shared/api-types";

export interface StravaParovaniProps {
  expeditionId: string;
  /** Po úspěšném confirmu rodič přepíše expedici (km / převýšení). */
  onSparovano?: () => void;
  /** Krok 13 (aditivně optional): výprava už má připojenou aktivitu. */
  jeSparovano?: boolean;
  /** Krok 13 (aditivně optional): id připojené Strava aktivity. */
  stravaActivityId?: string | null;
  /** Po úspěšném odpojení rodič přepíše expedici (statistiky klesnou). */
  onOdpojeno?: () => void;
}

type Faze = "nacitani" | "hotovo" | "chyba";

function formatKm(km: number): string {
  return `${String(km.toFixed(1)).replace(".", ",")} km`;
}

function formatDatum(datum: string): string {
  const cas = Date.parse(datum);
  if (Number.isNaN(cas)) return datum;
  return new Date(cas).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

/**
 * Step 4 — rozlišení tří úrovní odpojení (texty se nesmí plést):
 * - Strava aktivita od výpravy → tlačítko „Odpojit aktivitu" + confirm().
 * - Ruční zápis kilometrů → tlačítko „Smazat ruční zápis" + confirm().
 *   Stejný DELETE endpoint (server nuluje 4 sloupce), jiný popisek + dotaz.
 * - Účet Strava → JEN v profilu („Odpojit účet"), nikdy v expedici.
 *   Tady je jen vysvětlující hint, žádné takové tlačítko.
 * Čistá funkce pro testy — ruční km nesmí zmizet bez confirmu.
 */
export type ZdrojPripojeni = "strava" | "rucni" | "nic";

export interface StavPripojeniVstup {
  sparovanoId: string | null;
  jeSparovano: boolean;
  stravaActivityId: string | null;
  rucneSparovano: boolean;
  potlacenoOdpojenim: boolean;
}

export function rozhodniZdrojPripojeni(
  vstup: StavPripojeniVstup,
): ZdrojPripojeni {
  if (vstup.potlacenoOdpojenim) return "nic";
  if (vstup.sparovanoId !== null) return "strava";
  if (vstup.stravaActivityId !== null) return "strava";
  if (vstup.rucneSparovano) return "rucni";
  if (vstup.jeSparovano && vstup.stravaActivityId === null) return "rucni";
  return "nic";
}

export const POTVRZENI_ODPOJENI_STRAVA =
  "Opravdu odpojit Strava aktivitu od výpravy? Kilometry z výpravy zmizí.";
export const POTVRZENI_SMAZANI_RUCNIHO =
  "Opravdu smazat ručně zapsané kilometry z výpravy? Zápis zmizí a nepůjde vzít zpět.";
export default function StravaParovani({
  expeditionId,
  onSparovano,
  jeSparovano = false,
  stravaActivityId = null,
  onOdpojeno,
}: StravaParovaniProps): JSX.Element {
  const [faze, setFaze] = useState<Faze>("nacitani");
  const [navrhy, setNavrhy] = useState<NeparovanaAktivita[]>([]);
  const [celkem, setCelkem] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  /* Step 3: kód chyby vedle textu — podle něj se volí větev
     (validace / nedostupná / přihlášení / oprávnění / konflikt). */
  const [kodChyby, setKodChyby] = useState<ApiErrorCode | null>(null);
  /* Step 3: poslední nezdařené potvrzení — jen pro něj se nabízí ruční
     retry (odpojení retry nenabízí, aby znovu nevyskakoval confirm). */
  const [posledniNezdar, setPosledniNezdar] =
    useState<NeparovanaAktivita | null>(null);
  const [potvrzujeSe, setPotvrzujeSe] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [sparovanoId, setSparovanoId] = useState<string | null>(
    stravaActivityId,
  );
  const [odpojujeSe, setOdpojujeSe] = useState<boolean>(false);
  const [km, setKm] = useState<string>("");
  const [prevyseni, setPrevyseni] = useState<string>("");
  const [ukladaSe, setUkladaSe] = useState<boolean>(false);
  const [rucniChyba, setRucniChyba] = useState<string | null>(null);
  const [rucniZprava, setRucniZprava] = useState<string | null>(null);
  /* Krok 15: kompaktní expanding výběr — collapsed = 1 řádek. */
  const [rozbaleno, setRozbaleno] = useState<boolean>(false);
  /* Krok 16 fix: rozhodnutí čte JEN props z detailu expedice.
     Místní přepisy kryjí okno mezi klikem a refreshem rodiče
     (nactiUcastniky → nová expedice s novým jeSparovano). */
  const [rucneSparovano, setRucneSparovano] = useState<boolean>(false);
  const [mistniKm, setMistniKm] = useState<number | null>(null);
  const [potlacenoOdpojenim, setPotlacenoOdpojenim] =
    useState<boolean>(false);
  const seznamId: string = useId();

  useEffect(() => {
    setSparovanoId(stravaActivityId);
    setRucneSparovano(false);
    setMistniKm(null);
    setPotlacenoOdpojenim(false);
    setKodChyby(null);
    setPosledniNezdar(null);
  }, [expeditionId, jeSparovano, stravaActivityId]);

  useEffect(() => {
    let zije = true;
    void (async (): Promise<void> => {
      setFaze("nacitani");
      setChyba(null);
      setKodChyby(null);
      const vysledek = await nactiNeparovaneAktivity({ page: 1, per_page: 30 });
      if (!zije) return;
      if (!vysledek.ok) {
        setFaze("chyba");
        setChyba(vysledek.chyba);
        setKodChyby(vysledek.kod ?? null);
        return;
      }
      setNavrhy(vysledek.data.aktivity);
      setCelkem(vysledek.data.celkem ?? vysledek.data.aktivity.length);
      setFaze("hotovo");
    })();
    return () => {
      zije = false;
    };
  }, [expeditionId]);

  async function potvrdit(aktivita: NeparovanaAktivita): Promise<void> {
    setPotvrzujeSe(aktivita.id);
    setChyba(null);
    setKodChyby(null);
    setPosledniNezdar(null);
    setZprava(null);
    const vysledek = await sparujAktivitu(expeditionId, aktivita.id);
    setPotvrzujeSe(null);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      setKodChyby(vysledek.kod ?? null);
      /* Retry (ruční tlačítko) jen kde pomůže — validace, 401/403 ani 409
         ho nedostanou; aktivitu si pamatujeme jen pro opakovatelné druhy. */
      if (muzeOpakovatStravaChybu(vysledek.kod)) {
        setPosledniNezdar(aktivita);
      }
      return;
    }
    setZprava(
      `Spárováno: ${formatKm(aktivita.km)} · +${String(aktivita.prevyseniM)} m.`,
    );
    setSparovanoId(aktivita.id);
    setMistniKm(aktivita.km);
    setRucneSparovano(false);
    setPotlacenoOdpojenim(false);
    setNavrhy((prev) =>
      prev.map((polozka) =>
        polozka.id === aktivita.id ? { ...polozka, sparovano: true } : polozka,
      ),
    );
    /* Krok 15: po potvrzení se box sbalí zpět. */
    setRozbaleno(false);
    onSparovano?.();
  }

  function zamitnout(id: string): void {
    setNavrhy((prev) => prev.filter((polozka) => polozka.id !== id));
    setZprava("Návrh zamítnut — vybírej z dalších aktivit.");
  }

  async function obnovit(): Promise<void> {
    setFaze("nacitani");
    setChyba(null);
    setKodChyby(null);
    const vysledek = await nactiNeparovaneAktivity({ page: 1, per_page: 30 });
    if (!vysledek.ok) {
      setFaze("chyba");
      setChyba(vysledek.chyba);
      setKodChyby(vysledek.kod ?? null);
      return;
    }
    setNavrhy(vysledek.data.aktivity);
    setCelkem(vysledek.data.celkem ?? vysledek.data.aktivity.length);
    setFaze("hotovo");
  }

  async function odpojitStravaAktivitu(): Promise<void> {
    if (
      typeof window !== "undefined" &&
      !window.confirm(POTVRZENI_ODPOJENI_STRAVA)
    ) {
      return;
    }
    setOdpojujeSe(true);
    setChyba(null);
    setKodChyby(null);
    setPosledniNezdar(null);
    setZprava(null);
    const vysledek = await odpojAktivitu(expeditionId);
    setOdpojujeSe(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      setKodChyby(vysledek.kod ?? null);
      return;
    }
    setSparovanoId(null);
    setRucneSparovano(false);
    setMistniKm(null);
    setPotlacenoOdpojenim(true);
    setZprava("Strava aktivita odpojena — kilometry z výpravy zmizely.");
    onOdpojeno?.();
    onSparovano?.();
  }

  async function smazatRucniZapis(): Promise<void> {
    if (
      typeof window !== "undefined" &&
      !window.confirm(POTVRZENI_SMAZANI_RUCNIHO)
    ) {
      return;
    }
    setOdpojujeSe(true);
    setChyba(null);
    setKodChyby(null);
    setPosledniNezdar(null);
    setZprava(null);
    const vysledek = await odpojAktivitu(expeditionId);
    setOdpojujeSe(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      setKodChyby(vysledek.kod ?? null);
      return;
    }
    setSparovanoId(null);
    setRucneSparovano(false);
    setMistniKm(null);
    setPotlacenoOdpojenim(true);
    setZprava("Ruční zápis smazán — kilometry z výpravy zmizely.");
    onOdpojeno?.();
    onSparovano?.();
  }

  function prvniChybaPole(
    vysledek: Extract<RucniAktivitaVysledek, { ok: false }>,
  ): string | null {
    const details = vysledek.details;
    if (details === undefined) return null;
    for (const pole of ["km", "prevyseniM"]) {
      const hlasky = details[pole];
      if (hlasky !== undefined && hlasky.length > 0) return hlasky[0] ?? null;
    }
    return null;
  }

  async function ulozitRucne(): Promise<void> {
    setUkladaSe(true);
    setRucniChyba(null);
    setRucniZprava(null);
    const kmCislo = Number(km.trim().replace(",", "."));
    const prevyseniCislo =
      prevyseni.trim().length === 0
        ? 0
        : Number(prevyseni.trim().replace(",", "."));
    const vysledek = await ulozAktivituRucne(expeditionId, {
      km: kmCislo,
      prevyseniM: Number.isFinite(prevyseniCislo) ? Math.round(prevyseniCislo) : 0,
    });
    setUkladaSe(false);
    if (!vysledek.ok) {
      setRucniChyba(prvniChybaPole(vysledek) ?? vysledek.chyba);
      return;
    }
    setRucniZprava(
      `Zapsáno bez Stravy: ${formatKm(vysledek.data.aktivita.km ?? 0)} · +${String(vysledek.data.aktivita.prevyseniM ?? 0)} m.`,
    );
    setRucneSparovano(true);
    setMistniKm(vysledek.data.aktivita.km);
    setPotlacenoOdpojenim(false);
    onSparovano?.();
  }

  const zdroj: ZdrojPripojeni = rozhodniZdrojPripojeni({
    sparovanoId,
    jeSparovano,
    stravaActivityId: stravaActivityId ?? null,
    rucneSparovano,
    potlacenoOdpojenim,
  });

  /**
   * Step 3 — jediné ruční retry v souboru (tlačítko pro opakování).
   * Volá ho jen klik; žádný timer ani auto-retry v efektu.
   */
  function tlacitkoZkusitZnovu(akce: () => void): JSX.Element {
    return (
      <button
        type="button"
        onClick={akce}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold"
      >
        Zkusit znovu
      </button>
    );
  }

  /**
   * Step 3 — společný obsah chyby pro načtení i potvrzení/odpojení.
   * Každá větev má vlastní text i akci; retry tlačítko jen tam, kde
   * `muzeOpakovatStravaChybu` (výpadek Stravy / sítě) — validace (422),
   * 401/403 ani 409 retry nemají. Odkazy jsou nativní `<a>`
   * (klávesnice zdarma, stejný vzor jako zbytek aplikace).
   */
  function obsahChybyStravy(
    zprava: string,
    kod: ApiErrorCode | null,
    retryAkce: (() => void) | null,
  ): JSX.Element {
    const kodVolba: ApiErrorCode | undefined =
      kod === null ? undefined : kod;
    const druh = druhStravaChyby(kodVolba);
    const opakovatelna: (() => void) | null =
      retryAkce !== null && muzeOpakovatStravaChybu(kodVolba)
        ? retryAkce
        : null;
    if (druh === "validace") {
      return <span>Zkontroluj zadané údaje: {zprava}</span>;
    }
    if (jeStravaNedostupnaVetev(kodVolba)) {
      return (
        <>
          <span>{zprava}</span>{" "}
          <span>
            Mrkni, že máš Stravu propojenou v{" "}
            <a
              href="/profil"
              className="font-bold underline underline-offset-2"
            >
              profilu (Propoj Stravu)
            </a>
            .
          </span>
          {opakovatelna !== null && tlacitkoZkusitZnovu(opakovatelna)}
        </>
      );
    }
    if (druh === "neprihlasen") {
      return (
        <>
          <span>{zprava}</span>{" "}
          <a href="/login" className="font-bold underline underline-offset-2">
            Přihlas se
          </a>
          <span> a zkus to znovu.</span>
        </>
      );
    }
    if (druh === "zakazano") {
      return (
        <span>
          {zprava} Nemáš k téhle akci oprávnění — obrať se na vedoucí výpravy.
        </span>
      );
    }
    if (druh === "konflikt") {
      return <span>{zprava} Opakování nepomůže.</span>;
    }
    return (
      <>
        <span>{zprava}</span>
        {opakovatelna !== null && tlacitkoZkusitZnovu(opakovatelna)}
      </>
    );
  }

  /* Step 3 — retry potvrzení jen pro opakovatelný druh s uloženou aktivitou. */
  const retryPotvrzeni: (() => void) | null =
    posledniNezdar === null
      ? null
      : () => {
          const aktivita: NeparovanaAktivita = posledniNezdar;
          void potvrdit(aktivita);
        };
  const stavKmText: string =
    mistniKm !== null ? ` (${formatKm(mistniKm)})` : "";
  const stavTrasyText: string =
    zdroj === "strava"
      ? `připojeno – Strava aktivita${stavKmText}`
      : zdroj === "rucni"
        ? `připojeno – ruční zápis${stavKmText}`
        : "nepřipojeno";

  return (
    <>
    <section
      aria-label="Párování aktivity ze Stravy"
      className="mt-4 rounded-2xl border-2 border-inkoust bg-papir/60 p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-inkoust/60">
          Strava párování
        </h3>
        {faze === "hotovo" && (
          <button
            type="button"
            onClick={() => void obnovit()}
            className="min-h-[44px] min-w-[44px] rounded-full px-2 text-[13px] font-bold text-smrk underline underline-offset-2 motion-safe:hover:text-inkoust"
          >
            Obnovit
          </button>
        )}
      </div>
      <p className="mt-1 text-[13px] font-semibold text-inkoust/75">
        Jedna aktivita pro celou výpravu – kilometry se započítají všem
        účastníkům.
        {celkem !== null && ` Celkem mých aktivit: ${String(celkem)}.`}
      </p>
      <p role="status" className="mt-2 text-sm font-semibold tabular-nums">
        Stav trasy: {stavTrasyText}
      </p>

      {zdroj === "strava" && (
        <div className="mt-3 rounded-xl border border-inkoust/15 bg-papir p-3">
          <p className="text-sm font-bold">Strava aktivita je připojena.</p>
          <button
            type="button"
            onClick={() => void odpojitStravaAktivitu()}
            disabled={odpojujeSe}
            title="Odpojit Strava aktivitu od výpravy"
            aria-label="Odpojit aktivitu od výpravy"
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
          >
            {odpojujeSe ? "Odpojuji…" : "Odpojit aktivitu"}
          </button>
          <p className="mt-2 text-[13px] text-inkoust/70">
            Odpojuje se jen aktivita od této výpravy. Účet Strava se odpojuje
            v profilu („Odpojit účet“).
          </p>
        </div>
      )}

      {zdroj === "rucni" && (
        <div className="mt-3 rounded-xl border border-inkoust/15 bg-papir p-3">
          <p className="text-sm font-bold">Ruční zápis je uložen.</p>
          <button
            type="button"
            onClick={() => void smazatRucniZapis()}
            disabled={odpojujeSe}
            title="Smazat ručně zapsané kilometry z výpravy"
            aria-label="Smazat ruční zápis z výpravy"
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
          >
            {odpojujeSe ? "Mažu…" : "Smazat ruční zápis"}
          </button>
          <p className="mt-2 text-[13px] text-inkoust/70">
            Smaže se jen ruční zápis u této výpravy. Účet Strava se odpojuje
            v profilu („Odpojit účet“).
          </p>
        </div>
      )}

      {faze === "nacitani" && (
        <p role="status" className="mt-2 text-sm text-inkoust/70">
          Hledám nepárované aktivity…
        </p>
      )}

      {faze === "chyba" && (
        <div className="mt-2 rounded-xl border border-inkoust/20 p-3 text-center">
          <p role="alert" className="text-sm font-semibold">
            {obsahChybyStravy(
              chyba ?? "Návrhy se nepodařilo načíst.",
              kodChyby,
              () => void obnovit(),
            )}
          </p>
        </div>
      )}

      {faze === "hotovo" && navrhy.length === 0 && (
        <p role="status" className="mt-2 text-sm text-inkoust/70">
          Žádná nepárovaná aktivita — vše je už spárované, nebo si nejdřív
          propoj Stravu v profilu.
        </p>
      )}

      {faze === "hotovo" && navrhy.length > 0 && (
        <div className="mt-2 rounded-xl border border-inkoust/15">
          <button
            type="button"
            aria-expanded={rozbaleno}
            aria-controls={seznamId}
            onClick={() => setRozbaleno((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRozbaleno(false);
            }}
            title={
              rozbaleno ? "Skrýt výběr aktivit" : "Zobrazit výběr aktivit"
            }
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-papir px-3 text-sm font-bold motion-safe:transition-colors motion-safe:hover:bg-linka/30"
          >
            <span>Vybrat Strava aktivitu ({navrhy.length})</span>
            <span aria-hidden="true">{rozbaleno ? "▾" : "▸"}</span>
          </button>
          {rozbaleno && (
            <div
              id={seznamId}
              className="max-h-64 overflow-y-auto border-t border-inkoust/10 p-2"
            >
        <ul className="flex flex-col gap-2">
          {navrhy.map((navrh) => {
            const jePripojena = navrh.sparovano === true;
            return (
              <li
                key={navrh.id}
                className="rounded-xl border border-inkoust/15 bg-papir p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{navrh.nazev}</p>
                  <span
                    aria-label={jePripojena ? "připojeno" : "nepřipojeno"}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                      jePripojena
                        ? "bg-mech/15 text-inkoust"
                        : "bg-linka/40 text-inkoust/70"
                    }`}
                  >
                    {jePripojena ? "připojeno" : "nepřipojeno"}
                  </span>
                </div>
                <p className="mt-1 text-sm tabular-nums text-inkoust/75">
                  {formatKm(navrh.km)} · +{String(navrh.prevyseniM)} m ·{" "}
                  {formatDatum(navrh.datum)}
                </p>
                {!jePripojena && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void potvrdit(navrh)}
                      disabled={potvrzujeSe !== null}
                      title="Potvrdit spárování aktivity k výpravě"
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-inkoust disabled:opacity-60"
                    >
                      {potvrzujeSe === navrh.id ? "Páruji…" : "Potvrdit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => zamitnout(navrh.id)}
                      disabled={potvrzujeSe !== null}
                      title="Zamítnout navrženou aktivitu"
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
                    >
                      Zamítnout
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
            </div>
          )}
        </div>
      )}

      {zprava !== null && (
        <p role="status" className="mt-2 text-sm font-semibold text-inkoust">
          {zprava}
        </p>
      )}
      {faze === "hotovo" && chyba !== null && (
        <div
          role="alert"
          className="mt-2 text-sm font-semibold text-red-800"
        >
          {obsahChybyStravy(chyba, kodChyby, retryPotvrzeni)}
        </div>
      )}
    </section>

    <section
      aria-label="Ruční zadání bez Stravy"
      className="mt-4 rounded-2xl border-2 border-dashed border-inkoust/40 bg-papir/60 p-4"
    >
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-inkoust/60">
        Bez Stravy: zapsat kilometry ručně
      </h3>
      <p className="mt-1 text-[13px] text-inkoust/70">
        Stravu nepotřebuješ — její čtení je zdarma bez předplatného, a tenhle
        formulář funguje i úplně bez ní.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Kilometry
          <input
            type="text"
            inputMode="decimal"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="např. 12,5"
            className="min-h-[44px] rounded-xl border-2 border-inkoust/30 bg-papir px-3 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Převýšení (m)
          <input
            type="text"
            inputMode="numeric"
            value={prevyseni}
            onChange={(e) => setPrevyseni(e.target.value)}
            placeholder="např. 350"
            className="min-h-[44px] rounded-xl border-2 border-inkoust/30 bg-papir px-3 font-normal"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void ulozitRucne()}
        disabled={ukladaSe}
        title="Uložit kilometry bez Stravy"
        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-inkoust disabled:opacity-60"
      >
        {ukladaSe ? "Ukládám…" : "Uložit bez Stravy"}
      </button>
      {rucniZprava !== null && (
        <p role="status" className="mt-2 text-sm font-semibold text-inkoust">
          {rucniZprava}
        </p>
      )}
      {rucniChyba !== null && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
          {rucniChyba}
        </p>
      )}
    </section>
    </>
  );
}
