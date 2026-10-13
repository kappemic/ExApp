-- drizzle/migrations/0009_faze5_diskuze.sql — diskuze k výpravě (Fáze 5, Krok 3)
-- Idempotentní dostavba: pouze CREATE TABLE IF NOT EXISTS /
-- CREATE INDEX IF NOT EXISTS / DO $$ re-assert FK + CHECK.
-- Žádný DROP / RENAME / DELETE / UPDATE / TRUNCATE / DROP COLUMN —
-- existující data (expeditions, users) zůstávají nedotčena.
-- Odpovídá drizzle/schema/zpravy.ts:
--   zpravy(id UUID PK, expedice_id TEXT NOT NULL → expeditions.id CASCADE,
--   autor_id UUID → users.id SET NULL, text 1–1000, created_at, smazano_at NULL).
-- Chování: smazání výpravy maže celé vlákno (CASCADE); odchod uživatele
--   vlákno nemaže (SET NULL, zpráva zůstává jako klubová paměť — stejně
--   jako photos.uploaded_by); smazání zprávy je soft-delete (smazano_at).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Tabulka vlákna (bez inline FK — ty přidává idempotentní DO blok níže,
--    aby čerstvá i existující DB skončily se stejnými pojmenovanými constrainty).
CREATE TABLE IF NOT EXISTS zpravy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedice_id TEXT NOT NULL,
  autor_id UUID,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  smazano_at TIMESTAMPTZ
);

-- 2) Re-assert FK + CHECK (no-op, pokud constrainty už existují).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zpravy_expedice_id_fkey'
  ) THEN
    ALTER TABLE zpravy ADD CONSTRAINT zpravy_expedice_id_fkey
      FOREIGN KEY (expedice_id) REFERENCES expeditions(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zpravy_autor_id_fkey'
  ) THEN
    ALTER TABLE zpravy ADD CONSTRAINT zpravy_autor_id_fkey
      FOREIGN KEY (autor_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zpravy_text_check'
  ) THEN
    ALTER TABLE zpravy ADD CONSTRAINT zpravy_text_check
      CHECK (char_length(text) >= 1 AND char_length(text) <= 1000);
  END IF;
END $$;

-- 3) Řazení vlákna výpravy (WHERE expedice_id + ORDER BY created_at).
CREATE INDEX IF NOT EXISTS idx_zpravy_expedice_created
  ON zpravy (expedice_id, created_at);
