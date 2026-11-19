import { describe, expect, it } from "vitest";
import { smerVodorovnehoPosunu } from "../src/hooks/useVodorovnyPosun";

describe("smerVodorovnehoPosunu", () => {
  it("tah doleva prstem je další období", () => {
    expect(smerVodorovnehoPosunu(-48, 0, "touch")).toBe(1);
    expect(smerVodorovnehoPosunu(-80, 12, "pen")).toBe(1);
  });

  it("tah doprava je předchozí období", () => {
    expect(smerVodorovnehoPosunu(60, 10, "touch")).toBe(-1);
  });

  it("svislý pohyb a krátký posun období nemění", () => {
    expect(smerVodorovnehoPosunu(-20, 80, "touch")).toBeNull();
    expect(smerVodorovnehoPosunu(-40, 50, "touch")).toBeNull();
    expect(smerVodorovnehoPosunu(-47, 0, "touch")).toBeNull();
    expect(smerVodorovnehoPosunu(-48, 48, "touch")).toBeNull();
  });

  it("myš měsíc nepřepne", () => {
    expect(smerVodorovnehoPosunu(-120, 0, "mouse")).toBeNull();
  });
});
