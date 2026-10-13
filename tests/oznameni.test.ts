/**
 * tests/oznameni.test.ts — Fáze 5, Krok 2: důležitá oznámení na Discord.
 *
 * Hranice bez živého serveru a bez secretu v Gitu:
 * - `validujOznameni` — nazev 3–120 (trim), text 1–2000 (trim),
 *   chyby ve tvaru pole → seznam českých hlášek.
 * - Kontrakt §16 — OZNAMENI_PATH, meze VALIDACE, české VALIDACNI_ZPRAVY,
 *   guard `jeVytvoritOznameniOdpoved` (odmítne secrety).
 * Strict TS, žádný zakázaný typ.
 */
import { describe, expect, it } from "vitest";
import {
  OZNAMENI_PATH,
  VALIDACE,
  VALIDACNI_ZPRAVY,
  jeVytvoritOznameniOdpoved,
} from "../src/shared/api-types";
import { validujOznameni } from "../server/src/validace";

describe("validujOznameni (tvar důležitého oznámení)", () => {
  it("platné oznámení projde a trimuje", () => {
    const vysledek = validujOznameni({
      nazev: "  Zrušená výprava  ",
      text: "  Sraz se ruší pro nemoc.  ",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({
      nazev: "Zrušená výprava",
      text: "Sraz se ruší pro nemoc.",
    });
  });

  it("ne-objekt je chyba těla", () => {
    const vysledek = validujOznameni("oznameni");
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.data).toBeNull();
    expect(vysledek.chybyPoli["telo"]).toBeDefined();
  });

  it("chybějící název hlásí pole nazev", () => {
    const vysledek = validujOznameni({ text: "Něco se děje." });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["nazev"]).toEqual([
      VALIDACNI_ZPRAVY.oznameniNazevPovinny,
    ]);
  });

  it("krátký název (2 znaky) neprojde", () => {
    const vysledek = validujOznameni({ nazev: "Ne", text: "Něco se děje." });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["nazev"]).toEqual([
      VALIDACNI_ZPRAVY.oznameniNazevKratky,
    ]);
  });

  it("dlouhý název (121 znaků) neprojde", () => {
    const vysledek = validujOznameni({
      nazev: "N".repeat(121),
      text: "Něco se děje.",
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["nazev"]).toEqual([
      VALIDACNI_ZPRAVY.oznameniNazevDlouhy,
    ]);
  });

  it("prázdný text neprojde", () => {
    const vysledek = validujOznameni({ nazev: "Důležité", text: "   " });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["text"]).toEqual([
      VALIDACNI_ZPRAVY.oznameniTextPovinny,
    ]);
  });

  it("dlouhý text (2001 znaků) neprojde", () => {
    const vysledek = validujOznameni({ nazev: "Důležité", text: "T".repeat(2001) });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["text"]).toEqual([
      VALIDACNI_ZPRAVY.oznameniTextDlouhy,
    ]);
  });

  it("hraniční délky (3 / 120 / 2000) projdou", () => {
    const vysledek = validujOznameni({
      nazev: "N".repeat(120),
      text: "T".repeat(2000),
    });
    expect(vysledek.uspech).toBe(true);
    const kratke = validujOznameni({ nazev: "Ano", text: "X" });
    expect(kratke.uspech).toBe(true);
  });
});

describe("kontrakt oznámení (§16 Discord)", () => {
  it("cesta je /api/oznameni", () => {
    expect(OZNAMENI_PATH).toBe("/api/oznameni");
  });

  it("meze kopírují zadání (3/120, 1/2000)", () => {
    expect(VALIDACE.oznameniNazevMinDelka).toBe(3);
    expect(VALIDACE.oznameniNazevMaxDelka).toBe(120);
    expect(VALIDACE.oznameniTextMinDelka).toBe(1);
    expect(VALIDACE.oznameniTextMaxDelka).toBe(2000);
  });

  it("hlášky jsou české a neprázdné", () => {
    const hlasky: readonly string[] = [
      VALIDACNI_ZPRAVY.oznameniNazevPovinny,
      VALIDACNI_ZPRAVY.oznameniNazevKratky,
      VALIDACNI_ZPRAVY.oznameniNazevDlouhy,
      VALIDACNI_ZPRAVY.oznameniTextPovinny,
      VALIDACNI_ZPRAVY.oznameniTextDlouhy,
    ];
    for (const hlaska of hlasky) {
      expect(hlaska.trim().length).toBeGreaterThan(0);
    }
  });

  it("guard přijme právě { ok: true }", () => {
    expect(jeVytvoritOznameniOdpoved({ ok: true })).toBe(true);
    expect(jeVytvoritOznameniOdpoved({ ok: false })).toBe(false);
    expect(jeVytvoritOznameniOdpoved(null)).toBe(false);
  });

  it("guard odmítne odpověď se secretem", () => {
    expect(
      jeVytvoritOznameniOdpoved({ ok: true, access_token: "tajne" }),
    ).toBe(false);
    expect(
      jeVytvoritOznameniOdpoved({ ok: true, clientSecret: "tajne" }),
    ).toBe(false);
  });
});
