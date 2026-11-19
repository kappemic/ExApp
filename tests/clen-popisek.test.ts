import { describe, expect, it } from "vitest";
import { popisekClena } from "../src/lib/clen-popisek";

describe("popisekClena", () => {
  it("bere nejvyšší zařazení", () => {
    expect(popisekClena({ clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: true }, true)).toBe("Hlavní admin");
    expect(popisekClena({ clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: true }, false)).toBe("Admin");
    expect(popisekClena({ clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: false }, false)).toBe("Vedení");
    expect(popisekClena({ clenstvi: "aktivni_clen", funkce: "rada", isAdmin: false }, false)).toBe("Člen rady");
    expect(popisekClena({ clenstvi: "aktivni_clen", funkce: null, isAdmin: false }, false)).toBe("Aktivní člen");
    expect(popisekClena({ clenstvi: "clen", funkce: null, isAdmin: false }, false)).toBe("Člen");
  });
});
