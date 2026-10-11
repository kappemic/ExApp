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

  it("odkaz na trasu je nepovinný (default prázdný)", () => {
    const vysledek = validujVytvoreniExpedice(dobraVyprava());
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.trasaOdkaz).toBe("");
  });

  it("platný odkaz na trasu (mapy.com) projde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ trasaOdkaz: "https://mapy.com/s/abcdef" }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.trasaOdkaz).toContain("https://mapy.com/");
  });

  it("odkaz bez https:// neprojde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ trasaOdkaz: "mapy.com/s/abcdef" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["trasaOdkaz"]?.length).toBeGreaterThan(0);
  });

  it("moc dlouhý odkaz neprojde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ trasaOdkaz: `https://mapy.com/${"a".repeat(2048)}` }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["trasaOdkaz"]?.length).toBeGreaterThan(0);
  });

  it("konec od–do je nepovinný (default null = jednodenní)", () => {
    const vysledek = validujVytvoreniExpedice(dobraVyprava());
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datumDo).toBe(null);
  });

  it("platný rozsah od–do projde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datum: "2099-06-12", datumDo: "2099-06-14" }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datumDo).toBe("2099-06-14");
  });

  it("konec před začátkem neprojde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datum: "2099-06-12", datumDo: "2099-06-11" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datumDo"]?.length).toBeGreaterThan(0);
  });

  it("neplatný tvar konce neprojde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datumDo: "14.6.2099" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datumDo"]?.length).toBeGreaterThan(0);
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

  it("kapacita mimo 0–100 neprojde", () => {
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: -1 })).uspech,
    ).toBe(false);
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: 101 })).uspech,
    ).toBe(false);
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: 2.5 })).uspech,
    ).toBe(false);
  });

  it("kapacita 0 = bez omezení (projde)", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ kapacitaCelkem: 0 }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.kapacitaCelkem).toBe(0);
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

  it("minulé datum v patchi projde (úprava historie)", () => {
    const vysledek = validujUpravuExpedice({ datum: "2000-01-01" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datum).toBe("2000-01-01");
  });

  it("neplatný tvar data v patchi dál neprojde", () => {
    const vysledek = validujUpravuExpedice({ datum: "12.6.2000" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datum"]?.length).toBeGreaterThan(0);
  });

  it("budoucí datum v patchi projde", () => {
    const vysledek = validujUpravuExpedice({ datum: zitraYmd() });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datum).toBe(zitraYmd());
  });

  it("odkaz na trasu jde přidat patchem", () => {
    const vysledek = validujUpravuExpedice({
      trasaOdkaz: "https://mapy.com/s/abcdef",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.trasaOdkaz).toContain("https://mapy.com/");
  });

  it("odkaz jde patchem vymazat (prázdný řetězec)", () => {
    const vysledek = validujUpravuExpedice({ trasaOdkaz: "   " });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.trasaOdkaz).toBe("");
  });

  it("neplatný odkaz v patchi neprojde", () => {
    const vysledek = validujUpravuExpedice({ trasaOdkaz: "http://mapy.com/x" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["trasaOdkaz"]?.length).toBeGreaterThan(0);
  });

  it("konec od–do jde přidat patchem", () => {
    const vysledek = validujUpravuExpedice({ datumDo: "2099-06-14" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datumDo).toBe("2099-06-14");
  });

  it("konec jde patchem zrušit (null = jednodenní)", () => {
    const vysledek = validujUpravuExpedice({ datumDo: null });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datumDo).toBe(null);
  });

  it("konec před novým začátkem ve stejném patchi neprojde", () => {
    const vysledek = validujUpravuExpedice({
      datum: "2099-06-12",
      datumDo: "2099-06-11",
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datumDo"]?.length).toBeGreaterThan(0);
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

describe("validujVytvoreniExpedice — datumDo/trasaOdkaz hranice (doplnění Kroku 3)", () => {
  it("datumDo === datum projde (rovnost, konec >= začátek)", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datum: "2099-06-12", datumDo: "2099-06-12" }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datumDo).toBe("2099-06-12");
  });

  it("datumDo s minulým začátkem v jednom payloadu padne na datum (ne na datumDo)", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datum: "2000-01-01", datumDo: "2099-06-14" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datum"]?.length).toBeGreaterThan(0);
    expect(vysledek.chybyPoli["datumDo"]).toBeUndefined();
  });

  it("datumDo prázdné ('' / whitespace) = jednodenní (null)", () => {
    for (const datumDo of ["", "   "]) {
      const vysledek = validujVytvoreniExpedice(dobraVyprava({ datumDo }));
      expect(vysledek.uspech).toBe(true);
      expect(vysledek.data?.datumDo).toBe(null);
    }
  });

  it("datumDo jako číslo neprojde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ datumDo: 20290614 }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datumDo"]?.length).toBeGreaterThan(0);
  });

  it("trasaOdkaz přesně 2048 projde, 2049 neprojde", () => {
    const zaklad = "https://example.cz/";
    const prave2048 = zaklad + "a".repeat(2048 - zaklad.length);
    expect(prave2048).toHaveLength(2048);
    expect(
      validujVytvoreniExpedice(dobraVyprava({ trasaOdkaz: prave2048 })).uspech,
    ).toBe(true);
    const pres = validujVytvoreniExpedice(
      dobraVyprava({ trasaOdkaz: `${prave2048}a` }),
    );
    expect(pres.uspech).toBe(false);
    expect(pres.chybyPoli["trasaOdkaz"]?.length).toBeGreaterThan(0);
  });

  it("trasaOdkaz prázdný / whitespace = bez odkazu ('')", () => {
    for (const trasaOdkaz of ["", "   "]) {
      const vysledek = validujVytvoreniExpedice(dobraVyprava({ trasaOdkaz }));
      expect(vysledek.uspech).toBe(true);
      expect(vysledek.data?.trasaOdkaz).toBe("");
    }
  });

  it("trasaOdkaz http:// neprojde (jen https)", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ trasaOdkaz: "http://mapy.com/s/abcdef" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["trasaOdkaz"]?.length).toBeGreaterThan(0);
  });
});

describe("validujUpravuExpedice — datumDo hranice (doplnění Kroku 3)", () => {
  it("datumDo neplatný tvar v patchi neprojde", () => {
    const vysledek = validujUpravuExpedice({ datumDo: "14.6.2099" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datumDo"]?.length).toBeGreaterThan(0);
  });

  it("datumDo === datum ve stejném patchi projde", () => {
    const vysledek = validujUpravuExpedice({
      datum: "2099-06-12",
      datumDo: "2099-06-12",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datumDo).toBe("2099-06-12");
  });

  it("datumDo '' ruší konec stejně jako null (jednodenní)", () => {
    const vysledek = validujUpravuExpedice({ datumDo: "" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datumDo).toBe(null);
  });
});
