/**
 * tests/expedice-klient.test.ts — Krok 1b: expedice klient bez HTTP.
 * Mockne globální `fetch` (žádné destruktivní SQL, žádný secret v testech)
 * a ověřuje `src/lib/expeditions-ucast.ts` ve stylu
 * expedition-fotky-klient.test.ts: ok, 401, 403, 404, 422 s chybyPoli,
 * offline/500 + české hlášky.
 * Pokryto: prihlasNaVypravu / odhlasZVypravy / upravVypravu /
 * smazVypravu / uzavriVypravu.
 * Strict TypeScript, žádný `any`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  odhlasZVypravy,
  prihlasNaVypravu,
  smazVypravu,
  upravVypravu,
  uzavriVypravu,
} from "../src/lib/expeditions-ucast";
import type { ApiExpedice, ApiUcastnik } from "../src/shared/api-types";

const API_ZAKLAD = "https://api.test";
const ID_VYPRAVY = "vyprava-1";
const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

interface ZachyceneVolani {
  url: string;
  metoda: string;
  telo: string | undefined;
}

function dobraExpedice(): ApiExpedice {
  return {
    id: ID_VYPRAVY,
    nazev: "Tříjezerní slať",
    datum: "2026-10-18",
    datumDo: null,
    sraz: "Nádraží 8:00",
    popis: "Podzimní výprava.",
    trasaOdkaz: "",
    kapacita: { prihlaseno: 1, celkem: 20 },
    stav: "volno",
  };
}

function dobryUcastnik(): ApiUcastnik {
  return {
    id: "u1",
    expeditionId: ID_VYPRAVY,
    userId: null,
    clenId: "c01",
    jmeno: "Anna Nováková",
    status: "prihlasen",
    createdAt: "2026-10-01T10:00:00.000Z",
  };
}

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chybaApi(kod: string, zprava: string, status: number): Response {
  return odpovedJson({ error: { code: kod, message: zprava } }, status);
}

function mockFetch(
  odpoved: Response,
  zachyt?: ZachyceneVolani,
): void {
  const mock: typeof fetch = (
    vstup: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    if (zachyt !== undefined) {
      zachyt.url = String(vstup);
      zachyt.metoda = init?.method ?? "GET";
      const teloInit = init?.body;
      zachyt.telo = typeof teloInit === "string" ? teloInit : undefined;
    }
    return Promise.resolve(odpoved);
  };
  vi.stubGlobal("fetch", mock);
}

function mockFetchOffline(): void {
  const mock: typeof fetch = () => Promise.reject(new Error("offline"));
  vi.stubGlobal("fetch", mock);
}

function noveZachyceni(): ZachyceneVolani {
  return { url: "", metoda: "", telo: undefined };
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("prihlasNaVypravu — klient bez HTTP (mock fetch)", () => {
  it("201 přihlásí (POST /prihlasit) a vrátí účastníka + expedici", async () => {
    const zachyt = noveZachyceni();
    mockFetch(
      odpovedJson(
        { ucastnik: dobryUcastnik(), expedice: dobraExpedice() },
        201,
      ),
      zachyt,
    );
    const vysledek = await prihlasNaVypravu(ID_VYPRAVY);
    expect(zachyt.url).toBe(
      `${API_ZAKLAD}/api/expeditions/${ID_VYPRAVY}/prihlasit`,
    );
    expect(zachyt.metoda).toBe("POST");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.ucastnik.jmeno).toBe("Anna Nováková");
    }
  });

  it("409 KAPACITA_PLNA nese českou hlášku s kódem", async () => {
    mockFetch(chybaApi("KAPACITA_PLNA", "Výprava je plná.", 409));
    const vysledek = await prihlasNaVypravu(ID_VYPRAVY);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Výprava je plná.");
      expect(vysledek.kod).toBe("KAPACITA_PLNA");
    }
  });

  it("401 NEPRIHLASEN nese českou hlášku", async () => {
    mockFetch(chybaApi("NEPRIHLASEN", "Nejsi přihlášen.", 401));
    const vysledek = await prihlasNaVypravu(ID_VYPRAVY);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Nejsi přihlášen.");
      expect(vysledek.kod).toBe("NEPRIHLASEN");
    }
  });

  it("offline vrátí českou hlášku (bez připojení)", async () => {
    mockFetchOffline();
    const vysledek = await prihlasNaVypravu(ID_VYPRAVY);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe(
        "Bez připojení se přihlásit nejde. Zkus to později.",
      );
    }
  });
});

describe("odhlasZVypravy — klient bez HTTP (mock fetch)", () => {
  it("200 odhlásí (DELETE /odhlasit, idempotentní)", async () => {
    const zachyt = noveZachyceni();
    mockFetch(odpovedJson({ ok: true, expedice: dobraExpedice() }, 200), zachyt);
    const vysledek = await odhlasZVypravy(ID_VYPRAVY);
    expect(zachyt.url).toBe(
      `${API_ZAKLAD}/api/expeditions/${ID_VYPRAVY}/odhlasit`,
    );
    expect(zachyt.metoda).toBe("DELETE");
    expect(vysledek.ok).toBe(true);
  });

  it("offline hlásí bez připojení česky", async () => {
    mockFetchOffline();
    const vysledek = await odhlasZVypravy(ID_VYPRAVY);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe(
        "Bez připojení se odhlásit nejde. Zkus to později.",
      );
    }
  });
});

describe("upravVypravu — klient bez HTTP (mock fetch)", () => {
  it("200 uloží změny (PATCH /api/expeditions/:id)", async () => {
    const zachyt = noveZachyceni();
    mockFetch(odpovedJson({ expedice: dobraExpedice() }, 200), zachyt);
    const vysledek = await upravVypravu(ID_VYPRAVY, { nazev: "Nový název" });
    expect(zachyt.url).toBe(`${API_ZAKLAD}/api/expeditions/${ID_VYPRAVY}`);
    expect(zachyt.metoda).toBe("PATCH");
    expect(vysledek.ok).toBe(true);
  });

  it("422 mapuje chybyPoli z details (první hláška pole)", async () => {
    mockFetch(
      odpovedJson(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Zkontroluj zvýrazněná pole.",
            details: { nazev: ["Název výpravy musí mít aspoň 3 znaky."] },
          },
        },
        422,
      ),
    );
    const vysledek = await upravVypravu(ID_VYPRAVY, { nazev: "x" });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("VALIDATION_ERROR");
      expect(vysledek.chyba).toBe("Zkontroluj zvýrazněná pole.");
      expect(vysledek.chybyPoli?.["nazev"]).toBe(
        "Název výpravy musí mít aspoň 3 znaky.",
      );
    }
  });

  it("403 ZAKAZANO nese českou hlášku (USER bez práva)", async () => {
    mockFetch(chybaApi("ZAKAZANO", "Na tohle nemáš právo.", 403));
    const vysledek = await upravVypravu(ID_VYPRAVY, { nazev: "Nový název" });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Na tohle nemáš právo.");
      expect(vysledek.kod).toBe("ZAKAZANO");
    }
  });

  it("offline hlásí bez připojení česky (uložit)", async () => {
    mockFetchOffline();
    const vysledek = await upravVypravu(ID_VYPRAVY, { nazev: "Nový název" });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Bez připojení uložit nejde. Zkus to později.");
    }
  });
});

describe("smazVypravu — klient bez HTTP (mock fetch)", () => {
  it("200 smaže (DELETE /api/expeditions/:id, ne meetings)", async () => {
    const zachyt = noveZachyceni();
    mockFetch(odpovedJson({ ok: true }, 200), zachyt);
    const vysledek = await smazVypravu(ID_VYPRAVY);
    expect(zachyt.metoda).toBe("DELETE");
    expect(zachyt.url).toBe(`${API_ZAKLAD}/api/expeditions/${ID_VYPRAVY}`);
    expect(zachyt.url).not.toContain("/api/meetings");
    expect(vysledek.ok).toBe(true);
  });

  it("404 NENALEZENO nese českou hlášku s kódem", async () => {
    mockFetch(chybaApi("NENALEZENO", "Výprava nenalezena.", 404));
    const vysledek = await smazVypravu("neexistuje");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Výprava nenalezena.");
      expect(vysledek.kod).toBe("NENALEZENO");
    }
  });

  it("500 bez tvaru chyby vrátí obecnou českou hlášku", async () => {
    mockFetch(odpovedJson({ neco: "rozbité" }, 500));
    const vysledek = await smazVypravu(ID_VYPRAVY);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe(OBECNA_CHYBA);
    }
  });

  it("offline hlásí bez připojení česky (smazat)", async () => {
    mockFetchOffline();
    const vysledek = await smazVypravu(ID_VYPRAVY);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Bez připojení smazat nejde. Zkus to později.");
    }
  });
});

describe("uzavriVypravu — klient bez HTTP (mock fetch)", () => {
  it("200 uzavře a pošle docházku (PATCH /uzavrit)", async () => {
    const zachyt = noveZachyceni();
    mockFetch(
      odpovedJson(
        { expedice: dobraExpedice(), ucastnici: [dobryUcastnik()] },
        200,
      ),
      zachyt,
    );
    const vysledek = await uzavriVypravu(ID_VYPRAVY, [
      { ucastnikId: "u1", status: "ucastnil_se" },
    ]);
    expect(zachyt.url).toBe(
      `${API_ZAKLAD}/api/expeditions/${ID_VYPRAVY}/uzavrit`,
    );
    expect(zachyt.metoda).toBe("PATCH");
    expect(zachyt.telo).toContain("ucastnil_se");
    expect(vysledek.ok).toBe(true);
  });

  it("422 prázdná docházka nese českou hlášku", async () => {
    mockFetch(chybaApi("VALIDATION_ERROR", "Vyber aspoň jednoho účastníka.", 422));
    const vysledek = await uzavriVypravu(ID_VYPRAVY, []);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Vyber aspoň jednoho účastníka.");
      expect(vysledek.kod).toBe("VALIDATION_ERROR");
    }
  });

  it("offline hlásí bez připojení česky (uzavřít)", async () => {
    mockFetchOffline();
    const vysledek = await uzavriVypravu(ID_VYPRAVY, [
      { ucastnikId: "u1", status: "ucastnil_se" },
    ]);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.chyba).toBe("Bez připojení uzavřít nejde. Zkus to později.");
    }
  });
});
