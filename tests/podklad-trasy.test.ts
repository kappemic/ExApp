import { describe, expect, it } from "vitest";
import { naMercator, sestavPodkladTrasy } from "../src/lib/podklad-trasy";
import type { Souradnice } from "../src/lib/polyline";

function zMercatoru(x: number, y: number): Souradnice {
  const lng = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function bod(body: string, index: number): { x: number; y: number } {
  const par = body.split(" ")[index]?.split(",").map(Number) ?? [];
  return { x: par[0] ?? 0, y: par[1] ?? 0 };
}

describe("podklad trasy", () => {
  it("stejný posun na mapě má stejné pixely, čára se nenatáhne do rámečku", () => {
    const stred = naMercator({ lat: 50, lng: 14 });
    const krok = 0.002;
    const vychod = zMercatoru(stred.x + krok, stred.y);
    const jih = zMercatoru(stred.x, stred.y + krok);
    const podklad = sestavPodkladTrasy(
      [{ lat: 50, lng: 14 }, vychod, jih],
      200,
      120,
    );
    expect(podklad).not.toBeNull();
    const a = bod(podklad?.body ?? "", 0);
    const b = bod(podklad?.body ?? "", 1);
    const c = bod(podklad?.body ?? "", 2);
    const vodorovne = Math.hypot(b.x - a.x, b.y - a.y);
    const svisle = Math.hypot(c.x - a.x, c.y - a.y);
    expect(vodorovne).toBeGreaterThan(20);
    expect(svisle).toBeCloseTo(vodorovne, 0);
  });

  it("dlaždice pokrývají plochu a čára zůstane uvnitř", () => {
    const podklad = sestavPodkladTrasy(
      [
        { lat: 49.95, lng: 13.85 },
        { lat: 50.02, lng: 13.95 },
        { lat: 49.98, lng: 14.05 },
      ],
      280,
      180,
    );
    expect(podklad).not.toBeNull();
    expect(podklad?.dlazdice.length).toBeGreaterThan(0);
    expect(podklad?.dlazdice[0]?.src).toContain("tile.openstreetmap.org");
    for (const par of (podklad?.body ?? "").split(" ")) {
      const [x, y] = par.split(",").map(Number);
      expect(x ?? 0).toBeGreaterThan(0);
      expect(x ?? 0).toBeLessThan(280);
      expect(y ?? 0).toBeGreaterThan(0);
      expect(y ?? 0).toBeLessThan(180);
    }
  });
});
