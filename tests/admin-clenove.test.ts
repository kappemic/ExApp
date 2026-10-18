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
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HTTP_STATUS_PRO_KOD } from "../src/shared/api-types";
import { nactiCleny, smazClena } from "../src/lib/admin-clenove";
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
      telefon: "+420777111222",
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

  it("null telefon (nevyplněn) projde", async () => {
    const clen: Record<string, unknown> = dobryClen();
    clen["telefon"] = null;
    mockFetch(odpovedJson({ users: [clen] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data[0]?.telefon).toBeNull();
    }
  });

  it("chybějící telefon odpověď odmítne", async () => {
    const clen: Record<string, unknown> = dobryClen();
    delete clen["telefon"];
    mockFetch(odpovedJson({ users: [clen] }, 200));
    const vysledek = await nactiCleny();
    expect(vysledek.ok).toBe(false);
  });
});

describe("smazClena — DELETE /api/users/:id (mock fetch, bez HTTP)", () => {
  const API_ZAKLAD = "https://api.test";
  const ID = "11111111-1111-4111-8111-111111111111";

  function odpovedJson(telo: unknown, status: number): Response {
    return new Response(JSON.stringify(telo), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("200 a { ok: true } je úspěch a volá DELETE na detail uživatele", async () => {
    const volani: Array<{ url: string; method: string; credentials: RequestCredentials | undefined }> = [];
    vi.stubGlobal("fetch", (vstup: RequestInfo | URL, init?: RequestInit) => {
      volani.push({
        url: String(vstup),
        method: init?.method ?? "GET",
        credentials: init?.credentials,
      });
      return Promise.resolve(odpovedJson({ ok: true }, 200));
    });
    const vysledek = await smazClena(ID);
    expect(vysledek.ok).toBe(true);
    expect(volani).toEqual([
      {
        url: `${API_ZAKLAD}/api/users/${ID}`,
        method: "DELETE",
        credentials: "include",
      },
    ]);
  });

  it("403 vlastní účet vrátí českou hlášku ze serveru", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          odpovedJson(
            {
              error: {
                code: "ZAKAZANO",
                message: "Vlastní účet z administrace smazat nejde.",
              },
            },
            403,
          ),
        ),
    );
    const vysledek = await smazClena(ID);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Vlastní účet z administrace smazat nejde.");
      expect(vysledek.kod).toBe("ZAKAZANO");
    }
  });

  it("pád sítě vrátí offline hlášku", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    const vysledek = await smazClena(ID);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toContain("Bez připojení");
    }
  });
});

describe("DELETE /api/users/:id — admin guard a zákaz vlastního účtu", () => {
  it("route hlídá vyzadujAdmina a porovná id session", () => {
    const server = readFileSync("server/src/index.ts", "utf8");
    const start = server.indexOf("app.delete(\"/api/users/:id\"");
    expect(start).toBeGreaterThan(-1);
    const konec = server.indexOf("app.delete(", start + 10);
    const route = server.slice(start, konec === -1 ? undefined : konec);
    expect(route).toContain("vyzadujAdmina");
    expect(route).toContain("session.id === id");
    expect(route).toContain("Vlastní účet z administrace smazat nejde.");
  });
});

describe("GET /api/users — čtení pro přihlášené, úprava dál jen admin", () => {
  it("seznam hlídá přihlášení a mapper nese telefon", () => {
    const server = readFileSync("server/src/index.ts", "utf8");
    const start = server.indexOf("app.get(\"/api/users\"");
    expect(start).toBeGreaterThan(-1);
    const konec = server.indexOf("app.patch(\"/api/users/:id\"");
    const usek = server.slice(start, konec);
    expect(usek).toContain("vyzadujPrihlaseni");
    expect(usek).not.toContain("vyzadujAdmina");
    expect(usek).toContain("telefon:");
    const patch = server.slice(konec, server.indexOf("app.delete(\"/api/users/:id\""));
    expect(patch).toContain("vyzadujAdmina");
  });
});
