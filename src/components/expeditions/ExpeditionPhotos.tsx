import { useCallback, useEffect, useId, useState, type JSX } from "react";
import {
  nactiFotky,
  pridejFotku,
  smazFotku,
  type ApiFotka,
} from "../../lib/expedition-fotky";

export interface ExpeditionPhotosProps {
  expeditionId: string;
  /** Fotky existují jen u proběhlé — jinde komponenta nic nekreslí. */
  probehla: boolean;
  /** ADMIN zapisuje (URL + mazání), user jen čte. */
  isAdmin: boolean;
}

type FotkyStav = "nacitani" | "hotovo" | "chyba";

/**
 * Deníková kronika fotek k proběhlé výpravě (Krok 6, minimum Fáze 2).
 * URL režim (src/config/storage.ts): admin vloží https:// odkaz + popis,
 * server uloží jen URL do `photos`. Binární upload (Neon Object Storage)
 * později použije stejné endpointy — tohle UI se nemění.
 * Neproběhlá výprava → nic (fotky patří až do archivu po uzavření).
 */
export default function ExpeditionPhotos({
  expeditionId,
  probehla,
  isAdmin,
}: ExpeditionPhotosProps): JSX.Element | null {
  const nadpisId: string = useId();
  const urlPoleId: string = useId();
  const popisPoleId: string = useId();

  const [stav, setStav] = useState<FotkyStav>("nacitani");
  const [fotky, setFotky] = useState<ApiFotka[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);

  const [url, setUrl] = useState<string>("");
  const [popis, setPopis] = useState<string>("");
  const [chybaUrl, setChybaUrl] = useState<string | null>(null);
  const [chybaPopisu, setChybaPopisu] = useState<string | null>(null);
  const [odesilaSe, setOdesilaSe] = useState<boolean>(false);
  const [formChyba, setFormChyba] = useState<string | null>(null);

  const [mazaneId, setMazaneId] = useState<string | null>(null);
  const [mazatChyba, setMazatChyba] = useState<string | null>(null);
  const [potvrditSmazani, setPotvrditSmazani] = useState<string | null>(null);
  /** Rozbité URL (onError) — místo tichého schování viditelný náhradní stav. */
  const [rozbite, setRozbite] = useState<Record<string, boolean>>({});

  const nacist = useCallback(async (): Promise<void> => {
    setStav("nacitani");
    setChyba(null);
    const vysledek = await nactiFotky(expeditionId);
    if (!vysledek.ok) {
      setStav("chyba");
      setChyba(vysledek.chyba);
      return;
    }
    setFotky(vysledek.data.fotky);
    setRozbite({});
    setStav("hotovo");
  }, [expeditionId]);

  useEffect(() => {
    if (!probehla) return;
    void nacist();
  }, [probehla, nacist]);

  if (!probehla) return null;

  async function naPridat(): Promise<void> {
    setChybaUrl(null);
    setChybaPopisu(null);
    setFormChyba(null);
    const cisteUrl: string = url.trim();
    if (cisteUrl.length === 0) {
      setChybaUrl("Vlož odkaz na fotku (https://).");
      return;
    }
    setOdesilaSe(true);
    const vysledek = await pridejFotku(expeditionId, cisteUrl, popis.trim());
    setOdesilaSe(false);
    if (!vysledek.ok) {
      if (vysledek.chybyPoli !== undefined) {
        const hlaskaUrl: string | undefined = vysledek.chybyPoli["url"];
        const hlaskaPopis: string | undefined = vysledek.chybyPoli["popis"];
        if (hlaskaUrl !== undefined) setChybaUrl(hlaskaUrl);
        if (hlaskaPopis !== undefined) setChybaPopisu(hlaskaPopis);
        if (hlaskaUrl === undefined && hlaskaPopis === undefined) {
          setFormChyba(vysledek.chyba);
        }
      } else {
        setFormChyba(vysledek.chyba);
      }
      return;
    }
    setFotky((prev) => [...prev, vysledek.data.fotka]);
    setUrl("");
    setPopis("");
  }

  async function naSmazat(fotkaId: string): Promise<void> {
    setMazatChyba(null);
    setMazaneId(fotkaId);
    const vysledek = await smazFotku(expeditionId, fotkaId);
    setMazaneId(null);
    if (!vysledek.ok) {
      setMazatChyba(vysledek.chyba);
      return;
    }
    setPotvrditSmazani(null);
    setFotky((prev) => prev.filter((f) => f.id !== fotkaId));
  }

  return (
    <section aria-labelledby={nadpisId} className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id={nadpisId}
          className="text-sm font-bold uppercase tracking-[0.14em] text-inkoust/60"
        >
          Fotky z výpravy ({stav === "hotovo" ? fotky.length : "…"})
        </h3>
        {stav === "hotovo" && (
          <button
            type="button"
            onClick={() => void nacist()}
            className="min-h-[44px] min-w-[44px] rounded-full px-2 text-[13px] font-bold text-smrk underline underline-offset-2 motion-safe:hover:text-inkoust"
          >
            Obnovit
          </button>
        )}
      </div>

      {stav === "nacitani" && (
        <div
          className="mt-2 grid grid-cols-2 gap-2"
          aria-busy="true"
          aria-label="Načítám fotky"
        >
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-inkoust/10 motion-reduce:animate-none"
            />
          ))}
        </div>
      )}

      {stav === "chyba" && (
        <div className="mt-2 rounded-2xl border-2 border-inkoust/20 bg-papir p-4 text-center">
          <p role="alert" className="text-sm font-semibold">
            {chyba ?? "Fotky se nepodařilo načíst."}
          </p>
          <button
            type="button"
            onClick={() => void nacist()}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-5 text-sm font-bold text-papir"
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {stav === "hotovo" && (
        <>
          {fotky.length === 0 ? (
            <p
              role="status"
              className="mt-2 rounded-2xl border border-dashed border-inkoust/25 bg-papir/60 p-4 text-center text-sm text-inkoust/70"
            >
              {isAdmin
                ? "Zatím tu není žádná fotka — vlož první odkaz do kroniky níže."
                : "Zatím tu není žádná fotka — vedoucí ji sem připíše po výpravě."}
            </p>
          ) : (
            <ul role="list" className="mt-2 grid grid-cols-2 gap-2">
              {fotky.map((fotka) => {
                const mazeSe: boolean = mazaneId === fotka.id;
                const potvrzeno: boolean = potvrditSmazani === fotka.id;
                const jeRozbita: boolean = rozbite[fotka.id] === true;
                return (
                  <li
                    key={fotka.id}
                    className="overflow-hidden rounded-2xl border border-inkoust/15 bg-papir/70"
                  >
                    {jeRozbita ? (
                      <div className="flex h-28 w-full flex-col items-center justify-center px-2 text-center">
                        <p
                          role="status"
                          className="text-[12px] font-semibold text-inkoust/70"
                        >
                          Fotku se nepodařilo načíst.
                        </p>
                        <a
                          href={fotka.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[44px] items-center justify-center px-3 text-[12px] font-bold text-smrk underline underline-offset-2"
                        >
                          Otevřít odkaz
                        </a>
                      </div>
                    ) : (
                      <img
                        src={fotka.url}
                        alt={
                          fotka.popis.trim().length > 0
                            ? fotka.popis
                            : "Fotka z výpravy"
                        }
                        loading="lazy"
                        className="h-28 w-full object-cover"
                        onError={() => {
                          setRozbite((prev) => ({ ...prev, [fotka.id]: true }));
                        }}
                      />
                    )}
                    {fotka.popis.trim().length > 0 && (
                      <p className="truncate px-2 pt-1 text-[12px] text-inkoust/70">
                        {fotka.popis}
                      </p>
                    )}
                    {isAdmin && (
                      <div className="px-2 pb-2 pt-1">
                        {!potvrzeno ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMazatChyba(null);
                              setPotvrditSmazani(fotka.id);
                            }}
                            aria-label={`Smazat fotku ${fotka.popis.trim().length > 0 ? `„${fotka.popis}"` : ""}`.trim()}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-800/50 px-3 text-[12px] font-bold text-red-800 motion-safe:transition-colors motion-safe:hover:bg-red-800 motion-safe:hover:text-papir"
                          >
                            Smazat
                          </button>
                        ) : (
                          <span className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void naSmazat(fotka.id)}
                              disabled={mazeSe}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-red-800 bg-red-800 px-3 text-[12px] font-bold text-papir disabled:opacity-60"
                            >
                              {mazeSe ? "Mažu…" : "Ano, smazat"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPotvrditSmazani(null)}
                              disabled={mazeSe}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-inkoust px-3 text-[12px] font-bold disabled:opacity-60"
                            >
                              Nechat
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {mazatChyba !== null && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
              {mazatChyba}
            </p>
          )}

          {isAdmin && (
            <form
              className="mt-3 rounded-2xl border border-inkoust/15 bg-papir/60 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void naPridat();
              }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-inkoust/55">
                Přidat fotku (odkaz)
              </p>
              <label
                htmlFor={urlPoleId}
                className="mt-2 block text-[13px] font-semibold"
              >
                Odkaz na fotku
              </label>
              <input
                id={urlPoleId}
                type="url"
                inputMode="url"
                autoComplete="off"
                enterKeyHint="go"
                maxLength={2048}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                aria-invalid={chybaUrl !== null}
                aria-describedby={chybaUrl !== null ? `${urlPoleId}-chyba` : undefined}
                className="mt-1 min-h-[44px] w-full rounded-xl border-2 border-inkoust/25 bg-papir px-3 text-base"
              />
              {chybaUrl !== null && (
                <p
                  id={`${urlPoleId}-chyba`}
                  role="alert"
                  className="mt-1 text-[13px] font-semibold text-red-800"
                >
                  {chybaUrl}
                </p>
              )}
              <label
                htmlFor={popisPoleId}
                className="mt-3 block text-[13px] font-semibold"
              >
                Popis <span className="font-normal text-inkoust/60">(nepovinný)</span>
              </label>
              <input
                id={popisPoleId}
                type="text"
                maxLength={500}
                enterKeyHint="done"
                placeholder="Tábořiště při západu slunce…"
                value={popis}
                onChange={(e) => setPopis(e.currentTarget.value)}
                aria-invalid={chybaPopisu !== null}
                aria-describedby={chybaPopisu !== null ? `${popisPoleId}-chyba` : undefined}
                className="mt-1 min-h-[44px] w-full rounded-xl border-2 border-inkoust/25 bg-papir px-3 text-base"
              />
              {chybaPopisu !== null && (
                <p
                  id={`${popisPoleId}-chyba`}
                  role="alert"
                  className="mt-1 text-[13px] font-semibold text-red-800"
                >
                  {chybaPopisu}
                </p>
              )}
              {formChyba !== null && (
                <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                  {formChyba}
                </p>
              )}
              <button
                type="submit"
                disabled={odesilaSe}
                className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-5 text-sm font-bold text-papir motion-safe:transition-colors motion-safe:hover:bg-inkoust disabled:opacity-60"
              >
                {odesilaSe ? "Přidávám…" : "Přidat fotku"}
              </button>
              <p className="mt-2 text-center text-[12px] text-inkoust/60">
                Ukládá se jen odkaz — binární upload (Neon Storage) přijde později.
              </p>
            </form>
          )}
        </>
      )}
    </section>
  );
}
