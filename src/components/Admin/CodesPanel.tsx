import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useAuth, type DemoKod } from "../../hooks/useAuth";
import { VALIDACE } from "../../shared/api-types";

function formatZbyva(ms: number): string {
  if (ms <= 0) return "0:00";
  const sekund = Math.floor(ms / 1000);
  const minut = Math.floor(sekund / 60);
  const zbytek = sekund % 60;
  return `${minut}:${String(zbytek).padStart(2, "0")}`;
}

function jePlatny(kod: DemoKod, ted: number): boolean {
  return Date.parse(kod.expiresAt) > ted;
}

async function zkopiruj(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard !== undefined &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  // Fallback pro nezabezpečený kontext: dočasná textarea + execCommand.
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * CodesPanel — správa pozvánkových kódů (jen ADMIN).
 * Prezentace; generování + úložiště řeší useAuth.generujKod.
 */
export default function CodesPanel(): JSX.Element {
  const { kody, generujKod } = useAuth();
  const [poznamka, setPoznamka] = useState("");
  const [ted, setTed] = useState<number>(() => Date.now());
  const [zkopirovanoId, setZkopirovanoId] = useState<string | null>(null);
  const [kopieChyba, setKopieChyba] = useState<string | null>(null);
  const [generuji, setGeneruji] = useState(false);

  // Odpočet platnosti — textový, bez animací.
  useEffect(() => {
    const timer = window.setInterval(() => setTed(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Potvrzení kopie po 2 s zmizí.
  useEffect(() => {
    if (zkopirovanoId === null) return;
    const timer = window.setTimeout(() => setZkopirovanoId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [zkopirovanoId]);

  // Vypršelé se mažou v useAuth (purge) — list ukazuje jen platné.
  const serazene = [...kody]
    .filter((k) => jePlatny(k, ted))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function onGeneruj(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (generuji) return;
    setKopieChyba(null);
    setGeneruji(true);
    try {
      await generujKod(poznamka);
      setPoznamka("");
    } catch (err) {
      setKopieChyba(
        err instanceof Error
          ? err.message
          : "Kód se nepodařilo vygenerovat. Zkus to znovu.",
      );
    } finally {
      setGeneruji(false);
    }
  }

  async function onKopiruj(kod: DemoKod): Promise<void> {
    setKopieChyba(null);
    const ok = await zkopiruj(kod.kod);
    if (ok) {
      setZkopirovanoId(kod.id);
    } else {
      setKopieChyba(`Kód ${kod.kod} se nepodařilo zkopírovat — opiš ho ručně.`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => void onGeneruj(e)}
        aria-busy={generuji}
        className="rounded-lg border-2 border-inkoust bg-white/60 p-5 shadow-denik"
      >
        <label htmlFor="kody-poznamka" className="block text-sm font-bold">
          Poznámka ke kódu <span className="font-normal text-inkoust/60">(nepovinná)</span>
        </label>
        <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row">
          <input
            id="kody-poznamka"
            name="poznamka"
            type="text"
            value={poznamka}
            onChange={(e) => setPoznamka(e.target.value)}
            placeholder="Třeba Nováčci – říjen"
            maxLength={VALIDACE.poznamkaMaxDelka}
            className="min-h-[44px] w-full flex-1 rounded-md border-2 border-linka bg-white px-3.5 py-2.5 text-base text-inkoust placeholder:text-inkoust/40 transition-colors focus:border-smrk focus:outline-none motion-reduce:transition-none"
          />
          <button
            type="submit"
            disabled={generuji}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md border-2 border-inkoust bg-smrk px-4 py-2.5 text-sm font-bold text-papir transition-colors hover:bg-inkoust disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
          >
            {generuji ? "Generuji…" : "Vygenerovat kód"}
          </button>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-inkoust/65">
          Každý kód platí 10 minut pro všechny a lze ho použít opakovaně, dokud
          nevyprší. Po vypršení vygeneruj nový. Kódy ze serveru platí pro všechna
          zařízení; bez spojení se serverem vznikají jen v tomto prohlížeči.
        </p>
      </form>

      <div aria-live="polite">
        {kopieChyba !== null && (
          <p role="alert" className="rounded-md border-2 border-red-800/40 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-900">
            {kopieChyba}
          </p>
        )}
      </div>

      {serazene.length === 0 ? (
        <div
          role="status"
          className="rounded-lg border-2 border-dashed border-inkoust/30 bg-white/60 px-6 py-10 text-center shadow-denik"
        >
          <h2 className="text-base font-bold">Zatím žádný kód</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-inkoust/70">
            Vygeneruj první pozvánkový kód tlačítkem výše a pošli ho nováčkovi.
          </p>
        </div>
      ) : (
        <ul aria-label="Vygenerované pozvánkové kódy" className="flex flex-col gap-3">
          {serazene.map((kod) => {
            const zbyva = Date.parse(kod.expiresAt) - ted;
            const zkopirovano = zkopirovanoId === kod.id;
            return (
              <li
                key={kod.id}
                className="flex flex-col gap-3 rounded-lg border-2 border-inkoust bg-white/60 p-4 shadow-denik sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xl font-extrabold tracking-[0.12em]" aria-label={`Kód ${kod.kod}`}>
                    {kod.kod}
                  </p>
                  <p className="mt-1 text-xs text-inkoust/65">
                    {kod.poznamka !== null && kod.poznamka.length > 0 ? (
                      <>{kod.poznamka} · </>
                    ) : null}
                    <time dateTime={kod.createdAt}>
                      Vytvořen {new Date(kod.createdAt).toLocaleString("cs-CZ")}
                    </time>
                  </p>
                  <p className="mt-1.5">
                    <span
                      className="inline-flex min-h-[28px] items-center rounded border border-smrk bg-smrk/10 px-2 py-0.5 text-xs font-bold text-smrk"
                    >
                      Platný
                      <span aria-label={`Zbývá ${formatZbyva(zbyva)}`}>
                        {" "}· zbývá {formatZbyva(zbyva)}
                      </span>
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onKopiruj(kod)}
                  aria-label={`Kopírovat kód ${kod.kod}`}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-linka bg-papir px-4 py-2 text-sm font-bold transition-colors hover:border-inkoust motion-reduce:transition-none sm:shrink-0"
                >
                  {zkopirovano ? "Zkopírováno ✓" : "Kopírovat"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
