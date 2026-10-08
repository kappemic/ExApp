import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import ExpeditionForm, {
  type ChybyExpedice,
} from "../components/expeditions/ExpeditionForm";
import ExpeditionList from "../components/expeditions/ExpeditionList";
import ExpeditionModal from "../components/expeditions/ExpeditionModal";
import { useAuth } from "../hooks/useAuth";
import { getExpeditions, getExpeditionsSync } from "../lib/expeditions-api";
import { vytvorVypravu } from "../lib/expeditions-ucast";
import type { Expedition } from "../lib/mock-expeditions";
import type {
  ApiExpedice,
  UpravitExpediciRequest,
  VytvoritExpediciRequest,
} from "../shared/api-types";

type Zobrazeni = "seznam" | "kalendar";

const VOLBY: Array<{ id: Zobrazeni; popisek: string }> = [
  { id: "seznam", popisek: "Seznam" },
  { id: "kalendar", popisek: "Kalendář" },
];

const DNY_V_TYDNU = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

// Statická ukázka října 2026 — 1. 10. vychází na čtvrtek (offset 3).
const OFFSET_RIJEN_2026 = 3;
const DNU_V_RIJNU = 31;
const DNY_S_VYPRAVOU = new Set<number>([17, 24]);

function parseZobrazeni(hodnota: string | null): Zobrazeni {
  return hodnota === "kalendar" ? "kalendar" : "seznam";
}

