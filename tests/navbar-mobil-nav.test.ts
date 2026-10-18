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

describe("MOBIL_POLOZKY — tři položky bez Chatu, Domů a Profilu", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const mobil: string = blokMobilPolozky(navbar);

  it("neobsahuje cestu /chat", () => {
    expect(mobil).not.toContain('to: "/chat"');
    expect(mobil).not.toMatch(/popisek:\s*"Chat"/);
  });

  it("má přesně tři odkazy (Výpravy, Fotky, Žebříčky)", () => {
    const cesty: RegExpMatchArray | null = mobil.match(/to:\s*"[^"]+"/g);
    expect(cesty).toEqual([
      'to: "/vypravy"',
      'to: "/fotky"',
      'to: "/zebricky"',
    ]);
  });

  it("dokumentuje produktové rozhodnutí (Chat v hlavičce)", () => {
    expect(navbar).toMatch(/Chat is intentionally absent[\s\S]*const MOBIL_POLOZKY/);
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

  it("profil je na telefonu avatar vpravo nahoře, na desktopu zůstává v menu", () => {
    expect(header).toContain('to="/profil"');
    expect(header).toContain("AvatarKruh");
    expect(header).toContain('aria-label="Profil"');
    expect(header).toContain("lg:hidden");
    const desktop = navbar.match(/const DESKTOP_POLOZKY[\s\S]*?^\];/m);
    expect(desktop).not.toBeNull();
    expect(desktop![0]).toContain('to: "/profil"');
    expect(desktop![0]).not.toMatch(/to:\s*"\/"/);
  });
});

describe("MobileBar — čitelná lišta bez Domů a Profilu", () => {
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

  it("Členové jsou v liště vždy, Kódy jen pro admina", () => {
    const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
    const bar: string = blokMobileBar(navbar);
    expect(bar).toContain("ADMIN_POLOZKA");
    expect(bar).toContain("...(videtAdmin ? [KODY_POLOZKA] : [])");
    expect(bar).not.toContain("...(videtAdmin ? [KODY_POLOZKA, ADMIN_POLOZKA] : [])");
  });
});
