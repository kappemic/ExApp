/**
 * tests/strava-chyby-klient.test.ts — Step 3: klient rozlišuje větve chyb.
 *
 * TDD: RED = `druhStravaChyby / muzeOpakovatStravaChybu /
 * jeStravaNedostupnaVetev` ve `src/lib/strava-api.ts` neexistují a
 * `StravaParovani.tsx` nemá vlastní text/akci pro každou větev.
 * GREEN = helpery + větve v UI, retry jen kde pomůže, žádný auto-retry.
 *
 * Kontrakt (Step 2, server vrací 502 STRAVA_NEDOSTUPNA_ZPRAVA):
 * - VALIDATION_ERROR (422) → inline validační hláška, BEZ retry.
 * - STRAVA_NEDOSTUPNA (502) / network fail → „Propoj Stravu" + retry.
 * - 401 (NEPRIHLASEN…) → výzva k přihlášení; 403 (ZAKAZANO) → oprávnění.
 * - 409 (VYPRAVA_UZAVRENA, UZ_PRIHLASEN, KAPACITA_PLNA…) → konflikt, BEZ retry.
 *
 * Styl: repo nemá jsdom (viz tests/modal-confirm.test.ts) — lib se testuje
 * reálně s mocknutým fetch, .tsx zdroj-kontraktem (čtení src jako text).
 * Strict TS, žádný `any`. Small testy.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  druhStravaChyby,
  jeStravaNedostupnaVetev,
  muzeOpakovatStravaChybu,
  nactiNeparovaneAktivity,
  sparujAktivitu,
} from "../src/lib/strava-api";
import type { ApiErrorCode } from "../src/shared/api-types";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

const API = "src/lib/strava-api.ts";
const PAROVANI = "src/components/expeditions/StravaParovani.tsx";
const API_ZAKLAD = "https://api.test";
const VYPRAVA_ID = "vyprava-1";

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chybaApi(kod: ApiErrorCode, zprava: string, status: number): Response {
  return odpovedJson({ error: { code: kod, message: zprava } }, status);
}

function mockFetch(odpoved: Response): void {
  const mock: typeof fetch = () =>
    Promise.resolve(odpoved);
  vi.stubGlobal("fetch", mock);
}

function mockFetchOffline(): void {
  const mock: typeof fetch = () => Promise.reject(new Error("offline"));
  vi.stubGlobal("fetch", mock);
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("druhStravaChyby — každá větev má svůj druh", () => {
  it("VALIDATION_ERROR → validace", () => {
    expect(druhStravaChyby("VALIDATION_ERROR")).toBe("validace");
  });

  it("STRAVA_NEDOSTUPNA → strava-nedostupna (Step 2 mock 502)", () => {
    expect(druhStravaChyby("STRAVA_NEDOSTUPNA")).toBe("strava-nedostupna");
  });

  it("401 kódy → neprihlasen", () => {
    expect(druhStravaChyby("NEPRIHLASEN")).toBe("neprihlasen");
    expect(druhStravaChyby("KOD_NEPLATNY")).toBe("neprihlasen");
    expect(druhStravaChyby("SPATNE_HESLO")).toBe("neprihlasen");
  });

  it("ZAKAZANO → zakazano", () => {
    expect(druhStravaChyby("ZAKAZANO")).toBe("zakazano");
  });

  it("409 kódy → konflikt (uzavřená, duplicita, plná)", () => {
    expect(druhStravaChyby("VYPRAVA_UZAVRENA")).toBe("konflikt");
    expect(druhStravaChyby("UZ_PRIHLASEN")).toBe("konflikt");
    expect(druhStravaChyby("KAPACITA_PLNA")).toBe("konflikt");
  });

  it("zbytek (vnitřní chyba, neznámý kód) → obecna", () => {
    expect(druhStravaChyby("VNITRNI_CHYBA")).toBe("obecna");
    expect(druhStravaChyby("NENALEZENO")).toBe("obecna");
    expect(druhStravaChyby(undefined)).toBe("obecna");
  });
});

describe("muzeOpakovatStravaChybu — retry jen kde pomůže", () => {
  it("502 STRAVA_NEDOSTUPNA + network fail (bez kódu) + 500 → retry ano", () => {
    expect(muzeOpakovatStravaChybu("STRAVA_NEDOSTUPNA")).toBe(true);
    expect(muzeOpakovatStravaChybu(undefined)).toBe(true);
    expect(muzeOpakovatStravaChybu("VNITRNI_CHYBA")).toBe(true);
  });

  it("validace / 401 / 403 / 409 → retry ne (slepé opakování nepomůže)", () => {
    expect(muzeOpakovatStravaChybu("VALIDATION_ERROR")).toBe(false);
    expect(muzeOpakovatStravaChybu("NEPRIHLASEN")).toBe(false);
    expect(muzeOpakovatStravaChybu("ZAKAZANO")).toBe(false);
    expect(muzeOpakovatStravaChybu("VYPRAVA_UZAVRENA")).toBe(false);
    expect(muzeOpakovatStravaChybu("UZ_PRIHLASEN")).toBe(false);
    expect(muzeOpakovatStravaChybu("KAPACITA_PLNA")).toBe(false);
    expect(muzeOpakovatStravaChybu("NENALEZENO")).toBe(false);
  });
});

describe("jeStravaNedostupnaVetev — 502 i network fail sdílí větev", () => {
  it("STRAVA_NEDOSTUPNA i chybějící kód (síť) → stejná větev", () => {
    expect(jeStravaNedostupnaVetev("STRAVA_NEDOSTUPNA")).toBe(true);
    expect(jeStravaNedostupnaVetev(undefined)).toBe(true);
  });

  it("ostatní kódy do větve nepatří", () => {
    expect(jeStravaNedostupnaVetev("VALIDATION_ERROR")).toBe(false);
    expect(jeStravaNedostupnaVetev("NEPRIHLASEN")).toBe(false);
    expect(jeStravaNedostupnaVetev("VYPRAVA_UZAVRENA")).toBe(false);
  });
});

describe("klient nese kód až do UI (mock fetch, Step 2 502)", () => {
  it("502 STRAVA_NEDOSTUPNA z /neparovane → kod + retry povolen", async () => {
    mockFetch(
      chybaApi(
        "STRAVA_NEDOSTUPNA",
        "Strava je teď nedostupná. Zkus to prosím později.",
        502,
      ),
    );
    const vysledek = await nactiNeparovaneAktivity({ page: 1, per_page: 30 });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("STRAVA_NEDOSTUPNA");
      expect(druhStravaChyby(vysledek.kod)).toBe("strava-nedostupna");
      expect(muzeOpakovatStravaChybu(vysledek.kod)).toBe(true);
    }
  });

  it("network fail → bez kódu, ale retry povolen (stejná větev jako 502)", async () => {
    mockFetchOffline();
    const vysledek = await nactiNeparovaneAktivity({ page: 1, per_page: 30 });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(jeStravaNedostupnaVetev(vysledek.kod)).toBe(true);
      expect(muzeOpakovatStravaChybu(vysledek.kod)).toBe(true);
    }
  });

  it("422 VALIDATION_ERROR z confirmu → kod + retry zakázán", async () => {
    mockFetch(chybaApi("VALIDATION_ERROR", "Neplatné activityId.", 422));
    const vysledek = await sparujAktivitu(VYPRAVA_ID, "  ");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("VALIDATION_ERROR");
      expect(druhStravaChyby(vysledek.kod)).toBe("validace");
      expect(muzeOpakovatStravaChybu(vysledek.kod)).toBe(false);
    }
  });

  it("409 VYPRAVA_UZAVRENA z confirmu → konflikt, retry zakázán", async () => {
    mockFetch(chybaApi("VYPRAVA_UZAVRENA", "Výprava je uzavřená.", 409));
    const vysledek = await sparujAktivitu(VYPRAVA_ID, "123");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("VYPRAVA_UZAVRENA");
      expect(druhStravaChyby(vysledek.kod)).toBe("konflikt");
      expect(muzeOpakovatStravaChybu(vysledek.kod)).toBe(false);
    }
  });

  it("401 / 403 z confirmu → auth druhy, retry zakázán", async () => {
    mockFetch(chybaApi("NEPRIHLASEN", "Nejsi přihlášen.", 401));
    const nePrihlasen = await sparujAktivitu(VYPRAVA_ID, "123");
    expect(nePrihlasen.ok).toBe(false);
    if (!nePrihlasen.ok) {
      expect(druhStravaChyby(nePrihlasen.kod)).toBe("neprihlasen");
      expect(muzeOpakovatStravaChybu(nePrihlasen.kod)).toBe(false);
    }

    mockFetch(chybaApi("ZAKAZANO", "Nemáš oprávnění.", 403));
    const zakazano = await sparujAktivitu(VYPRAVA_ID, "123");
    expect(zakazano.ok).toBe(false);
    if (!zakazano.ok) {
      expect(druhStravaChyby(zakazano.kod)).toBe("zakazano");
      expect(muzeOpakovatStravaChybu(zakazano.kod)).toBe(false);
    }
  });
});

describe("StravaParovani — každá větev má vlastní text i akci", () => {
  it("nedostupná větev: „Propoj Stravu\" + odkaz do profilu + retry", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("Propoj Stravu");
    expect(obsah).toContain("/profil");
    expect(obsah).toContain("Zkusit znovu");
  });

  it("401 větev: výzva k přihlášení + odkaz na /login", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("/login");
    expect(obsah).toMatch(/Přihlas se/i);
  });

  it("403 větev: vlastní text o oprávnění (ne obecná chyba)", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toMatch(/oprávnění/i);
  });

  it("validace + konflikt: vlastní text, BEZ tlačítka retry v té větvi", () => {
    const obsah = cti(PAROVANI);
    // Obě větve vysvětlují, že opakování nepomůže / co zkontrolovat.
    expect(obsah).toMatch(/Zkontroluj/i);
    const retryPocet = obsah.split("Zkusit znovu").length - 1;
    // Jediné ruční retry patří nedostupné (příp. obecné) větvi —
    // validace, 401/403 ani 409 vlastní retry nemají.
    expect(retryPocet).toBe(1);
  });

  it("komponenta si pamatuje kód chyby (ne jen text) pro rozlišení větví", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toMatch(/kodChyby|kodPotvrzeni|ApiErrorCode/);
    expect(obsah).toContain("druhStravaChyby");
  });

  it("žádný slepý auto-retry: opakování jen přes explicitní klik", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).not.toContain("setTimeout");
    expect(obsah).not.toContain("setInterval");
    // Počáteční načtení běží jednou na expedici — chyba sama retry nespouští:
    // efekt závisí jen na expeditionId (nikdy na chyba/kodChyby).
    const efekt = obsah.slice(
      obsah.indexOf("let zije = true"),
      obsah.indexOf("let zije = true") + 1200,
    );
    expect(efekt).toContain("}, [expeditionId]);");
    expect(efekt).not.toContain("kodChyby");
    // Jediné volání obnovení z UI je přes onClick.
    expect(obsah).toContain("onClick={() => void obnovit()}");
  });
});

describe("strava-api — helpery jsou součástí lib (zdroj-kontrakt)", () => {
  it("lib exportuje druhy + retry rozhodování", () => {
    const obsah = cti(API);
    expect(obsah).toContain("druhStravaChyby");
    expect(obsah).toContain("muzeOpakovatStravaChybu");
    expect(obsah).toContain("jeStravaNedostupnaVetev");
    expect(obsah).toContain("StravaChybaDruh");
  });
});
