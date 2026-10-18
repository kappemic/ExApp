/**
 * tests/chat-konverzace-step3.test.ts — Step 3: nástěnka seskupená + jména.
 *
 * Bez DB, bez HTTP, bez jsdom — čistě pure pomocníci + zdroj-kontrakt testy
 * nad .tsx jako textem (a11y, deníkové tokeny, 44px, 360px, offline).
 * Pokrývá zadání:
 * - Seznam: řádek = konverzace (pinned Důležité + General nahoře),
 *   poslední zpráva + badge; žádná „každá zpráva = bublina konverzace".
 * - Detail: seskupení po autorovi/dni, hlavička authorName, „Ty" jen pro
 *   currentUserId; composer skrytý v Důležitém pro USER (read-only notice).
 * - break-ui: dlouhá jména / e-maily / emoji / 0 zpráv nelámou layout.
 * Strict TypeScript, žádný `any`, česky.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  jePinnedKanal,
  popisekNeprectenychKonverzace,
  prevedNaPolozky,
  seradKonverzace,
  vyberNazevKonverzace,
} from "../src/components/chat/ConversationList";
import {
  muzeOdeslatComposer,
  spocitejZbyvajiciZnakyComposeru,
} from "../src/components/chat/Composer";
import {
  jeStejnyDen,
  popisekDne,
  seradVlakno,
  seskupZpravyDoBloku,
} from "../src/components/chat/KonverzaceDetail";
import {
  tvarKonverzace,
  vytvorWorstCaseKonverzace,
  vytvorWorstCaseNazvy,
} from "../src/pages/ChatPage";
import type { ApiKonverzace, ApiZprava } from "../src/lib/diskuze-api";

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
    createdAt: "2026-10-14T10:00:00.000Z",
    ...cast,
  };
}

function konverzace(
  cast: Partial<ApiKonverzace> & { key: string },
): ApiKonverzace {
  return {
    expeditionId: null,
    channel: "general",
    lastMessage: null,
    unreadCount: 0,
    ...cast,
  };
}

/* ------------------------------------------------------------------ */

describe("ConversationList pure: názvy + pinned", () => {
  it("globály mají pevné české názvy (Důležité / General)", () => {
    expect(
      vyberNazevKonverzace(
        konverzace({ key: "dulezite", channel: "dulezite" }),
        null,
      ),
    ).toBe("Důležité");
    expect(
      vyberNazevKonverzace(
        konverzace({ key: "general", channel: "general" }),
        null,
      ),
    ).toBe("General");
  });

  it("výprava bere název z mapy, fallback id, pak key", () => {
    const expedicni = konverzace({
      key: "expedice:brdy-2026",
      expeditionId: "brdy-2026",
      channel: "expedice",
    });
    expect(vyberNazevKonverzace(expedicni, "Brdy – Jindrova skála")).toBe(
      "Brdy – Jindrova skála",
    );
    expect(vyberNazevKonverzace(expedicni, null)).toBe("brdy-2026");
    expect(
      vyberNazevKonverzace(
        konverzace({ key: "expedice:", channel: "expedice", expeditionId: "" }),
        null,
      ),
    ).toBe("expedice:");
  });

  it("pinned jsou právě Důležité + General", () => {
    expect(jePinnedKanal("dulezite")).toBe(true);
    expect(jePinnedKanal("general")).toBe(true);
    expect(jePinnedKanal("expedice")).toBe(false);
  });
});

