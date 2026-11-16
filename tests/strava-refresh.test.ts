/**
 * tests/strava-refresh.test.ts — refresh grant must succeed without athlete.
 *
 * Strava's refresh_token response has access_token, refresh_token and
 * expires_at, but no athlete. Treating that as a failed exchange made
 * "Obnovit stav" look like the Strava account was disconnected.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  StravaNedostupnaChyba,
  StravaVymenaChyba,
  chceVynutitObnoveni,
  jeStravaNedostupnaChyba,
  obnovStravaToken,
  vymenCodeZaTokeny,
} from "../server/src/strava";

const PUVODNI_MOCK = process.env["STRAVA_MOCK"];
const PUVODNI_ID = process.env["STRAVA_CLIENT_ID"];
const PUVODNI_SECRET = process.env["STRAVA_CLIENT_SECRET"];
const PUVODNI_FETCH: typeof fetch | undefined =
  typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;

function obnovEnv(klic: string, hodnota: string | undefined): void {
  if (hodnota === undefined) delete process.env[klic];
  else process.env[klic] = hodnota;
}

afterEach(() => {
  obnovEnv("STRAVA_MOCK", PUVODNI_MOCK);
  obnovEnv("STRAVA_CLIENT_ID", PUVODNI_ID);
  obnovEnv("STRAVA_CLIENT_SECRET", PUVODNI_SECRET);
  if (PUVODNI_FETCH !== undefined) globalThis.fetch = PUVODNI_FETCH;
});

function pripravRealnyRezim(): void {
  delete process.env["STRAVA_MOCK"];
  process.env["STRAVA_CLIENT_ID"] = "12345";
  process.env["STRAVA_CLIENT_SECRET"] = "test-secret";
}

function jsonOdpoved(status: number, telo: unknown): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("chceVynutitObnoveni", () => {
  it("jen obnovit=1 nebo true vymění klíč i před expirací", () => {
    expect(chceVynutitObnoveni({ obnovit: "1" })).toBe(true);
    expect(chceVynutitObnoveni({ obnovit: "true" })).toBe(true);
    expect(chceVynutitObnoveni({})).toBe(false);
    expect(chceVynutitObnoveni({ obnovit: "0" })).toBe(false);
    expect(chceVynutitObnoveni(null)).toBe(false);
  });
});

describe("obnovStravaToken (refresh bez atleta)", () => {
  it("HTTP 200 bez athlete uloží access, refresh i expiraci", async () => {
    pripravRealnyRezim();
    const expiresAt = Math.floor(Date.now() / 1000) + 21_600;
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonOdpoved(200, {
          token_type: "Bearer",
          access_token: "novy-access",
          refresh_token: "novy-refresh",
          expires_at: expiresAt,
          expires_in: 21_600,
        }),
      )) as typeof fetch;

    const vysledek = await obnovStravaToken("stary-refresh");
    expect(vysledek.accessToken).toBe("novy-access");
    expect(vysledek.refreshToken).toBe("novy-refresh");
    expect(vysledek.expirace.getTime()).toBe(expiresAt * 1000);
  });

  it("HTTP 400 invalid_grant je chyba výměny, ne úspěch", async () => {
    pripravRealnyRezim();
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonOdpoved(400, {
          message: "Bad Request",
          errors: [{ resource: "RefreshToken", field: "refresh_token", code: "invalid" }],
        }),
      )) as typeof fetch;

    const vysledek = await obnovStravaToken("mrtvy-refresh").then(
      () => "uspech",
      (chyba: unknown) => chyba,
    );
    expect(vysledek).toBeInstanceOf(StravaVymenaChyba);
    expect(jeStravaNedostupnaChyba(vysledek)).toBe(false);
  });

  it("HTTP 5xx token endpointu je výpadek, ne odpojení", async () => {
    pripravRealnyRezim();
    globalThis.fetch = (() =>
      Promise.resolve(jsonOdpoved(502, { message: "bad gateway" }))) as typeof fetch;

    const vysledek = await obnovStravaToken("stary-refresh").then(
      () => "uspech",
      (chyba: unknown) => chyba,
    );
    expect(vysledek).toBeInstanceOf(StravaNedostupnaChyba);
  });

  it("authorization_code bez atleta pořád selže", async () => {
    pripravRealnyRezim();
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonOdpoved(200, {
          access_token: "access",
          refresh_token: "refresh",
          expires_at: Math.floor(Date.now() / 1000) + 1000,
        }),
      )) as typeof fetch;

    const vysledek = await vymenCodeZaTokeny("auth-code-bez-atleta").then(
      () => "uspech",
      (chyba: unknown) => chyba,
    );
    expect(vysledek).toBeInstanceOf(StravaVymenaChyba);
  });
});
