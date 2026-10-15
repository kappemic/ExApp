-- drizzle/migrations/0010_diskuze_precteni.sql — Step 1: značky přečtení diskuze
-- Idempotentní dostavba: pouze CREATE TABLE IF NOT EXISTS + DO $$ re-assert FK/PK.
-- Žádný DROP / RENAME / DELETE / UPDATE / TRUNCATE / DROP COLUMN —
-- existující data (expeditions, users, zpravy) zůstávají nedotčena.
-- Odpovídá drizzle/schema/diskuze_precteni.ts:
--   diskuze_precteni(user_id UUID → users.id CASCADE, expedice_id TEXT → expeditions.id CASCADE,
--   last_read_at TIMESTAMPTZ NOT NULL, PK (user_id, expedice_id)).
-- Chování: smazání uživatele / výpravy maže jeho značky (CASCADE);
-- smazání zprávy lastReadAt nemění; POST read je idempotentní upsert.

-- 1) Tabulka značek (bez inline FK/PK — ty přidává idempotentní DO blok níže,
--    aby čerstvá i existující DB skončily se stejnými pojmenovanými constrainty).
CREATE TABLE IF NOT EXISTS diskuze_precteni (
  user_id UUID NOT NULL,
  expedice_id TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL
);

-- 2) Re-assert PK + FK (no-op, pokud constrainty už existují).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diskuze_precteni_pkey'
  ) THEN
    ALTER TABLE diskuze_precteni ADD CONSTRAINT diskuze_precteni_pkey
      PRIMARY KEY (user_id, expedice_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diskuze_precteni_user_id_fkey'
  ) THEN
    ALTER TABLE diskuze_precteni ADD CONSTRAINT diskuze_precteni_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diskuze_precteni_expedice_id_fkey'
  ) THEN
    ALTER TABLE diskuze_precteni ADD CONSTRAINT diskuze_precteni_expedice_id_fkey
      FOREIGN KEY (expedice_id) REFERENCES expeditions(id) ON DELETE CASCADE;
  END IF;
END $$;
