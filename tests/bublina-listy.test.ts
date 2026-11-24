import { describe, expect, it } from "vitest";
import { KROK_PRESKOKU_MS, preskokBubliny } from "../src/lib/bublina-listy";

const KAPSLE = { sirka: 333, presah: 2 };
const klid = (l: number): { l: number; r: number; vl: number; vr: number } => ({ l, r: l + 65, vl: 0, vr: 0 });

describe("preskokBubliny", () => {
  it("začne na místě, skončí přesně v cíli a trvá pod 0,7 s", () => {
    const snimky = preskokBubliny(klid(0), { l: 134, r: 199 }, KAPSLE);
    expect(snimky[0]).toMatchObject({ l: 0, r: 65 });
    expect(snimky[snimky.length - 1]).toEqual({ l: 134, r: 199, vl: 0, vr: 0, vyska: 1 });
    expect((snimky.length - 1) * KROK_PRESKOKU_MS).toBeLessThan(700);
  });

  it("vedoucí kraj předběhne zadní, takže se bublina protáhne a zúží", () => {
    for (const [od, cil] of [
      [0, 268],
      [268, 0],
    ] as const) {
      const snimky = preskokBubliny(klid(od), { l: cil, r: cil + 65 }, KAPSLE);
      expect(Math.max(...snimky.map((s) => s.r - s.l))).toBeGreaterThan(65 * 1.4);
      expect(Math.min(...snimky.map((s) => s.vyska))).toBeLessThan(0.95);
      expect(Math.min(...snimky.map((s) => s.vyska))).toBeGreaterThanOrEqual(0.84);
    }
  });

  it("nevyjede z kapsle", () => {
    const snimky = [
      ...preskokBubliny(klid(0), { l: 268, r: 333 }, KAPSLE),
      ...preskokBubliny(klid(268), { l: 0, r: 65 }, KAPSLE),
    ];
    expect(Math.min(...snimky.map((s) => s.l))).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...snimky.map((s) => s.r))).toBeLessThanOrEqual(335);
  });

  it("bublina se nikdy nepřetočí ani při změně směru v letu", () => {
    const tam = preskokBubliny(klid(0), { l: 268, r: 333 }, KAPSLE);
    const uprostred = tam[6]!;
    const zpet = preskokBubliny(uprostred, { l: 0, r: 65 }, KAPSLE);
    expect(zpet[0]).toMatchObject({ l: uprostred.l, r: uprostred.r });
    expect(Math.min(...zpet.map((s) => s.r - s.l))).toBeGreaterThan(40);
  });
});
