import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useAuth, type DemoKod } from "../../hooks/useAuth";
import { apiBase } from "../../lib/api-base";
import { ADMIN_CODES_PATH, VALIDACE, type ZivyKodPolozka } from "../../shared/api-types";
import PrazdnyStav from "../PrazdnyStav";
import Ikona from "../Ikona";
import VyberPole from "../VyberPole";
import { POPISEK_POLE } from "../formular-tridy";
import { IkonaKlic } from "../SeznamIkony";

function formatZbyva(ms: number): string {
  if (ms <= 0) return "0 s";
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s`;
  const minut = Math.floor(ms / 60_000);
  return `${minut} ${minut === 1 ? "minuta" : minut <= 4 ? "minuty" : "minut"}`;
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

const POLE_KODU =
  "h-[46px] w-full rounded-[11px] border border-pole bg-papir px-3.5 text-base text-inkoust placeholder:text-ink-4 focus:border-smrk focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25 min-[90rem]:bg-pole-podklad min-[90rem]:text-[13.5px] min-[90rem]:placeholder:text-ink-3";

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
    <div className="flex flex-col gap-5 min-[90rem]:grid min-[90rem]:grid-cols-[minmax(0,1fr)_340px] min-[90rem]:items-start min-[90rem]:gap-7">
      <div className="flex min-w-0 flex-col gap-5">
        <form
          onSubmit={(e) => void onGeneruj(e)}
          aria-busy={generuji}
          className="flex flex-col gap-3 rounded-2xl border border-linka bg-povrch p-4 shadow-karta min-[90rem]:gap-[18px] min-[90rem]:p-5"
        >
          <h2 className="font-display text-lg font-bold text-inkoust min-[90rem]:tracking-[-0.4px]">Nový kód</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="kody-popisek" className={POPISEK_POLE}>
              Popisek
            </label>
            <input
              id="kody-popisek"
              name="popisek"
              type="text"
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              placeholder="Např. Pro Adama – nový člen"
              maxLength={VALIDACE.poznamkaMaxDelka}
              className={POLE_KODU}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="kody-role" className={POPISEK_POLE}>
              Role
            </label>
            <VyberPole
              id="kody-role"
              value={roleNavrh}
              onChange={setRoleNavrh}
              className={POLE_KODU}
              volby={[{ value: "clen", popisek: "Člen" }]}
            />
          </div>
          <div className="flex gap-2.5 min-[90rem]:justify-end">
            <button
              type="button"
              onClick={() => setPoznamka("")}
              className="nahled-press inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-linka bg-papir px-2.5 text-sm font-semibold text-mech min-[90rem]:h-[46px] min-[90rem]:flex-none min-[90rem]:border-transparent min-[90rem]:bg-transparent"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={generuji}
              className="nahled-press inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-smrk px-[18px] text-sm font-semibold text-povrch disabled:opacity-60 min-[90rem]:h-[46px] min-[90rem]:flex-none min-[90rem]:gap-2"
            >
              <Ikona nazev="key-round" className="size-4" />
              {generuji ? "Vytvářím…" : "Vytvořit kód"}
            </button>
          </div>
        </form>

        <div aria-live="polite" className="empty:hidden">
          {kopieChyba !== null && (
            <p role="alert" className="rounded-xl bg-akcent-100 px-3.5 py-2.5 text-[13px] font-semibold text-akcent">
              {kopieChyba}
            </p>
          )}
        </div>

        <section
          aria-labelledby="kody-aktivni"
          className="min-[90rem]:overflow-hidden min-[90rem]:rounded-2xl min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-povrch min-[90rem]:shadow-denik"
        >
          <div className="hidden items-center gap-[9px] border-b border-linka px-5 py-4 min-[90rem]:flex">
            <h2 id="kody-aktivni" className="font-display text-[17px] font-bold tracking-[-0.3px] text-inkoust">
              Aktivní kódy
            </h2>
            <span className="rounded-full bg-povrch-2 px-2 py-[3px] text-[10.5px] font-semibold text-mech">{serazene.length}</span>
          </div>
          {serazene.length === 0 ? (
            <PrazdnyStav
              ikona={<IkonaKlic />}
              nadpis="Zatím žádný kód"
              text="Vytvoř první pozvánkový kód výše a pošli ho nováčkovi. Platí 10 minut."
            />
          ) : (
            <ul
              aria-label="Vygenerované pozvánkové kódy"
              className="m-0 flex list-none flex-col gap-5 p-0 min-[90rem]:gap-0 min-[90rem]:divide-y min-[90rem]:divide-linka"
            >
              {serazene.map((kod) => {
                const zbyva = Date.parse(kod.expiresAt) - ted;
                const zkopirovano = zkopirovanoId === kod.id;
                const poznamkaKodu = kod.poznamka !== null && kod.poznamka.length > 0 ? kod.poznamka : null;
                return (
                  <li
                    key={kod.id}
                    className="flex items-center gap-3 rounded-2xl border border-linka bg-povrch p-3.5 shadow-jemny min-[90rem]:gap-3.5 min-[90rem]:rounded-none min-[90rem]:border-0 min-[90rem]:px-5 min-[90rem]:py-4 min-[90rem]:shadow-none"
                  >
                    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-mlha text-smrk">
                      <Ikona nazev="key-round" className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p
                        className="font-display text-[15px] font-bold tracking-[0.3px] text-inkoust min-[90rem]:font-sans min-[90rem]:text-sm min-[90rem]:tracking-[1.2px]"
                        aria-label={`Kód ${kod.kod}`}
                      >
                        {kod.kod}
                      </p>
                      <p className="text-xs text-ink-3 min-[90rem]:text-[11.5px]">
                        <span className="min-[90rem]:hidden">Člen · </span>
                        {poznamkaKodu !== null ? `${poznamkaKodu} · ` : ""}zbývá {formatZbyva(zbyva)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onKopiruj(kod)}
                      aria-label={zkopirovano ? `Kód ${kod.kod} zkopírován` : `Kopírovat kód ${kod.kod}`}
                      className={`nahled-press relative inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] text-xs font-semibold before:absolute before:-inset-1 before:content-[''] transition-colors motion-reduce:transition-none min-[90rem]:h-8 min-[90rem]:w-auto min-[90rem]:rounded-lg min-[90rem]:px-[11px] ${
                        zkopirovano ? "bg-mlha text-smrk" : "bg-povrch-2 text-mech hover:bg-linka"
                      }`}
                    >
                      <Ikona nazev={zkopirovano ? "check" : "copy"} className="size-4 min-[90rem]:size-[13px]" />
                      <span className="hidden min-[90rem]:inline">{zkopirovano ? "Zkopírováno" : "Kopírovat"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-linka bg-povrch p-4 min-[90rem]:gap-3.5 min-[90rem]:p-5 min-[90rem]:shadow-denik">
        <h2 className="font-display text-base font-bold text-inkoust min-[90rem]:text-[17px] min-[90rem]:tracking-[-0.3px]">Použité</h2>
        <p className="text-xs text-ink-3">Historii použitých kódů aplikace zatím neukládá.</p>
      </section>
    </div>
  );
}
