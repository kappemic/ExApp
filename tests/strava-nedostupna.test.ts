/**
 * tests/strava-nedostupna.test.ts — Step 2: výpadek Stravy → 502 STRAVA_NEDOSTUPNA.
 *
 * RC2: catch v `GET /api/strava/neparovane` padal do slepé 500
 * (`vnitrniChyba`). Kontrakt chce kód STRAVA_NEDOSTUPNA + 502,
 * sjednocený error payload `{ error: { code, message } }`.
 * 401 / 403 / 409 větve zůstávají beze změny. Log bez secretů.
 * Strict TS, žádný `any`.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  HTTP_STATUS_PRO_KOD,
  STRAVA_NEDOSTUPNA_ZPRAVA,
  jeApiChyba,
} from "../src/shared/api-types";
import { chyboveTelo, httpStatusProKod } from "../server/src/chyby";
import {
  STRAVA_AKTIVITY_PER_PAGE,
  StravaNedostupnaChyba,
  jeStravaNedostupnaChyba,
  nactiStravaAktivity,
} from "../server/src/strava";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

const PUvodniMock: string | undefined = process.env["STRAVA_MOCK"];
const PUvodniFetch: typeof fetch | undefined =
  typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;

afterEach(() => {
  if (PUvodniMock === undefined) delete process.env["STRAVA_MOCK"];
  else process.env["STRAVA_MOCK"] = PUvodniMock;
  if (PUvodniFetch !== undefined) globalThis.fetch = PUvodniFetch;
});

describe("kontrakt STRAVA_NEDOSTUPNA (aditivně)", () => {
  it("mapuje se na 502 v kontraktu i na serveru", () => {
    expect(HTTP_STATUS_PRO_KOD["STRAVA_NEDOSTUPNA"]).toBe(502);
    expect(httpStatusProKod("STRAVA_NEDOSTUPNA")).toBe(502);
  });

  it("zpráva je česky a bez secretů", () => {
    expect(STRAVA_NEDOSTUPNA_ZPRAVA).toBe(
      "Strava je teď nedostupná. Zkus to prosím později.",
    );
    expect(STRAVA_NEDOSTUPNA_ZPRAVA.toLowerCase()).not.toContain("secret");
    expect(STRAVA_NEDOSTUPNA_ZPRAVA.toLowerCase()).not.toContain("token");
  });

  it("error payload má jednotný tvar { error: { code, message } }", () => {
    const telo = chyboveTelo(
      "STRAVA_NEDOSTUPNA",
      STRAVA_NEDOSTUPNA_ZPRAVA,
    );
    expect(jeApiChyba(telo)).toBe(true);
    expect(telo.error.code).toBe("STRAVA_NEDOSTUPNA");
    expect(telo.error.message).toBe(STRAVA_NEDOSTUPNA_ZPRAVA);
  });
});

describe("strava.ts rozlišuje výpadek od vnitřní chyby", () => {
  it("guard pozná jen StravaNedostupnaChyba", () => {
    expect(jeStravaNedostupnaChyba(new StravaNedostupnaChyba())).toBe(true);
    expect(jeStravaNedostupnaChyba(new Error("boom"))).toBe(false);
    expect(jeStravaNedostupnaChyba(null)).toBe(false);
  });

  it("síťový výpadek (fetch reject) → StravaNedostupnaChyba", async () => {
    delete process.env["STRAVA_MOCK"];
    globalThis.fetch = (() =>
      Promise.reject(new Error("síť spadla"))) as unknown as typeof fetch;
    const vysledek = await nactiStravaAktivity("token-123").then(
      () => "bez-chyby",
      (chyba: unknown) => chyba,
    );
    expect(jeStravaNedostupnaChyba(vysledek)).toBe(true);
  });

  it("Strava 5xx (!ok) → StravaNedostupnaChyba, zpráva bez secretů", async () => {
    delete process.env["STRAVA_MOCK"];
    const odpoved = { ok: false, status: 502 } as unknown as Response;
    globalThis.fetch = (() =>
      Promise.resolve(odpoved)) as unknown as typeof fetch;
    const vysledek = await nactiStravaAktivity(
      "token-123",
      STRAVA_AKTIVITY_PER_PAGE,
      1,
    ).then(
      () => "bez-chyby",
      (chyba: unknown) => chyba,
    );
    expect(jeStravaNedostupnaChyba(vysledek)).toBe(true);
    if (jeStravaNedostupnaChyba(vysledek)) {
      expect(vysledek.message).toBe(STRAVA_NEDOSTUPNA_ZPRAVA);
      expect(vysledek.message.toLowerCase()).not.toContain("bearer");
      expect(vysledek.message.toLowerCase()).not.toContain("secret");
    } else {
      expect.unreachable("čekala se StravaNedostupnaChyba");
    }
  });
});

describe("GET /api/strava/neparovane → 502, ostatní chyby beze změny", () => {
  it("catch posílá STRAVA_NEDOSTUPNA a loguje jen event + endpoint", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.lastIndexOf("/api/strava/neparovane");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(pozice, pozice + 5000);
    expect(okoli).toContain("stravaNedostupnaNeboVnitrniChyba");
    expect(obsah).toContain('"STRAVA_NEDOSTUPNA"');
    expect(obsah).toContain("strava_nedostupna");
    // Log nese jen event + endpoint — nikdy token ani secret.
    const logRadek = okoli.slice(
      okoli.indexOf("strava_nedostupna") - 200,
      okoli.indexOf("strava_nedostupna") + 200,
    );
    expect(logRadek.toLowerCase()).not.toContain("token");
    expect(logRadek.toLowerCase()).not.toContain("secret");
    expect(logRadek.toLowerCase()).not.toContain("bearer");
    expect(logRadek.toLowerCase()).not.toContain("authorization");
  });

  it("401 / 403 / 409 větve zůstávají (přihlášení, práva, uzavření, duplicita)", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("/api/strava/neparovane");
    expect(pozice).toBeGreaterThan(-1);
    const pred = obsah.slice(Math.max(0, pozice - 500), pozice + 3000);
    // 401: bez session přes vyzadujPrihlaseni.
    expect(pred).toContain("vyzadujPrihlaseni");
    // 403 + 409 na confirmu: dual-guard, VYPRAVA_UZAVRENA, UZ_PRIHLASEN.
    const parovani = obsah.indexOf("strava-parovani");
    expect(parovani).toBeGreaterThan(-1);
    const okoliParovani = obsah.slice(parovani - 500, parovani + 6000);
    expect(okoliParovani).toContain("vyzadujSpravceVyprav");
    expect(okoliParovani).toContain("VYPRAVA_UZAVRENA");
    expect(okoliParovani).toContain("UZ_PRIHLASEN");
  });
});
