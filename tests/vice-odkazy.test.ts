/**
 * tests/vice-odkazy.test.ts — source contract for the More menu.
 * The invite-code link stays inside the admin branch.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

describe("VicePage — pozvánkové kódy", () => {
  const zdroj: string = ctiZdroj("src/pages/VicePage.tsx");

  it("odkaz na /admin/kody je uvnitř podmínky admina", () => {
    const blok = zdroj.match(
      /\(isAdmin \|\| isSuperadmin\) \? \([\s\S]*?(?:to|odkaz)="\/admin\/kody"[\s\S]*?\) : null/,
    );
    expect(blok).not.toBeNull();
    const zbytek = zdroj.replace(blok![0], "");
    expect(zbytek).not.toContain('"/admin/kody"');
  });
});
