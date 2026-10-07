/**
 * tests/faze2-security.test.ts — Krok 7: Fáze 2 (validace expedice,
 * guard matice METOD, kapacita, uzavření, fotky validace) + role
 * negativní testy. Bez DB, bez HTTP — čistě hranice (validace.ts +
 * kontrakt api-types). Rozšiřuje expedice-validace.test.ts a guard.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  EXPEDICE_DETAIL_VZOR,
  EXPEDICE_FOTKA_DETAIL_VZOR,
  EXPEDICE_FOTKY_VZOR,
  EXPEDICE_ODHLASIT_VZOR,
  EXPEDICE_PRIHLASIT_VZOR,
  EXPEDICE_UCASTNICI_VZOR,
  EXPEDICE_UZAVRIT_VZOR,
  EXPEDITIONS_PATH,
  HTTP_STATUS_PRO_KOD,
  MATICE_EXPEDICE,
  PRISTUP_KROK2,
  PRISTUP_KROK6,
  expediceDetailPath,
  expediceListUrl,
  fotkaDetailPath,
  fotkyPath,
  jeApiChyba,
  odhlasitPath,
  prihlasitPath,
  ucastniciPath,
  uzavritPath,
} from "../src/shared/api-types";
import {
  validujFotku,
  validujUpravuExpedice,
  validujUzavreni,
  validujVytvoreniExpedice,
} from "../server/src/validace";

function dobraVyprava(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nazev: "Šumava — Tříjezerní slať",
    datum: "2099-06-12",
    sraz: "Praha hl. n. 7:30",
    popis: "Jednodenní výprava.",
    kapacitaCelkem: 12,
    ...over,
  };
}

function dnesYmd(): string {
  const ted = new Date();
  const rok = ted.getFullYear();
  const mesic = String(ted.getMonth() + 1).padStart(2, "0");
  const den = String(ted.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

/* ------------------------------------------------------------------ */
/* Validace expedice — sraz / popis / kapacita / trim                   */
/* ------------------------------------------------------------------ */

describe("validujVytvoreniExpedice — Fáze 2 rozšíření", () => {
  it("sraz je povinný", () => {
    const vysledek = validujVytvoreniExpedice(dobraVyprava({ sraz: "" }));
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["sraz"]?.length).toBeGreaterThan(0);
  });

  it("krátký sraz neprojde", () => {
    const vysledek = validujVytvoreniExpedice(dobraVyprava({ sraz: "Ab" }));
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["sraz"]?.length).toBeGreaterThan(0);
  });

  it("dlouhý sraz (121) neprojde", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ sraz: "x".repeat(121) }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["sraz"]?.length).toBeGreaterThan(0);
  });

  it("popis 2000 projde, 2001 neprojde", () => {
    expect(
      validujVytvoreniExpedice(dobraVyprava({ popis: "x".repeat(2000) }))
        .uspech,
    ).toBe(true);
    const pres = validujVytvoreniExpedice(
      dobraVyprava({ popis: "x".repeat(2001) }),
    );
    expect(pres.uspech).toBe(false);
    expect(pres.chybyPoli["popis"]?.length).toBeGreaterThan(0);
  });

  it("kapacita 1 a 100 projde (hranice)", () => {
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: 1 })).uspech,
    ).toBe(true);
    expect(
      validujVytvoreniExpedice(dobraVyprava({ kapacitaCelkem: 100 })).uspech,
    ).toBe(true);
  });

  it("kapacita string / záporná / necelá neprojde", () => {
    for (const kapacitaCelkem of [0, -1, 101, 2.5, "12", null]) {
      const vysledek = validujVytvoreniExpedice(
        dobraVyprava({ kapacitaCelkem }),
      );
      expect(vysledek.uspech).toBe(false);
      expect(vysledek.chybyPoli["kapacitaCelkem"]?.length).toBeGreaterThan(0);
    }
  });

  it("název se trimuje", () => {
    const vysledek = validujVytvoreniExpedice(
      dobraVyprava({ nazev: "  Šumava  " }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.nazev).toBe("Šumava");
  });

  it("dnešní datum projde (minulost ne)", () => {
    expect(
      validujVytvoreniExpedice(dobraVyprava({ datum: dnesYmd() })).uspech,
    ).toBe(true);
  });

  it("měsíc 13 ani den 32 neprojde", () => {
    expect(
      validujVytvoreniExpedice(dobraVyprava({ datum: "2099-13-01" })).uspech,
    ).toBe(false);
    expect(
      validujVytvoreniExpedice(dobraVyprava({ datum: "2099-01-32" })).uspech,
    ).toBe(false);
  });
});

