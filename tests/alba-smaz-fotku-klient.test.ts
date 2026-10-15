import { afterEach, describe, expect, it, vi } from "vitest";
import { smazFotkuAlba } from "../src/lib/alba-api";

describe("smazFotkuAlba — klient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("úspěšné DELETE vrátí ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })),
    );
    vi.stubEnv("VITE_API_BASE_URL", "http://test");
    const vysledek = await smazFotkuAlba("11111111-1111-4111-8111-111111111111", "f1");
    expect(vysledek.ok).toBe(true);
  });

  it("403 vrátí srozumitelnou chybu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: "ZAKAZANO", message: "Ne" } }),
      })),
    );
    vi.stubEnv("VITE_API_BASE_URL", "http://test");
    const vysledek = await smazFotkuAlba("11111111-1111-4111-8111-111111111111", "f1");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.chyba).toBe("Ne");
  });
});
