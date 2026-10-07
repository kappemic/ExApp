/**
 * tests/expedice-validace.test.ts — Krok 3b: validace na hranici (bez DB).
 * Pokrývá POST /api/expeditions, PATCH /:id a PATCH /:id/uzavrit —
 * pravidla i hlášky z kontraktu (VALIDACE + VALIDACNI_ZPRAVY).
 */
import { describe, expect, it } from "vitest";
import {
  validujUpravuExpedice,
  validujUzavreni,
  validujVytvoreniExpedice,
} from "../server/src/validace";

function dobraVyprava(over: Record<string, unknown> = {}) {
  return {
    nazev: "Šumava — Tříjezerní slať",
    datum: "2099-06-12",
    sraz: "Praha hl. n. 7:30",
    popis: "Jednodenní výprava.",
    kapacitaCelkem: 12,
    ...over,
  };
}

function zitraYmd(): string {
  const zitra = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const rok = zitra.getFullYear();
  const mesic = String(zitra.getMonth() + 1).padStart(2, "0");
  const den = String(zitra.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

describe("validujVytvoreniExpedice", () => {
  it("projde s platným vstupem", () => {
    const vysledek = validujVytvoreniExpedice(dobraVyprava());
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.nazev).toBe("Šumava — Tříjezerní slať");
  });

  it("popis je nepovinný (default prázdný)", () => {
    const { popis: _pryc, ...bezPopisu } = dobraVyprava();
    void _pryc;
    const vysledek = validujVytvoreniExpedice(bezPopisu);
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.popis).toBe("");
  });

  it("krátký název neprojde", () => {
    const vysledek = validujVytvoreniExpedice(dobraVyprava({ nazev: "Sr" }));
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["nazev"]?.length).toBeGreaterThan(0);
  });

  it("špatný tvar data neprojde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datum: "12.6.2099" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datum"]?.length).toBeGreaterThan(0);
  });

  it("neexistující den neprojde (2026-02-30)", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datum: "2099-02-30" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datum"]?.length).toBeGreaterThan(0);
  });

  it("minulost neprojde (historie vzniká jen uzavřením)", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datum: "2000-01-01" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datum"]?.length).toBeGreaterThan(0);
  });

  it("kapacita mimo 1–100 neprojde", () => {
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: 0 })).uspech,
    ).toBe(false);
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: 101 })).uspech,
    ).toBe(false);
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: 2.5 })).uspech,
    ).toBe(false);
  });

  it("non-objekt vrátí chybu těla", () => {
    const vysledek = validujVytvoreniExpedice(null);
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["telo"]?.length).toBeGreaterThan(0);
  });
});

describe("validujUpravuExpedice — parciální", () => {
  it("prázdný patch projde (beze změny, idempotentní)", () => {
    const vysledek = validujUpravuExpedice({});
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({});
  });

  it("stav tudy nikdy nejde", () => {
    const vysledek = validujUpravuExpedice({ stav: "proběhlá" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["stav"]?.length).toBeGreaterThan(0);
  });

  it("jen poslaná pole se mění", () => {
    const vysledek = validujUpravuExpedice({
      nazev: "Nová Šumava",
      kapacitaCelkem: 20,
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({
      nazev: "Nová Šumava",
      kapacitaCelkem: 20,
    });
  });

  it("minulé datum v patchi neprojde", () => {
    const vysledek = validujUpravuExpedice({ datum: "2000-01-01" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datum"]?.length).toBeGreaterThan(0);
  });

  it("budoucí datum v patchi projde", () => {
    const vysledek = validujUpravuExpedice({ datum: zitraYmd() });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datum).toBe(zitraYmd());
  });
});

describe("validujUzavreni — docházka", () => {
  it("projde s neprázdnou docházkou", () => {
    const vysledek = validujUzavreni({
      dochazka: [
        { ucastnikId: "11111111-1111-1111-1111-111111111111", status: "ucastnil_se" },
        { ucastnikId: "22222222-2222-2222-2222-222222222222", status: "omluven" },
      ],
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.dochazka).toHaveLength(2);
  });

  it("prázdná docházka neprojde", () => {
    const vysledek = validujUzavreni({ dochazka: [] });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["dochazka"]?.length).toBeGreaterThan(0);
  });

  it("chybějící docházka neprojde", () => {
    const vysledek = validujUzavreni({});
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["dochazka"]?.length).toBeGreaterThan(0);
  });

  it("neznámý status neprojde", () => {
    const vysledek = validujUzavreni({
      dochazka: [{ ucastnikId: "abc", status: "prihlasen" }],
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["dochazka"]?.length).toBeGreaterThan(0);
  });

  it("duplicitní ucastnikId neprojde", () => {
    const vysledek = validujUzavreni({
      dochazka: [
        { ucastnikId: "abc", status: "ucastnil_se" },
        { ucastnikId: "abc", status: "omluven" },
      ],
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["dochazka"]?.length).toBeGreaterThan(0);
  });
});
