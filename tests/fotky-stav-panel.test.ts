import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("FotkyStavPanel", () => {
  it("is fixed bottom-left with safe-area and diary tokens", () => {
    const panel = cti("src/components/fotky/FotkyStavPanel.tsx");
    expect(panel).toContain("data-fotky-stav-panel");
    expect(panel).toContain("fixed");
    expect(panel).toContain("safe-area-inset-left");
    expect(panel).toContain("safe-area-inset-bottom");
    expect(panel).toContain("bg-papir");
    expect(panel).toContain("shadow-denik");
    expect(panel).toContain("bg-jantar");
  });
});
