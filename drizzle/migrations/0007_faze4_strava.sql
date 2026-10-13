-- drizzle/migrations/0007_faze4_strava.sql — Strava tokeny + párování aktivit (Fáze 4, Krok 0)
-- POZNÁMKA k číslování: plán zněl 0006_faze4_strava.sql, ale
-- 0006_meeting_exceptions.sql patří necommitnuté vlně Fáze 3 (HANDOFF.md §4)
-- — nepřepisuji ji, pokračuji číslem 0007.
-- Idempotentní dostavba: pouze CREATE TABLE IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS.
-- Žádný DROP / RENAME / DELETE / UPDATE — existující data nedotčena.
-- Odpovídá drizzle/schema/strava_tokens.ts + drizzle/schema/expeditions.ts
-- (km / prevyseni_m / strava_activity_id / trasa_polyline) a kontraktu
-- src/shared/api-types.ts §15 (StravaTokens bez secretů, ApiAktivita).

-- 1) Tokeny: jeden řádek na uživatele (PK = FK, CASCADE).
CREATE TABLE IF NOT EXISTS strava_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expirace TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Párování aktivity k výpravě (vše NULL = nespárováno, staré řádky untouched).
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS km REAL NULL;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS prevyseni_m INTEGER NULL;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS strava_activity_id TEXT NULL;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS trasa_polyline TEXT NULL;

-- 3) Jedna Strava aktivita = jedna výprava (NULL hodnoty UNIQUE neblokuje).
CREATE UNIQUE INDEX IF NOT EXISTS uq_expeditions_strava_activity
  ON expeditions (strava_activity_id);
