/**
 * tests/strava-kontrakt.test.ts — Krok 0 Fáze 4: kontrakt §15
 * (Strava + osobní statistiky + žebříček, PRD 2.3).
 * Cesty, PRISTUP_STRAVA, MATICE_STRAVA a guardi odpovědí z kontraktu
 * `src/shared/api-types.ts`. Bez DB, bez HTTP — čistě hranice a tvary.
 * Strict TS, žádný `any`. Secrety (access/refresh token) nesmí projít
 * žádným guardem — do API odpovědí nepatří (jen DB + server-only).
 */
import { describe, expect, it } from "vitest";
import {
  MATICE_STRAVA,
  PRISTUP_STRAVA,
  STATISTIKY_MOJE_PATH,
  STATISTIKY_VZOR,
  STRAVA_AUTH_PATH,
  STRAVA_CALLBACK_PATH,
  ZEBRICEK_PATH,
  jeApiAktivita,
  jeStatistikyOdpoved,
  jeStravaTokens,
  jeZebricekOdpoved,
  statistikyPath,
  type ApiAktivita,
  type StatistikyResponse,
  type StravaCesta,
  type StravaTokens,
  type UserId,
  type ZebricekResponse,
} from "../src/shared/api-types";

function userId(id: string): UserId {
  return id as UserId;
}

function dobryStav(): StravaTokens {
  return {
    userId: userId("11111111-1111-1111-1111-111111111111"),
    stravaId: "12345678",
    scope: "read,activity:read",
    expirace: "2026-10-12T20:00:00.000Z",
    updatedAt: "2026-10-12T19:00:00.000Z",
  };
}

function dobraAktivita(): ApiAktivita {
  return {
    id: "a01",
    expeditionId: "sumava-trijezerska-slat",
    km: 14.2,
    prevyseniM: 380,
    stravaActivityId: "987654321",
    trasaPolyline: "abcABC123",
  };
}

describe("cesty §15", () => {
  it("literály cest odpovídají REST vzoru (plural, bez sloves)", () => {
    expect(STRAVA_AUTH_PATH).toBe("/api/strava/auth");
    expect(STRAVA_CALLBACK_PATH).toBe("/api/strava/callback");
    expect(STATISTIKY_VZOR).toBe("/api/statistiky/:userId");
    expect(ZEBRICEK_PATH).toBe("/api/zebricek");
  });

  it("statistikyPath staví URL detailu statistiky", () => {
    expect(statistikyPath("uzivatel-1")).toBe("/api/statistiky/uzivatel-1");
  });
});

describe("PRISTUP_STRAVA", () => {
  it("OAuth start i callback smí jen přihlášený (USER)", () => {
    expect(PRISTUP_STRAVA[STRAVA_AUTH_PATH]).toBe("USER");
    expect(PRISTUP_STRAVA[STRAVA_CALLBACK_PATH]).toBe("USER");
  });

  it("osobní statistiky čte přihlášený, žebříček každý (PUBLIC)", () => {
    expect(PRISTUP_STRAVA[STATISTIKY_VZOR]).toBe("USER");
    expect(PRISTUP_STRAVA[STATISTIKY_MOJE_PATH]).toBe("USER");
    expect(PRISTUP_STRAVA[ZEBRICEK_PATH]).toBe("PUBLIC");
  });
});

describe("MATICE_STRAVA", () => {
  it("kdo v každém řádku odpovídá PRISTUP_STRAVA pro danou cestu", () => {
    expect(MATICE_STRAVA.length).toBeGreaterThan(0);
    for (const radek of MATICE_STRAVA) {
      expect(radek.kdo).toBe(PRISTUP_STRAVA[radek.cesta as StravaCesta]);
    }
  });

  it("matice používá jen metody GET a známé cesty §15", () => {
    const znameCesty: readonly string[] = [
      STRAVA_AUTH_PATH,
      STRAVA_CALLBACK_PATH,
      STATISTIKY_VZOR,
      STATISTIKY_MOJE_PATH,
      ZEBRICEK_PATH,
    ];
    for (const radek of MATICE_STRAVA) {
      expect(radek.metoda).toBe("GET");
      expect(znameCesty).toContain(radek.cesta);
    }
  });
});

