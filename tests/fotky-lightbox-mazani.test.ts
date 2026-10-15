/**
 * Album lightbox delete confirm — portal stacking + stable photo id.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { idAktualniFotkyProPotvrzeni, idsFotekKeSmazani } from "../src/lib/fotky-mazani";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("idAktualniFotkyProPotvrzeni", () => {
  it("preferuje id zachycené při otevření potvrzení", () => {
    expect(idAktualniFotkyProPotvrzeni("foto-a", "foto-b")).toBe("foto-a");
  });

  it("spadne na aktuální lightbox id když uložené chybí", () => {
    expect(idAktualniFotkyProPotvrzeni(null, "foto-b")).toBe("foto-b");
  });

  it("po zavření lightboxu stále smaže dříve zachycené id", () => {
    const ids = idsFotekKeSmazani(
      [{ id: "foto-a" }, { id: "foto-b" }],
      new Set<string>(),
      "aktualni",
      idAktualniFotkyProPotvrzeni("foto-a", null),
    );
    expect(ids).toEqual(["foto-a"]);
  });

  it("bez uloženého i live id nevolá API (prázdný seznam)", () => {
    expect(
      idsFotekKeSmazani([{ id: "x" }], new Set(), "aktualni", idAktualniFotkyProPotvrzeni(null, null)),
    ).toEqual([]);
  });
});

describe("ConfirmDialog — portal nad lightboxem", () => {
  it("renderuje do document.body s vyšším z-indexem", () => {
    const confirm = cti("src/components/kalendar/ConfirmDialog.tsx");
    expect(confirm).toContain("createPortal");
    expect(confirm).toContain("document.body");
    expect(confirm).toContain("data-confirm-dialog-portal");
    expect(confirm).toContain("z-[200]");
  });
});

describe("AlbumFotky — lightbox mazání", () => {
  it("předává id fotky při otevření potvrzení z lightboxu", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain('otevriPotvrzeni("aktualni", aktualniFotkaId)');
    expect(album).toContain("potvrzeniAktualniId");
    expect(album).toContain("setObnovaAktualniFotkaId");
  });

  it("useFotkyMazani drží potvrzeniAktualniId pro provedMazani", () => {
    const hook = cti("src/hooks/useFotkyMazani.ts");
    expect(hook).toContain("potvrzeniAktualniId");
    expect(hook).toContain("idAktualniFotkyProPotvrzeni");
  });
});
