/**
 * tests/schuzky-validace.test.ts — Fáze 3: validace schůzek na hranici.
 * Server (`validujVytvoreniSchuzky` / `validujUpravuSchuzky`) + klientský
 * guard `jeSchuzka` (schuzky-api). České hlášky z kontraktu.
 */
import { describe, expect, it } from "vitest";
import {
  validujUpravuSchuzky,
  validujVytvoreniSchuzky,
} from "../server/src/validace";
import { jeSchuzka } from "../src/lib/schuzky-api";
import { toApiSchuzka } from "../server/src/schuzky";
import { VALIDACNI_ZPRAVY } from "../src/shared/api-types";

const PLATNA = {
  nazev: "Oddílová schůzka",
  datum: "2026-10-06",
  mistnost: "Klubovna",
  popis: "Hry a plánování",
  opakovani: "tydenni",
};

describe("validujVytvoreniSchuzky", () => {
  it("platná schůzka projde (včetně týdenní)", () => {
    const vysledek = validujVytvoreniSchuzky(PLATNA);
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({
      nazev: "Oddílová schůzka",
      datum: "2026-10-06",
      mistnost: "Klubovna",
      opakovani: "tydenni",
    });
  });

  it("minulost je povolena (opakovaná schůzka mohla začít dřív)", () => {
    const vysledek = validujVytvoreniSchuzky({
      ...PLATNA,
      datum: "2020-01-15",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.datum).toBe("2020-01-15");
  });

  it("prázdná místnost → null (venku)", () => {
    const vysledek = validujVytvoreniSchuzky({ ...PLATNA, mistnost: "   " });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.mistnost).toBeNull();
  });

  it("chybějící nepovinná pole → defaulty", () => {
    const vysledek = validujVytvoreniSchuzky({
      nazev: "Schůzka",
      datum: "2026-10-06",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.mistnost).toBeNull();
    expect(vysledek.data?.popis).toBe("");
    expect(vysledek.data?.opakovani).toBe("jednorazova");
  });

  it("krátký název → 422 s českou hláškou", () => {
    const vysledek = validujVytvoreniSchuzky({ ...PLATNA, nazev: "AB" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["nazev"]).toContain(
      VALIDACNI_ZPRAVY.schuzkaNazevKratky,
    );
  });

  it("neplatné datum (2026-02-30) → 422", () => {
    const vysledek = validujVytvoreniSchuzky({ ...PLATNA, datum: "2026-02-30" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["datum"]).toContain(
      VALIDACNI_ZPRAVY.schuzkaDatumNeplatne,
    );
  });

  it("neplatné opakování → 422", () => {
    const vysledek = validujVytvoreniSchuzky({ ...PLATNA, opakovani: "mesicne" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["opakovani"]).toContain(
      VALIDACNI_ZPRAVY.schuzkaOpakovaniNeplatne,
    );
  });

  it("dlouhá místnost (>120) → 422", () => {
    const vysledek = validujVytvoreniSchuzky({
      ...PLATNA,
      mistnost: "x".repeat(121),
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["mistnost"]).toContain(
      VALIDACNI_ZPRAVY.schuzkaMistnostDlouha,
    );
  });

  it("ne-objekt → 422 telo", () => {
    expect(validujVytvoreniSchuzky(null).uspech).toBe(false);
    expect(validujVytvoreniSchuzky("schuzka").chybyPoli["telo"]).toBeDefined();
  });
});

describe("validujUpravuSchuzky (parciální)", () => {
  it("prázdný PATCH projde (beze změny)", () => {
    const vysledek = validujUpravuSchuzky({});
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({});
  });

  it("jen název → jen název", () => {
    const vysledek = validujUpravuSchuzky({ nazev: "Nový název" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({ nazev: "Nový název" });
  });

  it("mistnost: null → zrušení místnosti", () => {
    const vysledek = validujUpravuSchuzky({ mistnost: null });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.mistnost).toBeNull();
  });

  it("neplatné opakovani → 422", () => {
    const vysledek = validujUpravuSchuzky({ opakovani: "denne" });
    expect(vysledek.uspech).toBe(false);
  });
});

describe("jeSchuzka (klientský guard)", () => {
  it("platná schůzka projde", () => {
    expect(
      jeSchuzka({
        id: "uuid-1",
        nazev: "Schůzka",
        datum: "2026-10-06",
        mistnost: null,
        popis: "",
        opakovani: "jednorazova",
      }),
    ).toBe(true);
  });

  it("neznámé opakování neprojde", () => {
    expect(
      jeSchuzka({
        id: "uuid-1",
        nazev: "Schůzka",
        datum: "2026-10-06",
        mistnost: null,
        popis: "",
        opakovani: "mesicne",
      }),
    ).toBe(false);
  });

  it("nevalidní datum neprojde", () => {
    expect(
      jeSchuzka({
        id: "uuid-1",
        nazev: "Schůzka",
        datum: "6.10.2026",
        mistnost: null,
        popis: "",
        opakovani: "jednorazova",
      }),
    ).toBe(false);
  });
});

describe("toApiSchuzka — vynecheneVyskyty (PATCH/GET parita)", () => {
  const radekTydenni = {
    id: "uuid-1",
    nazev: "Schůzka",
    datum: "2026-10-06",
    mistnost: null,
    popis: "",
    opakovani: "tydenni",
  } as never;

  it("týdenní řada s výjimkami je vrací (PATCH i GET)", () => {
    const vysledek = toApiSchuzka(radekTydenni, ["2026-10-13"]);
    expect(vysledek?.vynecheneVyskyty).toEqual(["2026-10-13"]);
  });

  it("bez výjimek pole chybí (PATCH bez výskytů)", () => {
    const vysledek = toApiSchuzka(radekTydenni, []);
    expect(vysledek?.vynecheneVyskyty).toBeUndefined();
  });
});
