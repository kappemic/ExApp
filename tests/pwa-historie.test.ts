/**
 * Offline history allow-list and GET cache behavior (Phase 6).
 * No DB, no secrets. Strict TypeScript.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HISTORIE_PREFIX,
  OFFLINE_HLAVICKA,
  jeHistorickeCteni,
  klicHistorickeCache,
  nactiHistorii,
  obsluzHistorickeVolani,
  type HistorieUloziste,
  zapniOfflineHistorii,
} from "../src/lib/pwa-historie";

function mockUloziste(): HistorieUloziste {
  const map = new Map<string, string>();
  return {
    getItem: (klic) => map.get(klic) ?? null,
    setItem: (klic, hodnota) => {
      map.set(klic, hodnota);
    },
    removeItem: (klic) => {
      map.delete(klic);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("jeHistorickeCteni — allow-list", () => {
  it("pustí GET na expeditions, detail, meetings a žebříčky", () => {
    expect(jeHistorickeCteni("GET", "/api/expeditions")).toBe(true);
    expect(jeHistorickeCteni("get", "/api/expeditions?stav=proběhlá&page=2")).toBe(
      true,
    );
    expect(jeHistorickeCteni("GET", "/api/expeditions/abc123")).toBe(true);
    expect(jeHistorickeCteni("GET", "/api/meetings")).toBe(true);
    expect(jeHistorickeCteni("GET", "/api/meetings/schuzka-1")).toBe(true);
    expect(jeHistorickeCteni("GET", "/api/zebricky")).toBe(true);
    expect(jeHistorickeCteni("GET", "/api/zebricky?limit=10")).toBe(true);
  });

  it("neukládá alba, diskuze, auth, Strava ani hlubší cesty", () => {
    expect(jeHistorickeCteni("GET", "/api/alba")).toBe(false);
    expect(
      jeHistorickeCteni("GET", "/api/alba/album-1/fotky/foto-1/soubor"),
    ).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/alba/album-1/fotky")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/expeditions/id/diskuze")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/auth/me")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/strava/activities")).toBe(false);
    expect(jeHistorickeCteni("POST", "/api/expeditions")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/zebricky/extra")).toBe(false);
  });
});

describe("klicHistorickeCache", () => {
  it("zachová query, zahodí fragment", () => {
    const url = "/api/expeditions?stav=proběhlá#sekce";
    expect(klicHistorickeCache(url)).toBe(
      `${HISTORIE_PREFIX}/api/expeditions?stav=proběhlá`,
    );
  });
});

describe("obsluzHistorickeVolani", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uloží JSON z 200 a při síťové chybě vrátí cache s offline hlavičkou", async () => {
    const uloziste = mockUloziste();
    const telo = '{"expedice":[]}';
    const url = "/api/expeditions?stav=proběhlá";
    const klic = klicHistorickeCache(url);

    const puvodni = vi.fn(async () =>
      Response.json(JSON.parse(telo) as { expedice: unknown[] }),
    );

    const uspech = await obsluzHistorickeVolani(url, undefined, puvodni, uloziste);
    expect(uspech.status).toBe(200);
    expect(nactiHistorii(uloziste, klic)).toBe(telo);

    puvodni.mockRejectedValueOnce(new TypeError("Network failed"));
    const offline = await obsluzHistorickeVolani(url, undefined, puvodni, uloziste);
    expect(offline.status).toBe(200);
    expect(await offline.text()).toBe(telo);
    expect(offline.headers.get(OFFLINE_HLAVICKA)).toBe("1");
  });

  it("neukládá GET /api/alba a při chybě nevrátí falešný offline JSON", async () => {
    const uloziste = mockUloziste();
    const url = "/api/alba";
    const puvodni = vi.fn(async () => Response.json({ alba: [] }));

    await obsluzHistorickeVolani(url, undefined, puvodni, uloziste);
    expect(uloziste.length).toBe(0);

    puvodni.mockRejectedValueOnce(new TypeError("Network failed"));
    await expect(
      obsluzHistorickeVolani(url, undefined, puvodni, uloziste),
    ).rejects.toThrow("Network failed");
  });

  it("nepovolené volání předá původnímu fetchi beze zápisu", async () => {
    const uloziste = mockUloziste();
    const puvodni = vi.fn(async () => new Response("not found", { status: 404 }));
    const odpoved = await obsluzHistorickeVolani(
      "/api/alba/album-1/fotky/foto-1/soubor",
      undefined,
      puvodni,
      uloziste,
    );
    expect(odpoved.status).toBe(404);
    expect(uloziste.length).toBe(0);
    expect(puvodni).toHaveBeenCalledOnce();
  });
});

describe("zapniOfflineHistorii", () => {
  const ZNACKA = "__exappZapnutaOfflineHistorie";

  afterEach(() => {
    vi.unstubAllGlobals();
    const g = globalThis as typeof globalThis & { [key: string]: unknown };
    delete g[ZNACKA];
  });

  it("obalí fetch jen jednou (StrictMode-safe)", async () => {
    const uloziste = mockUloziste();
    const puvodni = vi.fn(async () => Response.json({ expedice: [] }));
    vi.stubGlobal("fetch", puvodni);

    zapniOfflineHistorii(uloziste);
    zapniOfflineHistorii(uloziste);

    await globalThis.fetch("/api/expeditions");
    expect(puvodni).toHaveBeenCalledOnce();
  });
});
