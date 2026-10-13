/**
 * tests/diskuze-api.test.ts — Fáze 5, Krok 4: diskuze-klient bez HTTP.
 * Mockne globální `fetch` (žádné destruktivní SQL, žádný secret v testech)
 * a ověřuje `src/lib/diskuze-api.ts`: getZpravy / posliZpravu / smazZpravu
 * (200/201/401/403/404/422/offline + české hlášky) a XSS-safe render
 * (`escapujHtml` — payload se ukládá raw, ale renderuje jako text).
 * Strict TypeScript, žádný `any`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  escapujHtml,
  getZpravy,
  jeZprava,
  posliZpravu,
  smazZpravu,
} from "../src/lib/diskuze-api";

const API_ZAKLAD = "https://api.test";
const XSS = `<script>alert("xss")</script><img src="x" onerror="alert(1)">`;

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(odpoved: Response): void {
  const mock: typeof fetch = () => Promise.resolve(odpoved);
  vi.stubGlobal("fetch", mock);
}

function mockFetchZachytUrl(
  odpoved: Response,
  zachyt: { url: string; metoda: string },
): void {
  const mock: typeof fetch = (
    vstup: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    zachyt.url = String(vstup);
    const metoda: unknown = (init as { method?: unknown } | undefined)?.method;
    zachyt.metoda = typeof metoda === "string" ? metoda : "GET";
    return Promise.resolve(odpoved);
  };
  vi.stubGlobal("fetch", mock);
}

function mockFetchOffline(): void {
  const mock: typeof fetch = () => Promise.reject(new Error("offline"));
  vi.stubGlobal("fetch", mock);
}

function dobraZprava(): Record<string, string | null> {
  return {
    id: "z1",
    expeditionId: "abc",
    autorId: null,
    text: "Ahoj z výpravy",
    createdAt: "2026-10-01T10:00:00.000Z",
  };
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getZpravy — klient bez HTTP (mock fetch)", () => {
  it("vrátí vlákno seřazené od serveru (200, PUBLIC i anonymně)", async () => {
    const zachyt: { url: string; metoda: string } = { url: "", metoda: "" };
    mockFetchZachytUrl(
      odpovedJson({ zpravy: [dobraZprava()], nextCursor: null }, 200),
      zachyt,
    );
    const vysledek = await getZpravy("abc");
    expect(zachyt.url).toBe(`${API_ZAKLAD}/api/expeditions/abc/zpravy`);
    expect(zachyt.metoda).toBe("GET");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.zpravy).toHaveLength(1);
      expect(vysledek.data.zpravy[0]?.text).toBe("Ahoj z výpravy");
      expect(vysledek.data.nextCursor).toBeNull();
    }
  });

  it("paginaci posílá ?limit & cursor", async () => {
    const zachyt: { url: string; metoda: string } = { url: "", metoda: "" };
    mockFetchZachytUrl(
      odpovedJson({ zpravy: [], nextCursor: null }, 200),
      zachyt,
    );
    await getZpravy("abc", { limit: 10, cursor: "z1" });
    expect(zachyt.url).toContain("limit=10");
    expect(zachyt.url).toContain("cursor=z1");
  });

  it("404 NENALEZENO nese českou hlášku s kódem", async () => {
    mockFetch(
      odpovedJson(
        { error: { code: "NENALEZENO", message: "Výprava nenalezena." } },
        404,
      ),
    );
    const vysledek = await getZpravy("neexistuje");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Výprava nenalezena.");
      expect(vysledek.kod).toBe("NENALEZENO");
    }
  });

  it("offline vrátí českou hlášku (bez připojení)", async () => {
    mockFetchOffline();
    const vysledek = await getZpravy("abc");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Zprávy jsou bez připojení nedostupné.");
    }
  });
});

describe("posliZpravu — klient bez HTTP (mock fetch)", () => {
  it("201 přidá zprávu (text se posílá otrimovaný na server)", async () => {
    mockFetch(odpovedJson({ zprava: dobraZprava() }, 201));
    const vysledek = await posliZpravu("abc", "Ahoj z výpravy");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.zprava.text).toBe("Ahoj z výpravy");
    }
  });

  it("422 mapuje chybyPoli z details (první hláška pole text)", async () => {
    mockFetch(
      odpovedJson(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Zkontroluj zvýrazněná pole.",
            details: { text: ["Napiš zprávu."] },
          },
        },
        422,
      ),
    );
    const vysledek = await posliZpravu("abc", "   ");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("VALIDATION_ERROR");
      expect(vysledek.chybyPoli?.["text"]).toBe("Napiš zprávu.");
    }
  });

  it("401 anonym POST nese českou hlášku s kódem NEPRIHLASEN", async () => {
    mockFetch(
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
    const vysledek = await posliZpravu("abc", "Ahoj");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("NEPRIHLASEN");
      expect(vysledek.chyba).toContain("přihlášený");
    }
  });

  it("offline hlásí bez připojení česky", async () => {
    mockFetchOffline();
    const vysledek = await posliZpravu("abc", "Ahoj");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe(
        "Bez připojení zprávu poslat nejde. Zkus to později.",
      );
    }
  });
});

describe("smazZpravu — klient bez HTTP (mock fetch)", () => {
  it("200 smaže zprávu ({ok:true})", async () => {
    mockFetch(odpovedJson({ ok: true }, 200));
    const vysledek = await smazZpravu("abc", "z1");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data).toEqual({ ok: true });
    }
  });

  it("403 cizí mazání nese českou hlášku s kódem ZAKAZANO", async () => {
    mockFetch(
      odpovedJson(
        {
          error: {
            code: "ZAKAZANO",
            message: "Tuhle zprávu smazat nemůžeš.",
          },
        },
        403,
      ),
    );
    const vysledek = await smazZpravu("abc", "cizi-zprava");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("ZAKAZANO");
      expect(vysledek.chyba).toBe("Tuhle zprávu smazat nemůžeš.");
    }
  });

  it("404 nese českou hlášku", async () => {
    mockFetch(
      odpovedJson(
        { error: { code: "NENALEZENO", message: "Zpráva nenalezena." } },
        404,
      ),
    );
    const vysledek = await smazZpravu("abc", "neexistuje");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Zpráva nenalezena.");
      expect(vysledek.kod).toBe("NENALEZENO");
    }
  });

  it("offline hlásí bez připojení česky", async () => {
    mockFetchOffline();
    const vysledek = await smazZpravu("abc", "z1");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Bez připojení smazat nejde. Zkus to později.");
    }
  });
});

describe("jeZprava guard", () => {
  it("přijme platnou zprávu", () => {
    expect(jeZprava(dobraZprava())).toBe(true);
  });

  it("odmítne zprávu bez textu a null", () => {
    expect(jeZprava({ id: "z1", expeditionId: "abc" })).toBe(false);
    expect(jeZprava(null)).toBe(false);
  });
});

describe("escapujHtml (XSS-safe render — ukládá se raw, renderuje jako text)", () => {
  it("XSS payload se escapuje — ve výstupu není žádný <script>", () => {
    const ven = escapujHtml(XSS);
    expect(ven).not.toContain("<script>");
    expect(ven).not.toContain("<img");
    expect(ven).toContain("&lt;script&gt;");
  });

  it("escapuje &, <, >, uvozovky i apostrofy", () => {
    expect(escapujHtml(`a & b`)).toBe("a &amp; b");
    expect(escapujHtml(`<b>"ahoj" 'světe'</b>`)).toBe(
      "&lt;b&gt;&quot;ahoj&quot; &#39;světe&#39;&lt;/b&gt;",
    );
  });

  it("běžný český text s diakritikou nechává nedotčený", () => {
    expect(escapujHtml("Ahoj z výpravy — Tříjezerní slať")).toBe(
      "Ahoj z výpravy — Tříjezerní slať",
    );
  });
});

describe("diskuze-klient bez backendu (prázdný VITE_API_BASE_URL)", () => {
  it("čtení bez backendu vrací prázdné vlákno", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const vysledek = await getZpravy("abc");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.zpravy).toEqual([]);
      expect(vysledek.data.nextCursor).toBeNull();
    }
  });

  it("zápis bez backendu hlásí offline česky (žádný secret, žádný fetch)", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const volani = vi.fn();
    vi.stubGlobal("fetch", volani);
    const vysledek = await posliZpravu("abc", "Ahoj");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe(
        "Bez připojení zprávu poslat nejde. Zkus to později.",
      );
    }
    expect(volani).not.toHaveBeenCalled();
  });
});
