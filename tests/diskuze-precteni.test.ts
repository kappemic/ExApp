/**
 * tests/diskuze-precteni.test.ts — Step 1: unread meta + read (HANDOFF §10).
 * Bez DB, bez HTTP — čistě kontrakt + čistá logika + mock fetch:
 * - kontrakt §18 (cesty, guardy, matice, žádný secret v odpovědi).
 * - server/src/diskuze.ts (jeVlaknoNeprectene, anonymniDiskuzeMeta, spocitejLatestZVlakna).
 * - src/lib/diskuze-api.ts (getDiscussionMeta, markAsRead, optimistic cache
 *   exapp:discussion-lastRead-v1 — cache není pravda, jen cache).
 * - drizzle/schema/diskuze_precteni.ts + migrace 0010 (tvar, PK, CASCADE, nedestruktivní).
 * Strict TypeScript, žádný `any`, česky.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  DISKUZE_META_VZOR,
  DISKUZE_READ_VZOR,
  MATICE_DISKUZE_PRECTENI,
  PRISTUP_DISKUZE_PRECTENI,
  diskuzeMetaPath,
  diskuzeReadPath,
  jeDiskuzeMetaOdpoved,
  jeOznacPrecteniOdpoved,
} from "../src/shared/api-types";
import {
  anonymniDiskuzeMeta,
  jeVlaknoNeprectene,
  spocitejLatestZVlakna,
} from "../server/src/diskuze";
import {
  DISKUZE_LAST_READ_CACHE_KLIC,
  ctiLastReadZCache,
  getDiscussionMeta,
  markAsRead,
  ulozLastReadDoCache,
} from "../src/lib/diskuze-api";
import { diskuzePrecteni } from "../drizzle/schema/diskuze_precteni";

const API_ZAKLAD = "https://api.test";

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

/** In-memory localStorage pro node prostředí (vitest bez DOM). */
function stubPametoveUloziste(): void {
  const obchod = new Map<string, string>();
  const stub: Storage = {
    get length(): number {
      return obchod.size;
    },
    clear: (): void => {
      obchod.clear();
    },
    getItem: (klic: string): string | null => obchod.get(klic) ?? null,
    key: (index: number): string | null =>
      Array.from(obchod.keys())[index] ?? null,
    removeItem: (klic: string): void => {
      obchod.delete(klic);
    },
    setItem: (klic: string, hodnota: string): void => {
      obchod.set(klic, hodnota);
    },
  };
  vi.stubGlobal("localStorage", stub);
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
  stubPametoveUloziste();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("kontrakt §18 — cesty", () => {
  it("meta a read cesty odpovídají HANDOFF §10", () => {
    expect(DISKUZE_META_VZOR).toBe("/api/expeditions/:id/discussion/meta");
    expect(DISKUZE_READ_VZOR).toBe("/api/expeditions/:id/discussion/read");
    expect(diskuzeMetaPath("abc")).toBe("/api/expeditions/abc/discussion/meta");
    expect(diskuzeReadPath("abc")).toBe("/api/expeditions/abc/discussion/read");
  });

  it("matice: meta PUBLIC, read USER (per-user ze session)", () => {
    expect(PRISTUP_DISKUZE_PRECTENI[DISKUZE_META_VZOR]).toBe("PUBLIC");
    expect(PRISTUP_DISKUZE_PRECTENI[DISKUZE_READ_VZOR]).toBe("USER");
    const radky = MATICE_DISKUZE_PRECTENI.map((radek) => `${radek.metoda} ${radek.cesta} ${radek.kdo}`);
    expect(radky).toContain("GET /api/expeditions/:id/discussion/meta PUBLIC");
    expect(radky).toContain("POST /api/expeditions/:id/discussion/read USER");
  });
});

describe("kontrakt §18 — guardy", () => {
  it("přijme platné meta (ISO + boolean)", () => {
    expect(
      jeDiskuzeMetaOdpoved({
        latestMessageAt: "2026-10-14T10:00:00.000Z",
        lastReadAt: null,
        unread: true,
      }),
    ).toBe(true);
    expect(
      jeDiskuzeMetaOdpoved({ latestMessageAt: null, lastReadAt: null, unread: false }),
    ).toBe(true);
  });

  it("odmítne meta se secretem / PII / cizími klíči", () => {
    expect(
      jeDiskuzeMetaOdpoved({
        latestMessageAt: null,
        lastReadAt: null,
        unread: false,
        email: "a@b.cz",
      }),
    ).toBe(false);
    expect(
      jeDiskuzeMetaOdpoved({
        latestMessageAt: null,
        lastReadAt: null,
        unread: false,
        access_token: "tajne",
      }),
    ).toBe(false);
    expect(jeDiskuzeMetaOdpoved(null)).toBe(false);
    expect(
      jeDiskuzeMetaOdpoved({ latestMessageAt: null, unread: false }),
    ).toBe(false);
  });

  it("přijme platné read (právě lastReadAt) a odmítne secret", () => {
    expect(
      jeOznacPrecteniOdpoved({ lastReadAt: "2026-10-14T10:05:00.000Z" }),
    ).toBe(true);
    expect(jeOznacPrecteniOdpoved({ lastReadAt: null })).toBe(false);
    expect(jeOznacPrecteniOdpoved({})).toBe(false);
  });
});

describe("server — unread pravidla (jeVlaknoNeprectene)", () => {
  it("prázdné vlákno nikdy nesvítí", () => {
    expect(jeVlaknoNeprectene(null, null)).toBe(false);
    expect(jeVlaknoNeprectene(null, "2026-10-14T10:00:00.000Z")).toBe(false);
  });

  it("po nové cizí zprávě unread=true (nikdy nečetl)", () => {
    expect(jeVlaknoNeprectene("2026-10-14T10:00:00.000Z", null)).toBe(true);
  });

  it("po POST read unread=false (rovnost časů = přečteno)", () => {
    const cas = "2026-10-14T10:05:00.000Z";
    expect(jeVlaknoNeprectene(cas, cas)).toBe(false);
  });

  it("nová zpráva po read zase svítí (latest > lastRead)", () => {
    expect(
      jeVlaknoNeprectene("2026-10-14T10:06:00.000Z", "2026-10-14T10:05:00.000Z"),
    ).toBe(true);
    expect(
      jeVlaknoNeprectene("2026-10-14T10:04:00.000Z", "2026-10-14T10:05:00.000Z"),
    ).toBe(false);
  });

  it("anonym se nepersonalizuje (unread vždy false)", () => {
    expect(anonymniDiskuzeMeta("2026-10-14T10:00:00.000Z")).toEqual({
      latestMessageAt: "2026-10-14T10:00:00.000Z",
      lastReadAt: null,
      unread: false,
    });
    expect(anonymniDiskuzeMeta(null)).toEqual({
      latestMessageAt: null,
      lastReadAt: null,
      unread: false,
    });
  });

  it("spocitejLatestZVlakna bere MAX (prázdné → null, nevalidní přeskočí)", () => {
    expect(spocitejLatestZVlakna([])).toBeNull();
    expect(
      spocitejLatestZVlakna([
        { createdAt: "2026-10-14T10:00:00.000Z" },
        { createdAt: "2026-10-14T10:06:00.000Z" },
        { createdAt: "2026-10-14T10:03:00.000Z" },
      ]),
    ).toBe("2026-10-14T10:06:00.000Z");
    expect(spocitejLatestZVlakna([{ createdAt: "nesmysl" }])).toBeNull();
  });
});

describe("klient — getDiscussionMeta (mock fetch)", () => {
  it("200 vrací meta a zapíše lastRead do optimistic cache", async () => {
    const mock: typeof fetch = () =>
      Promise.resolve(
        odpovedJson(
          {
            latestMessageAt: "2026-10-14T10:00:00.000Z",
            lastReadAt: "2026-10-14T09:00:00.000Z",
            unread: true,
          },
          200,
        ),
      );
    vi.stubGlobal("fetch", mock);
    const vysledek = await getDiscussionMeta("abc");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.unread).toBe(true);
      expect(vysledek.data.latestMessageAt).toBe("2026-10-14T10:00:00.000Z");
    }
    expect(ctiLastReadZCache("abc")).toBe("2026-10-14T09:00:00.000Z");
  });

  it("404 neznámá expedice nese NENALEZENO", async () => {
    const mock: typeof fetch = () =>
      Promise.resolve(
        odpovedJson(
          { error: { code: "NENALEZENO", message: "Výprava nenalezena." } },
          404,
        ),
      );
    vi.stubGlobal("fetch", mock);
    const vysledek = await getDiscussionMeta("neexistuje");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.kod).toBe("NENALEZENO");
  });

  it("bez backendu vrací prázdné meta (unread false)", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const vysledek = await getDiscussionMeta("abc");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.latestMessageAt).toBeNull();
      expect(vysledek.data.unread).toBe(false);
    }
  });
});

