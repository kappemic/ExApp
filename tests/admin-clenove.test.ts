/**
 * tests/admin-clenove.test.ts — TDD RED: PATCH users 3D role (bez DB, bez HTTP).
 *
 * Spec (normativní):
 * - PATCH users přijímá `clenstvi?/funkce?/isAdmin?/skola?/trida?`
 *   (parciální) NEBO staré `{ role }` — nikdy obojí najednou (obojí → 422).
 * - Pravidlo 3D: funkce jen s aktivni_clen; isAdmin ortogonální.
 *
 * RED stav: `validujUpravuUzivatele` v `server/src/validace.ts` zatím
 * neexistuje (collection chyba = red). Původní `validujUpravuRoleUzivatele`
 * existuje a staré `{ role }` přes něj dál prochází (kontrakt se neláme).
 * Ne-admin zamítnutí se na route úrovni bez DB netestuje (záměrně vynecháno).
 * Klientský guard `jeUserListItem` (src/lib/admin-clenove.ts) se testuje
 * přes veřejné `nactiCleny` s mocknutým fetchem (žádné HTTP, žádná DB):
 * `skola`/`trida` musí být string (i ""), jiný tvar odpověď odmítne.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HTTP_STATUS_PRO_KOD } from "../src/shared/api-types";
import { nactiCleny } from "../src/lib/admin-clenove";
import {
  validujUpravuRoleUzivatele,
  validujUpravuUzivatele,
} from "../server/src/validace";

describe("PATCH users — parciální 3D trio (clenstvi/funkce/isAdmin/skola/trida)", () => {
  it("samotné clenstvi projde", () => {
    const vysledek = validujUpravuUzivatele({ clenstvi: "aktivni_clen" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ clenstvi: "aktivni_clen" });
  });

  it("celé trio clenstvi + funkce + isAdmin projde", () => {
    const vysledek = validujUpravuUzivatele({
      clenstvi: "aktivni_clen",
      funkce: "vedeni",
      isAdmin: false,
    });
    expect(vysledek.uspech).toBe(true);
  });

  it("samotné isAdmin projde (ortogonální příznak)", () => {
    const vysledek = validujUpravuUzivatele({ isAdmin: true });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ isAdmin: true });
  });

  it("parciální skola + trida projdou (trim, max 120)", () => {
    const vysledek = validujUpravuUzivatele({
      skola: "  ZŠ Lesní  ",
      trida: "  5.A  ",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ skola: "ZŠ Lesní", trida: "5.A" });
  });
});

describe("PATCH users — zpětná kompatibilita starého {role}", () => {
  it("původní validátor přijme {role} (stávající kontrakt se neláme)", () => {
    const vysledek = validujUpravuRoleUzivatele({ role: "clen" });
    expect(vysledek.uspech).toBe(true);
  });

  it("nový validátor přijme i samotné staré {role}", () => {
    const vysledek = validujUpravuUzivatele({ role: "clen" });
    expect(vysledek.uspech).toBe(true);
  });
});

describe("PATCH users — exkluzivita (nikdy obojí najednou → 422)", () => {
  it("VALIDATION_ERROR mapuje na 422 (kontrakt)", () => {
    expect(HTTP_STATUS_PRO_KOD["VALIDATION_ERROR"]).toBe(422);
  });

  it("role + clenstvi najednou neprojde", () => {
    const vysledek = validujUpravuUzivatele({
      role: "clen",
      clenstvi: "clen",
    });
    expect(vysledek.uspech).toBe(false);
    expect(Object.keys(vysledek.chybyPoli).length).toBeGreaterThan(0);
  });

  it("role + isAdmin najednou neprojde", () => {
    const vysledek = validujUpravuUzivatele({ role: "clen", isAdmin: true });
    expect(vysledek.uspech).toBe(false);
    expect(Object.keys(vysledek.chybyPoli).length).toBeGreaterThan(0);
  });

  it("clen + funkce neprojde (3D pravidlo i na PATCH úrovni)", () => {
    const vysledek = validujUpravuUzivatele({
      clenstvi: "clen",
      funkce: "vedeni",
    });
    expect(vysledek.uspech).toBe(false);
    expect(Object.keys(vysledek.chybyPoli).length).toBeGreaterThan(0);
  });
});

describe("nactiCleny — guard/mapper se skola/trida/discordNick (mock fetch, bez HTTP)", () => {
  const API_ZAKLAD = "https://api.test";

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

  function dobryClen(): Record<string, unknown> {
    return {
      id: "11111111-1111-4111-8111-111111111111",
      jmeno: "Anežka Nová",
      email: "anezka@example.cz",
      role: "clen",
      clenstvi: "clen",
      funkce: null,
      isAdmin: false,
      skola: "ZŠ Lesní",
      trida: "5.A",
      discordNick: "anezka.hraje",
    };
  }

  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("platný tvar se skola/trida projde a state nese skutečné hodnoty", async () => {
    mockFetch(odpovedJson({ users: [dobryClen()] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data).toHaveLength(1);
      expect(vysledek.data[0]?.skola).toBe("ZŠ Lesní");
      expect(vysledek.data[0]?.trida).toBe("5.A");
    }
  });

  it("prázdné skola/trida ('' = nevyplněno) projdou", async () => {
    const clen: Record<string, unknown> = dobryClen();
    clen["skola"] = "";
    clen["trida"] = "";
    mockFetch(odpovedJson({ users: [clen] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data[0]?.skola).toBe("");
      expect(vysledek.data[0]?.trida).toBe("");
    }
  });

  it("chybějící skola/trida odpověď odmítne (špatný tvar)", async () => {
    const clen: Record<string, unknown> = dobryClen();
    delete clen["skola"];
    delete clen["trida"];
    mockFetch(odpovedJson({ users: [clen] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(false);
  });

  it("ne-string skola odpověď odmítne (špatný tvar)", async () => {
    const clen: Record<string, unknown> = dobryClen();
    clen["skola"] = 123;
    mockFetch(odpovedJson({ users: [clen] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(false);
  });

  it("platný discordNick projde a nese skutečnou hodnotu", async () => {
    mockFetch(odpovedJson({ users: [dobryClen()] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data[0]?.discordNick).toBe("anezka.hraje");
    }
  });

  it("null discordNick (nevyplněn) projde", async () => {
    const clen: Record<string, unknown> = dobryClen();
    clen["discordNick"] = null;
    mockFetch(odpovedJson({ users: [clen] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data[0]?.discordNick).toBeNull();
    }
  });

  it("ne-string ne-null discordNick odpověď odmítne (špatný tvar)", async () => {
    const clen: Record<string, unknown> = dobryClen();
    clen["discordNick"] = 123;
    mockFetch(odpovedJson({ users: [clen] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(false);
  });
});
