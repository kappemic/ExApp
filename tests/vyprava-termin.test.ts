import { describe, expect, it } from "vitest";
import { lzeDoplnitArchiv } from "../server/src/vyprava-termin";

describe("lzeDoplnitArchiv", () => {
  it("allows a closed trip even when the date is still ahead", () => {
    expect(
      lzeDoplnitArchiv(
        { stav: "proběhlá", datum: "2026-12-01", datumDo: null },
        "2026-10-16",
      ),
    ).toBe(true);
  });

  it("allows an unclosed trip whose end date is already past", () => {
    expect(
      lzeDoplnitArchiv(
        { stav: "volno", datum: "2026-10-13", datumDo: "2026-10-15" },
        "2026-10-16",
      ),
    ).toBe(true);
  });

  it("blocks a trip that is still upcoming or in progress", () => {
    expect(
      lzeDoplnitArchiv(
        { stav: "volno", datum: "2026-10-16", datumDo: null },
        "2026-10-16",
      ),
    ).toBe(false);
    expect(
      lzeDoplnitArchiv(
        { stav: "skoro plno", datum: "2026-10-20", datumDo: null },
        "2026-10-16",
      ),
    ).toBe(false);
  });
});
