/**
 * tests/pen-tokeny.test.ts — pen redesign, shell tokeny.
 * Čte src/index.css jako text. Primární akcent je terracotta, papír není bílá.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8").toLowerCase();
}

describe("pen tokeny v src/index.css", () => {
  const css: string = ctiZdroj("src/index.css");

  it("má papír, terracotta akcent, okrovou a značku z pera", () => {
    expect(css).toContain("--color-papir: #f7f4eb");
    expect(css).toContain("--color-akcent: #a8461c");
    expect(css).toContain("--color-okr: #7a5b22");
    expect(css).toContain("--color-jantar: #7a5b22");
    expect(css).toContain("--color-smrk: #2e4022");
  });

  it("okraj pole nenechává na světlé lince", () => {
    expect(css).toContain("--color-pole: #8c937b");
    expect(css).not.toContain("--color-pole: #e4dfce");
  });
});
