import { describe, expect, it } from "vitest";
import {
  castiZpravy,
  idPrijemcu,
  nabidkyZminky,
  rozparsujZminky,
  rozpracovanaZminka,
  vlozZminku,
  type ClenProZminku,
} from "../src/shared/zminky";

const LIDE: ClenProZminku[] = [
  { id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", clenstvi: "clen", funkce: null, isAdmin: false, isSuperadmin: false },
  { id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2", clenstvi: "aktivni_clen", funkce: null, isAdmin: false, isSuperadmin: false },
  { id: "aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3", clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: true, isSuperadmin: false },
  { id: "aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaa4", clenstvi: "aktivni_clen", funkce: "rada", isAdmin: false, isSuperadmin: false },
];

describe("zmínky", () => {
  it("vezme role, člověka a ignoruje cizí zavináč", () => {
    const text =
      "Ahoj @everyone a @clen, taky @aktivni-clen @user:aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2. Mail a@clen.cz ne.";
    expect(rozparsujZminky(text).map((zminka) => zminka.druh)).toEqual([
      "everyone",
      "clen",
      "aktivni-clen",
      "uzivatel",
    ]);
    expect(rozparsujZminky("@everyone @everyone")).toHaveLength(1);
  });

  it("rozdá příjemce podle členství a vynechá autora", () => {
    const zminky = rozparsujZminky("@clen @vedeni @admin");
    expect(idPrijemcu(zminky, LIDE, LIDE[2]?.id ?? "")).toEqual([
      "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    ]);
    expect(idPrijemcu(rozparsujZminky("@everyone"), LIDE, LIDE[0]?.id ?? "")).toHaveLength(3);
  });

  it("našeptá podle rozepsaného zavináče a vloží token", () => {
    expect(rozpracovanaZminka("nazdar @ve", 10)).toEqual({ od: 7, dotaz: "ve" });
    expect(rozpracovanaZminka("bez", 3)).toBeNull();
    expect(nabidkyZminky("ve", []).map((nabidka) => nabidka.token)).toEqual(["@vedeni"]);
    expect(vlozZminku("ahoj @ve", 5, 8, "@vedeni")).toBe("ahoj @vedeni ");
    expect(castiZpravy("čau @rada")[1]).toMatchObject({ druh: "zminka", popisek: "Rada" });
  });
});
