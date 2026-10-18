import { describe, expect, it } from "vitest";
import { urlAvataruProZobrazeni } from "../src/lib/storage/avatar";

const UZIVATEL = "7d1ccc68-22d6-42a0-b82d-397e9c25afcd";
const SOUBOR_A = "a0e4688b-250b-4140-874f-320361e45d9f";
const SOUBOR_B = "b1b1b1b1-250b-4140-874f-320361e45d9f";

function ulozena(souborId: string): string {
  return `https://pub.example/avatary/${UZIVATEL}/${souborId}.png`;
}

describe("urlAvataruProZobrazeni", () => {
  it("přidá verzi souboru, aby prohlížeč nenačetl předchozí fotku", () => {
    const url = urlAvataruProZobrazeni(ulozena(SOUBOR_A));
    expect(url).toContain(`/api/users/${UZIVATEL}/avatar?v=${SOUBOR_A}`);
    expect(urlAvataruProZobrazeni(ulozena(SOUBOR_B))).not.toBe(url);
  });

  it("cizí https odkaz nechá být", () => {
    expect(urlAvataruProZobrazeni("https://cdn.test/jan.jpg")).toBe("https://cdn.test/jan.jpg");
  });
});