describe("klient — markAsRead (mock fetch, idempotentní POST)", () => {
  it("200 zapíše čas na server i do cache (tečka zhasne hned)", async () => {
    let zachycenaMetoda = "";
    let zachyceneTelo = "";
    const mock: typeof fetch = (
      vstup: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      expect(String(vstup)).toBe(`${API_ZAKLAD}/api/expeditions/abc/discussion/read`);
      const metoda: unknown = (init as { method?: unknown } | undefined)?.method;
      zachycenaMetoda = typeof metoda === "string" ? metoda : "";
      const telo: unknown = (init as { body?: unknown } | undefined)?.body;
      zachyceneTelo = typeof telo === "string" ? telo : "";
      return Promise.resolve(
        odpovedJson({ lastReadAt: "2026-10-14T10:05:00.000Z" }, 200),
      );
    };
    vi.stubGlobal("fetch", mock);
    const vysledek = await markAsRead("abc");
    expect(zachycenaMetoda).toBe("POST");
    expect(zachyceneTelo).toBe("{}");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.lastReadAt).toBe("2026-10-14T10:05:00.000Z");
    }
    expect(ctiLastReadZCache("abc")).toBe("2026-10-14T10:05:00.000Z");
  });

  it("401 bez session nese NEPRIHLASEN", async () => {
    const mock: typeof fetch = () =>
      Promise.resolve(
        odpovedJson(
          {
            error: {
              code: "NEPRIHLASEN",
              message: "Nejsi přihlášený. Přihlas se a zkus to znovu.",
            },
          },
          401,
        ),
      );
    vi.stubGlobal("fetch", mock);
    const vysledek = await markAsRead("abc");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.kod).toBe("NEPRIHLASEN");
  });
});

