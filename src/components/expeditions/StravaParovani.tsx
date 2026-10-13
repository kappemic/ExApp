import { useEffect, useId, useState, type JSX } from "react";
import {
  ulozAktivituRucne,
  type RucniAktivitaVysledek,
} from "../../lib/expedice-aktivita";
import {
  nactiNeparovaneAktivity,
  odpojAktivitu,
  sparujAktivitu,
  type NeparovanaAktivita,
} from "../../lib/strava-api";
import { getMojeStatistiky } from "../../lib/statistiky-api";

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
 * Karta párování k uzavřené výpravě (OAuth parovani)
 * + ruční zápis bez Stravy (`POST :id/aktivita-ruchne { km, prevyseni_m }`).
 * Krok 13: načte `GET /api/strava/neparovane` (VŠECHNY moje aktivity
 * s `sparovano` + `celkem`), ukáže seznam s odznakem připojeno/nepřipojeno.
 * Confirm → `POST :id/strava-parovani { activityId }` (dual-guard).
 * Odpojení → `DELETE :id/strava-parovani` s confirmem (dual-guard,
 * jen proběhlá, vymaže 4 sloupce → statistiky klesnou).
 * Krok 15: výběr je kompaktní expanding box (collapsed 1 řádek
 * `Vybrat Strava aktivitu (N)` s `aria-expanded`; expand = seznam
 * v `max-h-64 overflow-y-auto`; po potvrzení se sbalí zpět).
 * Ruční km i Odpojit zůstávají vždy viditelné MIMO box.
 * Bez secretů v klientovi — jen veřejný návrh ze serveru.
 * Expedition-level sdílení: jedna aktivita na expedici se započítá všem
 * `ucastnil_se` (statistiky čtou JOIN) — proto stačí jedno párování
 * nebo jeden ruční zápis pro celou výpravu.
 */
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
  /* Krok 16 fallback: expedice má km/strava_activity_id v DB, ale props
     jeSparovano/stravaActivityId jsou false (ExpeditionModal je nepředává).
     Dočteme stav z GET /api/statistiky/moje a Odpojit ukážeme i tehdy. */
  const [dbMaZaznam, setDbMaZaznam] = useState<boolean>(false);
  const [dbKm, setDbKm] = useState<number | null>(null);
  const seznamId: string = useId();

  useEffect(() => {
    setSparovanoId(stravaActivityId);
  }, [stravaActivityId]);

  useEffect(() => {
    let zije = true;
    void (async (): Promise<void> => {
      setFaze("nacitani");
      setChyba(null);
      const vysledek = await nactiNeparovaneAktivity({ page: 1, per_page: 30 });
      if (!zije) return;
      if (!vysledek.ok) {
        setFaze("chyba");
        setChyba(vysledek.chyba);
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

  /* Krok 16 fallback: když props říkají „nepřipojeno", ověř DB.
     Kryje i ruční zápis (km bez stravaActivityId). */
  useEffect(() => {
    if (stravaActivityId !== null || jeSparovano) return;
    let zije = true;
    void (async (): Promise<void> => {
      const statistiky = await getMojeStatistiky();
      if (!zije) return;
      if (statistiky.source !== "db") return;
      const zaznam =
        statistiky.data.aktivity.find((a) => a.expeditionId === expeditionId) ??
        null;
      if (zaznam === null) return;
      const maKm: boolean = zaznam.km !== null;
      const maStravaId: boolean = zaznam.stravaActivityId !== null;
      if (!maKm && !maStravaId) return;
      setDbMaZaznam(true);
      setDbKm(zaznam.km);
      if (zaznam.stravaActivityId !== null)
        setSparovanoId(zaznam.stravaActivityId);
    })();
    return () => {
      zije = false;
    };
  }, [expeditionId, jeSparovano, stravaActivityId]);

  async function potvrdit(aktivita: NeparovanaAktivita): Promise<void> {
    setPotvrzujeSe(aktivita.id);
    setChyba(null);
    setZprava(null);
    const vysledek = await sparujAktivitu(expeditionId, aktivita.id);
    setPotvrzujeSe(null);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    setZprava(
      `Spárováno: ${formatKm(aktivita.km)} · +${String(aktivita.prevyseniM)} m.`,
    );
    setSparovanoId(aktivita.id);
    setDbMaZaznam(true);
    setDbKm(aktivita.km);
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
    const vysledek = await nactiNeparovaneAktivity({ page: 1, per_page: 30 });
    if (!vysledek.ok) {
      setFaze("chyba");
      setChyba(vysledek.chyba);
      return;
    }
    setNavrhy(vysledek.data.aktivity);
    setCelkem(vysledek.data.celkem ?? vysledek.data.aktivity.length);
    setFaze("hotovo");
  }

  async function odpojit(): Promise<void> {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Opravdu odpojit aktivitu od výpravy? Kilometry zmizí.")
    ) {
      return;
    }
    setOdpojujeSe(true);
    setChyba(null);
    setZprava(null);
    const vysledek = await odpojAktivitu(expeditionId);
    setOdpojujeSe(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    setSparovanoId(null);
    setDbMaZaznam(false);
    setDbKm(null);
    setZprava("Aktivita odpojena — kilometry z výpravy zmizely.");
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
    setDbMaZaznam(true);
    setDbKm(vysledek.data.aktivita.km);
    onSparovano?.();
  }

  const pripojeno = sparovanoId !== null || jeSparovano || dbMaZaznam;
  const stavKmText: string =
    dbKm !== null ? ` (${formatKm(dbKm)})` : "";

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
        Stav trasy: {pripojeno ? `připojeno${stavKmText}` : "nepřipojeno"}
      </p>

      {pripojeno && (
        <div className="mt-3 rounded-xl border border-inkoust/15 bg-papir p-3">
          <p className="text-sm font-bold">Aktivita je připojena.</p>
          <button
            type="button"
            onClick={() => void odpojit()}
            disabled={odpojujeSe}
            title="Odpojit aktivitu od výpravy"
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold disabled:opacity-60"
          >
            {odpojujeSe ? "Odpojuji…" : "Odpojit aktivitu"}
          </button>
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
            {chyba ?? "Návrhy se nepodařilo načíst."}
          </p>
          <button
            type="button"
            onClick={() => void obnovit()}
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-papir px-5 text-sm font-bold"
          >
            Zkusit znovu
          </button>
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
        <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
          {chyba}
        </p>
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
