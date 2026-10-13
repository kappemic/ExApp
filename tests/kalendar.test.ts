/**
 * tests/kalendar.test.ts — Fáze 3: čistá logika měsíčního kalendáře.
 * Po–Ne mřížka, dny výpravy (od–do), rozpad týdenních schůzek, sjednocení.
 */
import { describe, expect, it } from "vitest";
import {
  dnuVMesici,
  dnyVypravy,
  getDayVariant,
  jeStejnaVyprava,
  mesicMrizka,
  mesicMrizkaSKontextem,
  nazevMesice,
  popisekDne,
  poradiVypravy,
  poziceVPasu,
  schuzkyDne,
  sklonujAkce,
  tydenMrizka,
  udalostiProMesic,
  udalostiProTyden,
  vypravyDne,
  vyskytySchuzky,
  type KalendarniUdalost,
} from "../src/lib/kalendar";

function u(typ: "vyprava" | "schuzka", id: string): KalendarniUdalost {
  return { typ, id, nazev: id, datum: "2026-10-12", detail: null };
}

describe("mesicMrizka (Po–Ne, vždy 5x7/6x7 YMD)", () => {
  it("říjen 2026: vždy 35 buněk, leading 28.–30. 9., trailing 1. 11.", () => {
    const bunky = mesicMrizka(2026, 10);
    // 1. 10. 2026 je čtvrtek → offset 3.
    expect(bunky).toHaveLength(35);
    expect(bunky.slice(0, 3)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ]);
    expect(bunky[3]).toBe("2026-10-01");
    expect(bunky[33]).toBe("2026-10-31");
    expect(bunky[34]).toBe("2026-11-01");
  });

  it("únor 2026: 28 dní → doplněno na 35 (leading 26.–31. 1., trailing 1. 3.)", () => {
    expect(dnuVMesici(2026, 2)).toBe(28);
    const bunky = mesicMrizka(2026, 2);
    // 1. 2. 2026 je neděle → offset 6.
    expect(bunky).toHaveLength(35);
    expect(bunky.slice(0, 6)).toEqual([
      "2026-01-26",
      "2026-01-27",
      "2026-01-28",
      "2026-01-29",
      "2026-01-30",
      "2026-01-31",
    ]);
    expect(bunky[6]).toBe("2026-02-01");
    expect(bunky[33]).toBe("2026-02-28");
    expect(bunky[34]).toBe("2026-03-01");
  });

  it("6týdenní měsíc (srpen 2026, 31 dní od soboty) → 42 buněk", () => {
    const bunky = mesicMrizka(2026, 8);
    expect(bunky).toHaveLength(42);
    expect(bunky[0]).toBe("2026-07-27");
    expect(bunky[5]).toBe("2026-08-01");
    expect(bunky[35]).toBe("2026-08-31");
    expect(bunky[41]).toBe("2026-09-06");
  });

  it("nevalidní měsíc/rok → prázdné pole", () => {
    expect(mesicMrizka(2026, 0)).toEqual([]);
    expect(mesicMrizka(2026, 13)).toEqual([]);
    expect(mesicMrizka(1800, 5)).toEqual([]);
    expect(mesicMrizkaSKontextem(2026, 0)).toEqual([]);
  });

  it("název měsíce česky", () => {
    expect(nazevMesice(2026, 10)).toMatch(/říjen/i);
  });
});

describe("mesicMrizkaSKontextem (mimo-měsíc flag)", () => {
  it("střed měsíce mimoMesic false, okraje true", () => {
    const bunky = mesicMrizkaSKontextem(2026, 10);
    expect(bunky).toHaveLength(35);
    expect(bunky.slice(0, 3).every((b) => b.mimoMesic)).toBe(true);
    expect(bunky[3]).toEqual({ ymd: "2026-10-01", mimoMesic: false });
    expect(bunky[33]).toEqual({ ymd: "2026-10-31", mimoMesic: false });
    expect(bunky[34]).toEqual({ ymd: "2026-11-01", mimoMesic: true });
  });

  it("počet mimo-dnů = celkem − dny v měsíci", () => {
    const bunky = mesicMrizkaSKontextem(2026, 8);
    const mimo = bunky.filter((b) => b.mimoMesic);
    expect(bunky).toHaveLength(42);
    expect(mimo).toHaveLength(42 - 31);
  });
});