describe("ConversationList pure: řazení (pinned nahoře)", () => {
  it("Důležité, General, pak výpravy podle poslední zprávy sestupně", () => {
    const vstup = prevedNaPolozky(
      [
        konverzace({
          key: "expedice:brdy-2026",
          expeditionId: "brdy-2026",
          channel: "expedice",
          lastMessage: zprava({
            id: "e1",
            expeditionId: "brdy-2026",
            createdAt: "2026-10-15T08:00:00.000Z",
          }),
        }),
        konverzace({
          key: "general",
          channel: "general",
          lastMessage: zprava({
            id: "g1",
            expeditionId: null,
            createdAt: "2026-10-01T08:00:00.000Z",
          }),
        }),
        konverzace({ key: "dulezite", channel: "dulezite", lastMessage: null }),
      ],
      new Map([["brdy-2026", "Brdy"]]),
    );
    expect(seradKonverzace(vstup).map((p) => p.key)).toEqual([
      "dulezite",
      "general",
      "expedice:brdy-2026",
    ]);
  });

  it("prázdné konverzace (0 zpráv) padají dospod, tie-break key", () => {
    const vstup = prevedNaPolozky(
      [
        konverzace({ key: "expedice:b", expeditionId: "b", channel: "expedice" }),
        konverzace({
          key: "expedice:a",
          expeditionId: "a",
          channel: "expedice",
          lastMessage: zprava({
            id: "a1",
            expeditionId: "a",
            createdAt: "2026-10-14T10:00:00.000Z",
          }),
        }),
      ],
      new Map(),
    );
    expect(seradKonverzace(vstup).map((p) => p.key)).toEqual([
      "expedice:a",
      "expedice:b",
    ]);
  });

  it("žádná konverzace se nestaví ze zpráv (1 řádek = 1 konverzace)", () => {
    const zdroj: string = ctiZdroj("src/components/chat/ConversationList.tsx");
    expect(zdroj).toContain("prevedNaPolozky");
    expect(zdroj).toContain("lastMessage");
    expect(zdroj).not.toMatch(/getZpravy|getGlobalZpravy/);
  });
});

describe("ConversationList pure: badge + pluralizace", () => {
  it("1 nepřečtená / 2–4 nepřečtené / 5+ nepřečtených", () => {
    expect(popisekNeprectenychKonverzace(1)).toBe("1 nepřečtená zpráva");
    expect(popisekNeprectenychKonverzace(3)).toBe("3 nepřečtené zprávy");
    expect(popisekNeprectenychKonverzace(1284)).toBe("1284 nepřečtených zpráv");
    expect(popisekNeprectenychKonverzace(0)).toBe("žádné nepřečtené zprávy");
  });

  it("tvarKonverzace: 1 konverzace / 2–4 konverzace / 5+ konverzací", () => {
    expect(tvarKonverzace(1)).toBe("konverzace");
    expect(tvarKonverzace(3)).toBe("konverzace");
    expect(tvarKonverzace(5)).toBe("konverzací");
    expect(tvarKonverzace(0)).toBe("konverzací");
  });
});

describe("KonverzaceDetail pure: seskupení po autorovi/dni", () => {
  it("stejný autor + stejný den = jeden blok (hlavička jen na začátku)", () => {
    const bloky = seskupZpravyDoBloku([
      zprava({ id: "z1", autorId: "a1", createdAt: "2026-10-14T10:00:00.000Z" }),
      zprava({ id: "z2", autorId: "a1", createdAt: "2026-10-14T10:05:00.000Z" }),
      zprava({ id: "z3", autorId: "a2", createdAt: "2026-10-14T10:06:00.000Z" }),
    ]);
    expect(bloky).toHaveLength(2);
    expect(bloky[0]?.zpravy.map((z) => z.id)).toEqual(["z1", "z2"]);
    expect(bloky[1]?.zpravy.map((z) => z.id)).toEqual(["z3"]);
  });

  it("stejný autor + jiný den = dva bloky (denní oddělovač)", () => {
    /* Polední časy = TZ-safe (půlnoc se v +2 posune do stejného dne). */
    const bloky = seskupZpravyDoBloku([
      zprava({ id: "z1", autorId: "a1", createdAt: "2026-10-13T12:00:00.000Z" }),
      zprava({ id: "z2", autorId: "a1", createdAt: "2026-10-14T12:00:00.000Z" }),
    ]);
    expect(bloky).toHaveLength(2);
    expect(jeStejnyDen("2026-10-14T10:00:00.000Z", "2026-10-14T18:00:00.000Z")).toBe(true);
    expect(jeStejnyDen("2026-10-14T12:00:00.000Z", "2026-10-13T12:00:00.000Z")).toBe(false);
    expect(jeStejnyDen("není-datum", "2026-10-14T10:00:00.000Z")).toBe(false);
  });

  it("popisekDne: Dnes / Včera / datum, nevalidní → prázdné", () => {
    expect(popisekDne(new Date().toISOString())).toBe("Dnes");
    const vcera = new Date();
    vcera.setDate(vcera.getDate() - 1);
    expect(popisekDne(vcera.toISOString())).toBe("Včera");
    expect(popisekDne("2026-01-05T10:00:00.000Z").length).toBeGreaterThan(0);
    expect(popisekDne("není-datum")).toBe("");
  });

  it("vlákno drží ASC + tie-break id", () => {
    const vstup: ApiZprava[] = [
      zprava({ id: "z2", createdAt: "2026-10-14T11:00:00.000Z" }),
      zprava({ id: "z1", createdAt: "2026-10-14T10:00:00.000Z" }),
    ];
    expect(seradVlakno(vstup).map((z) => z.id)).toEqual(["z1", "z2"]);
  });
});

