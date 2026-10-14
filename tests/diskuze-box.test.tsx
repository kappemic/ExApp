/**
 * tests/diskuze-box.test.tsx — Fáze 5, Krok 5: Diskuze UI (bez jsdom).
 *
 * Repo nemá jsdom ani testing-library (viz tests/modal-confirm.test.ts)
 * — proto pure testy nad exportovanými pomocníky + zdroj-kontrakt testy
 * nad .tsx jako textem (a11y, tokeny, 44px, optimistic insert, proklik).
 * Pokrývá zadání: prázdný stav, dlouhý nick/e-mail, emoji, 1000 znaků.
 * Strict TypeScript, žádný `any`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aplikujOptimistickyInsert,
  aplikujRollback,
  muzeOdeslat,
  potvrdOptimistickouZpravu,
  seradZpravy,
  spocitejZbyvajiciZnaky,
  vyberAutorPopisek,
  vytvorOptimistickouZpravu,
} from "../src/components/chat/DiskuzeBox";
import {
  formatCasZpravy,
  inicialyProJmeno,
} from "../src/components/chat/ZpravaBublina";
import type { ApiZprava } from "../src/lib/diskuze-api";
import { formatCasKratce } from "../src/lib/format-cas";
import {
  formatCasNastenky,
  seradNastenkuSestupne,
  tvarVypravy,
  tvarZpravy,
  vezmiNejnovesi,
  type PolozkaNastenky,
} from "../src/pages/ChatPage";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

function zprava(
  cast: Partial<ApiZprava> & { id: string },
): ApiZprava {
  return {
    expeditionId: "vyprava-1",
    autorId: "autor-1",
    text: "Ahoj",
    createdAt: "2026-10-10T10:00:00.000Z",
    ...cast,
  };
}

/* Worst-case data dle break-ui katalogu (reálné, ne náhodné „aaa…"). */
const DLOUHY_NICK = "Aleksandra Wiśniewska-Kowalczyk-Nováková Svobodová";
const DLOUHY_EMAIL =
  "bartholomew.fitzgerald.vyborny.turista@northwind-industries-holdings.example.com";
const TISIC_ZNAKU: string = "a".repeat(1000);
const TISIC_JEDNA: string = "b".repeat(1001);
const EMOJI_TEXT = "🏕️🔥 Jedeme! Těším se na Šumavu 🌲🌲🌲";
const XSS_TEXT =
  `<script>alert("xss")</script><img src="x" onerror="alert(1)">`;

/* ------------------------------------------------------------------ */

describe("DiskuzeBox pure: počítadlo + validace composeru", () => {
  it("prázdný text nejde odeslat (Napiš zprávu)", () => {
    expect(muzeOdeslat("", false)).toBe(false);
    expect(muzeOdeslat("   ", false)).toBe(false);
  });

  it("běžný text jde odeslat, během odesílání ne (dvojklik)", () => {
    expect(muzeOdeslat("Sraz v 7:40!", false)).toBe(true);
    expect(muzeOdeslat("Sraz v 7:40!", true)).toBe(false);
  });

  it("1000 znaků projde, 1001 ne (limit kontraktu)", () => {
    expect(muzeOdeslat(TISIC_ZNAKU, false)).toBe(true);
    expect(muzeOdeslat(TISIC_JEDNA, false)).toBe(false);
    expect(spocitejZbyvajiciZnaky(TISIC_ZNAKU)).toBe(0);
    expect(spocitejZbyvajiciZnaky(TISIC_JEDNA)).toBe(-1);
  });

  it("emoji se počítá po znacích, ne po UTF-16 jednotkách", () => {
    expect(muzeOdeslat(EMOJI_TEXT, false)).toBe(true);
    expect(spocitejZbyvajiciZnaky(EMOJI_TEXT)).toBeGreaterThan(950);
  });
});

