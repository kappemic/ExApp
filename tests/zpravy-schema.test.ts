/**
 * tests/zpravy-schema.test.ts — Fáze 5, Krok 3: DB model diskuze (guard tvaru).
 *
 * Bez DB, bez HTTP — čistě statický guard:
 * - drizzle/schema/zpravy.ts definuje tabulku `zpravy`
 *   (id uuid PK, expedice_id TEXT NOT NULL → expeditions.id CASCADE,
 *   autor_id UUID → users.id, text 1–1000, created_at, smazano_at NULL).
 * - index (expedice_id, created_at) pro vlákno výpravy.
 * - drizzle/schema/index.ts re-exportuje zpravy.
 * - drizzle/migrations/0009_faze5_diskuze.sql je nedestruktivní
 *   (pouze CREATE TABLE / INDEX IF NOT EXISTS + DO $$ re-assert FK/CHECK).
 * Strict TS, žádný zakázaný typ.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { zpravy } from "../drizzle/schema/zpravy";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

interface SloupecPrehled {
  name: string;
  columnType: string;
  notNull: boolean;
  primary: boolean;
}

function prehledSloupcu(): SloupecPrehled[] {
  const cfg = getTableConfig(zpravy);
  return cfg.columns.map((sloupec) => ({
    name: sloupec.name,
    columnType: sloupec.columnType,
    notNull: sloupec.notNull,
    primary: sloupec.primary,
  }));
}

function najdiSloupec(jmeno: string): SloupecPrehled | undefined {
  return prehledSloupcu().find((sloupec) => sloupec.name === jmeno);
}

interface IndexPrehled {
  name: string;
  columns: string[];
}

function prehledIndexu(): IndexPrehled[] {
  const cfg = getTableConfig(zpravy);
  return cfg.indexes.map((ix: unknown) => {
    const zaznam = ix as { config: { name: string; columns: { name: string }[] } };
    return {
      name: zaznam.config.name,
      columns: zaznam.config.columns.map((sloupec) => sloupec.name),
    };
  });
}

describe("zpravy — tvar tabulky (Fáze 5 diskuze)", () => {
  it("tabulka se jmenuje zpravy", () => {
    expect(getTableConfig(zpravy).name).toBe("zpravy");
  });

  it("id je uuid primární klíč", () => {
    const id = najdiSloupec("id");
    expect(id).toBeDefined();
    expect(id?.columnType).toBe("PgUUID");
    expect(id?.primary).toBe(true);
    expect(id?.notNull).toBe(true);
  });

  it("expedice_id je TEXT NOT NULL (FK → expeditions.id v migraci)", () => {
    const sloupec = najdiSloupec("expedice_id");
    expect(sloupec).toBeDefined();
    expect(sloupec?.columnType).toBe("PgText");
    expect(sloupec?.notNull).toBe(true);
  });

  it("autor_id je UUID (FK → users.id v migraci)", () => {
    const sloupec = najdiSloupec("autor_id");
    expect(sloupec).toBeDefined();
    expect(sloupec?.columnType).toBe("PgUUID");
  });

  it("text je TEXT NOT NULL (meze 1–1000 hlídá SQL CHECK)", () => {
    const sloupec = najdiSloupec("text");
    expect(sloupec).toBeDefined();
    expect(sloupec?.columnType).toBe("PgText");
    expect(sloupec?.notNull).toBe(true);
  });

  it("created_at je TIMESTAMPTZ NOT NULL, smazano_at je nullable (soft-delete)", () => {
    const vytvoreno = najdiSloupec("created_at");
    const smazano = najdiSloupec("smazano_at");
    expect(vytvoreno).toBeDefined();
    expect(vytvoreno?.notNull).toBe(true);
    expect(vytvoreno?.columnType).toBe("PgTimestamp");
    expect(smazano).toBeDefined();
    expect(smazano?.notNull).toBe(false);
    expect(smazano?.columnType).toBe("PgTimestamp");
  });

  it("má složený index (expedice_id, created_at) pro vlákno", () => {
    const indexy = prehledIndexu();
    const vlakno = indexy.find(
      (ix) =>
        ix.columns.length === 2 &&
        ix.columns[0] === "expedice_id" &&
        ix.columns[1] === "created_at",
    );
    expect(vlakno).toBeDefined();
  });
});

describe("zpravy — migrace 0009_faze5_diskuze.sql", () => {
  const SOUBOR = "drizzle/migrations/0009_faze5_diskuze.sql";

  it("migrace existuje a tvoří tabulku idempotentně", () => {
    const obsah = cti(SOUBOR);
    expect(obsah).toContain("CREATE TABLE IF NOT EXISTS zpravy");
    expect(obsah).toContain("CREATE INDEX IF NOT EXISTS");
    expect(obsah).toContain("expedice_id");
    expect(obsah).toContain("created_at");
  });

  it("FK: smazání výpravy maže vlákno (CASCADE), autor drží users", () => {
    const obsah = cti(SOUBOR);
    expect(obsah).toContain("REFERENCES expeditions(id) ON DELETE CASCADE");
    expect(obsah).toContain("REFERENCES users(id)");
  });

  it("text má CHECK 1–1000 znaků", () => {
    const obsah = cti(SOUBOR);
    expect(obsah).toContain("char_length");
    expect(obsah).toContain("1000");
  });

  it("smazano_at je nullable sloupec pro soft-delete", () => {
    const obsah = cti(SOUBOR);
    expect(obsah).toContain("smazano_at");
  });

  it("migrace je nedestruktivní (žádný DROP / DELETE / TRUNCATE / RENAME)", () => {
    const obsah = cti(SOUBOR);
    const bezKomentaru = obsah
      .split("\n")
      .filter((radek) => !radek.trimStart().startsWith("--"))
      .join("\n");
    expect(bezKomentaru).not.toMatch(/^\s*DROP\s+TABLE/m);
    expect(bezKomentaru).not.toMatch(/DELETE\s+FROM/i);
    expect(bezKomentaru).not.toMatch(/TRUNCATE/i);
    expect(bezKomentaru).not.toMatch(/ALTER\s+TABLE\s+\w+\s+RENAME/i);
    expect(bezKomentaru).not.toMatch(/DROP\s+COLUMN/i);
  });
});

describe("zpravy — export přes drizzle/schema/index.ts", () => {
  it("index re-exportuje tabulku zpravy", () => {
    const obsah = cti("drizzle/schema/index.ts");
    expect(obsah).toContain("zpravy");
  });

  it("nové soubory neobsahují zakázaný typ any", () => {
    const zakazanyTyp = ["as", "any"].join(" ");
    for (const soubor of [
      "drizzle/schema/zpravy.ts",
      "drizzle/schema/index.ts",
      "tests/zpravy-schema.test.ts",
    ]) {
      const obsah = cti(soubor);
      expect(obsah).not.toMatch(/:\s*any\b/);
      expect(obsah).not.toContain(zakazanyTyp);
    }
  });
});
