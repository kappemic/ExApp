import { describe, expect, it } from "vitest";
import {
  evropskeNaIso,
  isoNaEvropske,
  maskaEvropskehoData,
} from "../src/lib/evropske-datum";

describe("evropské datum", () => {
  it("ukáže den, měsíc a rok", () => {
    expect(isoNaEvropske("2026-10-19")).toBe("19.10.2026");
    expect(isoNaEvropske("")).toBe("");
    expect(isoNaEvropske("19.10.2026")).toBe("");
  });

  it("vrátí ISO jen z platného dne", () => {
    expect(evropskeNaIso("19.10.2026")).toBe("2026-10-19");
    expect(evropskeNaIso("5.3.2026")).toBe("2026-03-05");
    expect(evropskeNaIso("19.10")).toBeNull();
    expect(evropskeNaIso("31.02.2026")).toBeNull();
  });

  it("při psaní skládá dd.mm.rrrr a ISO vložení otočí", () => {
    expect(maskaEvropskehoData("1910")).toBe("19.10");
    expect(maskaEvropskehoData("19102026")).toBe("19.10.2026");
    expect(maskaEvropskehoData("2026-10-19")).toBe("19.10.2026");
  });
});
