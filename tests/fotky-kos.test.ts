/**
 * tests/fotky-kos.test.ts — trash album id, schema migration, UI contracts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { albaFotky } from "../drizzle/schema/alba";
import { photos } from "../drizzle/schema/photos";
import { ALBUM_KOS_ID, jeAlbumKos, KOS_RETENTION_DAYS } from "../src/shared/fotky-kos";
import { albumKos } from "../server/src/alba";
import { jeFotkaPoRetenciKos, jeFotkaVKosi, mezRetenceKos } from "../server/src/fotky-trash";
import type { Photo } from "../drizzle/schema/photos";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("ALBUM_KOS_ID", () => {
  it("je stabilní virtuální id složky Koš", () => {
    expect(ALBUM_KOS_ID).toBe("kos");
    expect(jeAlbumKos("kos")).toBe(true);
    expect(jeAlbumKos(" uuid ")).toBe(false);
  });

  it("albumKos vrací druh kos a název Koš", () => {
    const slozka = albumKos(3, "abc");
    expect(slozka.druh).toBe("kos");
    expect(slozka.nazev).toBe("Koš");
    expect(slozka.pocetFotek).toBe(3);
    expect(slozka.nahledFotkaId).toBe("abc");
  });
});

describe("purge hook v alba routes", () => {
  it("admin GET /api/alba a koš volají purgeKosBestEffort", () => {
    const routes = cti("server/src/alba-routes.ts");
    expect(routes).toContain("purgeKosBestEffort");
    expect(routes.match(/purgeKosBestEffort/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("DELETE koš je registrované před obecným mazáním fotky v albu", () => {
    const routes = cti("server/src/alba-routes.ts");
    const kosDelete = routes.indexOf('app.delete("/api/alba/kos/fotky/:fotkaId"');
    const albumDelete = routes.indexOf('app.delete("/api/alba/:id/fotky/:fotkaId"');
    expect(kosDelete).toBeGreaterThan(-1);
    expect(albumDelete).toBeGreaterThan(-1);
    expect(kosDelete).toBeLessThan(albumDelete);
  });
});

describe("jeFotkaVKosi", () => {
  it("vyžaduje existující řádek se smazano_at", () => {
    const radek = {
      id: "a",
      url: "https://example.com/x.jpg",
      createdAt: new Date(),
      jeNahled: false,
      expeditionId: "e",
      smazanoAt: new Date(),
    } satisfies Photo;
    expect(jeFotkaVKosi(null)).toBe(false);
    expect(jeFotkaVKosi({ druh: "vyprava", radek: { ...radek, smazanoAt: null } })).toBe(false);
    expect(jeFotkaVKosi({ druh: "vyprava", radek })).toBe(true);
  });
});

describe("retence koše", () => {
  it("KOS_RETENTION_DAYS je 30", () => {
    expect(KOS_RETENTION_DAYS).toBe(30);
  });

  it("mezRetenceKos odečte retenční dny od referenčního okamžiku", () => {
    const vuci = new Date("2026-06-15T12:00:00.000Z");
    const mez = mezRetenceKos(vuci);
    expect(mez.toISOString()).toBe("2026-05-16T12:00:00.000Z");
  });

  it("jeFotkaPoRetenciKos vybírá jen řádky se smazano_at před mezí", () => {
    const vuci = new Date("2026-06-15T12:00:00.000Z");
    const mez = mezRetenceKos(vuci);
    expect(jeFotkaPoRetenciKos(null, vuci)).toBe(false);
    expect(jeFotkaPoRetenciKos(mez, vuci)).toBe(false);
    expect(jeFotkaPoRetenciKos(new Date(mez.getTime() - 1), vuci)).toBe(true);
    expect(jeFotkaPoRetenciKos(new Date(mez.getTime() + 1), vuci)).toBe(false);
  });
});

describe("smazano_at sloupce", () => {
  it("photos a alba_fotky mají nullable smazano_at", () => {
    for (const tabulka of [photos, albaFotky]) {
      const sloupec = getTableConfig(tabulka).columns.find((c) => c.name === "smazano_at");
      expect(sloupec?.notNull).toBe(false);
    }
  });

  it("migrace 0014 jen přidává sloupce a indexy", () => {
    const sql = cti("drizzle/migrations/0014_fotky_kos.sql");
    expect(sql).toContain("smazano_at");
    const bezKomentaru = sql
      .split("\n")
      .filter((radek) => !radek.trimStart().startsWith("--"))
      .join("\n");
    expect(bezKomentaru).not.toMatch(/\bDROP\b/i);
  });
});

describe("AlbumFotky — lightbox a koš", () => {
  it("FotkaDialog maže aktuální fotku bez režimu výběru", () => {
    const dialog = cti("src/components/fotky/FotkaDialog.tsx");
    expect(dialog).toContain("onSmazatAktualni");
    expect(dialog).not.toContain("FotkyMazaciHlavicka");
    expect(dialog).toContain("Smazat natrvalo");
  });

  it("AlbumFotky uvádí 30denní automatické smazání koše", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain("KOS_RETENTION_DAYS");
    expect(album).toContain("Fotky v koši se po");
    expect(album).toContain("smažou natrvalo");
  });

  it("AlbumFotky používá koš hlavičku a obnovu", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain("FotkyKosHlavicka");
    expect(album).toContain("obnovFotkuZKose");
    expect(album).toContain('otevriPotvrzeni("aktualni", aktualniFotkaId)');
    expect(album).toMatch(/jeKos[\s\S]*border-smrk/);
  });

  it("potvrzení mazání je nad lightboxem (z-index)", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain('vrstva={potvrzeniNadLightboxem ? "nad-lightboxem" : "normal"}');
    expect(album).toContain("drzOtevrene={lightboxOtevren && potvrzeniNadLightboxem}");
    const confirm = cti("src/components/kalendar/ConfirmDialog.tsx");
    expect(confirm).toContain("nad-lightboxem");
    expect(confirm).toContain("z-[200]");
    expect(confirm).toContain("createPortal");
  });

  it("koš hlavička seskupuje obnovu a trvalé smazání", () => {
    const hlavicka = cti("src/components/fotky/FotkyKosHlavicka.tsx");
    expect(hlavicka).toContain("data-fotky-kos-akce");
    expect(hlavicka).toContain("data-fotky-kos-skupina-obnovit");
    expect(hlavicka).toContain("data-fotky-kos-skupina-smazat");
    expect(hlavicka).toContain("fotkyKosAkceObal");
    const ui = cti("src/components/fotky/fotky-ui.ts");
    expect(ui).toMatch(/fotkyKosAkceObal[\s\S]*sm:flex-row/);
  });

  it("fotky-mazani zmiňuje retenční dobu koše", () => {
    const mazani = cti("src/lib/fotky-mazani.ts");
    expect(mazani).toContain("KOS_RETENTION_DAYS");
    expect(mazani).toMatch(/Po \$\{KOS_RETENTION_DAYS\} dnech se smaže natrvalo/);
  });
});
