/**
 * tests/navbar-unread-badge.test.ts — Fáze 5, Krok 2: badge v Navbar.
 * Bez DB, bez HTTP, bez jsdom: čistá logika `spocitejNeprectene` +
 * `popisekNeprectenych` a zdroj-kontrakt `Navbar.tsx` (hook je jediný
 * zdroj pravdy, žádný hardcoded počet, tečka jen při unread > 0,
 * dynamický aria-label, reuse NeprectenaTecka, mobil + desktop sjednoceno).
 * Strict TypeScript, žádný `any`, česky.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  popisekNeprectenych,
  spocitejNeprectene,
} from "../src/hooks/useUnreadExpeditions";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

describe("spocitejNeprectene — součet badge vedle jeNeprectene", () => {
  it("prázdná mapa = 0 (tečka zhasnutá)", () => {
    expect(spocitejNeprectene(new Map<string, boolean>())).toBe(0);
  });

  it("počítá jen true (false a chybějící klíč nesvítí)", () => {
    const mapa = new Map<string, boolean>([
      ["a", true],
      ["b", false],
      ["c", true],
    ]);
    expect(spocitejNeprectene(mapa)).toBe(2);
  });

  it("vše přečteno = 0 (zhasne bez refreshi po eventu)", () => {
    const mapa = new Map<string, boolean>([
      ["a", false],
      ["b", false],
    ]);
    expect(spocitejNeprectene(mapa)).toBe(0);
  });
});

describe("popisekNeprectenych — česká pluralizace pro aria-label", () => {
  it("0 = žádné nepřečtené zprávy", () => {
    expect(popisekNeprectenych(0)).toBe("žádné nepřečtené zprávy");
  });

  it("1 = 1 nepřečtená zpráva", () => {
    expect(popisekNeprectenych(1)).toBe("1 nepřečtená zpráva");
  });

  it("2–4 = nepřečtené zprávy", () => {
    expect(popisekNeprectenych(2)).toBe("2 nepřečtené zprávy");
    expect(popisekNeprectenych(4)).toBe("4 nepřečtené zprávy");
  });

  it("5+ = nepřečtených zpráv", () => {
    expect(popisekNeprectenych(5)).toBe("5 nepřečtených zpráv");
    expect(popisekNeprectenych(11)).toBe("11 nepřečtených zpráv");
  });
});

describe("Navbar zdroj-kontrakt — badge na živých datech", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const hook: string = ctiZdroj("src/hooks/useUnreadExpeditions.ts");

  it("helper spocitejNeprectene žije vedle jeNeprectene", () => {
    expect(hook).toContain("export function spocitejNeprectene");
    expect(hook).toContain("export function jeNeprectene");
  });

  it("Navbar bere přehled konverzací (kolečko i bez otevření chatu)", () => {
    expect(navbar).toContain("useKonverzacePrehled");
    expect(navbar).toContain("pocetNeprectenych");
    expect(navbar).toContain("pocetNeprectenych > 0");
  });

  it("žádný hardcoded fake počet", () => {
    expect(navbar).not.toContain("NEPRECTENYCH_ZPRAV");
    expect(navbar).not.toContain("bg-jantar");
  });

  it("badge se obnovuje z přehledu konverzací, ne z id výprav", () => {
    const prehled: string = ctiZdroj("src/hooks/useKonverzacePrehled.tsx");
    expect(prehled).toContain("getKonverzace");
    expect(prehled).toContain("visibilitychange");
    expect(prehled).toContain("setInterval");
    expect(prehled).toContain("VYCHOZI_UNREAD_POLLING_MS");
    expect(navbar).not.toContain("getExpeditionsSync");
  });

  it("tečka jen když > 0, reuse NeprectenaTecka", () => {
    expect(navbar).toContain("NeprectenaTecka");
    expect(navbar).toContain("maNeprectene");
    expect(navbar).toContain('velikost="nadpis"');
  });

  it("dynamický aria-label (Chat vs Chat + počet)", () => {
    expect(navbar).toContain("popisekChat(pocetNeprectenych)");
    expect(navbar).toContain('aria-label={jeChat ? label : undefined}');
    expect(navbar).toContain("aria-label={jeChat ? popisekChat(pocetNeprectenych) : undefined}");
  });

  it("desktop TopBar i mobilní zvonek sdílí stejný počet", () => {
    expect(navbar).toContain("<TopBar");
    expect(navbar).toContain("pocetNeprectenych={pocetNeprectenych}");
    expect(navbar).toContain("pocetNeprectenych?: number");
    expect(navbar).toContain("min-[90rem]:hidden");
  });

  it("mobilní tečka drží 44px target (pointer-events-none + touch-action)", () => {
    expect(navbar).toContain("pointer-events-none");
    expect(navbar).toContain("[touch-action:manipulation]");
    expect(navbar).toContain("min-h-[44px] min-w-[44px]");
  });

  it("zdroje bez zakázaného typu a secretů", () => {
    for (const zdroj of [navbar, hook]) {
      expect(zdroj).not.toMatch(/:\s*any\b/);
      for (const slovo of [
        "client_secret",
        "passwordHash",
        "access_token",
        "refresh_token",
      ]) {
        expect(zdroj).not.toContain(slovo);
      }
    }
  });

  it("test bez zakázaného typu any", () => {
    const obsah: string = ctiZdroj("tests/navbar-unread-badge.test.ts");
    expect(obsah).not.toMatch(/:\s*any\b/);
  });
});
