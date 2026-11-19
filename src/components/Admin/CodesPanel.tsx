import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useAuth, type DemoKod } from "../../hooks/useAuth";
import { apiBase } from "../../lib/api-base";
import { ADMIN_CODES_PATH, VALIDACE, type ZivyKodPolozka } from "../../shared/api-types";
import PrazdnyStav from "../PrazdnyStav";
import { SEZNAM_KARTA_TRIDA, SeznamIkona } from "../SeznamKarta";
import { IkonaKlic } from "../SeznamIkony";

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

function jeSeznamZivychKodu(telo: unknown): telo is { kody: ZivyKodPolozka[] } {
  if (typeof telo !== "object" || telo === null) return false;
  const kody = (telo as { kody?: unknown }).kody;
  if (!Array.isArray(kody)) return false;
  return kody.every((polozka) => {
    if (typeof polozka !== "object" || polozka === null) return false;
    const zaznam = polozka as Record<string, unknown>;
    return typeof zaznam["code"] === "string" && typeof zaznam["expiresAt"] === "string";
  });
}

async function nactiZiveKody(): Promise<ZivyKodPolozka[]> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return [];
  const odpoved = await fetch(`${zaklad}${ADMIN_CODES_PATH}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const telo: unknown = await odpoved.json();
  if (!odpoved.ok || !jeSeznamZivychKodu(telo)) return [];
  return telo.kody;
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
  const [roleNavrh, setRoleNavrh] = useState("clen");
  const [ted, setTed] = useState<number>(() => Date.now());
  const [zkopirovanoId, setZkopirovanoId] = useState<string | null>(null);
  const [kopieChyba, setKopieChyba] = useState<string | null>(null);
  const [generuji, setGeneruji] = useState(false);
  const [zive, setZive] = useState<ZivyKodPolozka[] | null>(null);

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

  useEffect(() => {
    let ziveVolani = true;
    void nactiZiveKody()
      .then((radky) => {
        if (ziveVolani) setZive(radky);
      })
      .catch(() => {
        if (ziveVolani) setZive([]);
      });
    return () => {
      ziveVolani = false;
    };
  }, []);

  // Server list is the source of truth. Local rows fill the gap until reload.
  const serazene = ((): DemoKod[] => {
    const zeServeru: DemoKod[] = (zive ?? []).map((polozka) => ({
      id: polozka.code,
      kod: polozka.code,
      createdAt: polozka.expiresAt,
      expiresAt: polozka.expiresAt,
      poznamka: kody.find((lokalni) => lokalni.kod === polozka.code)?.poznamka ?? null,
    }));
    const kodyServeru = new Set(zeServeru.map((polozka) => polozka.kod));
    const zPameti = [...kody]
      .filter((kod) => jePlatny(kod, ted) && !kodyServeru.has(kod.kod))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...zeServeru, ...zPameti].filter((kod) => jePlatny(kod, ted));
  })();

  async function onGeneruj(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (generuji) return;
    setKopieChyba(null);
    setGeneruji(true);
    try {
      await generujKod(poznamka);
      setPoznamka("");
      try {
        setZive(await nactiZiveKody());
      } catch {
        setZive([]);
      }
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
        className="rounded-2xl border border-linka bg-povrch p-4"
      >
        <h2 className="font-display text-lg font-bold text-inkoust">Nový kód</h2>
        <label htmlFor="kody-popisek" className="mt-3 block text-sm font-bold text-inkoust">
          Popisek
        </label>
        <input
          id="kody-popisek"
          name="popisek"
          type="text"
          value={poznamka}
          onChange={(e) => setPoznamka(e.target.value)}
          placeholder="Třeba Nováčci – říjen"
          maxLength={VALIDACE.poznamkaMaxDelka}
          className="mt-1 min-h-11 w-full rounded-xl border border-pole bg-povrch-2 px-4 text-base text-inkoust placeholder:text-mech"
        />
        <label htmlFor="kody-role" className="mt-3 block text-sm font-bold text-inkoust">
          Role
        </label>
        <select
          id="kody-role"
          value={roleNavrh}
          onChange={(e) => setRoleNavrh(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-pole bg-povrch-2 px-4 text-base text-inkoust"
        >
          <option value="clen">Člen</option>
        </select>
        <p className="mt-2 text-xs text-ink-3">
          Role u kódu se na server neukládá — registrace vždy začíná jako člen.
        </p>
        <button
          type="submit"
          disabled={generuji}
          className="nahled-press mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-smrk px-4 text-[15px] font-semibold text-papir disabled:opacity-60"
        >
          <IkonaKlic />
          {generuji ? "Vytvářím…" : "Vytvořit kód"}
        </button>
      </form>

      <div aria-live="polite">
        {kopieChyba !== null && (
          <p role="alert" className="rounded-md border-2 border-red-800/40 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-900">
            {kopieChyba}
          </p>
        )}
      </div>

      <section className="mt-2">
        <h2 className="font-display text-lg font-bold text-inkoust">Aktivní kódy</h2>
      {serazene.length === 0 ? (
        <PrazdnyStav
          className="mt-3"
          ikona={<IkonaKlic />}
          nadpis="Zatím žádný kód"
          text="Vytvoř první pozvánkový kód výše a pošli ho nováčkovi."
        />
      ) : (
        <ul aria-label="Vygenerované pozvánkové kódy" className={`mt-3 ${SEZNAM_KARTA_TRIDA}`}>
          {serazene.map((kod) => {
            const zbyva = Date.parse(kod.expiresAt) - ted;
            const zkopirovano = zkopirovanoId === kod.id;
            const podtitul = [
              "Člen",
              kod.poznamka !== null && kod.poznamka.length > 0 ? kod.poznamka : null,
              `zbývá ${formatZbyva(zbyva)}`,
            ]
              .filter((cast): cast is string => cast !== null)
              .join(" · ");
            return (
              <li key={kod.id} className="flex min-h-[64px] items-center gap-3 px-3.5 py-2.5">
                <SeznamIkona>
                  <IkonaKlic />
                </SeznamIkona>
                <div className="min-w-0 flex-1">
                  <p
                    className="font-mono text-[17px] font-bold tracking-[0.08em] text-inkoust"
                    aria-label={`Kód ${kod.kod}`}
                  >
                    {kod.kod}
                  </p>
                  <p className="truncate text-[13px] text-ink-3">{podtitul}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void onKopiruj(kod)}
                  aria-label={zkopirovano ? `Kód ${kod.kod} zkopírován` : `Kopírovat kód ${kod.kod}`}
                  className={`nahled-press inline-flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors motion-reduce:transition-none ${
                    zkopirovano
                      ? "border-smrk bg-mlha text-smrk"
                      : "border-linka bg-povrch text-inkoust hover:bg-mlha/60"
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-[18px] w-[18px]"
                  >
                    {zkopirovano ? (
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    ) : (
                      <>
                        <rect x="8" y="8" width="12" height="12" rx="2.5" />
                        <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
                      </>
                    )}
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-bold text-inkoust">Použité</h2>
        <p className="mt-2 px-1 text-sm text-ink-3">
          Historii použitých kódů aplikace zatím neukládá.
        </p>
      </section>
    </div>
  );
}
