import { useCallback, useEffect, useId, useMemo, useState, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import AvatarKruh from "../components/AvatarKruh";
import Ikona from "../components/Ikona";
import PrihlaseniVypravaSheet from "../components/vypravy/PrihlaseniVypravaSheet";
import StrankaKostra from "../components/StrankaKostra";
import { useAuth } from "../hooks/useAuth";
import { useZpet } from "../hooks/useZpet";
import {
  jeBezOmezeni,
  volnaMista,
} from "../lib/expedition-utils";
import { nactiUcastniky, prihlasNaVypravu, type ApiUcastnik } from "../lib/expeditions-ucast";
import { getExpeditionsSync } from "../lib/expeditions-api";
import type { Expedition } from "../lib/mock-expeditions";

function normalizuj(hodnota: string): string {
  return hodnota
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function KdoJedePage(): JSX.Element {
  const { id } = useParams();
  const hledaniId = useId();
  const { user } = useAuth();
  const idVypravy = id ?? "";
  const zpet = useZpet(`/vypravy/${idVypravy}`);
  const [expedice, setExpedice] = useState<Expedition | null>(null);
  const [ucastnici, setUcastnici] = useState<ApiUcastnik[]>([]);
  const [stav, setStav] = useState<"nacitani" | "hotovo" | "chyba">("nacitani");
  const [chyba, setChyba] = useState<string | null>(null);
  const [dotaz, setDotaz] = useState("");
  const [sheet, setSheet] = useState(false);
  const [akceBezi, setAkceBezi] = useState(false);
  const [akceChyba, setAkceChyba] = useState<string | null>(null);
  const [filtrRole, setFiltrRole] = useState<"vsichni" | "organizuje" | "volna">("vsichni");

  useEffect(() => {
    if (idVypravy.length === 0) return;
    const mistni = getExpeditionsSync().data.find((e) => e.id === idVypravy);
    if (mistni !== undefined) setExpedice(mistni);
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiUcastniky(idVypravy);
      if (!zive) return;
      if (!vysledek.ok) {
        setStav("chyba");
        setChyba(vysledek.chyba);
        return;
      }
      setUcastnici(vysledek.data.ucastnici);
      setExpedice((pred) => ({
        ...(pred ?? {
          id: vysledek.data.expedice.id,
          nazev: vysledek.data.expedice.nazev,
          datum: vysledek.data.expedice.datum,
          datumDo: vysledek.data.expedice.datumDo,
          sraz: vysledek.data.expedice.sraz,
          popis: vysledek.data.expedice.popis ?? "",
          trasaOdkaz: vysledek.data.expedice.trasaOdkaz ?? "",
          organizatorId: vysledek.data.expedice.organizatorId ?? null,
          kapacita: vysledek.data.expedice.kapacita,
          stav: vysledek.data.expedice.stav,
        }),
        kapacita: vysledek.data.expedice.kapacita,
        nazev: vysledek.data.expedice.nazev,
      }));
      setStav("hotovo");
    })();
    return () => {
      zive = false;
    };
  }, [idVypravy]);

  const filtr = normalizuj(dotaz);
  const zobrazeni = useMemo(
    () =>
      filtr.length === 0
        ? ucastnici
        : ucastnici.filter((u) => normalizuj(u.jmeno).includes(filtr)),
    [ucastnici, filtr],
  );

  const kapacita = expedice?.kapacita;
  const bezOmezeni = expedice !== null && jeBezOmezeni(expedice);
  const volna =
    expedice !== null && kapacita !== undefined ? volnaMista(expedice) : 0;
  const prihlaseno = kapacita?.prihlaseno ?? ucastnici.length;
  const celkem = kapacita?.celkem ?? 0;

  const jsemPrihlasen =
    user !== null && ucastnici.some((u) => u.userId === user.id);

  const potvrdPrihlaseni = useCallback((): void => {
    if (expedice === null) return;
    setAkceBezi(true);
    setAkceChyba(null);
    void (async (): Promise<void> => {
      const vysledek = await prihlasNaVypravu(expedice.id);
      setAkceBezi(false);
      if (!vysledek.ok) {
        setAkceChyba(vysledek.chyba);
        return;
      }
      setSheet(false);
      const cerstve = await nactiUcastniky(expedice.id);
      if (cerstve.ok) {
        setUcastnici(cerstve.data.ucastnici);
        setExpedice((e) =>
          e !== null
            ? { ...e, kapacita: cerstve.data.expedice.kapacita }
            : e,
        );
      }
    })();
  }, [expedice]);

  if (idVypravy.length === 0) {
    return <NavigateToList />;
  }

  if (stav === "nacitani" && expedice === null) {
    return <StrankaKostra vnitrni />;
  }

  const detailPath = `/vypravy/${idVypravy}`;
  const jeOrganizator = (clovek: ApiUcastnik): boolean =>
    clovek.userId !== null &&
    expedice?.organizatorId !== null &&
    expedice?.organizatorId !== undefined &&
    clovek.userId === expedice.organizatorId;
  const radky = filtrRole === "organizuje" ? zobrazeni.filter(jeOrganizator) : zobrazeni;
  const ukazVolna = !bezOmezeni && volna > 0 && filtrRole !== "organizuje";
  const souhrn = bezOmezeni
    ? `${prihlaseno} přihlášených`
    : `${prihlaseno} z ${celkem} · ${volna > 0 ? `zbývají ${volna} ${volna === 1 ? "místo" : volna <= 4 ? "místa" : "míst"}` : "plno"}`;
  const souhrnPocitac = bezOmezeni
    ? `${prihlaseno} přihlášených`
    : `${prihlaseno} z ${celkem} · ${Math.max(0, volna)} ${volna === 1 ? "volné" : volna >= 2 && volna <= 4 ? "volná" : "volných"}`;
  const muzePrihlasit = user !== null && expedice !== null && !jsemPrihlasen && (bezOmezeni || volna > 0);

  const pole = (vyska: string): JSX.Element => (
    <div className="relative min-w-0">
      <label htmlFor={hledaniId} className="sr-only">
        Hledat v přihlášených
      </label>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">
        <Ikona nazev="search" className="size-4 min-[90rem]:size-[17px]" />
      </span>
      <input
        id={hledaniId}
        type="search"
        value={dotaz}
        onChange={(e) => setDotaz(e.target.value)}
        placeholder="Hledat v přihlášených"
        autoComplete="off"
        className={`block w-full rounded-xl border border-linka bg-povrch pl-10 pr-3.5 text-base text-inkoust placeholder:text-ink-4 focus:border-pole min-[90rem]:text-sm min-[90rem]:placeholder:text-ink-3 ${vyska}`}
      />
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-lg px-5 pb-6 pt-4 sm:max-w-[46rem] sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet
        zpet={detailPath}
        zpetPopisek="Zpět"
        onZpet={zpet}
        titulek="Kdo jede"
        className="mb-4 min-[90rem]:hidden"
      />
      <ZpetPocitac zpet={detailPath} popisek="Zpět" />

      <div className="flex flex-col min-[90rem]:flex-row min-[90rem]:items-end min-[90rem]:justify-between">
        <div className="flex min-w-0 flex-col gap-4 min-[90rem]:gap-2.5">
          <p className="font-display text-[22px] font-bold leading-[25px] tracking-[-0.4px] text-inkoust min-[90rem]:tracking-normal min-[90rem]:order-first min-[90rem]:font-sans min-[90rem]:text-[13.5px] min-[90rem]:font-medium min-[90rem]:text-mech">
            {expedice?.nazev ?? ""}
          </p>
          <h1 className="sr-only font-display font-bold tracking-[-1.4px] text-inkoust min-[90rem]:not-sr-only min-[90rem]:text-[46px] min-[90rem]:leading-[45px]">
            Kdo jede
          </h1>
          {expedice !== null ? <p className="text-[13.5px] text-mech min-[90rem]:hidden">{souhrn}</p> : null}
        </div>
        <div className="hidden items-center gap-2.5 min-[90rem]:flex">
          <div className="w-60">{pole("h-[46px]")}</div>
          {muzePrihlasit ? (
            <button
              type="button"
              onClick={() => setSheet(true)}
              className="nahled-press inline-flex h-[46px] items-center gap-2 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-papir hover:opacity-90"
            >
              <Ikona nazev="user-plus" className="size-4" />
              Přihlásit se
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 min-[90rem]:hidden">{pole("h-11")}</div>

      <div className="mt-7 hidden items-center justify-between border-b border-linka pb-4 min-[90rem]:flex">
        <div role="group" aria-label="Filtr přihlášených" className="flex items-center gap-2">
          {(
            [
              ["vsichni", "Všichni"],
              ["organizuje", "Organizuje"],
              ["volna", "Volná místa"],
            ] as const
          ).map(([klic, popisek]) => (
            <button
              key={klic}
              type="button"
              aria-pressed={filtrRole === klic}
              onClick={() => setFiltrRole(klic)}
              className={`nahled-press inline-flex items-center rounded-full border px-3.5 py-2 text-[13px] ${
                filtrRole === klic
                  ? "border-transparent bg-inkoust font-semibold text-povrch"
                  : "border-linka font-medium text-mech hover:bg-povrch-2"
              }`}
            >
              {popisek}
            </button>
          ))}
        </div>
        {expedice !== null ? <p className="text-[13px] font-medium text-ink-3">{souhrnPocitac}</p> : null}
      </div>

      {stav === "chyba" ? (
        <p role="alert" className="mt-4 text-sm text-red-800">
          {chyba}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-linka bg-povrch shadow-karta min-[90rem]:mt-8">
          <div
            aria-hidden="true"
            className="hidden h-11 items-center gap-4 border-b border-linka bg-zahlavi px-5 text-[10.5px] font-bold uppercase tracking-[1.1px] text-ink-3 min-[90rem]:flex"
          >
            <span className="flex-1">Člen</span>
            <span className="w-[140px]">Stav</span>
            <span className="w-40">Přihlášen</span>
            <span className="w-7" />
          </div>
          <ul className="m-0 list-none divide-y divide-linka p-0">
            {filtrRole !== "volna"
              ? radky.map((clovek) => {
                  const org = jeOrganizator(clovek);
                  const datum = clovek.createdAt.slice(0, 10);
                  return (
                    <li key={clovek.id} className="flex items-center gap-3 px-3.5 py-3 min-[90rem]:h-16 min-[90rem]:gap-4 min-[90rem]:px-5 min-[90rem]:py-0">
                      <span className="flex min-w-0 flex-1 items-center gap-3 min-[90rem]:gap-[11px]">
                        <span className="min-[90rem]:hidden">
                          <AvatarKruh jmeno={clovek.jmeno} url={clovek.avatarUrl} ton="barevny" velikost={40} />
                        </span>
                        <span className="hidden min-[90rem]:inline-flex">
                          <AvatarKruh jmeno={clovek.jmeno} url={clovek.avatarUrl} ton="barevny" velikost={34} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[14.5px] font-semibold text-inkoust min-[90rem]:text-sm">
                            {clovek.jmeno}
                          </span>
                          <span className="text-xs text-ink-3 min-[90rem]:hidden">
                            přihlášen {Number(datum.slice(8, 10))}. {Number(datum.slice(5, 7))}.
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 min-[90rem]:w-[140px]">
                        {org ? (
                          <span className="rounded-full bg-mlha px-2 py-1 text-[11px] font-semibold text-smrk min-[90rem]:py-[3px] min-[90rem]:text-[10.5px]">
                            Organizuje
                          </span>
                        ) : (
                          <span className="hidden rounded-full bg-povrch-2 px-2 py-[3px] text-[10.5px] font-semibold text-mech min-[90rem]:inline-flex">
                            Jede
                          </span>
                        )}
                      </span>
                      <span className="hidden w-40 text-[13px] text-mech min-[90rem]:block">
                        {datum.split("-").reverse().map((c) => String(Number(c))).join(". ")}
                      </span>
                      <span className="hidden w-7 justify-end min-[90rem]:flex">
                        <Ikona nazev="chevron-right" className="size-4 text-ink-3" />
                      </span>
                    </li>
                  );
                })
              : null}
            {ukazVolna
              ? Array.from({ length: filtrRole === "volna" ? Math.min(volna, 20) : Math.min(volna, 3) }, (_, i) => (
                  <li key={`volne-${i}`} className="flex items-center gap-3 px-3.5 py-3 text-ink-3 min-[90rem]:h-16 min-[90rem]:gap-4 min-[90rem]:px-5 min-[90rem]:py-0">
                    <span className="flex min-w-0 flex-1 items-center gap-3 min-[90rem]:gap-[11px]">
                      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-povrch-2 min-[90rem]:size-[34px]">
                        <Ikona nazev="plus" className="size-4 min-[90rem]:size-3.5" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[14.5px] font-semibold text-mech min-[90rem]:text-sm">Volné místo</span>
                        {muzePrihlasit ? <span className="text-xs min-[90rem]:hidden">ještě se můžeš přihlásit</span> : null}
                      </span>
                    </span>
                    <span className="hidden w-[140px] text-[13px] min-[90rem]:block">volné</span>
                    <span className="hidden w-40 text-[13px] min-[90rem]:block">—</span>
                    <span className="hidden w-7 min-[90rem]:block" />
                  </li>
                ))
              : null}
          </ul>
        </div>
      )}

      {muzePrihlasit ? (
        <div className="mt-4 min-[90rem]:hidden">
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="nahled-press inline-flex h-12 w-full items-center justify-center rounded-xl bg-smrk text-sm font-semibold text-povrch"
          >
            Přihlásit se
          </button>
        </div>
      ) : null}

      {expedice !== null ? (
        <PrihlaseniVypravaSheet
          otevreno={sheet}
          expedice={expedice}
          odesilaSe={akceBezi}
          chyba={akceChyba}
          onZavrit={() => {
            setSheet(false);
            setAkceChyba(null);
          }}
          onPotvrdit={potvrdPrihlaseni}
        />
      ) : null}
    </main>
  );
}

function NavigateToList(): JSX.Element {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/vypravy", { replace: true });
  }, [navigate]);
  return <StrankaKostra vnitrni />;
}