/**
 * tests/strava-oauth.test.ts — Krok 1 Fáze 4: Strava OAuth + správa tokenů.
 *
 * Hranice a čistá logika bez DB a bez HTTP:
 * - `validujStravaCallback` (server/src/validace.ts) — validace `code/state`
 *   na hranici, chybný `code` → neúspěch s polem `code` (route složí 422).
 * - `sestavStravaAuthUrl` (server/src/strava.ts) — stavba authorize URL
 *   jen z veřejného CLIENT_ID (SECRET se do URL nikdy nedostane).
 * - Mock výměna `code → tokens` (STRAVA_MOCK=1) — fixture bez reálného
 *   CLIENT_ID / SECRETu pro testy a localhost.
 * - `jeTokenExpirovany` — rozhodnutí o auto-refreshi (rezerva 5 minut).
 * - Klientský bundle (`src/lib/strava-api.ts`, `src/pages/ProfilPage.tsx`)
 *   nesmí obsahovat SECRET (klíč i hodnotu hlídá grep v závěru kroku).
 * Strict TS, žádný `any`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STRAVA_FETCH_TIMEOUT_MS,
  STRAVA_SCOPE_DEFAULT,
  ctiStravaClientId,
  jeRealneClientId,
  jeTokenExpirovany,
  sestavStravaAuthUrl,
  sestavStravaCallbackRedirect,
  vymenCodeZaTokeny,
  StravaVymenaChyba,
} from "../server/src/strava";
import {
  HTTP_STATUS_PRO_KOD,
  STRAVA_AUTH_URL_PATH,
  STRAVA_CALLBACK_DUVOD_ZPRAVY,
} from "../src/shared/api-types";
import { jePlatnyStravaState, validujStravaCallback } from "../server/src/validace";
import { prelozStravaDuvod } from "../src/lib/strava-api";

describe("validujStravaCallback (hranice GET /api/strava/callback)", () => {
  it("platný code projde (trim + state + scope)", () => {
    const vysledek = validujStravaCallback({
      code: "  mock-kod-123  ",
      state: "uzivatel-1",
      scope: "read,activity:read",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.code).toBe("mock-kod-123");
    expect(vysledek.data?.state).toBe("uzivatel-1");
  });

  it("chybějící code neprojde s polem code", () => {
    const vysledek = validujStravaCallback({ state: "uzivatel-1" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.data).toBeNull();
    expect(vysledek.chybyPoli["code"]?.length).toBeGreaterThan(0);
  });

  it("prázdný code neprojde", () => {
    const vysledek = validujStravaCallback({ code: "   " });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["code"]?.length).toBeGreaterThan(0);
  });

  it("code s nepovolenými znaky neprojde", () => {
    const vysledek = validujStravaCallback({ code: "<script>alert(1)</script>" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["code"]?.length).toBeGreaterThan(0);
  });

  it("příliš dlouhý code neprojde", () => {
    const vysledek = validujStravaCallback({ code: `${"a".repeat(513)}` });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["code"]?.length).toBeGreaterThan(0);
  });

  it("state je nepovinné (chybí → null), příliš dlouhé neprojde", () => {
    const bezState = validujStravaCallback({ code: "mock-kod-1" });
    expect(bezState.uspech).toBe(true);
    expect(bezState.data?.state).toBeNull();

    const dlouhyState = validujStravaCallback({
      code: "mock-kod-1",
      state: `${"s".repeat(257)}`,
    });
    expect(dlouhyState.uspech).toBe(false);
    expect(dlouhyState.chybyPoli["state"]?.length).toBeGreaterThan(0);
  });

  it("netělo (non-object) neprojde", () => {
    const vysledek = validujStravaCallback(null);
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.data).toBeNull();
  });
});

describe("sestavStravaAuthUrl (jen veřejné CLIENT_ID)", () => {
  const zaklad = {
    clientId: "12345",
    redirectUri: "http://localhost:3001/api/strava/callback",
    state: "uzivatel-1",
  };

  it("obsahuje client_id, response_type=code, redirect_uri, scope i state", () => {
    const url = sestavStravaAuthUrl(zaklad);
    expect(url.startsWith("https://www.strava.com/oauth/authorize?")).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("12345");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3001/api/strava/callback",
    );
    expect(parsed.searchParams.get("scope")).toBe(STRAVA_SCOPE_DEFAULT);
    expect(parsed.searchParams.get("state")).toBe("uzivatel-1");
    expect(parsed.searchParams.get("approval_prompt")).toBe("force");
  });

  it("SECRET se do URL nikdy nedostane", () => {
    const url = sestavStravaAuthUrl(zaklad).toLowerCase();
    expect(url).not.toContain("secret");
    expect(url).not.toContain("access_token");
    expect(url).not.toContain("refresh_token");
  });
});

describe("mock výměna code → tokens (STRAVA_MOCK=1)", () => {
  it("platný mock code vrátí fixture s expirací v budoucnosti", async () => {
    process.env["STRAVA_MOCK"] = "1";
    try {
      const vysledek = await vymenCodeZaTokeny("mock-kod-123");
      expect(vysledek.accessToken.length).toBeGreaterThan(0);
      expect(vysledek.refreshToken.length).toBeGreaterThan(0);
      expect(vysledek.athleteId.length).toBeGreaterThan(0);
      expect(vysledek.expirace.getTime()).toBeGreaterThan(Date.now());
      expect(vysledek.scope).toBe(STRAVA_SCOPE_DEFAULT);
    } finally {
      delete process.env["STRAVA_MOCK"];
    }
  });

  it("Strava odmítnutí vyhazuje StravaVymenaChyba (route složí 422)", async () => {
    process.env["STRAVA_MOCK"] = "1";
    try {
      await expect(vymenCodeZaTokeny("strava-odmita")).rejects.toBeInstanceOf(
        StravaVymenaChyba,
      );
    } finally {
      delete process.env["STRAVA_MOCK"];
    }
  });
});

describe("jeRealneClientId (Krok 7b — guard GET /api/strava/auth-url)", () => {
  it("číselné ID projde (200 s reálným URL)", () => {
    expect(jeRealneClientId("12345")).toBe(true);
  });

  it("mock-client-id neprojde (503 STRAVA_NENI_NASTAVENA)", () => {
    expect(jeRealneClientId("mock-client-id")).toBe(false);
  });

  it("prázdné / whitespace neprojde (503)", () => {
    expect(jeRealneClientId("")).toBe(false);
    expect(jeRealneClientId("   ")).toBe(false);
  });

  it("nečíselné a smíšené neprojde (503)", () => {
    expect(jeRealneClientId("abc")).toBe(false);
    expect(jeRealneClientId("12a45")).toBe(false);
    expect(jeRealneClientId("12 45")).toBe(false);
  });

  it("číselné s mezerami kolem projde (trim)", () => {
    expect(jeRealneClientId("  12345  ")).toBe(true);
  });
});

describe("ctiStravaClientId priorita (Krok 7b)", () => {
  const ZALOHA_CLIENT_ID = process.env["STRAVA_CLIENT_ID"];
  const ZALOHA_VITE_ID = process.env["VITE_STRAVA_CLIENT_ID"];
  const ZALOHA_MOCK = process.env["STRAVA_MOCK"];

  function uklid(): void {
    if (ZALOHA_CLIENT_ID === undefined) delete process.env["STRAVA_CLIENT_ID"];
    else process.env["STRAVA_CLIENT_ID"] = ZALOHA_CLIENT_ID;
    if (ZALOHA_VITE_ID === undefined) delete process.env["VITE_STRAVA_CLIENT_ID"];
    else process.env["VITE_STRAVA_CLIENT_ID"] = ZALOHA_VITE_ID;
    if (ZALOHA_MOCK === undefined) delete process.env["STRAVA_MOCK"];
    else process.env["STRAVA_MOCK"] = ZALOHA_MOCK;
  }

  it("bez ID a bez MOCKu vrací prázdné (route složí 503)", () => {
    delete process.env["STRAVA_CLIENT_ID"];
    delete process.env["VITE_STRAVA_CLIENT_ID"];
    delete process.env["STRAVA_MOCK"];
    try {
      const id = ctiStravaClientId();
      expect(jeRealneClientId(id)).toBe(false);
    } finally {
      uklid();
    }
  });

  it("s číselným ID vrací reálné ID (route složí 200)", () => {
    delete process.env["STRAVA_MOCK"];
    process.env["STRAVA_CLIENT_ID"] = "12345";
    try {
      const id = ctiStravaClientId();
      expect(id).toBe("12345");
      expect(jeRealneClientId(id)).toBe(true);
    } finally {
      uklid();
    }
  });

  it("STRAVA_MOCK=1 + reálné ID → reálné ID má prioritu (200 reálné)", () => {
    process.env["STRAVA_MOCK"] = "1";
    process.env["STRAVA_CLIENT_ID"] = "12345";
    try {
      const id = ctiStravaClientId();
      expect(id).toBe("12345");
      expect(jeRealneClientId(id)).toBe(true);
    } finally {
      uklid();
    }
  });

  it("kontrakt mapuje STRAVA_NENI_NASTAVENA na 503", () => {
    expect(HTTP_STATUS_PRO_KOD["STRAVA_NENI_NASTAVENA"]).toBe(503);
  });
});

describe("jeTokenExpirovany (auto-refresh před každým voláním Stravy)", () => {
  it("expirace za hodinu není expirovaná", () => {
    const expirace = new Date(Date.now() + 60 * 60 * 1000);
    expect(jeTokenExpirovany(expirace, new Date())).toBe(false);
  });

  it("expirace za 2 minuty je expirovaná (rezerva 5 minut)", () => {
    const expirace = new Date(Date.now() + 2 * 60 * 1000);
    expect(jeTokenExpirovany(expirace, new Date())).toBe(true);
  });

  it("prošlá expirace je expirovaná", () => {
    const expirace = new Date(Date.now() - 1000);
    expect(jeTokenExpirovany(expirace, new Date())).toBe(true);
  });
});

describe("Krok 9 — auth-url audit (client_id / redirect / scope / approval)", () => {
  it("s fake číselným ID jde sestavit validní Strava URL", () => {
    const url = sestavStravaAuthUrl({
      clientId: "123456",
      redirectUri: "http://localhost:3001/api/strava/callback",
      state: "uzivatel-1",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://www.strava.com/oauth/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("123456");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3001/api/strava/callback",
    );
    expect(parsed.searchParams.get("scope")).toBe("read,activity:read");
    expect(parsed.searchParams.get("approval_prompt")).toBe("force");
    expect(parsed.searchParams.get("state")).toBe("uzivatel-1");
  });

  it("kontrakt zná auth-url cestu", () => {
    expect(STRAVA_AUTH_URL_PATH).toBe("/api/strava/auth-url");
  });
});

describe("Krok 9 — state guard na auth-url (CSRF vazba)", () => {
  it("běžný userId projde", () => {
    expect(jePlatnyStravaState("uzivatel-1")).toBe(true);
  });

  it("prázdný state je povolený (auth-url ho pak vynechá)", () => {
    expect(jePlatnyStravaState("")).toBe(true);
  });

  it("script / mezery / příliš dlouhý neprojde", () => {
    expect(jePlatnyStravaState("<script>alert(1)</script>")).toBe(false);
    expect(jePlatnyStravaState("a b")).toBe(false);
    expect(jePlatnyStravaState("s".repeat(257))).toBe(false);
  });
});

describe("Krok 9 — callback redirect s českým důvodem", () => {
  it("propojeno nemá důvod", () => {
    expect(
      sestavStravaCallbackRedirect("http://localhost:5173", "propojeno"),
    ).toBe("http://localhost:5173/profil?strava=propojeno");
  });

  it("chyba nese duvod (neplatný kód)", () => {
    expect(
      sestavStravaCallbackRedirect("http://localhost:5173", "chyba", "neplatny-kod"),
    ).toBe("http://localhost:5173/profil?strava=chyba&duvod=neplatny-kod");
  });

  it("nebezpečný důvod se zahodí (jen allowlist)", () => {
    expect(
      sestavStravaCallbackRedirect(
        "http://localhost:5173",
        "chyba",
        "<script>",
      ),
    ).toBe("http://localhost:5173/profil?strava=chyba&duvod=neznama-chyba");
  });

  it("kontrakt nese české hlášky důvodů", () => {
    expect(STRAVA_CALLBACK_DUVOD_ZPRAVY["odepreno"]?.length).toBeGreaterThan(0);
    expect(STRAVA_CALLBACK_DUVOD_ZPRAVY["neplatny-kod"]?.length).toBeGreaterThan(0);
    expect(STRAVA_CALLBACK_DUVOD_ZPRAVY["strava-odmitla"]?.length).toBeGreaterThan(0);
  });

  it("klient přeloží důvod česky, neznámý → obecná hláška", () => {
    expect(prelozStravaDuvod("odepreno")).toContain("Stravě");
    expect(prelozStravaDuvod("neznamy-nesmysl")).toContain("Zkus");
  });
});

describe("Krok 9 — fetch timeout (žádné visící volání Stravy)", () => {
  it("timeout je 10 s", () => {
    expect(STRAVA_FETCH_TIMEOUT_MS).toBe(10_000);
  });
});

describe("klientský bundle nikdy nenese SECRET", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("src/lib/strava-api.ts čte jen VITE_STRAVA_CLIENT_ID", () => {
    const obsah = cti("src/lib/strava-api.ts");
    expect(obsah).toContain("VITE_STRAVA_CLIENT_ID");
    expect(obsah.toLowerCase()).not.toContain("strava_client_secret");
    expect(obsah).not.toContain("STRAVA_CLIENT_SECRET");
  });

  it("src/pages/ProfilPage.tsx nenese SECRET", () => {
    const obsah = cti("src/pages/ProfilPage.tsx");
    expect(obsah).not.toContain("STRAVA_CLIENT_SECRET");
    expect(obsah.toLowerCase()).not.toContain("strava_client_secret");
  });

  it("scripts/over-strava.ts nikdy nečte ani netiskne hodnotu secretu", () => {
    const obsah = cti("scripts/over-strava.ts");
    // Název proměnné v návodu je v pořádku — zakázané je číst/tisknout
    // její HODNOTU (secret by unikl do logu).
    expect(obsah).not.toContain('process.env["STRAVA_CLIENT_SECRET"]');
    expect(obsah).not.toContain("process.env.STRAVA_CLIENT_SECRET");
    expect(obsah).not.toContain("accessToken");
    expect(obsah).not.toContain("refreshToken");
    expect(obsah).not.toContain("access_token");
    expect(obsah).not.toContain("refresh_token");
  });
});
