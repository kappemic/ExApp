/**
 * tests/unread-expeditions.test.ts — Fáze 5, Krok 2: unread hook (HANDOFF §10).
 * Bez DB, bez HTTP, bez jsdom (repo nemá testing-library — viz
 * tests/diskuze-box.test.tsx): čistá logika + mock fetch + zdroj-kontrakt
 * nad `src/hooks/useUnreadExpeditions.ts` jako textem.
 * Pokrývá zadání: Map<expeditionId, boolean>, latestMessageAt > lastReadAt,
 * fetch on-load + polling 30 s s pauzou při hidden tabu, markAsRead helper
 * pro DiskuzeBox (visible + po send), localStorage cache + revalidace,
 * polling nezahltí API (jeden sdílený interval, minimum 10 s).
 * Strict TypeScript, žádný `any`, česky.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISKUZE_PRECTENO_EVENT,
  MIN_UNREAD_POLLING_MS,
  UNREAD_CACHE_KLIC,
  VYCHOZI_UNREAD_POLLING_MS,
  ctiUnreadZCache,
  jeNeprectene,
  normalizujSeznamId,
  oznacVlaknoJakoPrectene,
  ulozUnreadDoCache,
} from "../src/hooks/useUnreadExpeditions";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));
const API_ZAKLAD = "https://api.test";

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** In-memory localStorage pro node prostředí (vitest bez DOM). */
function stubPametoveUloziste(): Map<string, string> {
  const obchod = new Map<string, string>();
  const stub: Storage = {
    get length(): number {
      return obchod.size;
    },
    clear: (): void => {
      obchod.clear();
    },
    getItem: (klic: string): string | null => obchod.get(klic) ?? null,
    key: (index: number): string | null =>
      Array.from(obchod.keys())[index] ?? null,
    removeItem: (klic: string): void => {
      obchod.delete(klic);
    },
    setItem: (klic: string, hodnota: string): void => {
      obchod.set(klic, hodnota);
    },
  };
  vi.stubGlobal("localStorage", stub);
  return obchod;
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
  stubPametoveUloziste();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("jeNeprectene — unread = latestMessageAt > lastReadAt", () => {
  it("prázdné vlákno nikdy nesvítí", () => {
    expect(jeNeprectene(null, null)).toBe(false);
    expect(jeNeprectene(null, "2026-10-14T10:00:00.000Z")).toBe(false);
  });

  it("nikdy nečetl + neprázdné vlákno svítí", () => {
    expect(jeNeprectene("2026-10-14T10:00:00.000Z", null)).toBe(true);
  });

  it("rovnost časů = přečteno (po POST read)", () => {
    const cas = "2026-10-14T10:05:00.000Z";
    expect(jeNeprectene(cas, cas)).toBe(false);
  });

  it("nová zpráva po read svítí, starší ne", () => {
    expect(
      jeNeprectene("2026-10-14T10:06:00.000Z", "2026-10-14T10:05:00.000Z"),
    ).toBe(true);
    expect(
      jeNeprectene("2026-10-14T10:04:00.000Z", "2026-10-14T10:05:00.000Z"),
    ).toBe(false);
  });

  it("nevalidní časy jsou bezpečný default (nesvítí / čti znovu)", () => {
    expect(jeNeprectene("nesmysl", null)).toBe(false);
    expect(jeNeprectene("nesmysl", "2026-10-14T10:05:00.000Z")).toBe(false);
  });
});

describe("normalizujSeznamId — stabilní klíč pollingu", () => {
  it("trimuje, vyhazuje prázdné, deduplikuje a řadí", () => {
    expect(normalizujSeznamId(["b", " a ", "", "b", "  "])).toEqual(["a", "b"]);
    expect(normalizujSeznamId([])).toEqual([]);
  });
});

describe("unread snapshot cache — okamžitý render, pravda je server", () => {
  it("klíč je exapp:discussion-unread-v1", () => {
    expect(UNREAD_CACHE_KLIC).toBe("exapp:discussion-unread-v1");
    expect(DISKUZE_PRECTENO_EVENT).toBe("exapp:discussion-read");
  });

  it("prázdná cache → prázdný objekt, roundtrip drží booleany", () => {
    expect(ctiUnreadZCache()).toEqual({});
    ulozUnreadDoCache(
      new Map<string, boolean>([
        ["abc", true],
        ["def", false],
      ]),
    );
    expect(ctiUnreadZCache()).toEqual({ abc: true, def: false });
  });

  it("nevalidní / cizí záznam ignoruje (není to pravda o unread)", () => {
    localStorage.setItem(UNREAD_CACHE_KLIC, "nesmysl");
    expect(ctiUnreadZCache()).toEqual({});
    localStorage.setItem(
      UNREAD_CACHE_KLIC,
      JSON.stringify({ abc: true, cislo: 1, text: "x", nic: null }),
    );
    expect(ctiUnreadZCache()).toEqual({ abc: true });
  });
});

describe("oznacVlaknoJakoPrectene — helper pro DiskuzeBox (visible + po send)", () => {
  it("200 → true, volá POST read bez těla s časem", async () => {
    let zachycenaUrl = "";
    let zachycenaMetoda = "";
    const mock: typeof fetch = (
      vstup: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      zachycenaUrl = String(vstup);
      const metoda: unknown = (init as { method?: unknown } | undefined)?.method;
      zachycenaMetoda = typeof metoda === "string" ? metoda : "";
      return Promise.resolve(
        odpovedJson({ lastReadAt: "2026-10-14T10:05:00.000Z" }, 200),
      );
    };
    vi.stubGlobal("fetch", mock);
    const vysledek: boolean = await oznacVlaknoJakoPrectene("abc");
    expect(vysledek).toBe(true);
    expect(zachycenaUrl).toBe(`${API_ZAKLAD}/api/expeditions/abc/discussion/read`);
    expect(zachycenaMetoda).toBe("POST");
  });

  it("401 → false (tečka zůstává, server je pravda)", async () => {
    const mock: typeof fetch = () =>
      Promise.resolve(
        odpovedJson(
          {
            error: {
              code: "NEPRIHLASEN",
              message: "Nejsi přihlášený. Přihlas se a zkus to znovu.",
            },
          },
          401,
        ),
      );
    vi.stubGlobal("fetch", mock);
    await expect(oznacVlaknoJakoPrectene("abc")).resolves.toBe(false);
  });

  it("prázdné id nevolá fetch a vrací false", async () => {
    const volani = vi.fn();
    vi.stubGlobal("fetch", volani);
    await expect(oznacVlaknoJakoPrectene("   ")).resolves.toBe(false);
    expect(volani).not.toHaveBeenCalled();
  });

  it("offline → false s českou hláškou uvnitř (žádný pád)", async () => {
    const mock: typeof fetch = () => Promise.reject(new Error("offline"));
    vi.stubGlobal("fetch", mock);
    await expect(oznacVlaknoJakoPrectene("abc")).resolves.toBe(false);
  });
});

describe("hook zdroj-kontrakt — polling nezahlcuje API", () => {
  const zdroj: string = ctiZdroj("src/hooks/useUnreadExpeditions.ts");

  it("exportuje useUnreadExpeditions vracející Map<expeditionId, boolean>", () => {
    expect(zdroj).toContain("export function useUnreadExpeditions");
    expect(zdroj).toContain("Map<string, boolean>");
  });

  it("výchozí polling je 30 s, minimum 10 s (ochrana API)", () => {
    expect(VYCHOZI_UNREAD_POLLING_MS).toBe(30_000);
    expect(MIN_UNREAD_POLLING_MS).toBe(10_000);
    expect(zdroj).toContain("Math.max(Math.floor(pollingMs), MIN_UNREAD_POLLING_MS)");
  });

  it("jeden sdílený interval pro všechna id (žádný timer na id)", () => {
    const pocetIntervalu: number = zdroj.split("setInterval").length - 1;
    expect(pocetIntervalu).toBe(1);
    expect(zdroj).toContain("Promise.all");
    expect(zdroj).toContain("clearInterval");
  });

  it("pauza při skrytém tabu + refetch při návratu/focusu", () => {
    expect(zdroj).toContain("document.hidden");
    expect(zdroj).toContain("visibilitychange");
    expect(zdroj).toContain('"focus"');
  });

  it("čte meta a zapisuje read přes diskuze-api (žádný vlastní fetch)", () => {
    expect(zdroj).toContain("getDiscussionMeta");
    expect(zdroj).toContain("markAsRead");
    expect(zdroj).not.toContain("fetch(");
  });

  it("cache do localStorage + okamžité zhasnutí eventem", () => {
    expect(zdroj).toContain("UNREAD_CACHE_KLIC");
    expect(zdroj).toContain("DISKUZE_PRECTENO_EVENT");
    expect(zdroj).toContain("localStorage");
  });

  it("uklízí po sobě (cancel flag + removeEventListener)", () => {
    expect(zdroj).toContain("zruseno = true");
    expect(zdroj).toContain("removeEventListener");
  });

  it("zdroj neobsahuje zakázaný typ ani secrety", () => {
    const zakazanyTyp: string = ["as", "any"].join(" ");
    expect(zdroj).not.toMatch(/:\s*any\b/);
    expect(zdroj).not.toContain(zakazanyTyp);
    for (const slovo of ["client_secret", "passwordHash", "access_token", "refresh_token"]) {
      expect(zdroj).not.toContain(slovo);
    }
  });

  it("test neobsahuje zakázaný typ any", () => {
    const obsah: string = ctiZdroj("tests/unread-expeditions.test.ts");
    const zakazanyTyp: string = ["as", "any"].join(" ");
    expect(obsah).not.toMatch(/:\s*any\b/);
    expect(obsah).not.toContain(zakazanyTyp);
  });
});
