/**
 * tests/nahled-obal.test.ts — cover id on the list plus lightbox source contract.
 * No DB, no secrets. Strict TypeScript.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sestavMapuNahledu } from "../server/src/vypravy";
import { getExpeditions } from "../src/lib/expeditions-api";
import { jeVolitelneNahledFotkaId } from "../src/shared/api-types";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("sestavMapuNahledu", () => {
  const starsi = new Date("2026-01-01T00:00:00.000Z");
  const novejsi = new Date("2026-06-01T00:00:00.000Z");

  it("bez příznaku bere nejstarší fotku výpravy", () => {
    const mapa = sestavMapuNahledu([
      { id: "b", expeditionId: "sumava", jeNahled: false, createdAt: novejsi },
      { id: "a", expeditionId: "sumava", jeNahled: false, createdAt: starsi },
    ]);
    expect(mapa.get("sumava")).toBe("a");
  });

  it("příznak vyhrává nad starší fotkou a výpravy se nemíchají", () => {
    const mapa = sestavMapuNahledu([
      { id: "a", expeditionId: "sumava", jeNahled: false, createdAt: starsi },
      { id: "b", expeditionId: "sumava", jeNahled: true, createdAt: novejsi },
      { id: "c", expeditionId: "brdy", jeNahled: false, createdAt: starsi },
    ]);
    expect(mapa.get("sumava")).toBe("b");
    expect(mapa.get("brdy")).toBe("c");
  });

  it("prázdný vstup nemá obálku", () => {
    expect(sestavMapuNahledu([]).size).toBe(0);
  });
});

describe("jeVolitelneNahledFotkaId", () => {
  it("pustí chybějící pole, null i neprázdné id", () => {
    expect(jeVolitelneNahledFotkaId(undefined)).toBe(true);
    expect(jeVolitelneNahledFotkaId(null)).toBe(true);
    expect(jeVolitelneNahledFotkaId("foto-1")).toBe(true);
    expect(jeVolitelneNahledFotkaId("")).toBe(false);
    expect(jeVolitelneNahledFotkaId(1)).toBe(false);
  });
});

describe("getExpeditions — nahledFotkaId", () => {
  const API_ZAKLAD = "https://api.test";

  function dobraExpedice(
    nahledFotkaId?: string | null,
  ): Record<string, unknown> {
    return {
      id: "abc",
      nazev: "Šumava — Tříjezerní slať",
      datum: "2099-06-12",
      datumDo: null,
      sraz: "Praha hl. n. 7:30",
      popis: "",
      trasaOdkaz: "",
      kapacita: { prihlaseno: 0, celkem: 10 },
      stav: "volno",
      ...(nahledFotkaId !== undefined ? { nahledFotkaId } : {}),
    };
  }

  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("přenese id obálky ze seznamu", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ expedice: [dobraExpedice("foto-9")] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );
    const vysledek = await getExpeditions();
    expect(vysledek.source).toBe("db");
    expect(vysledek.data[0]?.nahledFotkaId).toBe("foto-9");
  });

  it("neplatné id obálky spadne na snapshot, nevyhodí", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ expedice: [dobraExpedice("")] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );
    const vysledek = await getExpeditions();
    expect(vysledek.errorCode).toBe("BACKEND_CHYBA");
  });
});

describe("obálka a lightbox — zdroj", () => {
  const karta = cti("src/components/expeditions/ExpeditionCard.tsx");
  const modal = cti("src/components/expeditions/ExpeditionModal.tsx");
  const fotky = cti("src/components/expeditions/ExpeditionPhotos.tsx");
  const lightbox = cti("src/components/expeditions/FotkyLightbox.tsx");
  const nahled = cti("src/components/expeditions/VypravaNahled.tsx");
  const seznam = cti("server/src/index.ts");

  it("karta i hlavička modalu kreslí náhled a nechávají SVG", () => {
    expect(karta).toContain("aspect-[16/9]");
    expect(karta).toContain("VypravaNahled");
    expect(karta).toContain("useNahledFotkaId");
    expect(modal).toContain("h-36");
    expect(modal).toContain("VypravaNahled");
    expect(nahled).toContain('viewBox="0 0 400 180"');
    expect(nahled).toContain("urlSouboruFotky");
    expect(nahled).not.toContain("fotka.url");
  });

  it("seznam výprav doplní obálku jedním dotazem", () => {
    expect(seznam).toContain("nactiMapuNahledu");
    expect(seznam).toContain("sNahledFotkaId");
  });

  it("lightbox má zavření, předchozí a další fotku a aplikační URL", () => {
    const nav = cti("src/components/fotky/FotkyLightboxNav.tsx");
    expect(lightbox).toContain('aria-label="Zavřít fotku"');
    expect(lightbox).toContain("FotkyLightboxNav");
    expect(nav).toContain('aria-label="Předchozí fotka"');
    expect(nav).toContain('aria-label="Další fotka"');
    expect(nav).toContain("fotkyLightboxNavTlacitko");
    expect(lightbox).toContain('udalost.key === "Escape"');
    expect(lightbox).toContain("bg-papir");
    expect(lightbox).toContain("text-inkoust");
    expect(lightbox).toContain("urlSouboruFotky");
    expect(lightbox).toContain("Fotku se nepodařilo načíst.");
    expect(fotky).toContain("aria-label={popisekFotky}");
    expect(fotky).not.toContain('aria-label="Zvětšit náhledovou fotku"');
    expect(fotky).toContain("<FotkyLightbox");
    expect(karta).not.toContain("FotkyLightbox");
    expect(modal).not.toContain("<FotkyLightbox");
    expect(nahled).not.toContain("onOtevrit");
    expect(nahled).not.toContain("Zvětšit náhledovou fotku");
    expect(lightbox).toContain("Nastavit náhled");
    expect(lightbox).toContain('role="dialog"');
    expect(lightbox).toContain("overscroll-contain");
  });

  it("FotkaDialog na stránce alb je oddělený od expedition lightboxu", () => {
    const dialog = cti("src/components/fotky/FotkaDialog.tsx");
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain("<FotkaDialog");
    expect(album).not.toContain("FotkyLightbox");
    expect(dialog).not.toContain("Highlight");
    expect(dialog).toContain("srcFotkyAlba");
  });
});
