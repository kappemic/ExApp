import { describe, expect, it } from "vitest";
import {
  VYCHOZI_KOD_ZEME,
  formatujNarodniTelefon,
  kodZemeZTelefonu,
  narodniCastTelefonu,
  normalizujTelefon,
  seznamZemi,
  zobrazeniTelefonu,
} from "../src/shared/telefon";

describe("telefon", () => {
  it("výchozí země je CZ s předvolbou +420", () => {
    expect(VYCHOZI_KOD_ZEME).toBe("CZ");
    const zeme = seznamZemi();
    expect(zeme[0]).toMatchObject({ kod: "CZ", predvolba: "+420", nazev: "Česko" });
  });

  it("české národní číslo uloží jako E.164 a zobrazí mezinárodně", () => {
    expect(normalizujTelefon("777 123 456", "CZ")).toEqual({
      ok: true,
      e164: "+420777123456",
    });
    expect(zobrazeniTelefonu("+420777123456")).toEqual({
      text: "+420 777 123 456",
      href: "tel:+420777123456",
    });
    expect(narodniCastTelefonu("+420777123456")).toBe("777 123 456");
  });

  it("číslo bez předvolby při zobrazení bere jako české", () => {
    expect(zobrazeniTelefonu("777123456")).toEqual({
      text: "+420 777 123 456",
      href: "tel:+420777123456",
    });
    expect(kodZemeZTelefonu("777 123 456")).toBe("CZ");
  });

  it("změna země přeformátuje národní část", () => {
    expect(formatujNarodniTelefon("777123456", "CZ")).toBe("777 123 456");
    expect(formatujNarodniTelefon("777 123 456", "CZ")).toBe("777 123 456");
    expect(formatujNarodniTelefon("2025550123", "US")).toBe("(202) 555-0123");
    expect(formatujNarodniTelefon("2025550123", "CZ")).not.toBe("(202) 555-0123");
  });

  it("neparsovatelný starý text zobrazí beze změny a bez tel odkazu", () => {
    expect(zobrazeniTelefonu("volejte po 18.")).toEqual({
      text: "volejte po 18.",
      href: null,
    });
  });

  it("prázdný vstup je null, neprázdný neplatný vstup selže", () => {
    expect(normalizujTelefon("", "CZ")).toEqual({ ok: true, e164: null });
    expect(normalizujTelefon("   ", "CZ")).toEqual({ ok: true, e164: null });
    expect(normalizujTelefon("abc", "CZ")).toEqual({ ok: false });
    expect(zobrazeniTelefonu(null)).toEqual({ text: "", href: null });
    expect(zobrazeniTelefonu(undefined)).toEqual({ text: "", href: null });
  });

  it("seznam zemí má Česko první a obsahuje Slovensko i USA", () => {
    const zeme = seznamZemi();
    expect(zeme.length).toBeGreaterThan(200);
    expect(zeme[0]?.kod).toBe("CZ");
    expect(zeme.find((polozka) => polozka.kod === "SK")).toMatchObject({
      predvolba: "+421",
      nazev: "Slovensko",
    });
    expect(zeme.find((polozka) => polozka.kod === "US")).toMatchObject({
      predvolba: "+1",
      nazev: "Spojené státy",
    });
    const bezCeska = zeme.slice(1);
    const serazeno = [...bezCeska].sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"));
    expect(bezCeska.map((polozka) => polozka.kod)).toEqual(serazeno.map((polozka) => polozka.kod));
  });

  it("z E.164 vybere zemi pro předvolbu ve formuláři", () => {
    expect(kodZemeZTelefonu("+421903123456")).toBe("SK");
    expect(kodZemeZTelefonu("+420777123456")).toBe("CZ");
    expect(kodZemeZTelefonu(null)).toBe("CZ");
  });
});
