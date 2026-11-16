import { describe, expect, it } from "vitest";
import { seskupUcastniky } from "../src/lib/ucastnici";
import type { ApiUcastnik } from "../src/shared/api-types";

function u(id: string, status: ApiUcastnik["status"]): ApiUcastnik {
  return {
    id,
    expeditionId: "v",
    userId: null,
    clenId: null,
    jmeno: id,
    status,
    createdAt: "2026-11-01T10:00:00Z",
  };
}

describe("seskupUcastniky", () => {
  it("nadcházející výprava má jednu skupinu Přihlášení", () => {
    const skupiny = seskupUcastniky([u("a", "prihlasen"), u("b", "prihlasen")], false);
    expect(skupiny.map((s) => s.klic)).toEqual(["prihlaseni"]);
    expect(skupiny[0]!.ucastnici).toHaveLength(2);
  });

  it("prázdný seznam nemá skupiny", () => {
    expect(seskupUcastniky([], false)).toEqual([]);
    expect(seskupUcastniky([], true)).toEqual([]);
  });

  it("po termínu drží přihlášené a dorazilé pohromadě, omluvené zvlášť", () => {
    const skupiny = seskupUcastniky(
      [u("a", "omluven"), u("b", "ucastnil_se"), u("c", "prihlasen"), u("d", "ucastnil_se")],
      true,
    );
    expect(skupiny.map((s) => s.klic)).toEqual(["prihlaseni", "omluveni"]);
    expect(skupiny[0]!.nadpis).toBe("");
    expect(skupiny[0]!.ucastnici.map((x) => x.id)).toEqual(["b", "c", "d"]);
    expect(skupiny[1]!.tlumene).toBe(true);
    expect(skupiny[1]!.ucastnici.map((x) => x.id)).toEqual(["a"]);
  });

  it("prázdné skupiny vypadnou", () => {
    const skupiny = seskupUcastniky([u("a", "prihlasen")], true);
    expect(skupiny.map((s) => s.klic)).toEqual(["prihlaseni"]);
  });
});