describe("dnyVypravy (od–do)", () => {
  it("jednodenní → jeden den", () => {
    expect(dnyVypravy({ datum: "2026-10-17", datumDo: null })).toEqual([
      "2026-10-17",
    ]);
  });

  it("vícedenní ve stejném měsíci → všechny dny včetně", () => {
    expect(
      dnyVypravy({ datum: "2026-10-17", datumDo: "2026-10-19" }),
    ).toEqual(["2026-10-17", "2026-10-18", "2026-10-19"]);
  });

  it("přes měsíce → překročí hranici", () => {
    const dny = dnyVypravy({ datum: "2026-10-30", datumDo: "2026-11-02" });
    expect(dny).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("obrácený rozsah → jen začátek (fail-safe)", () => {
    expect(
      dnyVypravy({ datum: "2026-10-19", datumDo: "2026-10-17" }),
    ).toEqual(["2026-10-19"]);
  });
});

describe("vyskytySchuzky", () => {
  it("jednorázová v měsíci → jeden výskyt, mimo → žádný", () => {
    expect(
      vyskytySchuzky({ datum: "2026-10-06", opakovani: "jednorazova" }, 2026, 10),
    ).toEqual(["2026-10-06"]);
    expect(
      vyskytySchuzky({ datum: "2026-10-06", opakovani: "jednorazova" }, 2026, 11),
    ).toEqual([]);
  });

  it("týdenní: stejný weekday od prvního výskytu (úterý 6. 10. 2026)", () => {
    // 6. 10. 2026 je úterý → v říjnu 13., 20., 27.
    expect(
      vyskytySchuzky({ datum: "2026-10-06", opakovani: "tydenni" }, 2026, 10),
    ).toEqual(["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
  });

  it("týdenní: výskyty před začátkem nevznikají", () => {
    // Začátek 20. 10. → v říjnu jen 20. + 27.
    expect(
      vyskytySchuzky({ datum: "2026-10-20", opakovani: "tydenni" }, 2026, 10),
    ).toEqual(["2026-10-20", "2026-10-27"]);
    // V září (před začátkem) nic.
    expect(
      vyskytySchuzky({ datum: "2026-10-20", opakovani: "tydenni" }, 2026, 9),
    ).toEqual([]);
  });

  it("týdenní: pokračuje do dalšího měsíce stejným weekday", () => {
    const listopad = vyskytySchuzky(
      { datum: "2026-10-06", opakovani: "tydenni" },
      2026,
      11,
    );
    expect(listopad).toEqual([
      "2026-11-03",
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
    ]);
  });
});

describe("udalostiProMesic (sjednocení)", () => {
  it("výprava + schůzka ve stejný den: výprava první", () => {
    const mapa = udalostiProMesic(
      {
        expedice: [
          { id: "e1", nazev: "Výprava", datum: "2026-10-17", datumDo: null, sraz: "Sraz" },
        ],
        schuzky: [
          { id: "s1", nazev: "Schůzka", datum: "2026-10-17", mistnost: "Klubovna", opakovani: "jednorazova" },
        ],
      },
      2026,
      10,
    );
    const den = mapa.get("2026-10-17") ?? [];
    expect(den.map((u) => u.typ)).toEqual(["vyprava", "schuzka"]);
  });

  it("vícedenní výprava pokryje každý den", () => {
    const mapa = udalostiProMesic(
      {
        expedice: [
          { id: "e1", nazev: "Víkend", datum: "2026-10-17", datumDo: "2026-10-18", sraz: "S" },
        ],
        schuzky: [],
      },
      2026,
      10,
    );
    expect(mapa.get("2026-10-17")?.length).toBe(1);
    expect(mapa.get("2026-10-18")?.length).toBe(1);
  });

  it("mimo měsíc se nepropíše", () => {
    const mapa = udalostiProMesic(
      {
        expedice: [
          { id: "e1", nazev: "Jinde", datum: "2026-11-05", datumDo: null, sraz: "S" },
        ],
        schuzky: [],
      },
      2026,
      10,
    );
    expect(mapa.size).toBe(0);
  });
});

describe("getDayVariant (typ dne)", () => {
  it("prázdný → prazdny", () => {
    expect(getDayVariant([])).toBe("prazdny");
  });

  it("jen výprava → vyprava, jen schůzka → schuzka", () => {
    expect(getDayVariant([u("vyprava", "e1")])).toBe("vyprava");
    expect(getDayVariant([u("schuzka", "s1")])).toBe("schuzka");
  });

  it("obojí → oboji (precedence typů)", () => {
    expect(getDayVariant([u("vyprava", "e1"), u("schuzka", "s1")])).toBe(
      "oboji",
    );
    expect(getDayVariant([u("schuzka", "s1"), u("vyprava", "e1")])).toBe(
      "oboji",
    );
  });
});

describe("sklonujAkce (1 / 2–4 / 5+)", () => {
  it("1 akce", () => {
    expect(sklonujAkce(1)).toBe("akce");
  });

  it("2–4 akce", () => {
    expect(sklonujAkce(2)).toBe("akce");
    expect(sklonujAkce(3)).toBe("akce");
    expect(sklonujAkce(4)).toBe("akce");
  });

  it("5+ akcí", () => {
    expect(sklonujAkce(5)).toBe("akcí");
    expect(sklonujAkce(7)).toBe("akcí");
  });
});

describe("popisekDne (aria-label)", () => {
  it("prazdny den bez akce", () => {
    expect(popisekDne("2026-10-07", [])).toBe("7. — bez akce");
  });

  it("1 výprava → skloňování 1", () => {
    expect(popisekDne("2026-10-05", [u("vyprava", "e1")])).toBe(
      "5. — výprava, 1 akce",
    );
  });

  it("vyprava + schuzka, 3 akce", () => {
    expect(
      popisekDne("2026-10-12", [u("vyprava", "e1"), u("vyprava", "e2"), u("schuzka", "s1")]),
    ).toBe("12. — výprava a schůzka, 3 akce");
  });

  it("5+ → akcí", () => {
    const pet: KalendarniUdalost[] = [
      u("vyprava", "e1"),
      u("vyprava", "e2"),
      u("schuzka", "s1"),
      u("schuzka", "s2"),
      u("schuzka", "s3"),
    ];
    expect(popisekDne("2026-10-12", pet)).toBe(
      "12. — výprava a schůzka, 5 akcí",
    );
  });

  it("jen schůzky, 2 → schůzka, 2 akce", () => {
    expect(
      popisekDne("2026-10-06", [u("schuzka", "s1"), u("schuzka", "s2")]),
    ).toBe("6. — schůzka, 2 akce");
  });

  it("stav dnes/vybráno popisek nemění (jen typ + počet)", () => {
    // Dnes i vybraný den sdílí stejný popisek — stav řeší border, ne text.
    const den: KalendarniUdalost[] = [u("vyprava", "e1")];
    expect(popisekDne("2026-10-17", den)).toBe("17. — výprava, 1 akce");
  });
});

function mapaProPas(): {
  mrizka: string[];
  mapa: Map<string, KalendarniUdalost[]>;
} {
  const mapa = udalostiProMesic(
    {
      expedice: [
        { id: "e1", nazev: "Víkend", datum: "2026-10-17", datumDo: "2026-10-19", sraz: "S" },
        { id: "e2", nazev: "Jiná", datum: "2026-10-18", datumDo: null, sraz: "S" },
      ],
      schuzky: [
        { id: "s1", nazev: "Schůzka", datum: "2026-10-18", mistnost: "Klubovna", opakovani: "jednorazova" },
      ],
    },
    2026,
    10,
  );
  // Plná mřížka 35 YMD včetně mimo-dnů (žádné ruční doplňování).
  const mrizka: string[] = [...mesicMrizka(2026, 10)];
  return { mrizka, mapa };
}

describe("jeStejnaVyprava / vypravyDne / schuzkyDne", () => {
  it("stejné id výpravy → true, jiné id / schůzka → false", () => {
    expect(jeStejnaVyprava(u("vyprava", "e1"), u("vyprava", "e1"))).toBe(true);
    expect(jeStejnaVyprava(u("vyprava", "e1"), u("vyprava", "e2"))).toBe(false);
    expect(jeStejnaVyprava(u("vyprava", "e1"), u("schuzka", "e1"))).toBe(false);
  });

  it("vypravyDne / schuzkyDne dělí den", () => {
    const den = [u("vyprava", "e1"), u("schuzka", "s1")];
    expect(vypravyDne(den).map((x) => x.id)).toEqual(["e1"]);
    expect(schuzkyDne(den).map((x) => x.id)).toEqual(["s1"]);
  });
});

describe("poziceVPasu (pás + must-fix zalomení)", () => {
  it("17. start, 18. middle, 19. end (3denní výprava)", () => {
    const { mrizka, mapa } = mapaProPas();
    // 17.–19. 10. 2026 je So–Po → přechod řádku mezi Ne 18. a Po 19.
    expect(poziceVPasu("e1", "2026-10-17", mrizka, mapa)).toBe("start");
    expect(poziceVPasu("e1", "2026-10-18", mrizka, mapa)).toBe("end");
    expect(poziceVPasu("e1", "2026-10-19", mrizka, mapa)).toBe("single");
  });

  it("konec řádku je vpravo zaoblený i uprostřed výpravy (wrap)", () => {
    // Neděle 18. 10. má vpravo pondělí 19. 10. v dalším řádku → nesmí
    // se spojit přes hranu týdne, i když výprava pokračuje.
    const { mrizka, mapa } = mapaProPas();
    expect(poziceVPasu("e1", "2026-10-18", mrizka, mapa)).not.toBe("middle");
    expect(poziceVPasu("e1", "2026-10-19", mrizka, mapa)).not.toBe("middle");
  });

  it("jednodenní výprava → single", () => {
    const { mrizka, mapa } = mapaProPas();
    expect(poziceVPasu("e2", "2026-10-18", mrizka, mapa)).toBe("single");
  });

  it("jiná výprava pás nespojuje, neznámý den → null", () => {
    const { mrizka, mapa } = mapaProPas();
    expect(poziceVPasu("e2", "2026-10-17", mrizka, mapa)).toBe(null);
    expect(poziceVPasu("e1", "2026-10-20", mrizka, mapa)).toBe(null);
  });
});

describe("poradiVypravy (den X z Y přes wrap)", () => {
  it("čísluje globálně za výpravu, wrap řádku nečísluje znovu", () => {
    const { mapa } = mapaProPas();
    expect(poradiVypravy("e1", "2026-10-17", mapa)).toEqual({ poradi: 1, celkem: 3 });
    expect(poradiVypravy("e1", "2026-10-18", mapa)).toEqual({ poradi: 2, celkem: 3 });
    expect(poradiVypravy("e1", "2026-10-19", mapa)).toEqual({ poradi: 3, celkem: 3 });
  });

  it("neznámý den → null", () => {
    const { mapa } = mapaProPas();
    expect(poradiVypravy("e1", "2026-10-20", mapa)).toBe(null);
  });
});

describe("popisekDne s kontextem pásu", () => {
  it("bez kontextu původní krátký formát", () => {
    expect(popisekDne("2026-10-18", [u("vyprava", "e1")])).toBe(
      "18. — výprava, 1 akce",
    );
  });

  it("s kontextem přidá název + den X z Y + počet schůzek", () => {
    const { mrizka, mapa } = mapaProPas();
    const denni = mapa.get("2026-10-18") ?? [];
    const text = popisekDne("2026-10-18", denni, { mrizka, mapa });
    expect(text).toContain("Víkend");
    expect(text).toContain("den 2 z 3");
    expect(text).toContain("1 schůzka");
  });
});

describe("tydenMrizka (Po–Ne, vždy 7 dnů)", () => {
  it("středa 14. 10. 2026 → Po 12. 10. až Ne 18. 10.", () => {
    expect(tydenMrizka("2026-10-14")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("pondělí i neděle padnou do stejného týdne", () => {
    expect(tydenMrizka("2026-10-12")).toEqual(tydenMrizka("2026-10-14"));
    expect(tydenMrizka("2026-10-18")).toEqual(tydenMrizka("2026-10-14"));
  });

  it("wrap měsíců: čt 1. 10. 2026 → Po 28. 9. až Ne 4. 10.", () => {
    expect(tydenMrizka("2026-10-01")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("wrap roku: čt 1. 1. 2026 → Po 29. 12. 2025 až Ne 4. 1. 2026", () => {
    expect(tydenMrizka("2026-01-01")).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("nevalidní kotva → prázdné pole", () => {
    expect(tydenMrizka("není-datum")).toEqual([]);
    expect(tydenMrizka("")).toEqual([]);
  });
});

describe("udalostiProTyden (reuse logiky měsíce, wrap měsíců)", () => {
  const vstup = {
    expedice: [
      { id: "e1", nazev: "Přes hranu", datum: "2026-09-30", datumDo: "2026-10-02", sraz: "S" },
      { id: "e2", nazev: "Jinde", datum: "2026-10-20", datumDo: null, sraz: "S" },
    ],
    schuzky: [
      { id: "s1", nazev: "Úterý", datum: "2026-09-29", mistnost: "Klubovna", opakovani: "jednorazova" as const },
      { id: "s2", nazev: "Týdenní", datum: "2026-09-29", mistnost: "Klubovna", opakovani: "tydenni" as const },
    ],
  };

  it("týden přes hranu měsíce neztratí výpravy ani schůzky", () => {
    const mapa = udalostiProTyden(vstup, "2026-10-01");
    expect(mapa.get("2026-09-30")?.some((u) => u.id === "e1")).toBe(true);
    expect(mapa.get("2026-10-02")?.some((u) => u.id === "e1")).toBe(true);
    expect(mapa.get("2026-09-29")?.some((u) => u.id === "s1")).toBe(true);
  });

  it("týdenní schůzka se propíše i do dalšího měsíce stejným weekday", () => {
    // s2 startuje v úterý 29. 9. → v týdnu 5.–11. 10. je úterý 6. 10.
    const mapa = udalostiProTyden(vstup, "2026-10-06");
    expect(mapa.get("2026-10-06")?.some((u) => u.id === "s2")).toBe(true);
  });

  it("mimo týden se nepropíše, nevalidní kotva → prázdná mapa", () => {
    const mapa = udalostiProTyden(vstup, "2026-10-01");
    expect(mapa.get("2026-10-20")).toBeUndefined();
    expect(udalostiProTyden(vstup, "x").size).toBe(0);
  });
});

describe("poziceVPasu v týdenní mřížce (celý týden = 1 řádka)", () => {
  it("Po start, Út middle, St end, Čt bez pásu (3denní výprava Po–St)", () => {
    const vstup = {
      expedice: [
        { id: "e1", nazev: "Týden", datum: "2026-10-12", datumDo: "2026-10-14", sraz: "S" },
      ],
      schuzky: [],
    };
    const mrizka = tydenMrizka("2026-10-14");
    const mapa = udalostiProTyden(vstup, "2026-10-14");
    expect(poziceVPasu("e1", "2026-10-12", mrizka, mapa)).toBe("start");
    expect(poziceVPasu("e1", "2026-10-13", mrizka, mapa)).toBe("middle");
    expect(poziceVPasu("e1", "2026-10-14", mrizka, mapa)).toBe("end");
    expect(poziceVPasu("e1", "2026-10-15", mrizka, mapa)).toBe(null);
  });
});

describe("udalostiProMesic včetně mimo-dnů mřížky", () => {
  it("výprava přes hranu září→říjen je vidět i na mimo-dni 30. 9.", () => {
    const mapa = udalostiProMesic(
      {
        expedice: [
          { id: "e1", nazev: "Přes hranu", datum: "2026-09-30", datumDo: "2026-10-02", sraz: "S" },
        ],
        schuzky: [],
      },
      2026,
      10,
    );
    expect(mapa.get("2026-09-30")?.some((u) => u.id === "e1")).toBe(true);
    expect(mapa.get("2026-10-01")?.some((u) => u.id === "e1")).toBe(true);
    expect(mapa.get("2026-10-02")?.some((u) => u.id === "e1")).toBe(true);
  });

  it("trailing mimo-den 1. 11. nese událost z listopadu", () => {
    const mapa = udalostiProMesic(
      {
        expedice: [
          { id: "e1", nazev: "Listopad", datum: "2026-11-01", datumDo: null, sraz: "S" },
        ],
        schuzky: [],
      },
      2026,
      10,
    );
    expect(mapa.get("2026-11-01")?.some((u) => u.id === "e1")).toBe(true);
  });

  it("týdenní schůzka z vedlejšího měsíce se objeví na viditelném mimo-dni", () => {
    const mapa = udalostiProMesic(
      {
        expedice: [],
        schuzky: [
          { id: "s2", nazev: "Týdenní", datum: "2026-09-29", mistnost: "Klubovna", opakovani: "tydenni" },
        ],
      },
      2026,
      10,
    );
    // 29. 9. 2026 je úterý a je v říjnové mřížce jako mimo-den.
    expect(mapa.get("2026-09-29")?.some((u) => u.id === "s2")).toBe(true);
  });

  it("vzdálený den mimo mřížku se nepropíše (5. 11. není v říjnové mřížce)", () => {
    const mapa = udalostiProMesic(
      {
        expedice: [
          { id: "e1", nazev: "Jinde", datum: "2026-11-05", datumDo: null, sraz: "S" },
        ],
        schuzky: [],
      },
      2026,
      10,
    );
    expect(mapa.get("2026-11-05")).toBeUndefined();
  });
});

describe("poziceVPasu přes hranu měsíce (plná 35 mřížka)", () => {
  it("pás 30. 9. → 1. 10. navazuje ve stejném řádku (start/end)", () => {
    const vstup = {
      expedice: [
        { id: "e1", nazev: "Přes hranu", datum: "2026-09-30", datumDo: "2026-10-01", sraz: "S" },
      ],
      schuzky: [],
    };
    const mrizka = mesicMrizka(2026, 10);
    const mapa = udalostiProMesic(vstup, 2026, 10);
    // 1. řádek: Po 28. 9. … Ne 4. 10. → 30. 9. i 1. 10. ve stejném řádku.
    expect(poziceVPasu("e1", "2026-09-30", mrizka, mapa)).toBe("start");
    expect(poziceVPasu("e1", "2026-10-01", mrizka, mapa)).toBe("end");
  });
});
