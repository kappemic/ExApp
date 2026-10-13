import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getZebricek } from "../lib/zebricky-api";
import type { ZebrickyRadek } from "../shared/api-types";

type ObdobiVolba = string;

function aktualniRok(): number {
  return new Date().getFullYear();
}

function volbyObdobi(): Array<{ hodnota: string; popisek: string }> {
  const rok = aktualniRok();
  return [
    { hodnota: "celkem", popisek: "Celkem" },
    { hodnota: String(rok), popisek: `Rok ${rok}` },
    { hodnota: String(rok - 1), popisek: `Rok ${rok - 1}` },
  ];
}

function formatKm(km: number): string {
  return `${String(Math.round(km * 10) / 10).replace(".", ",")} km`;
}

export default function ZebrickyPage(): JSX.Element {
  const { user, isLoading } = useAuth();
  const odhlasen = !isLoading && user === null;
  const [obdobi, setObdobi] = useState<ObdobiVolba>("celkem");
  const [radky, setRadky] = useState<ZebrickyRadek[]>([]);
  const [nacitani, setNacitani] = useState<boolean>(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const volby = volbyObdobi();

  useEffect(() => {
    let zive = true;
    setNacitani(true);
    setChyba(null);
    void (async (): Promise<void> => {
      const vysledek = await getZebricek(obdobi);
      if (!zive) return;
      setRadky(vysledek.data.zebricky);
      if (vysledek.source === "fallback") {
        setChyba("Žebříček se nepodařilo načíst. Zkus to prosím později.");
      }
      setNacitani(false);
    })();
    return () => {
      zive = false;
    };
  }, [obdobi]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">Školní expediční klub</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Žebříčky
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Přehled nejaktivnějších členů podle účasti a kilometrů.
        </p>
      </header>

      <div className="pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label
              htmlFor="zebricky-obdobi"
              className="text-sm font-bold tracking-tight"
            >
              Období
            </label>
            <p className="mt-0.5 text-sm text-inkoust/70">
              Filtr období — celkem, nebo jen výpravy daného roku.
            </p>
          </div>
          <select
            id="zebricky-obdobi"
            value={obdobi}
            onChange={(udalost) => {
              setObdobi(udalost.target.value);
            }}
            className="min-h-[44px] min-w-[44px] rounded-md border-2 border-inkoust bg-white/80 px-3 py-2 text-sm font-bold"
          >
            {volby.map((volba) => (
              <option key={volba.hodnota} value={volba.hodnota}>
                {volba.popisek}
              </option>
            ))}
          </select>
        </div>

        {nacitani && (
          <div
            role="status"
            aria-label="Načítám žebříček"
            className="mt-4 space-y-3"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-md border-2 border-inkoust/20 bg-white/60"
              />
            ))}
          </div>
        )}

        {!nacitani && chyba !== null && radky.length === 0 && (
          <div
            role="alert"
            className="mt-4 rounded-lg border-2 border-inkoust bg-white/60 p-5 text-center shadow-denik"
          >
            <h2 className="text-base font-bold tracking-tight">
              Žebříček je teď nedostupný
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
              {chyba}
            </p>
          </div>
        )}

        {!nacitani && radky.length === 0 && chyba === null && (
          <div
            role="status"
            className="mt-4 flex flex-col items-center rounded-lg border-2 border-dashed border-inkoust/30 bg-white/60 px-6 py-14 text-center shadow-denik"
          >
            <div
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-inkoust bg-papir shadow-razitko"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7 text-smrk"
              >
                <path d="M8 21h8" />
                <path d="M12 17v4" />
                <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
              </svg>
            </div>
            <h2 className="mt-5 text-lg font-bold tracking-tight">
              Zatím tu není co hodnotit
            </h2>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
              Jakmile uzavřeme první výpravy, objeví se tu pořadí
              nejaktivnějších členů.
            </p>
            <p
              aria-hidden="true"
              className="mt-4 border-t border-dashed border-linka pt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70"
            >
              exapp · žebříčky se chystají
            </p>
          </div>
        )}

        {!nacitani && radky.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border-2 border-inkoust bg-white/80 shadow-denik">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Žebříček členů podle účasti a kilometrů
              </caption>
              <thead>
                <tr className="border-b-2 border-inkoust bg-papir">
                  <th scope="col" className="px-4 py-3 font-bold">
                    Pořadí
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Jméno
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Výpravy
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Kilometry
                  </th>
                </tr>
              </thead>
              <tbody>
                {radky.map((radek, index) => {
                  const jsemJa =
                    user !== null && user.id === radek.userId;
                  return (
                    <tr
                      key={radek.userId}
                      aria-current={jsemJa ? "true" : undefined}
                      className={
                        jsemJa
                          ? "border-t border-linka bg-jantar/20 font-bold"
                          : "border-t border-linka"
                      }
                    >
                      <td className="px-4 py-3 tabular-nums">
                        {index + 1}.
                      </td>
                      <td className="px-4 py-3">
                        {radek.jmeno}
                        {jsemJa && (
                          <span className="ml-2 rounded-full border border-inkoust bg-smrk px-2 py-0.5 text-xs font-bold text-papir">
                            ty
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {radek.vypravy}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatKm(radek.km)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {odhlasen && (
          <section
            aria-labelledby="zebricky-prihlaseni"
            className="mt-5 rounded-lg border-2 border-inkoust bg-white/60 p-5 text-center shadow-denik"
          >
            <h2 id="zebricky-prihlaseni" className="text-base font-bold tracking-tight">
              Chceš být v žebříčku?
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-inkoust/70">
              Přihlas se, nebo se zaregistruj s kódem od vedoucí — pak se ti
              započítá účast na výpravách.
            </p>
            <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
              <Link
                to="/login"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-smrk px-4 py-2 text-sm font-bold text-papir transition-colors hover:bg-inkoust"
              >
                Přihlásit se
              </Link>
              <Link
                to="/register"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-papir px-4 py-2 text-sm font-bold transition-colors hover:bg-linka"
              >
                Registrace s kódem
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
