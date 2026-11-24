import { describe, expect, it } from "vitest";
import type { ApiFotka } from "../src/shared/api-typy/expedice";
import { fotkyMimoNahled, priradZastupne, vyberZastupnou } from "../src/lib/zastupne-fotky";

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
      { idVypravy: "tahle", fotkaId: "vlastni" },
      { idVypravy: "minula", fotkaId: "cizi" },
    ];
    const prvni = vyberZastupnou("tahle", bazen);
    expect(prvni).toEqual({ idVypravy: "minula", fotkaId: "cizi" });
    expect(vyberZastupnou("tahle", bazen)).toEqual(prvni);
    expect(vyberZastupnou("tahle", [{ idVypravy: "tahle", fotkaId: "vlastni" }])).toBeNull();
  });

  it("da kazde vyprave jinou fotku", () => {
    const bazen = [
      { idVypravy: "minula", fotkaId: "a" },
      { idVypravy: "minula", fotkaId: "b" },
    ];
    const prirazeni = priradZastupne(["prvni", "druha"], bazen);
    const fotky = [...prirazeni.values()].map((fotka) => fotka.fotkaId);
    expect(new Set(fotky).size).toBe(2);
    expect(priradZastupne(["prvni", "druha"], bazen)).toEqual(prirazeni);
  });

  it("vyprave necha fotku i po zmene seznamu a bazenu", () => {
    const bazen = ["a", "b", "c"].map((fotkaId) => ({ idVypravy: "minula", fotkaId }));
    const prvni = priradZastupne(["hero"], bazen);
    const vetsi = [...bazen, { idVypravy: "jina", fotkaId: "d" }, { idVypravy: "jina", fotkaId: "e" }];
    const potom = priradZastupne(["aaa", "hero", "zzz"], vetsi, prvni);
    expect(potom.get("hero")).toEqual(prvni.get("hero"));
    expect(new Set([...potom.values()].map((fotka) => fotka.fotkaId)).size).toBe(3);
    const bezPuvodni = vetsi.filter((fotka) => fotka.fotkaId !== prvni.get("hero")?.fotkaId);
    expect(priradZastupne(["hero"], bezPuvodni, prvni).get("hero")).not.toEqual(prvni.get("hero"));
  });
});
