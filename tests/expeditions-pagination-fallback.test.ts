/**
 * tests/expeditions-pagination-fallback.test.ts — Krok 10:
 * `getExpeditions` s nevalidní `pagination` → bezpečný fallback, bez throw.
 * Chování přes mocknutý fetch: odpověď 200 s nevalidní `pagination`
 * → výsledek nese `errorCode`, nevyhodí. Strict TS, žádný `any`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExpeditions } from "../src/lib/expeditions-api";

const API_ZAKLAD = "https://api.test";

function dobraExpedice(): Record<string, string | Record<string, number> | null> {
  return {
    id: "abc",
    nazev: "Šumava — Tříjezerní slať",
    datum: "2099-06-12",
    datumDo: null,
    sraz: "Praha hl. n. 7:30",
    popis: "",
    trasaOdkaz: "",
    kapacita: { prihlaseno: 0, celkem: 10 },
    stav: "volno",
  };
}

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

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getExpeditions — nevalidní pagination → bezpečný fallback", () => {
  it("page 0 (200 s nevalidní pagination) → fallback s errorCode, bez throw", async () => {
    mockFetch(
      odpovedJson(
        {
          expedice: [dobraExpedice()],
          pagination: { page: 0, pageSize: 20, totalItems: 1, totalPages: 1 },
        },
        200,
      ),
    );
    const vysledek = await getExpeditions();
    expect(vysledek.errorCode).toBeDefined();
    expect(vysledek.source).not.toBe("db");
    expect(vysledek.pagination).toBeUndefined();
  });

  it("pageSize 101 (200 s nevalidní pagination) → fallback s errorCode, bez throw", async () => {
    mockFetch(
      odpovedJson(
        {
          expedice: [dobraExpedice()],
          pagination: { page: 1, pageSize: 101, totalItems: 1, totalPages: 1 },
        },
        200,
      ),
    );
    const vysledek = await getExpeditions();
    expect(vysledek.errorCode).toBeDefined();
    expect(vysledek.source).not.toBe("db");
    expect(vysledek.pagination).toBeUndefined();
  });

  it("pagination jako řetězec (200 s nevalidní pagination) → fallback s errorCode, bez throw", async () => {
    mockFetch(
      odpovedJson({ expedice: [dobraExpedice()], pagination: "strana-1" }, 200),
    );
    const vysledek = await getExpeditions();
    expect(vysledek.errorCode).toBeDefined();
    expect(vysledek.source).not.toBe("db");
    expect(vysledek.pagination).toBeUndefined();
  });
});
