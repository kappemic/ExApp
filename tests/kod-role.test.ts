/**
 * tests/kod-role.test.ts — role pozvánkového kódu.
 * Kód založí účet rovnou se svou rolí, vyšší než člen smí jen hlavní admin
 * a admin z kódu vzniknout nemůže. Routy běží proti falešné DB.
 */
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registrationCodes } from "../drizzle/schema/registration_codes";
import { users } from "../drizzle/schema/users";
import { ROLE_KODU, roleKoduNeboClen, smiNastavitRoliKodu } from "../src/config/roles";
import { VALIDACNI_ZPRAVY } from "../src/shared/api-types";

type Radek = Record<string, unknown>;

const stav = vi.hoisted(() => ({
  kody: [] as Record<string, unknown>[],
  uzivatele: [] as Record<string, unknown>[],
  vlozeneKody: [] as Record<string, unknown>[],
  vlozeniUzivatele: [] as Record<string, unknown>[],
}));

vi.mock("../server/src/db", () => {
  function dotaz(radky: Radek[]): Promise<Radek[]> & Record<string, unknown> {
    const slib = Promise.resolve(radky) as Promise<Radek[]> & Record<string, unknown>;
    slib["where"] = () => slib;
    slib["limit"] = () => slib;
    slib["orderBy"] = () => slib;
    return slib;
  }
  const db = {
    select: (pole?: Radek) => ({
      from: (tabulka: unknown) => {
        if (tabulka === registrationCodes) return dotaz(stav.kody);
        // Dotaz na obsazený e-mail vybírá jen id, celý řádek čte session.
        return dotaz(pole === undefined ? stav.uzivatele : []);
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    insert: (tabulka: unknown) => ({
      values: (hodnoty: Radek) => ({
        returning: () => {
          const ted = new Date();
          const radek = { id: "11111111-1111-4111-8111-111111111111", createdAt: ted, updatedAt: ted, ...hodnoty };
          if (tabulka === registrationCodes) stav.vlozeneKody.push(hodnoty);
          if (tabulka === users) stav.vlozeniUzivatele.push(hodnoty);
          return Promise.resolve([radek]);
        },
      }),
    }),
  };
  return { getDb: () => db };
});

const { registrujUcty } = await import("../server/src/ucty-routes");
const { podepisToken } = await import("../server/src/auth");
const { validujNovyKod } = await import("../server/src/validace");

const ID = "22222222-2222-4222-8222-222222222222";
let server: Server;
let zaklad = "";
let token = "";

function prihlas(isSuperadmin: boolean, isAdmin = true): void {
  stav.uzivatele = [
    { id: ID, email: "a@example.cz", role: "admin", clenstvi: "aktivni_clen", funkce: null, isAdmin, isSuperadmin },
  ];
}

async function posli(cesta: string, telo: unknown): Promise<{ status: number; telo: Radek }> {
  const odpoved = await fetch(`${zaklad}${cesta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(telo),
  });
  return { status: odpoved.status, telo: (await odpoved.json()) as Radek };
}

beforeAll(async () => {
  vi.stubEnv("AUTH_JWT_SECRET", "testovaci-tajemstvi-delsi-nez-32-znaku-x");
  token = podepisToken(ID);
  const app = express();
  app.use(express.json());
  registrujUcty(app);
  await new Promise<void>((hotovo) => {
    server = app.listen(0, "127.0.0.1", () => hotovo());
  });
  zaklad = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  stav.kody = [];
  stav.uzivatele = [];
  stav.vlozeneKody = [];
  stav.vlozeniUzivatele = [];
});

describe("pravidla role kódu", () => {
  it("admin mezi rolemi kódu není a neznámá hodnota spadne na člena", () => {
    expect(ROLE_KODU).not.toContain("admin");
    expect(roleKoduNeboClen("admin")).toBe("clen");
    expect(roleKoduNeboClen(undefined)).toBe("clen");
    expect(roleKoduNeboClen("vedeni")).toBe("vedeni");
  });

  it("běžný admin smí jen člena, hlavní admin všechno", () => {
    expect(ROLE_KODU.filter((role) => smiNastavitRoliKodu(role, false))).toEqual(["clen"]);
    expect(ROLE_KODU.filter((role) => smiNastavitRoliKodu(role, true))).toEqual([...ROLE_KODU]);
  });

  it("starý klient bez role dostane člena, neplatná role je chyba pole", () => {
    expect(validujNovyKod({}).data?.role).toBe("clen");
    expect(validujNovyKod(undefined).data?.role).toBe("clen");
    expect(validujNovyKod({ poznamka: " Adam ", role: "clen-rady" }).data).toEqual({ poznamka: "Adam", role: "clen-rady" });
    for (const role of ["admin", "superadmin", "", 1, ["vedeni"]]) {
      expect(validujNovyKod({ role }).chybyPoli["role"]).toEqual([VALIDACNI_ZPRAVY.kodRoleNeplatna]);
    }
  });

  it("CHECK v migraci zná přesně role kódu", () => {
    const sql = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../drizzle/migrations/0027_kod_role.sql"),
      "utf8",
    );
    const vycet = /role IN \(([^)]+)\)/.exec(sql)?.[1] ?? "";
    expect(vycet.split(",").map((kus) => kus.trim().replaceAll("'", ""))).toEqual([...ROLE_KODU]);
  });
});

describe("POST /api/admin/codes", () => {
  it("hlavní admin uloží kód s rolí", async () => {
    prihlas(true);
    const { status, telo } = await posli("/api/admin/codes", { role: "vedeni" });
    expect(status).toBe(201);
    expect(telo["role"]).toBe("vedeni");
    expect(stav.vlozeneKody[0]?.["role"]).toBe("vedeni");
  });

  it("běžný admin dostane na vyšší roli 403 a nic se neuloží", async () => {
    prihlas(false);
    for (const role of ["aktivni-clen", "clen-rady", "vedeni"]) {
      expect((await posli("/api/admin/codes", { role })).status).toBe(403);
    }
    expect(stav.vlozeneKody).toHaveLength(0);
    expect((await posli("/api/admin/codes", {})).status).toBe(201);
    expect(stav.vlozeneKody[0]?.["role"]).toBe("clen");
  });

  it("ne-admin kód nevytvoří a role admin neprojde ani hlavnímu adminovi", async () => {
    prihlas(false, false);
    expect((await posli("/api/admin/codes", { role: "clen" })).status).toBe(403);
    prihlas(true);
    expect((await posli("/api/admin/codes", { role: "admin" })).status).toBe(422);
    expect(stav.vlozeneKody).toHaveLength(0);
  });
});

describe("POST /api/register", () => {
  async function registruj(role: string): Promise<Radek | undefined> {
    stav.kody = [{ code: "ABCDEFGH", expiresAt: new Date(Date.now() + 60_000), role }];
    const { status } = await posli("/api/register", {
      jmeno: "Adam",
      email: "adam@example.cz",
      heslo: "tajneheslo",
      kod: "ABCDEFGH",
      // Roli určuje kód, ne tělo registrace.
      role: "admin",
      isAdmin: true,
    });
    expect(status).toBe(201);
    return stav.vlozeniUzivatele.at(-1);
  }

  it.each([
    ["clen", "clen", null],
    ["aktivni-clen", "aktivni_clen", null],
    ["clen-rady", "aktivni_clen", "rada"],
    ["vedeni", "aktivni_clen", "vedeni"],
  ])("kód %s založí účet s touhle rolí", async (role, clenstvi, funkce) => {
    expect(await registruj(role)).toMatchObject({ role, clenstvi, funkce, isAdmin: false, isSuperadmin: false });
  });

  it("řádek s rolí admin založí jen člena", async () => {
    expect(await registruj("admin")).toMatchObject({ role: "clen", clenstvi: "clen", isAdmin: false, isSuperadmin: false });
  });
});