describe("validujUpravuExpedice — Fáze 2 rozšíření", () => {
  it("neznámé pole se ignoruje (aditivní kontrakt)", () => {
    const vysledek = validujUpravuExpedice({ neexistuje: 1 });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({});
  });

  it("kapacita jako string neprojde", () => {
    const vysledek = validujUpravuExpedice({ kapacitaCelkem: "12" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["kapacitaCelkem"]?.length).toBeGreaterThan(0);
  });

  it("dlouhý popis v patchi neprojde", () => {
    const vysledek = validujUpravuExpedice({ popis: "x".repeat(2001) });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["popis"]?.length).toBeGreaterThan(0);
  });

  it("krátký sraz v patchi neprojde", () => {
    const vysledek = validujUpravuExpedice({ sraz: "x" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["sraz"]?.length).toBeGreaterThan(0);
  });

  it("non-objekt vrátí chybu těla", () => {
    for (const telo of [null, [], "x"]) {
      const vysledek = validujUpravuExpedice(telo);
      expect(vysledek.uspech).toBe(false);
      expect(vysledek.chybyPoli["telo"]?.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Guard matice METOD (Krok 2 + Krok 6)                                 */
/* ------------------------------------------------------------------ */

describe("MATICE_EXPEDICE — metoda + cesta → kdo", () => {
  it("má právě 9 řádků", () => {
    expect(MATICE_EXPEDICE).toHaveLength(9);
  });

  it("POST/PATCH/DELETE detailu a PATCH uzavrit je ADMIN", () => {
    const najdi = (metoda: string, cesta: string) =>
      MATICE_EXPEDICE.find((r) => r.metoda === metoda && r.cesta === cesta);
    expect(najdi("POST", EXPEDITIONS_PATH)?.kdo).toBe("ADMIN");
    expect(najdi("PATCH", EXPEDICE_DETAIL_VZOR)?.kdo).toBe("ADMIN");
    expect(najdi("DELETE", EXPEDICE_DETAIL_VZOR)?.kdo).toBe("ADMIN");
    expect(najdi("PATCH", EXPEDICE_UZAVRIT_VZOR)?.kdo).toBe("ADMIN");
  });

  it("GET list + GET detail je PUBLIC", () => {
    const najdi = (metoda: string, cesta: string) =>
      MATICE_EXPEDICE.find((r) => r.metoda === metoda && r.cesta === cesta);
    expect(najdi("GET", EXPEDITIONS_PATH)?.kdo).toBe("PUBLIC");
    expect(najdi("GET", EXPEDICE_DETAIL_VZOR)?.kdo).toBe("PUBLIC");
  });

  it("účast (seznam/přihlásit/odhlásit) je USER", () => {
    const najdi = (metoda: string, cesta: string) =>
      MATICE_EXPEDICE.find((r) => r.metoda === metoda && r.cesta === cesta);
    expect(najdi("GET", EXPEDICE_UCASTNICI_VZOR)?.kdo).toBe("USER");
    expect(najdi("POST", EXPEDICE_PRIHLASIT_VZOR)?.kdo).toBe("USER");
    expect(najdi("DELETE", EXPEDICE_ODHLASIT_VZOR)?.kdo).toBe("USER");
  });
});

describe("PRISTUP_KROK2 + PRISTUP_KROK6 — hranice vzorů", () => {
  it("detail je PUBLIC, účast USER, uzavření ADMIN", () => {
    expect(PRISTUP_KROK2[EXPEDICE_DETAIL_VZOR]).toBe("PUBLIC");
    expect(PRISTUP_KROK2[EXPEDICE_UCASTNICI_VZOR]).toBe("USER");
    expect(PRISTUP_KROK2[EXPEDICE_PRIHLASIT_VZOR]).toBe("USER");
    expect(PRISTUP_KROK2[EXPEDICE_ODHLASIT_VZOR]).toBe("USER");
    expect(PRISTUP_KROK2[EXPEDICE_UZAVRIT_VZOR]).toBe("ADMIN");
  });

  it("fotky: seznam PUBLIC, detail ADMIN", () => {
    expect(PRISTUP_KROK6[EXPEDICE_FOTKY_VZOR]).toBe("PUBLIC");
    expect(PRISTUP_KROK6[EXPEDICE_FOTKA_DETAIL_VZOR]).toBe("ADMIN");
  });
});

describe("path helpery — stabilní URL", () => {
  it("staví URL akcí", () => {
    expect(expediceDetailPath("abc")).toBe("/api/expeditions/abc");
    expect(ucastniciPath("abc")).toBe("/api/expeditions/abc/ucastnici");
    expect(prihlasitPath("abc")).toBe("/api/expeditions/abc/prihlasit");
    expect(odhlasitPath("abc")).toBe("/api/expeditions/abc/odhlasit");
    expect(uzavritPath("abc")).toBe("/api/expeditions/abc/uzavrit");
    expect(fotkyPath("abc")).toBe("/api/expeditions/abc/fotky");
    expect(fotkaDetailPath("abc", "f1")).toBe("/api/expeditions/abc/fotky/f1");
  });

  it("expediceListUrl kóduje stav i stránkování", () => {
    expect(expediceListUrl({})).toBe("/api/expeditions");
    expect(expediceListUrl({ stav: "proběhlá" })).toContain("stav=");
    expect(expediceListUrl({ page: 2, pageSize: 5 })).toContain("page=2");
  });
});

/* ------------------------------------------------------------------ */
/* Kapacita + uzavření — kódy a pravidla                                */
/* ------------------------------------------------------------------ */

describe("kapacita — kontrakt kódů", () => {
  it("plná výprava je 409 KAPACITA_PLNA", () => {
    expect(HTTP_STATUS_PRO_KOD["KAPACITA_PLNA"]).toBe(409);
  });

  it("snížení kapacity pod přihlášené hlídá server (validátor pustí tvar)", () => {
    // Hranice validuje jen tvar 1–100; srovnání s COUNTem dělá route nad DB
    // (PATCH → 422 s kapacitaCelkem, viz smoke-krok7). Tady jen tvar projde.
    const vysledek = validujUpravuExpedice({ kapacitaCelkem: 1 });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.kapacitaCelkem).toBe(1);
  });

  it("duplicitní přihláška je 409 UZ_PRIHLASEN", () => {
    expect(HTTP_STATUS_PRO_KOD["UZ_PRIHLASEN"]).toBe(409);
  });
});

describe("uzavření — kontrakt + validace tvaru", () => {
  it("opakované uzavření je 409 VYPRAVA_UZAVRENA", () => {
    expect(HTTP_STATUS_PRO_KOD["VYPRAVA_UZAVRENA"]).toBe(409);
  });

  it("ucastnikId se trimuje", () => {
    const vysledek = validujUzavreni({
      dochazka: [{ ucastnikId: "  abc  ", status: "ucastnil_se" }],
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.dochazka[0]?.ucastnikId).toBe("abc");
  });

  it("prázdné ucastnikId ani status prihlasen neprojde", () => {
    expect(
      validujUzavreni({ dochazka: [{ ucastnikId: "   ", status: "ucastnil_se" }] })
        .uspech,
    ).toBe(false);
    expect(
      validujUzavreni({ dochazka: [{ ucastnikId: "abc", status: "prihlasen" }] })
        .uspech,
    ).toBe(false);
  });

  it("non-record položka a non-array docházka neprojde", () => {
    expect(validujUzavreni({ dochazka: [null] }).uspech).toBe(false);
    expect(validujUzavreni({ dochazka: "x" }).uspech).toBe(false);
    expect(validujUzavreni(null).uspech).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Fotky validace (Krok 6, URL režim)                                   */
/* ------------------------------------------------------------------ */

describe("validujFotku — URL režim", () => {
  it("projde s https URL a popiskem", () => {
    const vysledek = validujFotku({
      url: "https://example.cz/foto.jpg",
      popis: "Tříjezerní slať",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.popis).toBe("Tříjezerní slať");
  });

  it("popis je nepovinný (default prázdný)", () => {
    const vysledek = validujFotku({ url: "https://example.cz/foto.jpg" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.popis).toBe("");
  });

  it("http ani bez protokolu neprojde", () => {
    for (const url of [
      "http://example.cz/foto.jpg",
      "example.cz/foto.jpg",
      "ftp://example.cz/foto.jpg",
    ]) {
      const vysledek = validujFotku({ url });
      expect(vysledek.uspech).toBe(false);
      expect(vysledek.chybyPoli["url"]?.length).toBeGreaterThan(0);
    }
  });

  it("prázdná a non-string URL neprojde", () => {
    for (const url of ["", "   ", 123, null]) {
      const vysledek = validujFotku({ url });
      expect(vysledek.uspech).toBe(false);
      expect(vysledek.chybyPoli["url"]?.length).toBeGreaterThan(0);
    }
  });

  it("URL nad 2048 znaků neprojde", () => {
    const vysledek = validujFotku({
      url: `https://example.cz/${"x".repeat(2100)}`,
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["url"]?.length).toBeGreaterThan(0);
  });

  it("popis 500 projde, 501 neprojde", () => {
    expect(
      validujFotku({
        url: "https://example.cz/foto.jpg",
        popis: "x".repeat(500),
      }).uspech,
    ).toBe(true);
    const pres = validujFotku({
      url: "https://example.cz/foto.jpg",
      popis: "x".repeat(501),
    });
    expect(pres.uspech).toBe(false);
    expect(pres.chybyPoli["popis"]?.length).toBeGreaterThan(0);
  });

  it("non-string popis neprojde", () => {
    const vysledek = validujFotku({
      url: "https://example.cz/foto.jpg",
      popis: 42,
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["popis"]?.length).toBeGreaterThan(0);
  });

  it("URL i popis se trimují", () => {
    const vysledek = validujFotku({
      url: "  https://example.cz/foto.jpg  ",
      popis: "  Krásná slať  ",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.popis).toBe("Krásná slať");
  });

  it("non-objekt vrátí chybu těla", () => {
    const vysledek = validujFotku(null);
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["telo"]?.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Role negativní testy + TS strict (jeApiChyba hrany)                  */
/* ------------------------------------------------------------------ */

describe("role negativní — jeApiChyba hrany", () => {
  it("odmítne neúplné a cizí tvary", () => {
    expect(jeApiChyba(undefined)).toBe(false);
    expect(jeApiChyba("chyba")).toBe(false);
    expect(jeApiChyba({ error: null })).toBe(false);
    expect(jeApiChyba({ error: { code: 42, message: "x" } })).toBe(false);
    expect(jeApiChyba({ error: { code: "NEPRIHLASEN" } })).toBe(false);
    expect(
      jeApiChyba({ error: { code: "NEPRIHLASEN", message: "N." } }),
    ).toBe(true);
  });
});
