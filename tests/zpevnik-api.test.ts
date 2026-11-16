/**
 * Songbook access rules and migration shape. No database and no HTTP.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { zpevnikPisne } from "../drizzle/schema/zpevnik_pisne";
import { klicParu, overVstupPisne } from "../src/shared/zpevnik";
import {
  hlaskyVstupu,
  jeKolizeVydane,
  jeSchvalovatel,
  smiSchvalit,
  smiUpravitVydanou,
  vidiNavrh,
  type UcetZpevniku,
} from "../server/src/zpevnik-pristup";

const CLEN: UcetZpevniku = {
  id: "clen",
  isAdmin: false,
  isSuperadmin: false,
  funkce: null,
};
const RADA: UcetZpevniku = {
  id: "rada",
  isAdmin: false,
  isSuperadmin: false,
  funkce: "rada",
};
const VEDENI: UcetZpevniku = {
  id: "vedeni",
  isAdmin: false,
  isSuperadmin: false,
  funkce: "vedeni",
};
const ADMIN: UcetZpevniku = {
  id: "admin",
  isAdmin: true,
  isSuperadmin: false,
  funkce: null,
};
const SUPERADMIN: UcetZpevniku = {
  id: "super",
  isAdmin: true,
  isSuperadmin: true,
  funkce: null,
};

const TELO = { bloky: [{ typ: "sloka" as const, radky: [{ slabiky: [{ text: "Ahoj" }] }] }] };

describe("kdo smí schvalovat", () => {
  it("pustí vedení, admina i superadmina a radu ne", () => {
    expect(jeSchvalovatel(CLEN)).toBe(false);
    expect(jeSchvalovatel(RADA)).toBe(false);
    expect(jeSchvalovatel(VEDENI)).toBe(true);
    expect(jeSchvalovatel(ADMIN)).toBe(true);
    expect(jeSchvalovatel(SUPERADMIN)).toBe(true);
    expect(smiSchvalit(VEDENI)).toBe(true);
    expect(smiSchvalit(CLEN)).toBe(false);
    expect(smiUpravitVydanou(CLEN)).toBe(false);
    expect(smiUpravitVydanou(ADMIN)).toBe(true);
  });

  it("cizí návrh člen ani rada nevidí, vedení ano, vlastní ano", () => {
    expect(vidiNavrh(CLEN, "clen")).toBe(true);
    expect(vidiNavrh(CLEN, "nekdo")).toBe(false);
    expect(vidiNavrh(RADA, "nekdo")).toBe(false);
    expect(vidiNavrh(VEDENI, "nekdo")).toBe(true);
    expect(vidiNavrh(CLEN, null)).toBe(false);
    expect(vidiNavrh(ADMIN, null)).toBe(true);
  });
});

describe("kolize vydané písně", () => {
  it("stejný pár bez diakritiky je kolize, jiný autor ne", () => {
    const klic = klicParu("Píseň", "Dvořák");
    const vydane = [{ id: "a", parKlic: klic }];
    expect(jeKolizeVydane(klicParu("pisen", "dvorak"), vydane)).toBe(true);
    expect(jeKolizeVydane(klicParu("Píseň", "Novák"), vydane)).toBe(false);
    expect(jeKolizeVydane(klic, vydane, "a")).toBe(false);
  });
});

describe("vstup písně", () => {
  it("vezme název, autora a text a sjednotí anglické B na H", () => {
    const vysledek = overVstupPisne({
      nazev: "  Píseň  ",
      autor: " Dvořák ",
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [{ slabiky: [{ text: "A", akord: "B" }, { text: "hoj" }] }],
          },
        ],
      },
    });
    expect(vysledek.ok).toBe(true);
    if (!vysledek.ok) return;
    expect(vysledek.hodnota.nazev).toBe("Píseň");
    expect(vysledek.hodnota.autor).toBe("Dvořák");
    expect(vysledek.hodnota.parKlic).toBe(klicParu("Píseň", "Dvořák"));
    expect(vysledek.hodnota.telo.bloky[0]?.radky[0]?.slabiky[0]?.akord).toBe("B");
  });

  it("odmítne prázdný název, autora, text i rozbitý akord", () => {
    expect(overVstupPisne({ nazev: "  ", autor: "A", telo: TELO }).ok).toBe(false);
    expect(overVstupPisne({ nazev: "N", autor: " ", telo: TELO })).toMatchObject({
      ok: false,
      duvod: "chybi_autor",
    });
    expect(
      overVstupPisne({
        nazev: "N",
        autor: "A",
        telo: { bloky: [{ typ: "sloka", radky: [{ slabiky: [{ text: "   " }] }] }] },
      }),
    ).toMatchObject({ ok: false, duvod: "chybi_text" });
    expect(
      overVstupPisne({
        nazev: "N",
        autor: "A",
        telo: { bloky: [{ typ: "sloka", radky: [{ slabiky: [{ text: "A", akord: "neakord" }] }] }] },
      }),
    ).toMatchObject({ ok: false, duvod: "spatne_akordy" });
    expect(hlaskyVstupu("chybi_nazev").nazev?.[0]).toContain("název");
  });
});

describe("migrace 0022_zpevnik.sql", () => {
  const obsah = readFileSync("drizzle/migrations/0022_zpevnik.sql", "utf8");

  it("zakládá tabulku idempotentně a nemá DROP", () => {
    expect(obsah).toContain("CREATE TABLE IF NOT EXISTS zpevnik_pisne");
    expect(obsah).toContain("CREATE UNIQUE INDEX IF NOT EXISTS zpevnik_pisne_par_schvalena");
    const prikazDrop = obsah.split(/\r?\n/).some((radek) => /^\s*drop\b/i.test(radek));
    expect(prikazDrop).toBe(false);
  });

  it("drží autora na users a stav jen návrh nebo schválená", () => {
    expect(obsah).toContain("REFERENCES users(id) ON DELETE SET NULL");
    expect(obsah).toContain("stav IN ('navrh', 'schvalena')");
    expect(getTableConfig(zpevnikPisne).name).toBe("zpevnik_pisne");
  });
});