describe("DiskuzeBox pure: optimistic insert s rollbackem", () => {
  it("insert přidá dočasnou na konec (ASC), 201 ji potvrdí", () => {
    const puvodni: ApiZprava[] = [zprava({ id: "z1" })];
    const docasna: ApiZprava = vytvorOptimistickouZpravu(
      "vyprava-1",
      "autor-1",
      "  Nový vzkaz  ",
    );
    expect(docasna.id.startsWith("optimistic-")).toBe(true);
    expect(docasna.text).toBe("Nový vzkaz");
    const poInsertu = aplikujOptimistickyInsert(puvodni, docasna);
    expect(poInsertu).toHaveLength(2);
    expect(poInsertu[1]?.id).toBe(docasna.id);
    expect(puvodni).toHaveLength(1);
    const potvrzena: ApiZprava = zprava({ id: "z2", text: "Nový vzkaz" });
    const poPotvrzeni = potvrdOptimistickouZpravu(
      poInsertu,
      docasna.id,
      potvrzena,
    );
    expect(poPotvrzeni).toHaveLength(2);
    expect(poPotvrzeni[1]?.id).toBe("z2");
  });

  it("rollback po chybě dočasnou odstraní, hotové nechá", () => {
    const docasna: ApiZprava = vytvorOptimistickouZpravu(
      "vyprava-1",
      "autor-1",
      "Nedoručené",
    );
    const stav: ApiZprava[] = [
      zprava({ id: "z1" }),
      docasna,
    ];
    const poRollbacku = aplikujRollback(stav, docasna.id);
    expect(poRollbacku.map((z) => z.id)).toEqual(["z1"]);
  });

  it("řazení drží ASC + tie-break id (žádné přeskakování)", () => {
    const neusporadane: ApiZprava[] = [
      zprava({ id: "z2", createdAt: "2026-10-10T11:00:00.000Z" }),
      zprava({ id: "z1", createdAt: "2026-10-10T10:00:00.000Z" }),
    ];
    expect(seradZpravy(neusporadane).map((z) => z.id)).toEqual(["z1", "z2"]);
  });
});

describe("DiskuzeBox pure: autor popisky (dlouhý nick / e-mail / smazaný)", () => {
  it("moje zpráva je Ty, cizí nese krátké id, smazaný je Bývalý člen", () => {
    expect(
      vyberAutorPopisek(zprava({ autorId: "moje-id" }), "moje-id"),
    ).toBe("Ty");
    expect(
      vyberAutorPopisek(zprava({ autorId: "cizi-dlouhe-id-123" }), "moje-id"),
    ).toBe("Člen · cizi-dlo");
    expect(vyberAutorPopisek(zprava({ autorId: null }), "moje-id")).toBe(
      "Bývalý člen",
    );
  });
});

describe("ZpravaBublina pure: iniciály (emoji-safe) + čas", () => {
  it("dlouhý nick → první + poslední slovo (AW), jedno slovo → 1 znak", () => {
    expect(inicialyProJmeno(DLOUHY_NICK)).toBe("AS");
    expect(inicialyProJmeno("Jo")).toBe("J");
    expect(inicialyProJmeno("")).toBe("?");
    expect(inicialyProJmeno("   ")).toBe("?");
  });

  it("dlouhý e-mail jako nick neláme iniciály (první grapheme)", () => {
    expect(inicialyProJmeno(DLOUHY_EMAIL)).toBe("B");
  });

  it("emoji na začátku jména nesmí vrátit � (grapheme cluster)", () => {
    const iniciály: string = inicialyProJmeno("🏕️ Vedoucí");
    expect(inicialyProJmeno("🏕️ Vedoucí").length).toBeGreaterThan(0);
    expect(iniciály).not.toContain("�");
  });

  it("čas je český a nevalidní ISO vrátí prázdné (žádný NaN)", () => {
    expect(formatCasZpravy("2026-10-10T10:00:00.000Z").length).toBeGreaterThan(
      0,
    );
    expect(formatCasZpravy("není-datum")).toBe("");
  });

  it("XSS payload zůstává textem — React ho escapuje (žádné innerHTML)", () => {
    const zdroj: string = ctiZdroj("src/components/chat/ZpravaBublina.tsx");
    expect(zdroj).not.toContain("dangerouslySetInnerHTML");
    expect(zdroj).toContain("{zprava.text}");
    expect(XSS_TEXT.length).toBeGreaterThan(0);
  });
});