describe("optimistic cache — není pravda o unread", () => {
  it("klíč je exapp:discussion-lastRead-v1", () => {
    expect(DISKUZE_LAST_READ_CACHE_KLIC).toBe("exapp:discussion-lastRead-v1");
  });

  it("prázdná cache vrací null, nevalidní čas ignoruje", () => {
    expect(ctiLastReadZCache("abc")).toBeNull();
    ulozLastReadDoCache("abc", "2026-10-14T10:05:00.000Z");
    expect(ctiLastReadZCache("abc")).toBe("2026-10-14T10:05:00.000Z");
    ulozLastReadDoCache("abc", "nesmysl");
    // Nevalidní zápis přes přímé localStorage — guard ho odmítne.
    try {
      localStorage.setItem(`${DISKUZE_LAST_READ_CACHE_KLIC}:abc`, "nesmysl");
    } catch {
      // Bez úložiště — přeskočeno.
    }
    expect(ctiLastReadZCache("abc")).toBeNull();
  });
});

describe("diskuze_precteni — tvar tabulky + migrace 0010", () => {
  it("tabulka se jmenuje diskuze_precteni", () => {
    expect(getTableConfig(diskuzePrecteni).name).toBe("diskuze_precteni");
  });

  it("sloupce: user_id UUID NOT NULL, expedice_id TEXT NOT NULL, last_read_at NOT NULL", () => {
    const cfg = getTableConfig(diskuzePrecteni);
    const sloupce = new Map(
      cfg.columns.map((sloupec) => [sloupec.name, sloupec]),
    );
    expect(sloupce.get("user_id")?.notNull).toBe(true);
    expect(sloupce.get("expedice_id")?.notNull).toBe(true);
    expect(sloupce.get("last_read_at")?.notNull).toBe(true);
  });

  it("migrace 0010 existuje, je idempotentní a nedestruktivní", () => {
    const obsah = cti("drizzle/migrations/0010_diskuze_precteni.sql");
    expect(obsah).toContain("CREATE TABLE IF NOT EXISTS diskuze_precteni");
    expect(obsah).toContain("REFERENCES users(id) ON DELETE CASCADE");
    expect(obsah).toContain("REFERENCES expeditions(id) ON DELETE CASCADE");
    expect(obsah).toContain("PRIMARY KEY (user_id, expedice_id)");
    const bezKomentaru = obsah
      .split("\n")
      .filter((radek) => !radek.trimStart().startsWith("--"))
      .join("\n");
    expect(bezKomentaru).not.toMatch(/^\s*DROP\s+TABLE/m);
    expect(bezKomentaru).not.toMatch(/DELETE\s+FROM/i);
    expect(bezKomentaru).not.toMatch(/TRUNCATE/i);
    expect(bezKomentaru).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("schema/index.ts re-exportuje diskuzePrecteni", () => {
    expect(cti("drizzle/schema/index.ts")).toContain("diskuzePrecteni");
  });

  it("nové soubory neobsahují zakázaný typ any", () => {
    const zakazanyTyp = ["as", "any"].join(" ");
    for (const soubor of [
      "drizzle/schema/diskuze_precteni.ts",
      "src/lib/diskuze-api.ts",
      "server/src/diskuze.ts",
      "tests/diskuze-precteni.test.ts",
    ]) {
      const obsah = cti(soubor);
      expect(obsah).not.toMatch(/:\s*any\b/);
      expect(obsah).not.toContain(zakazanyTyp);
    }
  });
});
