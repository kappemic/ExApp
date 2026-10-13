/**
 * tests/meetings-delete.test.ts — Krok 4 (verifikace mazání schůzek).
 *
 * TDD (Prove-It): uživatel hlásil „po Ano, odebrat se nestane vůbec nic".
 * Tyto testy selhávají na starém kódu (smazSchuzku stavělo jen holé
 * DELETE /api/meetings/:id bez větve occurrence) a procházejí na novém:
 * - klient-unit: smazSchuzku URL obsahuje rozvrhem=vyskyt + datum (vyskyt),
 *   holé detail URL (rada),
 * - occurrence větev kalendáře: vynechaný výskyt zmizí, řada zůstává,
 * - edge: neexistující ID (404), double DELETE, neplatné datum, prázdné id,
 *   pád sítě, expedice-delete nedotčen.
 *
 * Strict TS, žádný `any`. Fetch je mocknutý (small testy, bez I/O).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { udalostiProMesic, vyskytySchuzky } from "../src/lib/kalendar";
import { smazSchuzku } from "../src/lib/schuzky-api";
import { smazVypravu } from "../src/lib/expeditions-ucast";
import type { ApiSchuzka } from "../src/shared/api-types";

const API_ZAKLAD = "https://api.test";
const ID_SCHUZKY = "11111111-1111-4111-8111-111111111111";

interface ZachyceneVolani {
  url: string;
  metoda: string;
}

function tydenniSchuzka(vynechene: string[] = []): ApiSchuzka {
  return {
    id: ID_SCHUZKY,
    nazev: "Oddílová schůzka",
    datum: "2026-10-06",
    mistnost: "Klubovna",
    popis: "",
    opakovani: "tydenni",
    ...(vynechene.length > 0 ? { vynecheneVyskyty: vynechene } : {}),
  };
}

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Mock fetch, který zaznamená URL + metodu a vrací připravené odpovědi. */
function mockSekvence(odpovedi: Response[], zachyt: ZachyceneVolani[]): void {
  let poradi = 0;
  const mock: typeof fetch = (vstup: string | URL | Request, init?: RequestInit) => {
    const url = typeof vstup === "string" ? vstup : vstup.toString();
    const metoda =
      typeof init?.method === "string"
        ? init.method
        : vstup instanceof Request
          ? vstup.method
          : "GET";
    zachyt.push({ url, metoda });
    const odpoved = odpovedi[Math.min(poradi, odpovedi.length - 1)];
    poradi += 1;
    return Promise.resolve(odpoved as Response);
  };
  vi.stubGlobal("fetch", mock);
}

function chybaApi(kod: string, zprava: string, status: number): Response {
  return odpovedJson({ error: { code: kod, message: zprava } }, status);
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("smazSchuzku — rada maže celou řadu", () => {
  it("DELETE na holé /api/meetings/:id, bez query", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence([odpovedJson({ ok: true }, 200)], zachyt);

    const vysledek = await smazSchuzku(ID_SCHUZKY, "rada");

    expect(vysledek.ok).toBe(true);
    expect(zachyt).toHaveLength(1);
    expect(zachyt[0]?.metoda).toBe("DELETE");
    expect(zachyt[0]?.url).toBe(`${API_ZAKLAD}/api/meetings/${ID_SCHUZKY}`);
  });

  it("default rozsah je rada (volání bez rozsahu → stejné holé URL)", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence([odpovedJson({ ok: true }, 200)], zachyt);

    const vysledek = await smazSchuzku(ID_SCHUZKY);

    expect(vysledek.ok).toBe(true);
    expect(zachyt[0]?.url).toBe(`${API_ZAKLAD}/api/meetings/${ID_SCHUZKY}`);
  });
});

describe("smazSchuzku — vyskyt maže jeden výskyt (occurrence větev)", () => {
  it("URL obsahuje /occurrence + rozvrhem=vyskyt + datum", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence([odpovedJson({ ok: true }, 200)], zachyt);

    const vysledek = await smazSchuzku(ID_SCHUZKY, "vyskyt", "2026-10-13");

    expect(vysledek.ok).toBe(true);
    expect(zachyt).toHaveLength(1);
    expect(zachyt[0]?.metoda).toBe("DELETE");
    const url = new URL(zachyt[0]?.url ?? "");
    expect(url.pathname).toBe(`/api/meetings/${ID_SCHUZKY}/occurrence`);
    expect(url.searchParams.get("rozvrhem")).toBe("vyskyt");
    expect(url.searchParams.get("datum")).toBe("2026-10-13");
  });

  it("vyskyt bez data → jen rozvrhem=vyskyt (server pak vrátí českou 422)", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence(
      [chybaApi("VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", 422)],
      zachyt,
    );

    const vysledek = await smazSchuzku(ID_SCHUZKY, "vyskyt");

    expect(vysledek.ok).toBe(false);
    const url = new URL(zachyt[0]?.url ?? "");
    expect(url.pathname).toBe(`/api/meetings/${ID_SCHUZKY}/occurrence`);
    expect(url.searchParams.get("rozvrhem")).toBe("vyskyt");
    expect(url.searchParams.has("datum")).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Zkontroluj zvýrazněná pole.");
      expect(vysledek.kod).toBe("VALIDATION_ERROR");
    }
  });

  it("neplatné datum se neposílá (ochrana před rozbitým query)", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence(
      [chybaApi("VALIDATION_ERROR", "Zkontroluj zvýrazněná pole.", 422)],
      zachyt,
    );

    await smazSchuzku(ID_SCHUZKY, "vyskyt", "neni-datum");

    const url = new URL(zachyt[0]?.url ?? "");
    expect(url.searchParams.has("datum")).toBe(false);
  });
});