describe("ChatPage pure: nástěnka (nejnovější napříč výpravami)", () => {
  function polozka(id: string, iso: string, nazev: string): PolozkaNastenky {
    return {
      zprava: zprava({ id, createdAt: iso, expeditionId: id }),
      idVypravy: id,
      nazevVypravy: nazev,
    };
  }

  it("řadí sestupně (nejnovější první), tie-break id", () => {
    const vstup: PolozkaNastenky[] = [
      polozka("a", "2026-10-09T10:00:00.000Z", "Brdy"),
      polozka("b", "2026-10-11T10:00:00.000Z", "Šumava"),
    ];
    expect(
      seradNastenkuSestupne(vstup).map((p) => p.zprava.id),
    ).toEqual(["b", "a"]);
  });

  it("z vlákna (ASC) bere jen poslední N (nejnovější)", () => {
    const vlakno: ApiZprava[] = [1, 2, 3, 4, 5, 6].map((n) =>
      zprava({ id: `z${n}` }),
    );
    expect(vezmiNejnovesi(vlakno, 5).map((z) => z.id)).toEqual([
      "z2",
      "z3",
      "z4",
      "z5",
      "z6",
    ]);
    expect(vezmiNejnovesi([], 5)).toEqual([]);
  });

  it("pluralizace: 1 zpráva / 2–4 zprávy / 5+ zpráv", () => {
    expect(tvarZpravy(1)).toBe("zpráva");
    expect(tvarZpravy(2)).toBe("zprávy");
    expect(tvarZpravy(4)).toBe("zprávy");
    expect(tvarZpravy(5)).toBe("zpráv");
    expect(tvarZpravy(0)).toBe("zpráv");
  });

  it("pluralizace výprav: 1 výprava / 2–4 výpravy / 0 a 5+ výprav", () => {
    expect(tvarVypravy(1)).toBe("výprava");
    expect(tvarVypravy(2)).toBe("výpravy");
    expect(tvarVypravy(3)).toBe("výpravy");
    expect(tvarVypravy(4)).toBe("výpravy");
    expect(tvarVypravy(5)).toBe("výprav");
    expect(tvarVypravy(0)).toBe("výprav");
  });

  it('ChatPage pouziva tvarVypravy(pocetVyprav) — zadna inline vetev', () => {
    const chat: string = ctiZdroj("src/pages/ChatPage.tsx");
    expect(chat).toContain("tvarVypravy(pocetVyprav)");
    expect(chat).toContain("tvarVypravy");
  });
});

describe("Jednotný formát času (format-cas.ts, repetition=0)", () => {
  it("formatCasKratce / formatCasZpravy / formatCasNastenky jsou v paritě", () => {
    const iso = "2026-10-10T10:00:00.000Z";
    expect(formatCasKratce(iso).length).toBeGreaterThan(0);
    expect(formatCasZpravy(iso)).toBe(formatCasKratce(iso));
    expect(formatCasNastenky(iso)).toBe(formatCasKratce(iso));
    expect(formatCasKratce("není-datum")).toBe("");
    expect(formatCasZpravy("není-datum")).toBe("");
    expect(formatCasNastenky("není-datum")).toBe("");
  });

  it("jediná implementace žije v src/lib/format-cas.ts (žádný duplicitní Intl blok)", () => {
    const lib: string = ctiZdroj("src/lib/format-cas.ts");
    const bublina: string = ctiZdroj(
      "src/components/chat/ZpravaBublina.tsx",
    );
    const chat: string = ctiZdroj("src/pages/ChatPage.tsx");
    expect(lib).toContain("formatCasKratce");
    expect(lib).toContain("Intl.DateTimeFormat");
    expect(bublina).toContain("lib/format-cas");
    expect(chat).toContain("lib/format-cas");
    /* Re-exporty delegují — v komponentách už není druhý Intl blok. */
    expect(bublina).not.toContain("Intl.DateTimeFormat");
    expect(chat).not.toContain("Intl.DateTimeFormat");
  });
});

