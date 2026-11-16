/**
 * Live thread merge: server page is truth, optimistic bubbles and
 * just-sent ids survive a poll that has not seen them yet.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ApiZprava } from "../src/shared/api-types";
import {
  INTERVAL_ZIVYCH_ZPRAV_MS,
  ODCHOD_ZPRAVY_MS,
  PRAH_DNA_PX,
  dobaOdchoduZpravy,
  odeberZpravu,
  vratZpravu,
  vyhodnotSlouceni,
  vlaknaSeLisi,
  jsemUDna,
  maScrollovatNaNove,
  slucVlakno,
} from "../src/lib/zive-vlakno";
import { orezStrankuZprav } from "../server/src/diskuze";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

function zprava(cast: Partial<ApiZprava> & { id: string }): ApiZprava {
  return {
    expeditionId: "brdy-2026",
    autorId: "autor-1",
    authorName: "Jan Novák",
    channel: "expedice",
    text: "Ahoj",
    prilohy: [],
    createdAt: "2026-10-14T10:00:00.000Z",
    ...cast,
  };
}

describe("slucVlakno", () => {
  it("přidá nové id ze serveru a drží ASC", () => {
    const mistni: ApiZprava[] = [
      zprava({ id: "z2", createdAt: "2026-10-14T10:02:00.000Z" }),
    ];
    const zeServeru: ApiZprava[] = [
      zprava({ id: "z2", createdAt: "2026-10-14T10:02:00.000Z" }),
      zprava({ id: "z1", createdAt: "2026-10-14T10:01:00.000Z", text: "Dřív" }),
    ];
    expect(slucVlakno(mistni, zeServeru).map((z) => z.id)).toEqual(["z1", "z2"]);
  });

  it("zahodí id, které server už nevrací", () => {
    const mistni: ApiZprava[] = [zprava({ id: "z1" }), zprava({ id: "z2", text: "Smazat" })];
    const vysledek = vyhodnotSlouceni(mistni, [zprava({ id: "z1" })]);
    expect(vysledek.zpravy.map((z) => z.id)).toEqual(["z1"]);
    expect(vysledek.zmenilaSeSada).toBe(true);
    expect(vysledek.novaId).toEqual([]);
  });

  it("nechá optimistic bublinu, dokud server nevrátí stejné tělo", () => {
    const docasna: ApiZprava = zprava({
      id: "optimistic-abc",
      text: "Rozepsané",
      createdAt: "2026-10-14T10:05:00.000Z",
    });
    const bezServeru = slucVlakno([zprava({ id: "z1" }), docasna], [zprava({ id: "z1" })]);
    expect(bezServeru.map((z) => z.id)).toEqual(["z1", "optimistic-abc"]);

    const potvrzena: ApiZprava = zprava({
      id: "z9",
      text: "Rozepsané",
      createdAt: "2026-10-14T10:05:01.000Z",
    });
    const poDoruceni = slucVlakno(
      [zprava({ id: "z1" }), docasna],
      [zprava({ id: "z1" }), potvrzena],
    );
    expect(poDoruceni.map((z) => z.id)).toEqual(["z1", "z9"]);
  });

  it("drží právě odeslanou zprávu, i když ji poll ještě nevidí", () => {
    const moje: ApiZprava = zprava({
      id: "z-moje",
      text: "Právě teď",
      createdAt: "2026-10-14T10:06:00.000Z",
    });
    const vysledek = slucVlakno([], [zprava({ id: "z1" })], { drzet: [moje] });
    expect(vysledek.map((z) => z.id)).toEqual(["z1", "z-moje"]);
  });

  it("skryje smazané id, i když ho starý poll ještě vrátí", () => {
    const vysledek = slucVlakno(
      [zprava({ id: "z1" })],
      [zprava({ id: "z1" }), zprava({ id: "z2" })],
      { skrytId: new Set(["z2"]) },
    );
    expect(vysledek.map((z) => z.id)).toEqual(["z1"]);
  });

  it("nová id hlásí jen zprávy, které místně nebyly", () => {
    const mistni: ApiZprava[] = [zprava({ id: "z1" })];
    const cizi: ApiZprava = zprava({
      id: "z2",
      autorId: "nekdo",
      createdAt: "2026-10-14T10:03:00.000Z",
    });
    const vysledek = vyhodnotSlouceni(mistni, [zprava({ id: "z1" }), cizi]);
    expect(vysledek.novaId).toEqual(["z2"]);
    expect(vysledek.zmenilaSeSada).toBe(true);
    expect(vlaknaSeLisi(mistni, vysledek.zpravy)).toBe(true);
    expect(vlaknaSeLisi(vysledek.zpravy, vysledek.zpravy)).toBe(false);
  });

  it("konec okna doplní nové a nechá starší zprávy nad stránkou", () => {
    const starsi: ApiZprava = zprava({ id: "z1", createdAt: "2026-10-14T10:00:00.000Z" });
    const hranice: ApiZprava = zprava({ id: "z2", createdAt: "2026-10-14T10:02:00.000Z" });
    const nova: ApiZprava = zprava({ id: "z3", createdAt: "2026-10-14T10:03:00.000Z", text: "Teď" });
    const vysledek = slucVlakno([starsi, hranice], [hranice, nova], { konecOkna: true });
    expect(vysledek.map((z) => z.id)).toEqual(["z1", "z2", "z3"]);
  });

  it("v okně konce zmizí smazaná zpráva, starší nad oknem zůstane", () => {
    const nadOknem: ApiZprava = zprava({ id: "z0", createdAt: "2026-10-14T09:00:00.000Z" });
    const hranice: ApiZprava = zprava({ id: "z1", createdAt: "2026-10-14T10:00:00.000Z" });
    const smazana: ApiZprava = zprava({ id: "z2", createdAt: "2026-10-14T10:02:00.000Z" });
    const zustava: ApiZprava = zprava({ id: "z3", createdAt: "2026-10-14T10:03:00.000Z" });
    const vysledek = slucVlakno(
      [nadOknem, hranice, smazana, zustava],
      [hranice, zustava],
      { konecOkna: true },
    );
    expect(vysledek.map((z) => z.id)).toEqual(["z0", "z1", "z3"]);
  });

  it("server vyhraje u stejného id (jméno autora)", () => {
    const mistni: ApiZprava[] = [zprava({ id: "z1", authorName: "Staré" })];
    const zeServeru: ApiZprava[] = [zprava({ id: "z1", authorName: "Nové" })];
    expect(slucVlakno(mistni, zeServeru)[0]?.authorName).toBe("Nové");
  });
});

describe("orezStrankuZprav", () => {
  it("bez tail bere nejstarší stránku, s tail poslední", () => {
    const vlakno: ApiZprava[] = [
      zprava({ id: "z1", createdAt: "2026-10-14T10:00:00.000Z" }),
      zprava({ id: "z2", createdAt: "2026-10-14T10:01:00.000Z" }),
      zprava({ id: "z3", createdAt: "2026-10-14T10:02:00.000Z" }),
    ];
    expect(orezStrankuZprav(vlakno, 2, null, false).zpravy.map((z) => z.id)).toEqual(["z1", "z2"]);
    expect(orezStrankuZprav(vlakno, 2, null, false).nextCursor).toBe("z2");
    expect(orezStrankuZprav(vlakno, 2, null, true).zpravy.map((z) => z.id)).toEqual(["z2", "z3"]);
    expect(orezStrankuZprav(vlakno, 2, null, true).nextCursor).toBeNull();
  });
});

describe("scroll u dna", () => {
  it("práh 120 px", () => {
    expect(PRAH_DNA_PX).toBe(120);
    expect(
      jsemUDna({ scrollHeight: 1000, scrollTop: 800, clientHeight: 100 }),
    ).toBe(true);
    expect(
      jsemUDna({ scrollHeight: 1000, scrollTop: 700, clientHeight: 100 }),
    ).toBe(false);
  });

  it("u dna skočí dolů, výš jen na vlastní novou zprávu", () => {
    const cizi: ApiZprava = zprava({ id: "c", autorId: "nekdo" });
    const moje: ApiZprava = zprava({ id: "m", autorId: "ja" });
    expect(maScrollovatNaNove(true, [cizi], "ja")).toBe(true);
    expect(maScrollovatNaNove(false, [cizi], "ja")).toBe(false);
    expect(maScrollovatNaNove(false, [moje], "ja")).toBe(true);
    expect(maScrollovatNaNove(false, [], "ja")).toBe(false);
  });
});

describe("optimistické smazání", () => {
  it("odebere zprávu hned a po chybě ji vrátí na místo", () => {
    const vlakno: ApiZprava[] = [
      zprava({ id: "z1", createdAt: "2026-10-14T10:00:00.000Z" }),
      zprava({ id: "z2", createdAt: "2026-10-14T10:01:00.000Z", text: "Mazaná" }),
      zprava({ id: "z3", createdAt: "2026-10-14T10:02:00.000Z" }),
    ];
    const bez: ApiZprava[] = odeberZpravu(vlakno, "z2");
    expect(bez.map((z) => z.id)).toEqual(["z1", "z3"]);
    const vracena: ApiZprava | undefined = vlakno[1];
    expect(vracena).toBeDefined();
    if (vracena === undefined) return;
    expect(vratZpravu(bez, vracena).map((z) => z.id)).toEqual(["z1", "z2", "z3"]);
    expect(vratZpravu(bez, vracena)).not.toBe(vlakno);
  });
});

describe("živý poll ve zdrojích", () => {
  it("detail polluje potichu a nespouští kostru", () => {
    const zdroj: string = ctiZdroj("src/components/chat/KonverzaceDetail.tsx");
    expect(zdroj).toContain("vyhodnotSlouceni");
    expect(zdroj).toContain("INTERVAL_ZIVYCH_ZPRAV_MS");
    expect(zdroj).toContain("setInterval");
    expect(zdroj).toContain("document.hidden");
    expect(INTERVAL_ZIVYCH_ZPRAV_MS).toBe(4000);
    const zacatek: number = zdroj.indexOf("const obnovTise");
    const konec: number = zdroj.indexOf("generaceRef.current += 1");
    expect(zacatek).toBeGreaterThan(-1);
    expect(konec).toBeGreaterThan(zacatek);
    expect(zdroj.slice(zacatek, konec)).not.toContain('setStav("nacitani")');
  });

  it("DiskuzeBox používá stejné sloučení a interval", () => {
    const zdroj: string = ctiZdroj("src/components/chat/DiskuzeBox.tsx");
    expect(zdroj).toContain("vyhodnotSlouceni");
    expect(zdroj).toContain("INTERVAL_ZIVYCH_ZPRAV_MS");
    expect(zdroj).toContain("setInterval");
    expect(zdroj).toContain("document.hidden");
    const zacatek: number = zdroj.indexOf("const obnovTise");
    const konec: number = zdroj.indexOf("generaceRef.current += 1");
    expect(zacatek).toBeGreaterThan(-1);
    expect(konec).toBeGreaterThan(zacatek);
    expect(zdroj.slice(zacatek, konec)).not.toContain('setStav("nacitani")');
  });

  it("smazání zprávy nejdřív změní vlákno a teprve potom volá server", () => {
    for (const cesta of [
      "src/components/chat/KonverzaceDetail.tsx",
      "src/components/chat/DiskuzeBox.tsx",
    ]) {
      const zdroj: string = ctiZdroj(cesta);
      const telo: string = zdroj.slice(zdroj.indexOf("async function naSmazat"));
      const odchod: number = telo.indexOf("oznacOdchod");
      const cekani: number = telo.indexOf("await smaz");
      expect(zdroj.indexOf("odeberZpravu")).toBeGreaterThan(-1);
      expect(odchod).toBeGreaterThan(-1);
      expect(cekani).toBeGreaterThan(odchod);
      expect(telo).toContain("vratZpravu");
      expect(telo).toContain("oznacOdchod");
    }
    const bublina: string = ctiZdroj("src/components/chat/ZpravaBublina.tsx");
    expect(bublina).toContain("grid-rows-[0fr]");
    expect(bublina).toContain("bez-prejeti");
    expect(ODCHOD_ZPRAVY_MS).toBe(240);
    expect(dobaOdchoduZpravy()).toBe(ODCHOD_ZPRAVY_MS);
  });
});