describe("Composer pure: limit 1000 + počítadlo", () => {
  it("prázdné nejde, 1000 projde, 1001 ne, běh blokuje", () => {
    expect(muzeOdeslatComposer("", false)).toBe(false);
    expect(muzeOdeslatComposer("   ", false)).toBe(false);
    expect(muzeOdeslatComposer("Sraz v 7:40!", false)).toBe(true);
    expect(muzeOdeslatComposer("Sraz v 7:40!", true)).toBe(false);
    expect(muzeOdeslatComposer("a".repeat(1000), false)).toBe(true);
    expect(muzeOdeslatComposer("b".repeat(1001), false)).toBe(false);
  });

  it("emoji se počítá po znacích (Array.from), ne UTF-16", () => {
    expect(spocitejZbyvajiciZnakyComposeru("🏕️🔥 Jedeme!")).toBeGreaterThan(980);
  });
});

describe("break-ui worst-case: 0 zpráv + dlouhá jména nerozbijí layout", () => {
  it("fixture má pinned + prázdnou + dlouhá jména + emoji + 1284", () => {
    const fixture: ApiKonverzace[] = vytvorWorstCaseKonverzace();
    expect(fixture.map((k) => k.key)).toContain("dulezite");
    expect(fixture.map((k) => k.key)).toContain("general");
    expect(fixture.some((k) => k.lastMessage === null)).toBe(true);
    expect(
      fixture.some(
        (k) => (k.lastMessage?.authorName ?? "").length > 40,
      ),
    ).toBe(true);
    expect(fixture.some((k) => k.unreadCount === 1284)).toBe(true);
    expect(vytvorWorstCaseNazvy().size).toBeGreaterThan(0);
  });

  it("worst-case řádky se seřadí bez pádu (pinned nahoře, prázdné dospod)", () => {
    const polozky = seradKonverzace(
      prevedNaPolozky(vytvorWorstCaseKonverzace(), vytvorWorstCaseNazvy()),
    );
    expect(polozky[0]?.key).toBe("dulezite");
    expect(polozky[1]?.key).toBe("general");
    expect(polozky.length).toBe(5);
  });
});