describe("smazSchuzku — edge cases", () => {
  it("neexistující ID → 404 NENALEZENO, ok:false s českou hláškou", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence(
      [chybaApi("NENALEZENO", "Schůzka nenalezena.", 404)],
      zachyt,
    );

    const vysledek = await smazSchuzku("neexistujici-id", "rada");

    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Schůzka nenalezena.");
      expect(vysledek.kod).toBe("NENALEZENO");
    }
  });

  it("dvojklik / double DELETE → první ok, druhý 404 (žádný throw)", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence(
      [
        odpovedJson({ ok: true }, 200),
        chybaApi("NENALEZENO", "Schůzka nenalezena.", 404),
      ],
      zachyt,
    );

    const prvni = await smazSchuzku(ID_SCHUZKY, "rada");
    const druhy = await smazSchuzku(ID_SCHUZKY, "rada");

    expect(prvni.ok).toBe(true);
    expect(druhy.ok).toBe(false);
    expect(zachyt).toHaveLength(2);
  });

  it("prázdné id → ok:false a fetch se vůbec nevolá", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence([odpovedJson({ ok: true }, 200)], zachyt);

    const vysledek = await smazSchuzku("", "rada");

    expect(vysledek.ok).toBe(false);
    expect(zachyt).toHaveLength(0);
  });

  it("pád sítě → ok:false s obecnou českou hláškou, bez throw", async () => {
    const odmitnuti: typeof fetch = () => Promise.reject(new Error("síť down"));
    vi.stubGlobal("fetch", odmitnuti);

    const vysledek = await smazSchuzku(ID_SCHUZKY, "rada");

    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.chyba.length).toBeGreaterThan(0);
  });
});

describe("occurrence větev v kalendáři (vynecheneVyskyty)", () => {
  it("vynechaný výskyt zmizí, zbytek týdenní řady zůstává", () => {
    const plnaRada = vyskytySchuzky(tydenniSchuzka(), 2026, 10);
    expect(plnaRada).toContain("2026-10-13");

    const poVynechani = vyskytySchuzky(tydenniSchuzka(["2026-10-13"]), 2026, 10);

    expect(poVynechani).not.toContain("2026-10-13");
    expect(poVynechani).toEqual(plnaRada.filter((den) => den !== "2026-10-13"));
    expect(poVynechani.length).toBeGreaterThan(0);
  });

  it("udalostiProMesic: smazaný výskyt není v mapě, ostatní dny ano", () => {
    const mapa = udalostiProMesic(
      { expedice: [], schuzky: [tydenniSchuzka(["2026-10-13"])] },
      2026,
      10,
    );

    const smazanyDen = (mapa.get("2026-10-13") ?? []).filter(
      (udalost) => udalost.typ === "schuzka",
    );
    expect(smazanyDen).toHaveLength(0);
    expect((mapa.get("2026-10-06") ?? []).length).toBeGreaterThan(0);
    expect((mapa.get("2026-10-20") ?? []).length).toBeGreaterThan(0);
  });

  it("rada smazaná (schůzka chybí v seznamu) → v kalendáři po ní nic", () => {
    const mapa = udalostiProMesic({ expedice: [], schuzky: [] }, 2026, 10);

    const schuzkoveDny = [...mapa.values()].flat().filter((u) => u.typ === "schuzka");
    expect(schuzkoveDny).toHaveLength(0);
  });
});

describe("žádná regrese výpisu výprav (Expedition delete nedotčen)", () => {
  it("smazVypravu je stále exportovaná funkce expedic", () => {
    expect(typeof smazVypravu).toBe("function");
  });

  it("smazVypravu míří na /api/expeditions/:id (ne na meetings)", async () => {
    const zachyt: ZachyceneVolani[] = [];
    mockSekvence([odpovedJson({ ok: true }, 200)], zachyt);

    await smazVypravu("vyprava-1");

    expect(zachyt).toHaveLength(1);
    expect(zachyt[0]?.metoda).toBe("DELETE");
    expect(zachyt[0]?.url ?? "").toContain("/api/expeditions/vyprava-1");
    expect(zachyt[0]?.url ?? "").not.toContain("/api/meetings");
  });
});