function KalendarPlaceholder(): JSX.Element {
  const bunky: Array<number | null> = [
    ...Array<number | null>(OFFSET_RIJEN_2026).fill(null),
    ...Array.from({ length: DNU_V_RIJNU }, (_, i) => i + 1),
  ];

  return (
    <div
      role="status"
      aria-label="Ukázka kalendáře – říjen 2026"
      className="rounded-lg border-2 border-inkoust bg-white/60 p-4 shadow-denik sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight">Říjen 2026 · ukázka</h2>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mech">
          Kalendářní pohled připravujeme
        </p>
      </div>
      <div
        aria-hidden="true"
        className="mt-4 grid grid-cols-7 gap-1.5 text-center"
      >
        {DNY_V_TYDNU.map((den) => (
          <span
            key={den}
            className="pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-mech"
          >
            {den}
          </span>
        ))}
        {bunky.map((den, index) => (
          <span
            key={index}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-md border text-sm tabular-nums ${
              den === null
                ? "border-transparent"
                : DNY_S_VYPRAVOU.has(den)
                  ? "border-inkoust bg-papir font-bold shadow-denik"
                  : "border-linka bg-papir/60 text-inkoust/70"
            }`}
          >
            {den ?? ""}
            {den !== null && DNY_S_VYPRAVOU.has(den) && (
              <span className="h-1.5 w-1.5 rounded-full bg-smrk" />
            )}
          </span>
        ))}
      </div>
      <p className="mt-4 border-t border-dashed border-linka pt-3 text-center text-sm text-inkoust/70">
        Tečky značí dny s výpravou. Plný kalendář s proklikem na detail
        doplníme v dalším kroku.
      </p>
    </div>
  );
}

function prevedApiExpedici(api: ApiExpedice): Expedition {
  return {
    id: api.id,
    nazev: api.nazev,
    datum: api.datum,
    datumDo: api.datumDo,
    sraz: api.sraz,
    popis: api.popis,
    trasaOdkaz: api.trasaOdkaz,
    kapacita: { prihlaseno: api.kapacita.prihlaseno, celkem: api.kapacita.celkem },
    stav: api.stav,
  };
}

/**
 * Sloučí živý seznam z BFF s lokálním stavem.
 * Živá data jsou pravda pro počty (`kapacita.prihlaseno` = COUNT v DB),
 * ale řádky změněné lokálně po mountu (účast / úprava / nová) jsou čerstvější
 * z mutačních odpovědí — ty se nechávají. Lokálně smazané se neobnovují.
 */
function sloucSeZivymi(
  lokalni: Expedition[],
  zive: ApiExpedice[],
  zmenene: ReadonlySet<string>,
  smazane: ReadonlySet<string>,
): Expedition[] {
  const lokalnePodleId = new Map(lokalni.map((e) => [e.id, e]));
  const vysledek: Expedition[] = [];
  for (const api of zive) {
    if (smazane.has(api.id)) continue;
    const lokalniVerze: Expedition | undefined = lokalnePodleId.get(api.id);
    vysledek.push(
      lokalniVerze !== undefined && zmenene.has(api.id)
        ? lokalniVerze
        : prevedApiExpedici(api),
    );
  }
  for (const mistni of lokalni) {
    if (
      !smazane.has(mistni.id) &&
      !vysledek.some((e) => e.id === mistni.id)
    ) {
      vysledek.push(mistni);
    }
  }
  return vysledek.sort((a, b) => a.datum.localeCompare(b.datum));
}

export default function VypravyPage(): JSX.Element {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const zobrazeni = parseZobrazeni(searchParams.get("zobrazeni"));
  // Start: build-time snapshot pro okamžité vykreslení, po mountu se tiše
  // povýší na živá data z BFF (GET /api/expeditions, PUBLIC) — snapshot
  // jinak ukazuje zastaralé počty přihlášených proti detailu z DB.
  // Lokální stav, aby se účast / úprava / uzavření propsaly bez refetche.
  const [expedice, setExpedice] = useState<Expedition[]>(
    () => getExpeditionsSync().data,
  );
  /* ID změněná/smazaná lokálně po mountu — živý fetch je nesmí přepsat. */
  const zmeneneRef = useRef<Set<string>>(new Set());
  const smazaneRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let zruseno = false;
    void (async (): Promise<void> => {
      const zive = await getExpeditions();
      if (zruseno || zive.source !== "db") return;
      setExpedice((prev) =>
        sloucSeZivymi(prev, zive.data, zmeneneRef.current, smazaneRef.current),
      );
      setVybrana((prev) => {
        if (prev === null || zmeneneRef.current.has(prev.id)) return prev;
        const cerstva: ApiExpedice | undefined = zive.data.find(
          (e) => e.id === prev.id,
        );
        return cerstva === undefined ? prev : prevedApiExpedici(cerstva);
      });
    })();
    return () => {
      zruseno = true;
    };
  }, []);
  const [vybrana, setVybrana] = useState<Expedition | null>(null);
  const [tvorbaOtevrena, setTvorbaOtevrena] = useState<boolean>(false);
  const [vytvariSe, setVytvariSe] = useState<boolean>(false);
  const [chybaTvorby, setChybaTvorby] = useState<string | null>(null);
  const [chybyPoliTvorby, setChybyPoliTvorby] = useState<ChybyExpedice>({});

  const nadchazejici: Expedition[] = useMemo(
    () => expedice.filter((e) => e.stav !== "proběhlá"),
    [expedice],
  );
  const probehle: Expedition[] = useMemo(
    () => expedice.filter((e) => e.stav === "proběhlá"),
    [expedice],
  );

  function zmenZobrazeni(nove: Zobrazeni): void {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("zobrazeni", nove);
      return next;
    });
  }

  function naAktualizaci(nova: Expedition): void {
    zmeneneRef.current.add(nova.id);
    setExpedice((prev) => prev.map((e) => (e.id === nova.id ? nova : e)));
    setVybrana((prev) => (prev !== null && prev.id === nova.id ? nova : prev));
  }

  const naAktualizaciStabilni = useCallback(naAktualizaci, []);
  const naSmazanaStabilni = useCallback((id: string): void => {
    smazaneRef.current.add(id);
    setExpedice((prev) => prev.filter((e) => e.id !== id));
    setVybrana(null);
  }, []);
  const naZavritModalStabilni = useCallback((): void => {
    setVybrana(null);
  }, []);

  function naOdeslatNovou(
    payload: VytvoritExpediciRequest | UpravitExpediciRequest,
  ): void {
    setVytvariSe(true);
    setChybaTvorby(null);
    setChybyPoliTvorby({});
    void (async (): Promise<void> => {
      const vysledek = await vytvorVypravu(payload as VytvoritExpediciRequest);
      setVytvariSe(false);
      if (!vysledek.ok) {
        if (vysledek.chybyPoli !== undefined) setChybyPoliTvorby(vysledek.chybyPoli);
        else setChybaTvorby(vysledek.chyba);
        return;
      }
      const nova = prevedApiExpedici(vysledek.data.expedice);
      zmeneneRef.current.add(nova.id);
      setExpedice((prev) =>
        [...prev, nova].sort((a, b) => a.datum.localeCompare(b.datum)),
      );
      setTvorbaOtevrena(false);
      setVybrana(nova);
    })();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">ExApp · podzim 2026</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Výpravy
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Přehled {expedice.length} plánovaných i proběhlých akcí.
          Kliknutím na Detail otevřeš přihlašování a správu.
        </p>

        <div
          role="group"
          aria-label="Zobrazení výprav"
          className="mt-4 inline-flex rounded-md border-2 border-inkoust bg-white/60 p-1 shadow-denik"
        >
          {VOLBY.map((volba) => {
            const aktivni = zobrazeni === volba.id;
            return (
              <button
                key={volba.id}
                type="button"
                aria-pressed={aktivni}
                onClick={() => zmenZobrazeni(volba.id)}
                className={`min-h-[44px] min-w-[44px] rounded px-4 py-2 text-sm font-bold transition-colors ${
                  aktivni
                    ? "bg-inkoust text-papir"
                    : "text-inkoust hover:bg-linka/60"
                }`}
              >
                {volba.popisek}
              </button>
            );
          })}
        </div>
        {isAdmin && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setChybaTvorby(null);
                setChybyPoliTvorby({});
                setTvorbaOtevrena(true);
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir shadow-denik motion-safe:transition-colors motion-safe:hover:bg-inkoust"
            >
              <span aria-hidden="true">＋</span> Nová výprava
            </button>
          </div>
        )}
      </header>

      <div className="pt-6">
        {zobrazeni === "seznam" ? (
          <div className="space-y-10">
            <section aria-labelledby="nadchazejici-nadpis">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="nadchazejici-nadpis"
                  className="text-xl font-bold tracking-tight"
                >
                  Nadcházející
                </h2>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-mech tabular-nums">
                  {nadchazejici.length}{" "}
                  {nadchazejici.length === 1
                    ? "výprava"
                    : nadchazejici.length >= 2 && nadchazejici.length <= 4
                      ? "výpravy"
                      : "výprav"}
                </p>
              </div>
              <div className="pt-4">
                <ExpeditionList expedice={nadchazejici} onDetail={setVybrana} />
              </div>
            </section>

            <section aria-labelledby="historie-nadpis">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-inkoust pt-8">
                <h2
                  id="historie-nadpis"
                  className="text-xl font-bold tracking-tight"
                >
                  Proběhlé · historie
                </h2>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-mech tabular-nums">
                  {probehle.length}{" "}
                  {probehle.length === 1
                    ? "záznam"
                    : probehle.length >= 2 && probehle.length <= 4
                      ? "záznamy"
                      : "záznamů"}
                </p>
              </div>
              <p className="mt-2 text-sm text-inkoust/70">
                Archiv výprav — přihlašování je uzavřené, detail ukazuje
                docházku a fotky.
              </p>
              <div className="pt-4">
                <ExpeditionList expedice={probehle} onDetail={setVybrana} />
              </div>
            </section>
          </div>
        ) : (
          <KalendarPlaceholder />
        )}
      </div>

      {vybrana !== null && (
        <ExpeditionModal
          key={vybrana.id}
          expedice={vybrana}
          onZavrit={naZavritModalStabilni}
          onAktualizace={naAktualizaciStabilni}
          onSmazana={naSmazanaStabilni}
        />
      )}

      {tvorbaOtevrena && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 p-4 sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTvorbaOtevrena(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nová výprava"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border-2 border-inkoust bg-papir p-5 shadow-denik sm:p-6"
          >
            <ExpeditionForm
              nadpis="Nová výprava"
              odeslatPopisek="Vytvořit výpravu"
              vychozi={null}
              odesilaSe={vytvariSe}
              serverChyba={chybaTvorby}
              serverChybyPoli={chybyPoliTvorby}
              onSubmit={naOdeslatNovou}
              onZrusit={() => setTvorbaOtevrena(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
