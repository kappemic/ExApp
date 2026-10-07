/**
 * tests/guard.test.ts — smoke matice auth guardu bez serveru (TDD RED).
 * Ověřuje kontrakt src/shared/api-types.ts: PRISTUP + smiNaEndpoint,
 * zámek HTTP mapování a tvar chyby. Bez DB, bez HTTP, čistě logika.
 */
import { describe, expect, it } from "vitest";
import {
  ADMIN_CODES_PATH,
  CLENOVE_PATH,
  EXPEDITIONS_PATH,
  HTTP_STATUS_PRO_KOD,
  LOGIN_PATH,
  ME_PATH,
  PRISTUP,
  REGISTER_PATH,
  clenDetailPath,
  jeApiChyba,
  smiNaEndpoint,
} from "../src/shared/api-types";

describe("PRISTUP — kontrakt hranice admin vs user", () => {
  it("ADMIN-only endpointy jsou jen pro ADMIN", () => {
    expect(PRISTUP[ADMIN_CODES_PATH]).toBe("ADMIN");
    expect(PRISTUP[CLENOVE_PATH]).toBe("ADMIN");
    expect(PRISTUP["/api/clenove/:id"]).toBe("ADMIN");
  });

  it("verejne endpointy jsou PUBLIC", () => {
    expect(PRISTUP[REGISTER_PATH]).toBe("PUBLIC");
    expect(PRISTUP[LOGIN_PATH]).toBe("PUBLIC");
    expect(PRISTUP[EXPEDITIONS_PATH]).toBe("PUBLIC");
  });

  it("/api/me vyzaduje aspon USER", () => {
    expect(PRISTUP[ME_PATH]).toBe("USER");
  });
});

describe("smiNaEndpoint — matice bez serveru", () => {
  it("neprihlaseny smi jen na PUBLIC", () => {
    expect(smiNaEndpoint(null, REGISTER_PATH)).toBe(true);
    expect(smiNaEndpoint(null, EXPEDITIONS_PATH)).toBe(true);
    expect(smiNaEndpoint(null, ME_PATH)).toBe(false);
    expect(smiNaEndpoint(null, ADMIN_CODES_PATH)).toBe(false);
    expect(smiNaEndpoint(null, CLENOVE_PATH)).toBe(false);
  });

  it("USER nesmi na ADMIN-only, ale smi na USER", () => {
    expect(smiNaEndpoint("USER", ME_PATH)).toBe(true);
    expect(smiNaEndpoint("USER", EXPEDITIONS_PATH)).toBe(true);
    expect(smiNaEndpoint("USER", ADMIN_CODES_PATH)).toBe(false);
    expect(smiNaEndpoint("USER", CLENOVE_PATH)).toBe(false);
    expect(smiNaEndpoint("USER", "/api/clenove/:id")).toBe(false);
  });

  it("ADMIN smi vsude", () => {
    expect(smiNaEndpoint("ADMIN", ADMIN_CODES_PATH)).toBe(true);
    expect(smiNaEndpoint("ADMIN", CLENOVE_PATH)).toBe(true);
    expect(smiNaEndpoint("ADMIN", ME_PATH)).toBe(true);
    expect(smiNaEndpoint("ADMIN", REGISTER_PATH)).toBe(true);
  });
});

describe("HTTP_STATUS_PRO_KOD — zamek mapovani", () => {
  it("KOD_EXPIROVANY je jedina 410 v kontraktu", () => {
    expect(HTTP_STATUS_PRO_KOD["KOD_EXPIROVANY"]).toBe(410);
    const dalsi410 = (
      Object.entries(HTTP_STATUS_PRO_KOD) as [string, number][]
    ).filter(([kod, status]) => status === 410 && kod !== "KOD_EXPIROVANY");
    expect(dalsi410).toEqual([]);
  });

  it("KOD_NEPLATNY i SPATNE_HESLO mapuji na 401 (bez enumerace uctu)", () => {
    expect(HTTP_STATUS_PRO_KOD["KOD_NEPLATNY"]).toBe(401);
    expect(HTTP_STATUS_PRO_KOD["SPATNE_HESLO"]).toBe(401);
    expect(HTTP_STATUS_PRO_KOD["NEPRIHLASEN"]).toBe(401);
  });

  it("VALIDATION_ERROR je 422 a ZAKAZANO je 403", () => {
    expect(HTTP_STATUS_PRO_KOD["VALIDATION_ERROR"]).toBe(422);
    expect(HTTP_STATUS_PRO_KOD["ZAKAZANO"]).toBe(403);
  });
});

describe("jeApiChyba + clenDetailPath", () => {
  it("rozlisi uspech vs chybu", () => {
    expect(jeApiChyba({ error: { code: "NEPRIHLASEN", message: "x" } })).toBe(
      true,
    );
    expect(jeApiChyba({ user: {} })).toBe(false);
    expect(jeApiChyba(null)).toBe(false);
  });

  it("stavi URL detailu clena", () => {
    expect(clenDetailPath("c01")).toBe("/api/clenove/c01");
  });
});
