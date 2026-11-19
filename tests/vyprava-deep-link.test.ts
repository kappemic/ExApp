/**
 * tests/vyprava-deep-link.test.ts — Step 3: deep-link výprava → Diskuze.
 *
 * Klik z Nástěnky / Chatu otevře do 1 kroku diskuzi dané výpravy
 * (`/vypravy?vyprava=<id>` → ExpeditionModal + doscroll na Diskuzi + focus),
 * přímé otevření URL funguje také, zpětná navigace modal nezavěsí.
 *
 * Bez DB, bez HTTP, bez jsdom: čisté pomocníci (`src/lib/vyprava-deep-link.ts`)
 * + zdroj-kontrakt nad 4 soubory. Strict TypeScript, žádný `any`, česky.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  VYPRAVA_PARAM,
  buildVypravyDeepLink,
  parseVypravaId,
  sVypravouVUrl,
} from "../src/lib/vyprava-deep-link";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

function bezAny(zdroj: string): void {
  expect(zdroj).not.toMatch(/:\s*any\b/);
  expect(zdroj).not.toContain(["as", "any"].join(" "));
}

const POMOCNICI = "src/lib/vyprava-deep-link.ts";
const NASTENKA = "src/pages/ChatPage.tsx";
const STRANKA = "src/pages/VypravyNahledPage.tsx";
const DETAIL = "src/pages/VypravaDetailPage.tsx";
const MODAL = "src/components/expeditions/ExpeditionModal.tsx";

describe("deep-link pomocníci (čistí, bez jsdom)", () => {
  it("param se jmenuje `vyprava` (kompatibilní se `zobrazeni`)", () => {
    expect(VYPRAVA_PARAM).toBe("vyprava");
  });

  it("parseVypravaId: prázdné / chybějící → null", () => {
    expect(parseVypravaId(null)).toBeNull();
    expect(parseVypravaId(undefined)).toBeNull();
    expect(parseVypravaId("")).toBeNull();
    expect(parseVypravaId("   ")).toBeNull();
  });

  it("parseVypravaId: otrimuje a platné id vrací", () => {
    expect(parseVypravaId("  sumava-trijezerska-slat  ")).toBe(
      "sumava-trijezerska-slat",
    );
    expect(parseVypravaId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("parseVypravaId: smetí (overlong / řídicí / <>) → null", () => {
    expect(parseVypravaId("a".repeat(201))).toBeNull();
    expect(parseVypravaId("a<b")).toBeNull();
    expect(parseVypravaId("a\nb")).toBeNull();
  });

  it("buildVypravyDeepLink: jeden krok na diskuzi výpravy", () => {
    const odkaz: string = buildVypravyDeepLink("sumava-modrava");
    expect(odkaz.startsWith("/vypravy?")).toBe(true);
    expect(odkaz).toContain(`${VYPRAVA_PARAM}=sumava-modrava`);
  });

  it("buildVypravyDeepLink: id escapuje, platné zobrazeni zachovává", () => {
    expect(buildVypravyDeepLink("a b")).toContain("vyprava=a+b");
    expect(buildVypravyDeepLink("x", "kalendar")).toContain("zobrazeni=kalendar");
    expect(buildVypravyDeepLink("x", "seznam")).toContain("zobrazeni=seznam");
    expect(buildVypravyDeepLink("x", "nesmysl")).not.toContain("zobrazeni=");
    expect(buildVypravyDeepLink("x", null)).not.toContain("zobrazeni=");
  });

  it("sVypravouVUrl: merge — zapisuje i maže, ostatní paramy nechává", () => {
    const zapis = sVypravouVUrl(new URLSearchParams("zobrazeni=kalendar"), "abc");
    expect(zapis.get("vyprava")).toBe("abc");
    expect(zapis.get("zobrazeni")).toBe("kalendar");
    const smaz = sVypravouVUrl(
      new URLSearchParams("zobrazeni=kalendar&vyprava=abc"),
      null,
    );
    expect(smaz.get("vyprava")).toBeNull();
    expect(smaz.get("zobrazeni")).toBe("kalendar");
    const prazdne = sVypravouVUrl(new URLSearchParams(), "  ");
    expect(prazdne.get("vyprava")).toBeNull();
  });
});

describe("Nástěnka → thread (Step 3: klik = detail konverzace v URL)", () => {
  it("řádek seznamu otevře thread přes ?konverzace= (1 krok, sdílitelné)", () => {
    const chat: string = ctiZdroj(NASTENKA);
    expect(chat).toContain("KonverzaceDetail");
    expect(chat).toContain("konverzace");
    expect(chat).toContain('set("konverzace"');
    expect(chat).toContain("vybranyNazev");
    bezAny(chat);
  });

  it("vlákno výpravy nese název z mapy výprav (fallback id, pak key)", () => {
    const chat: string = ctiZdroj(NASTENKA);
    expect(chat).toContain("nazvyVyprav");
    expect(chat).toContain("getExpeditionsSync");
  });
});

describe("VypravyPage — deep-link ?vyprava= přesměruje na stránku detailu", () => {
  it("seznam čte param a otevření jde na /vypravy/:id", () => {
    const stranka: string = ctiZdroj(STRANKA);
    expect(stranka).toContain("VYPRAVA_PARAM");
    expect(stranka).toContain("parseVypravaId");
    expect(stranka).toContain("otevriVypravu");
    expect(stranka).toContain("navigate(`/vypravy/${");
    expect(stranka).not.toContain("ExpeditionModal");
    bezAny(stranka);
  });

  it("mount redirect zachová ostatní query + nastaví diskuze", () => {
    const stranka: string = ctiZdroj(STRANKA);
    expect(stranka).toContain('next.set("diskuze", "1")');
  });
});

describe("VypravaDetailPage — mount detail + deep-link Diskuze", () => {
  it("fallback GET detail a ExpeditionModal jako stránka", () => {
    const detail: string = ctiZdroj(DETAIL);
    expect(detail).toContain("expediceDetailPath");
    expect(detail).toContain("ExpeditionModal");
    expect(detail).toContain("stranka");
    expect(detail).toContain("neprectenaDiskuze={neprecteneVypravy.get(expedice.id) === true}");
    expect(detail).toContain("startNaDiskuzi={startNaDiskuzi}");
    expect(detail).toContain("key={expedice.id}");
    bezAny(detail);
  });
});

describe("ExpeditionModal — doscroll na Diskuzi + focus (mobil OK)", () => {
  it("bere tečku i cíl propsem, vlastní poller nemá", () => {
    const modal: string = ctiZdroj(MODAL);
    expect(modal).toContain("neprectenaDiskuze");
    expect(modal).toContain("startNaDiskuzi");
    expect(modal).not.toContain("useUnreadExpeditions(");
    bezAny(modal);
  });

  it("Diskuze je focusovatelný cíl s popiskem pro čtečku", () => {
    const modal: string = ctiZdroj(MODAL);
    expect(modal).toContain('id="diskuze"');
    expect(modal).toContain("tabIndex={-1}");
    expect(modal).toContain("Diskuze k výpravě");
    expect(modal).toContain('data-deep-link-cil="diskuze"');
    expect(modal).toContain("scroll-mt-");
  });

  it("scroll + focus respektuje reduced-motion a neskáče po doscrollování", () => {
    const modal: string = ctiZdroj(MODAL);
    expect(modal).toContain("scrollIntoView");
    expect(modal).toContain("prefers-reduced-motion");
    expect(modal).toContain("preventScroll");
    expect(modal).toContain("requestAnimationFrame");
    // Focus míří na sekci, ne na textarea — mobilní klávesnice nevyskočí.
    expect(modal).not.toContain("textareaRef.current?.focus()");
  });

  it("focus-trap, Esc, backdrop i návrat fokusu zůstávají", () => {
    const modal: string = ctiZdroj(MODAL);
    expect(modal).toContain('"Escape"');
    expect(modal).toContain("naKlikBackdropu");
    expect(modal).toContain("predchoziFocus");
    expect(modal).toContain("focus-visible:");
  });
});

describe("deep-link soubory bez any", () => {
  it("pomocníci, nástěnka, stránka ani modal neobsahují any", () => {
    for (const cesta of [POMOCNICI, NASTENKA, STRANKA, MODAL]) {
      bezAny(ctiZdroj(cesta));
    }
  });
});
