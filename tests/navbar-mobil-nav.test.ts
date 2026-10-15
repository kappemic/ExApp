/**
 * tests/navbar-mobil-nav.test.ts — Fáze 5: mobilní navigace (produkt).
 * Spodní lišta = 5 položek bez Chatu; Chat v hlavičce na mobilu + badge unread.
 * Bez DB/HTTP/jsdom: zdroj-kontrakt Navbar.tsx (vzor navbar-unread-badge).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

function blokMobilPolozky(navbar: string): string {
  const match = navbar.match(/const MOBIL_POLOZKY[\s\S]*?^\];/m);
  expect(match).not.toBeNull();
  return match![0];
}

function blokAppHeader(navbar: string): string {
  const match = navbar.match(
    /export function AppHeader[\s\S]*?(?=^export default function Navbar)/m,
  );
  expect(match).not.toBeNull();
  return match![0];
}

function blokMobileBar(navbar: string): string {
  const match = navbar.match(/export function MobileBar[\s\S]*?^}/m);
  expect(match).not.toBeNull();
  return match![0];
}

describe("MOBIL_POLOZKY — pět položek bez Chatu", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const mobil: string = blokMobilPolozky(navbar);

  it("neobsahuje cestu /chat", () => {
    expect(mobil).not.toContain('to: "/chat"');
    expect(mobil).not.toMatch(/popisek:\s*"Chat"/);
  });

  it("má přesně pět odkazů (Domů, Výpravy, Fotky, Žebříčky, Profil)", () => {
    const cesty: RegExpMatchArray | null = mobil.match(/to:\s*"[^"]+"/g);
    expect(cesty).not.toBeNull();
    expect(cesty!.length).toBe(5);
    expect(cesty!.join(" ")).toContain('to: "/"');
    expect(cesty!.join(" ")).toContain('to: "/vypravy"');
    expect(cesty!.join(" ")).toContain('to: "/fotky"');
    expect(cesty!.join(" ")).toContain('to: "/zebricky"');
    expect(cesty!.join(" ")).toContain('to: "/profil"');
  });

  it("dokumentuje produktové rozhodnutí (Chat v hlavičce)", () => {
    expect(navbar).toMatch(/Chat záměrně chybí[\s\S]*const MOBIL_POLOZKY/);
    expect(navbar).toContain("`AppHeader`");
  });
});

describe("AppHeader — mobilní Chat + unread badge", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const header: string = blokAppHeader(navbar);

  it("odkaz na /chat jen na mobilu (lg:hidden)", () => {
    expect(header).toContain('to="/chat"');
    expect(header).toContain("lg:hidden");
    expect(header).toContain("IkonaChat");
  });

  it("badge při nepřečtených (ChatTecka + dynamický aria-label)", () => {
    expect(header).toContain("maNeprectene");
    expect(header).toContain("ChatTecka");
    expect(header).toContain("popisekChat(pocetNeprectenych)");
  });

  it("44px tap-target v hlavičce", () => {
    expect(header).toContain("min-h-[44px] min-w-[44px]");
    expect(header).toContain("[touch-action:manipulation]");
  });
});

describe("MobileBar — čitelná pět položková lišta", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const bar: string = blokMobileBar(navbar);

  it("renderuje MOBIL_POLOZKY, ne DESKTOP_POLOZKY", () => {
    expect(bar).toContain("MOBIL_POLOZKY");
    expect(bar).not.toContain("DESKTOP_POLOZKY");
  });

  it("jen na mobilu + safe-area + dynamický grid sloupců", () => {
    expect(bar).toContain("lg:hidden");
    expect(bar).toContain("safe-area-inset-bottom");
    expect(bar).toContain("gridTemplateColumns");
    expect(bar).toContain("repeat(${polozky.length}");
  });

  it("tap-targety min. 44px a čitelné popisky", () => {
    expect(navbar).toContain("tridyMobilOdkazu");
    expect(navbar).toMatch(/min-h-\[48px\][\s\S]*min-w-\[44px\]/);
    expect(navbar).toContain("text-[11px]");
  });
});
