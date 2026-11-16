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
    expect(panel).toContain("z-50");
    expect(panel).toContain("createPortal");
    const css = cti("src/index.css");
    expect(css).toContain(".fotky-stav-panel");
    expect(css).toContain("safe-area-inset-left");
    expect(css).toContain("safe-area-inset-bottom");
    expect(css).toContain("5.25rem");
    expect(panel).toContain("bg-papir");
    expect(panel).toContain("shadow-denik");
    expect(panel).toContain("bg-jantar");
  });
});
