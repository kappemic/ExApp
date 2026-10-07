/**
 * scripts/sync-readmodel.ts — SERVER-ONLY build-time sync (strategie A).
 *
 * Nikdy neimportovat ze `src/**` (klientský bundle). Čte `DATABASE_URL`
 * (bez prefixu VITE_) a zapisuje `src/data/expeditions.generated.json`.
 * Bez `DATABASE_URL` / bez DB / bez `pg` driveru: ponechá stávající snapshot
 * (fallback na mocky) a skončí s kódem 0 — build zůstává deterministický.
 *
 * Spuštění:  npx tsx scripts/sync-readmodel.ts
 * (vyžaduje dev-závislost `tsx` + `pg`; obojí volitelné — viz fallback výše)
 *
 * Očekávané DB sloupce (tabulka `expeditions`): id, nazev, datum (date/varchar
 * YYYY-MM-DD), sraz, popis, kapacita_prihlaseno (int), kapacita_celkem (int), stav
 * ('volno' | 'skoro plno' | 'proběhlá'). Sync mapuje kapacita_* AS prihlaseno/celkem.
 *
 * Členové (`clenove`) jsou ZÁMĚRNĚ live-only: čtou se živě z BFF
 * `GET /api/clenove` (jen ADMIN), nikdy se nesnapshotují do Gitu —
 * obsahují osobní údaje (e-mail, telefon) a do veřejného build-time
 * snapshotu nepatří. UI prototyp mezitím používá `src/data/mockClenove.ts`.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Načti DATABASE_URL z `.env.local` (git-ignorováno, reálné secrety).
// `tsx scripts/...` sám o sobě `.env*` nenačítá, proto bez tohoto
// sync hlásil „chybí" i když soubor existoval. Pořadí: nejdřív
// `.env.local`, pak fallback `.env` (nepřepisuje již nastavené).
// Hodnotu nikdy nelogujeme.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });
dotenv.config();

const PLATNE_STAVY = ["volno", "skoro plno", "proběhlá"] as const;
type PlatnyStav = (typeof PLATNE_STAVY)[number];

interface SnapshotExpedice {
  id: string;
  nazev: string;
  datum: string;
  sraz: string;
  popis: string;
  kapacita: { prihlaseno: number; celkem: number };
  stav: PlatnyStav;
}

interface DbRadek {
  id: unknown;
  nazev: unknown;
  datum: unknown;
  sraz: unknown;
  popis: unknown;
  prihlaseno: unknown;
  celkem: unknown;
  stav: unknown;
}

function jePlatnyStav(hodnota: unknown): hodnota is PlatnyStav {
  return (
    typeof hodnota === "string" &&
    (PLATNE_STAVY as readonly string[]).includes(hodnota)
  );
}

function normalizujDatum(hodnota: unknown): string | null {
  if (hodnota instanceof Date && !Number.isNaN(hodnota.getTime())) {
    // DATE nemá časové pásmo — formátuj lokální části, ne toISOString()
    // (toISOString by v CEST posunulo půlnoční datum o den zpět).
    const rok = hodnota.getFullYear();
    const mesic = String(hodnota.getMonth() + 1).padStart(2, "0");
    const den = String(hodnota.getDate()).padStart(2, "0");
    return `${rok}-${mesic}-${den}`;
  }
  if (typeof hodnota === "string") {
    const den = hodnota.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(den)) return den;
  }
  return null;
}

function normalizujRadek(radek: DbRadek): SnapshotExpedice | null {
  if (typeof radek.id !== "string" || radek.id.length === 0) return null;
  if (typeof radek.nazev !== "string" || radek.nazev.length === 0) return null;
  const datum = normalizujDatum(radek.datum);
  if (datum === null) return null;
  if (!jePlatnyStav(radek.stav)) return null;
  const prihlaseno =
    typeof radek.prihlaseno === "number"
      ? radek.prihlaseno
      : typeof radek.prihlaseno === "string"
        ? Number.parseInt(radek.prihlaseno, 10)
        : NaN;
  const celkem =
    typeof radek.celkem === "number"
      ? radek.celkem
      : typeof radek.celkem === "string"
        ? Number.parseInt(radek.celkem, 10)
        : NaN;
  if (!Number.isInteger(prihlaseno) || prihlaseno < 0) return null;
  if (!Number.isInteger(celkem) || celkem < 0) return null;
  return {
    id: radek.id,
    nazev: radek.nazev,
    datum,
    sraz: typeof radek.sraz === "string" ? radek.sraz : "",
    popis: typeof radek.popis === "string" ? radek.popis : "",
    kapacita: { prihlaseno, celkem },
    stav: radek.stav,
  };
}

async function main(): Promise<void> {
  const tady = dirname(fileURLToPath(import.meta.url));
  const cil = resolve(tady, "..", "src", "data", "expeditions.generated.json");
  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString || connectionString.includes("USER:PASSWORD")) {
    console.warn(
      "[sync-readmodel] DATABASE_URL chybí nebo je placeholder – snapshot ponechán (mock fallback).",
    );
    return;
  }

  let pgModul: unknown;
  try {
    pgModul = await import("pg");
  } catch {
    console.warn(
      "[sync-readmodel] Balíček `pg` není nainstalován – snapshot ponechán (mock fallback). Doinstaluj: npm i -D pg @types/pg tsx",
    );
    return;
  }

  const ClientCtor = (pgModul as { Client?: unknown }).Client;
  if (typeof ClientCtor !== "function") {
    console.warn("[sync-readmodel] `pg.Client` nenalezen – snapshot ponechán.");
    return;
  }

  type PgClient = {
    connect: () => Promise<void>;
    query: (sql: string) => Promise<{ rows: DbRadek[] }>;
    end: () => Promise<void>;
  };
  const client = new (ClientCtor as new (cfg: { connectionString: string }) => PgClient)({
    connectionString,
  });

  try {
    await client.connect();
    const vysledek = await client.query(
      "SELECT id, nazev, datum::text AS datum, sraz, popis, kapacita_prihlaseno AS prihlaseno, kapacita_celkem AS celkem, stav FROM expeditions ORDER BY datum ASC",
    );
    const expedice: SnapshotExpedice[] = [];
    for (const radek of vysledek.rows) {
      const norm = normalizujRadek(radek);
      if (norm !== null) expedice.push(norm);
    }
    if (expedice.length === 0) {
      console.warn(
        "[sync-readmodel] DB vrátila 0 platných řádků – snapshot ponechán (prázdný snapshot by znamenal ExpeditionEmpty).",
      );
      return;
    }
    const snapshot = {
      _meta: {
        zdroj: "db-snapshot",
        generatedAt: new Date().toISOString(),
        poznamka:
          "Build-time snapshot z Neon DB (scripts/sync-readmodel.ts). Bez secretů, pouze veřejná read data.",
      },
      expedice,
    };
    // Kontrola, že cíl existuje (nevytváříme nic mimo src/data):
    if (!existsSync(dirname(cil))) {
      console.warn(`[sync-readmodel] Chybí adresář ${dirname(cil)} – snapshot nezapsán.`);
      return;
    }
    // Lehké ověření, že stávající soubor je čitelný (fail-safe před přepsáním):
    try {
      readFileSync(cil, "utf8");
    } catch {
      console.warn("[sync-readmodel] Stávající snapshot nečitelný – přesto zapisuji nový.");
    }
    writeFileSync(cil, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    console.info(
      `[sync-readmodel] Zapsáno ${expedice.length} výprav → src/data/expeditions.generated.json`,
    );
  } catch (chyba) {
    console.warn(
      `[sync-readmodel] DB sync selhal (${chyba instanceof Error ? chyba.message : "neznámá chyba"}) – snapshot ponechán (mock fallback).`,
    );
  } finally {
    try {
      await client.end();
    } catch {
      // ignoruj chybu při zavírání – sync už má výsledek
    }
  }
}

void main();
