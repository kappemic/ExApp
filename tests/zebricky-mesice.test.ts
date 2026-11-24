import { describe, expect, it } from "vitest";
import { kmPodleLet, kmPodleMesicu, mesiceRoku, nazevMesice, soucetKm } from "../src/lib/zebricky-mesice";

const TRASY = [
  { datum: "2024-10-05", km: 12.5 },
  { datum: "2026-02-10", km: 8 },
  { datum: "2026-02-20", km: null },
  { datum: "2026-09-01", km: 10.1 },
];

describe("kilometry podle měsíců a let", () => {
  it("rok má vždy 12 měsíců od ledna, prázdné s nulou", () => {
    const mesice = mesiceRoku(TRASY, 2026);
    expect(mesice).toHaveLength(12);
    expect(mesice[0]).toEqual({ klic: "2026-01", popisek: "led", km: 0 });
    expect(mesice[1]?.km).toBe(8);
    expect(mesice[8]?.km).toBe(10.1);
  });

  it("roky jdou po sobě i přes rok bez výprav", () => {
    expect(kmPodleLet(TRASY).map((r) => [r.rok, r.km, r.vypravy])).toEqual([
      [2024, 12.5, 1],
      [2025, 0, 0],
      [2026, 18.1, 3],
    ]);
  });

  it("bez výprav nebo s vadným datem nevrací nic", () => {
    expect(kmPodleLet([])).toEqual([]);
    expect(kmPodleLet([{ datum: "", km: 5 }])).toEqual([]);
  });

  it("součet nemá zbytky po desetinných číslech", () => {
    expect(soucetKm([{ datum: "2026-01-01", km: 0.1 }, { datum: "2026-01-02", km: 0.2 }])).toBe(0.3);
  });

  it("název měsíce z klíče", () => {
    expect(nazevMesice("2026-10")).toBe("říjen 2026");
  });

  it("malý graf zůstává na čtyřech posledních měsících", () => {
    const pet = ["01", "02", "03", "04", "05"].map((m) => ({ datum: `2026-${m}-01`, km: 1 }));
    expect(kmPodleMesicu(pet).map((m) => m.klic)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05"]);
  });
});
