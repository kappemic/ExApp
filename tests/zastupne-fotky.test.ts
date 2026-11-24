import { describe, expect, it } from "vitest";
import type { ApiFotka } from "../src/shared/api-typy/expedice";
import {
  fotkyMimoNahled,
  priradZastupne,
  urlZastupneFotky,
  vyberZastupnou,
} from "../src/lib/zastupne-fotky";
import { ALBUM_NAHLEDY_ID } from "../src/shared/fotky-nahledy";

function fotka(id: string, jeNahled: boolean): ApiFotka {
  return {
    id,
    expeditionId: "minula",
    url: "",
    popis: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    jeNahled,
  };
}

describe("zastupne fotky", () => {
  it("vynecha nahled a jedinou fotku bere jako nahled", () => {
    expect(fotkyMimoNahled([fotka("a", true), fotka("b", false)]).map((f) => f.id)).toEqual(["b"]);
    expect(fotkyMimoNahled([fotka("a", false), fotka("b", false)]).map((f) => f.id)).toEqual(["b"]);
    expect(fotkyMimoNahled([fotka("a", false)])).toEqual([]);
  });

  it("vybere stejnou cizi fotku a ne tu z vlastni vypravy", () => {
    const bazen = [
      { idAlba: "tahle", fotkaId: "vlastni" },
      { idAlba: "minula", fotkaId: "cizi" },
    ];
    const prvni = vyberZastupnou("tahle", bazen);
    expect(prvni).toEqual({ idAlba: "minula", fotkaId: "cizi" });
    expect(vyberZastupnou("tahle", bazen)).toEqual(prvni);
    expect(vyberZastupnou("tahle", [{ idAlba: "tahle", fotkaId: "vlastni" }])).toBeNull();
  });

  it("da kazde vyprave jinou fotku", () => {
    const bazen = [
      { idAlba: "minula", fotkaId: "a" },
      { idAlba: "minula", fotkaId: "b" },
    ];
    const prirazeni = priradZastupne(["prvni", "druha"], bazen);
    const fotky = [...prirazeni.values()].map((fotka) => fotka.fotkaId);
    expect(new Set(fotky).size).toBe(2);
    expect(priradZastupne(["prvni", "druha"], bazen)).toEqual(prirazeni);
  });

  it("vyprave necha fotku i po zmene seznamu a bazenu", () => {
    const bazen = ["a", "b", "c"].map((fotkaId) => ({ idAlba: "minula", fotkaId }));
    const prvni = priradZastupne(["hero"], bazen);
    const vetsi = [...bazen, { idAlba: "jina", fotkaId: "d" }, { idAlba: "jina", fotkaId: "e" }];
    const potom = priradZastupne(["aaa", "hero", "zzz"], vetsi, prvni);
    expect(potom.get("hero")).toEqual(prvni.get("hero"));
    expect(new Set([...potom.values()].map((fotka) => fotka.fotkaId)).size).toBe(3);
    const bezPuvodni = vetsi.filter((fotka) => fotka.fotkaId !== prvni.get("hero")?.fotkaId);
    expect(priradZastupne(["hero"], bezPuvodni, prvni).get("hero")).not.toEqual(prvni.get("hero"));
  });

  const album = (pocet: number) =>
    Array.from({ length: pocet }, (_, i) => ({ idAlba: ALBUM_NAHLEDY_ID, fotkaId: `foto-${i}` }));
  const vypravy = (pocet: number) => Array.from({ length: pocet }, (_, i) => `vyprava-${i}`);

  it("nikdy neda stejnou fotku dvema vypravam po sobe", () => {
    for (let pocetFotek = 1; pocetFotek <= 8; pocetFotek += 1) {
      const ids = vypravy(60);
      const prirazeni = priradZastupne(ids, album(pocetFotek));
      for (let i = 1; i < ids.length; i += 1) {
        const tahle = prirazeni.get(ids[i] ?? "")?.fotkaId;
        const minula = prirazeni.get(ids[i - 1] ?? "")?.fotkaId;
        if (tahle !== undefined) expect(tahle).not.toBe(minula);
        if (pocetFotek >= 2) expect(tahle).toBeDefined();
      }
    }
  });

  it("stejna fotka po sobe nezustane ani ze starsiho prirazeni", () => {
    const [prvni] = album(1);
    if (prvni === undefined) throw new Error("bez fotky");
    const drivejsi = new Map([["a", prvni], ["b", prvni]]);
    const prirazeni = priradZastupne(["a", "b"], album(3), drivejsi);
    expect(prirazeni.get("a")).toEqual(prvni);
    expect(prirazeni.get("b")).toBeDefined();
    expect(prirazeni.get("b")).not.toEqual(prvni);
  });

  it("pri dostatku fotek se zadna neopakuje ani obden a pouziji se vsechny", () => {
    const ids = vypravy(60);
    const prirazeni = priradZastupne(ids, album(6));
    for (let i = 3; i < ids.length; i += 1) {
      const ctverice = [i - 3, i - 2, i - 1, i].map((j) => prirazeni.get(ids[j] ?? "")?.fotkaId);
      expect(new Set(ctverice).size).toBe(4);
    }
    expect(new Set([...prirazeni.values()].map((f) => f.fotkaId)).size).toBe(6);
  });

  it("vyber nezavisi na poradi fotek z API", () => {
    const ids = vypravy(20);
    expect(priradZastupne(ids, [...album(7)].reverse())).toEqual(priradZastupne(ids, album(7)));
  });

  it("fotku z alba nahledu bere pres soubor alba", () => {
    expect(urlZastupneFotky({ idAlba: ALBUM_NAHLEDY_ID, fotkaId: "f" })).toContain(
      `/api/alba/${ALBUM_NAHLEDY_ID}/fotky/f/soubor`,
    );
    expect(urlZastupneFotky({ idAlba: "minula", fotkaId: "f" })).toContain(
      "/api/expeditions/minula/fotky/f/soubor",
    );
  });
});
