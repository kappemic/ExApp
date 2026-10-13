/**
 * tests/diskuze-validace.test.ts — Fáze 5, Krok 4: diskuze k výpravě (hranice).
 *
 * TDD RED: validace + mapování + rate-limit + kontrakt bez živého serveru:
 * - `validujZpravu` — text 1–1000 po trimu, chyby ve tvaru pole → české hlášky,
 *   XSS payload validací PROJDE (ukládá se raw, escapuje se až při renderu).
 * - `toApiZprava` — DB řádek → ApiZprava (fail-safe null, raw text bez escapování).
 * - rate-limit 10/min/ip (`smiPoslatZpravu` + `resetDiskuzeLimitu`).
 * - kontrakt § Diskuze — cesty, meze VALIDACE, české VALIDACNI_ZPRAVY,
 *   guardy `jeApiZprava` / `jeZpravyOdpoved`, matice oprávnění.
 * Strict TS, žádný zakázaný typ.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPEDICE_ZPRAVA_DETAIL_VZOR,
  EXPEDICE_ZPRAVY_VZOR,
  VALIDACE,
  VALIDACNI_ZPRAVY,
  jeApiZprava,
  jeZpravyOdpoved,
  zpravaDetailPath,
  zpravyPath,
} from "../src/shared/api-types";
import { validujZpravu } from "../server/src/validace";
import {
  resetDiskuzeLimitu,
  smiPoslatZpravu,
  toApiZprava,
} from "../server/src/diskuze";

const XSS = `<script>alert("xss")</script><img src="x" onerror="alert(1)">`;

function dbRadek(overrides: Record<string, unknown> = {}): {
  id: string;
  expediceId: string;
  autorId: string | null;
  text: string;
  createdAt: Date;
  smazanoAt: Date | null;
} {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    expediceId: "sumava-2026",
    autorId: "22222222-2222-4222-8222-222222222222",
    text: "Ahoj z výpravy",
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    smazanoAt: null,
    ...overrides,
  } as {
    id: string;
    expediceId: string;
    autorId: string | null;
    text: string;
    createdAt: Date;
    smazanoAt: Date | null;
  };
}

describe("validujZpravu (tvar zprávy diskuze)", () => {
  it("platná zpráva projde a trimuje", () => {
    const vysledek = validujZpravu({ text: "  Ahoj z výpravy  " });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({ text: "Ahoj z výpravy" });
  });

  it("ne-objekt je chyba těla", () => {
    const vysledek = validujZpravu("ahoj");
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.data).toBeNull();
    expect(vysledek.chybyPoli["telo"]).toBeDefined();
  });

  it("chybějící text hlásí pole text", () => {
    const vysledek = validujZpravu({});
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["text"]).toEqual([
      VALIDACNI_ZPRAVY.zpravaTextPovinny,
    ]);
  });

  it("prázdný / whitespace text neprojde", () => {
    const vysledek = validujZpravu({ text: "   " });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["text"]).toEqual([
      VALIDACNI_ZPRAVY.zpravaTextPovinny,
    ]);
  });

  it("dlouhý text (1001 znaků) neprojde", () => {
    const vysledek = validujZpravu({ text: "x".repeat(1001) });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["text"]).toEqual([
      VALIDACNI_ZPRAVY.zpravaTextDlouhy,
    ]);
  });

  it("hraniční délky (1 / 1000) projdou", () => {
    expect(validujZpravu({ text: "a" }).uspech).toBe(true);
    expect(validujZpravu({ text: "x".repeat(1000) }).uspech).toBe(true);
  });

  it("XSS payload validací PROJDE a uloží se raw (escapuje až render)", () => {
    const vysledek = validujZpravu({ text: XSS });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.text).toBe(XSS);
  });
});

describe("toApiZprava (DB řádek → ApiZprava)", () => {
  it("mapuje řádek na ApiZprava s ISO časem", () => {
    const api = toApiZprava(dbRadek());
    expect(api).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      expeditionId: "sumava-2026",
      autorId: "22222222-2222-4222-8222-222222222222",
      text: "Ahoj z výpravy",
      createdAt: "2026-10-01T10:00:00.000Z",
    });
  });

  it("autorId null (odešlý uživatel) projde — vlákno zůstává", () => {
    const api = toApiZprava(dbRadek({ autorId: null }));
    expect(api?.autorId).toBeNull();
  });

  it("nevalidní řádek (prázdné id / text) → null", () => {
    expect(toApiZprava(dbRadek({ id: "" }))).toBeNull();
    const bezTextu = dbRadek();
    const upraveny: Record<string, unknown> = { ...bezTextu, text: 42 };
    expect(
      toApiZprava(
        upraveny as unknown as Parameters<typeof toApiZprava>[0],
      ),
    ).toBeNull();
  });

  it("XSS text drží raw — server neescapuje (escapuje až klient při renderu)", () => {
    const api = toApiZprava(dbRadek({ text: XSS }));
    expect(api?.text).toBe(XSS);
    expect(api?.text).toContain("<script>");
  });
});

describe("rate-limit diskuze (10/min/ip)", () => {
  it("prvních 10 zpráv projde, 11. je odmítnuta", () => {
    resetDiskuzeLimitu();
    const ip = "test-ip-10-za-minutu";
    for (let i = 0; i < 10; i += 1) {
      expect(smiPoslatZpravu(ip, 1_000_000 + i * 1_000)).toBe(true);
    }
    expect(smiPoslatZpravu(ip, 1_000_000 + 10 * 1_000)).toBe(false);
  });

  it("jiná IP má vlastní limit", () => {
    resetDiskuzeLimitu();
    const zaklad = 2_000_000;
    for (let i = 0; i < 10; i += 1) {
      expect(smiPoslatZpravu("ip-a", zaklad + i)).toBe(true);
    }
    expect(smiPoslatZpravu("ip-a", zaklad + 60_000)).toBe(false);
    expect(smiPoslatZpravu("ip-b", zaklad + 60_000)).toBe(true);
  });

  it("po minutovém okně jde posílat znovu", () => {
    resetDiskuzeLimitu();
    const ip = "test-ip-okno";
    for (let i = 0; i < 10; i += 1) {
      expect(smiPoslatZpravu(ip, i * 1_000)).toBe(true);
    }
    expect(smiPoslatZpravu(ip, 61_000)).toBe(true);
  });
});

describe("kontrakt diskuze (§ Diskuze)", () => {
  it("cesty vláken výpravy", () => {
    expect(EXPEDICE_ZPRAVY_VZOR).toBe("/api/expeditions/:id/zpravy");
    expect(EXPEDICE_ZPRAVA_DETAIL_VZOR).toBe(
      "/api/expeditions/:id/zpravy/:zpravaId",
    );
    expect(zpravyPath("abc")).toBe("/api/expeditions/abc/zpravy");
    expect(zpravaDetailPath("abc", "z1")).toBe("/api/expeditions/abc/zpravy/z1");
  });

  it("meze kopírují DB CHECK (1–1000) a paginaci (default 50, cap 100)", () => {
    expect(VALIDACE.zpravaTextMinDelka).toBe(1);
    expect(VALIDACE.zpravaTextMaxDelka).toBe(1000);
    expect(VALIDACE.zpravyLimitDefault).toBe(50);
    expect(VALIDACE.zpravyLimitMax).toBe(100);
  });

  it("hlášky jsou české a neprázdné", () => {
    const hlasky: readonly string[] = [
      VALIDACNI_ZPRAVY.zpravaTextPovinny,
      VALIDACNI_ZPRAVY.zpravaTextDlouhy,
    ];
    for (const hlaska of hlasky) {
      expect(hlaska.trim().length).toBeGreaterThan(0);
    }
  });

  it("guard přijme platnou zprávu", () => {
    expect(
      jeApiZprava({
        id: "z1",
        expeditionId: "abc",
        autorId: null,
        text: "Ahoj",
        createdAt: "2026-10-01T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("guard odmítne zprávu bez textu", () => {
    expect(
      jeApiZprava({
        id: "z1",
        expeditionId: "abc",
        autorId: null,
        createdAt: "2026-10-01T10:00:00.000Z",
      }),
    ).toBe(false);
    expect(jeApiZprava(null)).toBe(false);
  });

  it("guard seznamu přijme prázdné vlákno s nextCursor", () => {
    expect(jeZpravyOdpoved({ zpravy: [], nextCursor: null })).toBe(true);
    expect(jeZpravyOdpoved({ zpravy: "ne" })).toBe(false);
  });
});

describe("diskuze — nové soubory bez any", () => {
  it("žádný zakázaný typ any v nových souborech", () => {
    const zakazanyTyp = ["as", "any"].join(" ");
    for (const soubor of [
      "server/src/diskuze.ts",
      "server/src/validace.ts",
      "src/shared/api-types.ts",
      "src/lib/diskuze-api.ts",
      "tests/diskuze-validace.test.ts",
      "tests/diskuze-api.test.ts",
    ]) {
      const obsah = readFileSync(soubor, "utf8");
      expect(obsah).not.toMatch(/:\s*any\b/);
      expect(obsah).not.toContain(zakazanyTyp);
    }
  });
});