describe("jeStravaTokens (stav propojení — nikdy secrety)", () => {
  it("platný stav projde", () => {
    expect(jeStravaTokens(dobryStav())).toBe(true);
  });

  it("nepropojený účet (stravaId null) projde", () => {
    expect(jeStravaTokens({ ...dobryStav(), stravaId: null })).toBe(true);
  });

  it("odpověď s access_token neprojde (SECRET do kontraktu nepatří)", () => {
    expect(
      jeStravaTokens({ ...dobryStav(), access_token: "tajne" }),
    ).toBe(false);
  });

  it("odpověď s refresh_token neprojde", () => {
    expect(
      jeStravaTokens({ ...dobryStav(), refresh_token: "tajne" }),
    ).toBe(false);
  });

  it("špatný typ pole neprojde", () => {
    expect(jeStravaTokens({ ...dobryStav(), scope: 42 })).toBe(false);
    expect(jeStravaTokens(null)).toBe(false);
    expect(jeStravaTokens([])).toBe(false);
  });
});

describe("jeApiAktivita (spárovaná aktivita k výpravě)", () => {
  it("platná aktivita s čísly projde", () => {
    expect(jeApiAktivita(dobraAktivita())).toBe(true);
  });

  it("nespárovaná aktivita (vše null) projde", () => {
    expect(
      jeApiAktivita({
        id: "a02",
        expeditionId: "krkonose-snezka",
        km: null,
        prevyseniM: null,
        stravaActivityId: null,
        trasaPolyline: null,
      }),
    ).toBe(true);
  });

  it("km jako řetězec neprojde", () => {
    expect(jeApiAktivita({ ...dobraAktivita(), km: "14,2" })).toBe(false);
  });

  it("chybějící expeditionId neprojde", () => {
    const { expeditionId: _zahozene, ...bezVypravy } = dobraAktivita();
    expect(jeApiAktivita(bezVypravy)).toBe(false);
  });
});

describe("jeStatistikyOdpoved (osobní statistiky)", () => {
  function dobraOdpoved(): StatistikyResponse {
    return {
      userId: userId("11111111-1111-1111-1111-111111111111"),
      jmeno: "Anna Nováková",
      vypravy: 3,
      kmCelkem: 42.5,
      prevyseniCelkem: 900,
      aktivity: [dobraAktivita()],
    };
  }

  it("platná odpověď projde", () => {
    expect(jeStatistikyOdpoved(dobraOdpoved())).toBe(true);
  });

  it("odpověď s nevalidní aktivitou neprojde", () => {
    expect(
      jeStatistikyOdpoved({
        ...dobraOdpoved(),
        aktivity: [{ ...dobraAktivita(), km: "hodně" }],
      }),
    ).toBe(false);
  });

  it("odpověď bez jména neprojde", () => {
    const { jmeno: _zahozene, ...bezJmena } = dobraOdpoved();
    expect(jeStatistikyOdpoved(bezJmena)).toBe(false);
  });
});

describe("jeZebricekOdpoved (žebříček členů)", () => {
  function dobryZebricek(): ZebricekResponse {
    return {
      zebricek: [
        {
          userId: userId("11111111-1111-1111-1111-111111111111"),
          jmeno: "Anna Nováková",
          vypravy: 5,
          km: 60.1,
        },
        {
          userId: userId("22222222-2222-2222-2222-222222222222"),
          jmeno: "Petr Dvořák",
          vypravy: 2,
          km: 18.4,
        },
      ],
    };
  }

  it("prázdný žebříček projde", () => {
    expect(jeZebricekOdpoved({ zebricek: [] })).toBe(true);
  });

  it("platný žebříček projde", () => {
    expect(jeZebricekOdpoved(dobryZebricek())).toBe(true);
  });

  it("řádek se špatným typem neprojde", () => {
    expect(
      jeZebricekOdpoved({
        zebricek: [{ ...dobryZebricek().zebricek[0], km: "60" }],
      }),
    ).toBe(false);
  });
});
