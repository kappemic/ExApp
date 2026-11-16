import { describe, expect, it } from "vitest";
import { formatKmNaDesetinu, formatKmZaokrouhlene } from "../src/lib/format-cisla";

describe("formáty kilometrů", () => {
  it("celé číslo nechá bez desetiny, nebo ji vypíše", () => {
    expect(formatKmZaokrouhlene(12)).toBe("12 km");
    expect(formatKmNaDesetinu(12)).toBe("12,0 km");
  });

  it("12,34 zaokrouhlí na jednu desetinu v obou formátech", () => {
    expect(formatKmZaokrouhlene(12.34)).toBe("12,3 km");
    expect(formatKmNaDesetinu(12.34)).toBe("12,3 km");
  });
});
