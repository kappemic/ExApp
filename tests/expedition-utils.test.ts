/**
 * tests/expedition-utils.test.ts — Krok C: čistě klientská definice
 * „právě probíhá" + formát rozsahu data (bez DB).
 */
import { describe, expect, it } from "vitest";
import {
  dnesniDatumYmd,
  formatRozsahData,
  jeProbihajici,
} from "../src/lib/expedition-utils";
import type { Expedition } from "../src/lib/mock-expeditions";

function vyprava(
  over: Partial<Pick<Expedition, "stav" | "datum" | "datumDo">> = {},
): Pick<Expedition, "stav" | "datum" | "datumDo"> {
  return {
    stav: "volno",
    datum: "2026-10-10",
    datumDo: null,
    ...over,
  };
}

describe("dnesniDatumYmd", () => {
  it("vrací lokální YYYY-MM-DD", () => {
    const ted = new Date();
    const ocekavano = `${ted.getFullYear()}-${String(ted.getMonth() + 1).padStart(2, "0")}-${String(ted.getDate()).padStart(2, "0")}`;
    expect(dnesniDatumYmd()).toBe(ocekavano);
    expect(dnesniDatumYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("jeProbihajici", () => {
  const DNES = "2026-10-10";

  it("jednodenní dnes probíhá", () => {
    expect(jeProbihajici(vyprava({ datum: DNES }), DNES)).toBe(true);
  });

  it("jednodenní včera neprobíhá", () => {
    expect(jeProbihajici(vyprava({ datum: "2026-10-09" }), DNES)).toBe(false);
  });

  it("jednodenní zítra neprobíhá", () => {
    expect(jeProbihajici(vyprava({ datum: "2026-10-11" }), DNES)).toBe(false);
  });

  it("od–do přes dnešek probíhá", () => {
    expect(
      jeProbihajici(
        vyprava({ datum: "2026-10-08", datumDo: "2026-10-12" }),
        DNES,
      ),
    ).toBe(true);
  });

  it("konec včera neprobíhá", () => {
    expect(
      jeProbihajici(
        vyprava({ datum: "2026-10-08", datumDo: "2026-10-09" }),
        DNES,
      ),
    ).toBe(false);
  });

  it("proběhlá s dnešním datem NENÍ probíhající", () => {
    expect(
      jeProbihajici(
        vyprava({ stav: "proběhlá", datum: DNES, datumDo: null }),
        DNES,
      ),
    ).toBe(false);
  });

  it("explicitní dnes parametr rozhoduje (ne systémové datum)", () => {
    expect(jeProbihajici(vyprava({ datum: "2026-10-10" }), "2026-10-12")).toBe(
      false,
    );
    expect(
      jeProbihajici(
        vyprava({ datum: "2026-10-10", datumDo: "2026-10-15" }),
        "2026-10-12",
      ),
    ).toBe(true);
  });

  it("bez explicitního dnes bere lokální dnešek", () => {
    const dnes = dnesniDatumYmd();
    expect(jeProbihajici(vyprava({ datum: dnes }))).toBe(true);
  });
});

describe("formatRozsahData", () => {
  it("jednodenní → celé datum", () => {
    expect(formatRozsahData("2026-10-17", null)).toBe("17. října 2026");
  });

  it("vícedenní ve stejném měsíci", () => {
    expect(formatRozsahData("2026-10-17", "2026-10-19")).toBe(
      "17.–19. říjen 2026",
    );
  });

  it("přes měsíce", () => {
    expect(formatRozsahData("2026-10-30", "2026-11-02")).toBe(
      "30. říjen – 2. listopadu 2026",
    );
  });

  it("přes roky vypíše obě data plně", () => {
    expect(formatRozsahData("2026-12-30", "2027-01-02")).toBe(
      "30. prosince 2026 – 2. ledna 2027",
    );
  });
});
