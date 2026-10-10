/**
 * tests/expedition-fotky-klient.test.ts — Krok 3: fotky-klient bez HTTP.
 * Mockne globální `fetch` (žádné destruktivní SQL, žádný secret v testech)
 * a ověřuje `src/lib/expedition-fotky.ts`: 201/422/404/offline + české hlášky.
 * Strict TypeScript, žádný `any`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nactiFotky,
  pridejFotku,
  smazFotku,
} from "../src/lib/expedition-fotky";

const API_ZAKLAD = "https://api.test";

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(odpoved: Response): void {
  const mock: typeof fetch = () =>
    Promise.resolve(odpoved);
  vi.stubGlobal("fetch", mock);
}

function mockFetchZachytUrl(
  odpoved: Response,
  zachyt: { url: string },
): void {
  const mock: typeof fetch = (vstup: Parameters<typeof fetch>[0]) => {
    zachyt.url = String(vstup);
    return Promise.resolve(odpoved);
  };
  vi.stubGlobal("fetch", mock);
}

function mockFetchOffline(): void {
  const mock: typeof fetch = () =>
    Promise.reject(new Error("offline"));
  vi.stubGlobal("fetch", mock);
}

function dobraFotka(): Record<string, string> {
  return {
    id: "f1",
    expeditionId: "abc",
    url: "https://example.cz/foto.jpg",
    popis: "Tříjezerní slať",
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

describe("nactiFotky — klient bez HTTP (mock fetch)", () => {
  it("vrátí seznam fotek (200)", async () => {
    const zachyt: { url: string } = { url: "" };
    mockFetchZachytUrl(odpovedJson({ fotky: [dobraFotka()] }, 200), zachyt);
    const vysledek = await nactiFotky("abc");
    expect(zachyt.url).toBe(`${API_ZAKLAD}/api/expeditions/abc/fotky`);
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.fotky).toHaveLength(1);
      expect(vysledek.data.fotky[0]?.url).toBe("https://example.cz/foto.jpg");
    }
  });

  it("404 NENALEZENO nese českou hlášku s kódem", async () => {
    mockFetch(
      odpovedJson(
        { error: { code: "NENALEZENO", message: "Výprava nenalezena." } },
        404,
      ),
    );
    const vysledek = await nactiFotky("neexistuje");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Výprava nenalezena.");
      expect(vysledek.kod).toBe("NENALEZENO");
    }
  });

  it("offline vrátí českou hlášku (bez připojení)", async () => {
    mockFetchOffline();
    const vysledek = await nactiFotky("abc");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Fotky jsou bez připojení nedostupné.");
    }
  });
});

describe("pridejFotku — klient bez HTTP (mock fetch)", () => {
  it("201 přidá fotku (url + popis)", async () => {
    mockFetch(odpovedJson({ fotka: dobraFotka() }, 201));
    const vysledek = await pridejFotku(
      "abc",
      "https://example.cz/foto.jpg",
      "Tříjezerní slať",
    );
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.fotka.url).toBe("https://example.cz/foto.jpg");
      expect(vysledek.data.fotka.popis).toBe("Tříjezerní slať");
    }
  });

  it("422 mapuje chybyPoli z details (první hláška pole)", async () => {
    mockFetch(
      odpovedJson(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Zkontroluj zvýrazněná pole.",
            details: { url: ["Odkaz musí začínat https://."] },
          },
        },
        422,
      ),
    );
    const vysledek = await pridejFotku("abc", "http://x.cz/f.jpg", "");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("VALIDATION_ERROR");
      expect(vysledek.chyba).toBe("Zkontroluj zvýrazněná pole.");
      expect(vysledek.chybyPoli?.["url"]).toBe(
        "Odkaz musí začínat https://.",
      );
    }
  });

  it("404 nese českou hlášku", async () => {
    mockFetch(
      odpovedJson(
        { error: { code: "NENALEZENO", message: "Výprava nenalezena." } },
        404,
      ),
    );
    const vysledek = await pridejFotku(
      "neexistuje",
      "https://example.cz/foto.jpg",
      "",
    );
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Výprava nenalezena.");
      expect(vysledek.kod).toBe("NENALEZENO");
    }
  });

  it("offline hlásí bez připojení česky", async () => {
    mockFetchOffline();
    const vysledek = await pridejFotku(
      "abc",
      "https://example.cz/foto.jpg",
      "",
    );
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe(
        "Bez připojení fotku přidat nejde. Zkus to později.",
      );
    }
  });
});

describe("smazFotku — klient bez HTTP (mock fetch)", () => {
  it("200 smaže fotku ({ok:true})", async () => {
    mockFetch(odpovedJson({ ok: true }, 200));
    const vysledek = await smazFotku("abc", "f1");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data).toEqual({ ok: true });
    }
  });

  it("404 nese českou hlášku", async () => {
    mockFetch(
      odpovedJson(
        { error: { code: "NENALEZENO", message: "Fotka nenalezena." } },
        404,
      ),
    );
    const vysledek = await smazFotku("abc", "neexistuje");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Fotka nenalezena.");
      expect(vysledek.kod).toBe("NENALEZENO");
    }
  });

  it("offline hlásí bez připojení česky", async () => {
    mockFetchOffline();
    const vysledek = await smazFotku("abc", "f1");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Bez připojení smazat nejde. Zkus to později.");
    }
  });
});

describe("fotky-klient bez backendu (prázdný VITE_API_BASE_URL)", () => {
  it("čtení bez backendu vrací prázdně (offline-first náhled)", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const vysledek = await nactiFotky("abc");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.fotky).toEqual([]);
    }
  });

  it("zápis bez backendu hlásí offline česky (žádný secret, žádný fetch)", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const volani = vi.fn();
    vi.stubGlobal("fetch", volani);
    const vysledek = await pridejFotku(
      "abc",
      "https://example.cz/foto.jpg",
      "",
    );
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe(
        "Bez připojení fotku přidat nejde. Zkus to později.",
      );
    }
    expect(volani).not.toHaveBeenCalled();
  });
});
