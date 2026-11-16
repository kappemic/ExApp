import { describe, expect, it } from "vitest";
import {
  HLASKA_OKNO_SMAZANI,
  HLASKA_ZAKAZ_SMAZANI,
  OKNO_SMAZANI_ZPRAVY_MS,
  hlaskaZakazuSmazani,
  jeAdminUcet,
  smiSmazatZpravu,
} from "../src/shared/mazani-zprav";

const TED = new Date("2026-10-19T18:00:00.000Z");

function pred(ms: number): string {
  return new Date(TED.getTime() - ms).toISOString();
}

describe("smiSmazatZpravu", () => {
  it("okno je 10 minut", () => {
    expect(OKNO_SMAZANI_ZPRAVY_MS).toBe(10 * 60 * 1000);
  });

  it("autor smaže vlastní zprávu do 10 minut včetně", () => {
    expect(
      smiSmazatZpravu({
        jeAdmin: false,
        jeAutor: true,
        createdAt: pred(OKNO_SMAZANI_ZPRAVY_MS),
        ted: TED,
      }),
    ).toBe(true);
    expect(
      smiSmazatZpravu({
        jeAdmin: false,
        jeAutor: true,
        createdAt: pred(OKNO_SMAZANI_ZPRAVY_MS + 1),
        ted: TED,
      }),
    ).toBe(false);
  });

  it("cizí zprávu smaže jen admin, i když je stará", () => {
    const stara = pred(24 * 60 * 60 * 1000);
    expect(smiSmazatZpravu({ jeAdmin: false, jeAutor: false, createdAt: stara, ted: TED })).toBe(false);
    expect(smiSmazatZpravu({ jeAdmin: true, jeAutor: false, createdAt: stara, ted: TED })).toBe(true);
  });

  it("superadmin počítá jako admin", () => {
    expect(jeAdminUcet({ isAdmin: false, isSuperadmin: true })).toBe(true);
    expect(jeAdminUcet({ isAdmin: false })).toBe(false);
  });

  it("po okně dostane autor jinou hlášku než cizí účet", () => {
    const stare = { jeAdmin: false, jeAutor: true, createdAt: pred(OKNO_SMAZANI_ZPRAVY_MS + 1), ted: TED };
    expect(hlaskaZakazuSmazani(stare)).toBe(HLASKA_OKNO_SMAZANI);
    expect(
      hlaskaZakazuSmazani({ jeAdmin: false, jeAutor: false, createdAt: pred(1000), ted: TED }),
    ).toBe(HLASKA_ZAKAZ_SMAZANI);
    expect(
      hlaskaZakazuSmazani({ jeAdmin: true, jeAutor: false, createdAt: pred(1000), ted: TED }),
    ).toBeNull();
  });
});
