/**
 * School and class suggestions come from values already stored,
 * on registration, profile edit, and admin member edit.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

describe("našeptávání školy a třídy", () => {
  const registrace = cti("src/pages/RegisterPage.tsx");
  const profil = cti("src/components/profil/ProfileForm.tsx");
  const admin = cti("src/components/Admin/ClenDetailModal.tsx");
  const server = cti("server/src/schuzky-routes.ts");

  it("registrace používá combobox pro školu i třídu a veřejný číselník", () => {
    expect(registrace).toContain("nactiSkolyTridy");
    expect(registrace).not.toContain("datalist");
    const pouziti = registrace.split("<VstupSNabidkou").length - 1;
    expect(pouziti).toBe(2);
  });

  it("úprava profilu nabízí školu i třídu ze stejného číselníku", () => {
    expect(profil).toContain("nactiSkolyTridy");
    const pouziti = profil.split("<VstupSNabidkou").length - 1;
    expect(pouziti).toBe(2);
    expect(profil).toContain('id="profil-skola"');
    expect(profil).toContain('id="profil-trida"');
  });

  it("admin úprava člena nabízí školu i třídu", () => {
    expect(admin).toContain("nactiSkolyTridy");
    const pouziti = admin.split("<VstupSNabidkou").length - 1;
    expect(pouziti).toBe(2);
  });

  it("číselník zůstává veřejný GET /api/meta/skoly-tridy", () => {
    expect(server).toContain('app.get("/api/meta/skoly-tridy"');
  });
});