describe("Step 3 zdroj-kontrakt (a11y + deník + 44px + mobile-native)", () => {
  it("seznam: listbox + option + selected + badge role=status", () => {
    const zdroj: string = ctiZdroj("src/components/chat/ConversationList.tsx");
    expect(zdroj).toContain('role="listbox"');
    expect(zdroj).toContain('role="option"');
    expect(zdroj).toContain("aria-selected");
    expect(zdroj).toContain('role="status"');
  });

  it("detail: log + polite + denní oddělovač + skrytHlavicku (seskupení)", () => {
    const zdroj: string = ctiZdroj("src/components/chat/KonverzaceDetail.tsx");
    expect(zdroj).toContain('role="log"');
    expect(zdroj).toContain('aria-live="polite"');
    expect(zdroj).toContain("popisekDne");
    expect(zdroj).toContain("skrytHlavicku");
    expect(zdroj).toContain("seskupZpravyDoBloku");
  });

  it("Důležité: composer skrytý pro USER + read-only notice česky", () => {
    const zdroj: string = ctiZdroj("src/components/chat/KonverzaceDetail.tsx");
    expect(zdroj).toContain("muzePsatDulezite");
    expect(zdroj).toContain("Důležité čte každý, psát můžou jen vedení");
    expect(zdroj).toContain("oznacKonverzaciJakoPrectenou");
  });

  it("bublina: hlavička authorName + Ty jen pro jeMoje (žádné plošné Ty)", () => {
    const zdroj: string = ctiZdroj("src/components/chat/ZpravaBublina.tsx");
    expect(zdroj).toContain("autorPopisek");
    expect(zdroj).toContain("{jeMoje &&");
    expect(zdroj).toContain("skrytHlavicku");
    expect(zdroj).not.toContain("dangerouslySetInnerHTML");
  });

  it("deníkové tokeny ve všech nových souborech", () => {
    for (const soubor of [
      "src/components/chat/ConversationList.tsx",
      "src/components/chat/KonverzaceDetail.tsx",
      "src/components/chat/Composer.tsx",
      "src/pages/ChatPage.tsx",
    ]) {
      const zdroj: string = ctiZdroj(soubor);
      expect(zdroj).toContain("border-inkoust");
      expect(zdroj).toContain("bg-papir");
      expect(zdroj).toContain("shadow-denik");
    }
  });

  it("všechny dotykové cíle 44px+ (seznam, detail, composer, toggle, zpět)", () => {
    for (const soubor of [
      "src/components/chat/ConversationList.tsx",
      "src/components/chat/KonverzaceDetail.tsx",
      "src/components/chat/Composer.tsx",
    ]) {
      expect(ctiZdroj(soubor)).toContain("min-h-[44px]");
    }
    expect(ctiZdroj("src/components/chat/ConversationList.tsx")).toContain(
      "min-h-[64px]",
    );
  });

  it("mobile-native: 16px composer (text-base) + send + safe-area + overscroll-contain", () => {
    const composer: string = ctiZdroj("src/components/chat/Composer.tsx");
    expect(composer).toContain("text-base");
    expect(composer).toContain('enterKeyHint="send"');
    const detail: string = ctiZdroj("src/components/chat/KonverzaceDetail.tsx");
    expect(detail).toContain("env(safe-area-inset-bottom");
    expect(detail).toContain("overscroll-contain");
  });

  it("break-ui hardening: min-w-0 + anywhere + shrink-0 + title v seznamu i detailu", () => {
    for (const soubor of [
      "src/components/chat/ConversationList.tsx",
      "src/components/chat/KonverzaceDetail.tsx",
      "src/components/chat/ZpravaBublina.tsx",
    ]) {
      const zdroj: string = ctiZdroj(soubor);
      expect(zdroj).toContain("min-w-0");
      expect(zdroj).toContain("anywhere");
      expect(zdroj).toContain("shrink-0");
    }
    expect(ctiZdroj("src/pages/ChatPage.tsx")).toContain("min-w-0");
  });

  it("ChatPage: URL stav (?konverzace=) + offline cache, bez přepínače testovacích dat", () => {
    const zdroj: string = ctiZdroj("src/pages/ChatPage.tsx");
    expect(zdroj).toContain("useSearchParams");
    expect(zdroj).toContain("konverzace");
    expect(zdroj).toContain("exapp:konverzace-v1");
    expect(zdroj).not.toContain("Přepínač testovacích dat");
    expect(zdroj).not.toContain("DATABASE_URL");
  });

  it("mobilní Zpět (44px, jen mobil) + desktop grid vedle sebe", () => {
    const detail: string = ctiZdroj("src/components/chat/KonverzaceDetail.tsx");
    expect(detail).toContain("Zpět na seznam konverzací");
    expect(detail).toContain("lg:hidden");
    expect(detail).toContain("min-h-[44px]");
    const chat: string = ctiZdroj("src/pages/ChatPage.tsx");
    expect(chat).toContain("lg:grid");
    expect(chat).toContain("lg:grid-cols-");
  });
});

describe("Step 3 — soubory bez any", () => {
  it("žádný zakázaný typ any ve scope souborech + testu", () => {
    const zakazanyTyp = ["as", "any"].join(" ");
    for (const soubor of [
      "src/pages/ChatPage.tsx",
      "src/components/chat/ConversationList.tsx",
      "src/components/chat/KonverzaceDetail.tsx",
      "src/components/chat/Composer.tsx",
      "src/components/chat/ZpravaBublina.tsx",
      "src/components/chat/DiskuzeBox.tsx",
      "tests/chat-konverzace-step3.test.ts",
    ]) {
      const obsah: string = ctiZdroj(soubor);
      expect(obsah).not.toMatch(/:\s*any\b/);
      expect(obsah).not.toContain(zakazanyTyp);
    }
  });
});
