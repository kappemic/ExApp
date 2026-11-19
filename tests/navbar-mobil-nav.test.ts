/**
 * tests/navbar-mobil-nav.test.ts — pen redesign: spodní lišta.
 * Pět položek: Výpravy, Fotky, Zpěvník, Chat, Více. Unread tečka zůstává na Chatu.
 * Bez DB/HTTP/jsdom: zdroj-kontrakt Navbar.tsx.
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

describe("MOBIL_POLOZKY — pět položek pera", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const mobil: string = blokMobilPolozky(navbar);

  it("má přesně pět odkazů v pořadí pera", () => {
    const cesty: RegExpMatchArray | null = mobil.match(/to:\s*"[^"]+"/g);
    expect(cesty).toEqual([
      'to: "/vypravy"',
      'to: "/fotky"',
      'to: "/zpevnik"',
      'to: "/chat"',
      'to: "/vice"',
    ]);
  });

  it("neobsahuje Domů ani Profil", () => {
    expect(mobil).not.toMatch(/to:\s*"\/"/);
    expect(mobil).not.toContain('to: "/profil"');
  });
});

describe("AppHeader — mobilní Chat + unread badge", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const header: string = blokAppHeader(navbar);

  it("na telefonu nezdvojuje Chat, ten je v liště", () => {
    expect(header).not.toContain('to="/chat"');
    expect(header).not.toContain('to="/zpevnik"');
  });

  it("44px tap-target v hlavičce", () => {
    expect(header).toContain("min-h-[44px] min-w-[44px]");
    expect(header).toContain("[touch-action:manipulation]");
  });

  it("hlavička je jen od 1440, účet otevírá menu, žebříčky jsou v liště", () => {
    expect(header).not.toContain('to="/profil"');
    expect(header).toContain("AvatarKruh");
    expect(header).toContain('aria-haspopup="menu"');
    expect(header).toContain('aria-expanded={profilOtevreno}');
    expect(header).toContain('aria-label="Účet a profil"');
    expect(header).toContain("MenuProfil");
    expect(header).toContain("NavigacniRozbalovak");
    expect(header).toContain("min-[90rem]:grid");
    expect(header).toContain("hidden");
    const desktop = navbar.match(/const DESKTOP_POLOZKY[\s\S]*?^\];/m);
    expect(desktop).not.toBeNull();
    expect(desktop![0]).toContain('to: "/zebricky"');
    expect(desktop![0]).not.toContain('to: "/profil"');
    expect(desktop![0]).not.toContain('to: "/vice"');
    expect(desktop![0]).not.toMatch(/to:\s*"\/"/);
    expect(navbar).toContain("MenuVice");
    expect(navbar).toContain('aria-controls="menu-vice"');
  });
});

describe("MobileBar — čitelná lišta bez Domů a Profilu", () => {
  const navbar: string = ctiZdroj("src/components/Navbar/Navbar.tsx");
  const bar: string = blokMobileBar(navbar);

  it("renderuje MOBIL_POLOZKY, ne DESKTOP_POLOZKY", () => {
    expect(bar).toContain("MOBIL_POLOZKY");
    expect(bar).not.toContain("DESKTOP_POLOZKY");
  });

  it("lišta je plovoucí kapsle a mizí až od 1440 px", () => {
    expect(bar).toContain("min-[90rem]:hidden");
    expect(bar).not.toContain("lg:hidden");
    expect(bar).toContain("safe-area-inset-bottom");
    expect(bar).toContain("h-14");
    expect(bar).toContain("rounded-[28px]");
    expect(bar).toContain("MOBIL_POLOZKY");
  });

  it("Chat v liště drží unread tečku", () => {
    expect(bar).toContain("ChatTecka");
    expect(bar).toContain("popisekChat(pocetNeprectenych)");
    expect(bar).toContain("maNeprectene");
  });

  it("tap-targety min. 44px a čitelné popisky", () => {
    expect(navbar).toContain("tridyMobilOdkazu");
    expect(navbar).toMatch(/min-h-11[\s\S]*min-w-\[44px\]/);
    expect(navbar).toContain("text-[10px]");
  });

  it("do pěti položek nepřidává Členy ani Kódy", () => {
    expect(bar).not.toContain("ADMIN_POLOZKA");
    expect(bar).not.toContain("KODY_POLOZKA");
  });
});