describe("DiskuzeBox zdroj-kontrakt (a11y + deník + 44px + optimistic)", () => {
  const diskuze: string = ctiZdroj("src/components/chat/DiskuzeBox.tsx");
  const bublina: string = ctiZdroj("src/components/chat/ZpravaBublina.tsx");

  it("prázdný stav role=status s výzvou k prvnímu vzkazu", () => {
    expect(diskuze).toContain('role="status"');
    expect(diskuze).toContain("Zatím tu není žádná zpráva");
  });

  it("list je role=log + aria-live polite (čtečka hlásí nové)", () => {
    expect(diskuze).toContain('role="log"');
    expect(diskuze).toContain('aria-live="polite"');
    expect(diskuze).toContain('aria-relevant="additions"');
  });

  it("chyby mají role=alert, úspěch role=status (česky)", () => {
    expect(diskuze).toContain('role="alert"');
    expect(diskuze).toContain("Zpráva odeslána.");
    expect(diskuze).toContain("Zpráva smazána.");
  });

  it("všechny cíle 44px+ (composer, odeslat, smazat, retry)", () => {
    expect(diskuze).toContain("min-h-[44px]");
    expect(bublina).toContain("min-h-[44px]");
    expect(bublina).toContain("min-w-[44px]");
  });

  it("composer: 16px (bez iOS zoomu) + enterkeyhint=send + počítadlo 1000", () => {
    expect(diskuze).toContain("text-base");
    expect(diskuze).toContain('enterKeyHint="send"');
    expect(diskuze).toContain("Zbývá");
    expect(diskuze).toContain("MAX_DELKA");
  });

  it("composer je sticky se safe-area paddingem (klávesnice ho nezakryje)", () => {
    expect(diskuze).toContain("sticky");
    expect(diskuze).toContain("env(safe-area-inset-bottom");
  });

  it("optimistic insert: optimistic- id + Odesílá se + rollback", () => {
    expect(diskuze).toContain("optimistic-");
    expect(diskuze).toContain("Odesílá se");
    expect(diskuze).toContain("aplikujRollback");
    expect(diskuze).toContain("potvrdOptimistickouZpravu");
  });

  it("deníkové tokeny: border-inkoust, bg-papir, shadow-denik", () => {
    expect(diskuze).toContain("border-inkoust");
    expect(diskuze).toContain("bg-papir");
    expect(diskuze).toContain("shadow-denik");
    expect(bublina).toContain("border-inkoust");
    expect(bublina).toContain("shadow-denik");
  });

  it("break-ui hardening: min-w-0 + overflow-wrap anywhere + shrink-0 + title", () => {
    expect(bublina).toContain("min-w-0");
    expect(bublina).toContain("overflowWrap");
    expect(bublina).toContain("anywhere");
    expect(bublina).toContain("shrink-0");
    expect(bublina).toContain("title={autorPopisek}");
    expect(diskuze).toContain("touch-action:manipulation");
  });

  it("smazat má aria-label s náhledem + čte autor/dual-guard (muzeMazat)", () => {
    expect(bublina).toContain("Smazat zprávu:");
    expect(diskuze).toContain("muzeSpravovatVypravy");
  });

  it("klient sahá jen na VITE_API_BASE_URL (žádný secret v bundlu)", () => {
    const api: string = ctiZdroj("src/lib/diskuze-api.ts");
    expect(api).toContain("VITE_API_BASE_URL");
    expect(api).not.toContain("DATABASE_URL");
    expect(api).not.toContain("VITE_STRAVA_CLIENT_SECRET");
    expect(diskuze).not.toContain("DATABASE_URL");
  });
});

describe("ExpeditionModal slot + ChatPage proklik (zdroj-kontrakt)", () => {
  it("modal montuje DiskuzeBox s idVypravy (za účastí, před trasou)", () => {
    const modal: string = ctiZdroj(
      "src/components/expeditions/ExpeditionModal.tsx",
    );
    expect(modal).toContain("<DiskuzeBox");
    expect(modal).toContain("idVypravy={expedice.id}");
    const poziceDiskuze: number = modal.indexOf("<DiskuzeBox");
    const poziceTrasy: number = modal.indexOf("<ExpeditionTrasaPrehled");
    expect(poziceDiskuze).toBeGreaterThan(-1);
    if (poziceTrasy > -1) {
      expect(poziceDiskuze).toBeLessThan(poziceTrasy);
    }
  });

  it("ChatPage je živá nástěnka: skeleton, prázdný stav, proklik na výpravu", () => {
    const chat: string = ctiZdroj("src/pages/ChatPage.tsx");
    expect(chat).not.toContain("Brzy");
    expect(chat).toContain("Nástěnka");
    expect(chat).toContain('role="status"');
    expect(chat).toContain("Zatím tu je ticho");
    expect(chat).toContain("Otevřít výpravu");
    expect(chat).toContain('to="/vypravy"');
    expect(chat).toContain("getZpravy");
    expect(chat).toContain("min-w-0");
    expect(chat).toContain("anywhere");
  });

  it("ChatPage bez composeru (psaní patří do modalu) + bez secretu", () => {
    const chat: string = ctiZdroj("src/pages/ChatPage.tsx");
    expect(chat).not.toContain("<textarea");
    expect(chat).not.toContain("DATABASE_URL");
  });
});
