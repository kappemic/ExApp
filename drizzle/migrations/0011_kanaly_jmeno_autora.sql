-- drizzle/migrations/0011_kanaly_jmeno_autora.sql — Step 1: kanály + jméno autora + sjednocené přečtení
-- Idempotentní dostavba: pouze ADD COLUMN IF NOT EXISTS / ALTER DROP NOT NULL /
-- CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DO $$ re-assert CHECK/FK/PK.
-- Žádný DROP / RENAME / DELETE / UPDATE / TRUNCATE / DROP COLUMN —
-- existující data (expeditions, users, zpravy, diskuze_precteni) zůstávají nedotčena.
-- Odpovídá drizzle/schema/zpravy.ts + drizzle/schema/konverzace_precteni.ts:
--   zpravy.kanal 'expedice' | 'dulezite' | 'general' (default 'expedice' = dnešní chování),
--   zpravy.expedice_id NULLABLE (NULL = globál dulezite/general, string = vlákno výpravy),
--   zpravy.autor_jmeno TEXT NOT NULL DEFAULT '' (snapshot zobrazovaného jména),
--   konverzace_precteni(user_id UUID → users.id CASCADE, conversation_key TEXT,
--     last_read_at TIMESTAMPTZ NOT NULL, PK (user_id, conversation_key)).
-- Chování: smazání výpravy maže její vlákno (CASCADE, globálů se NULL nedotkne);
--   odchod uživatele vlákno nemaže (zpravy.autor_id SET NULL, jméno drží autor_jmeno);
--   diskuze_precteni (0010) se NEMĚNÍ — 5 existujících rout meta/read + zpravy beze změny.
-- Rollback (záměrný admin krok, NENÍ součástí deploye):
--   ALTER TABLE zpravy DROP CONSTRAINT IF EXISTS zpravy_kanal_expedice_check;
--   ALTER TABLE zpravy DROP CONSTRAINT IF EXISTS zpravy_kanal_check;
--   DROP INDEX IF EXISTS idx_zpravy_kanal_created;
--   DROP TABLE IF EXISTS konverzace_precteni;
--   -- expedice_id zpět na NOT NULL + DROP COLUMN kanal/autor_jmeno JEN po ruční kontrole,
--   -- že žádný globál (expedice_id IS NULL) neexistuje; jinak by mazal data — proto mimo migraci.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Nové sloupce zpravy (defaulty backfillují existující řádky bez UPDATE).
ALTER TABLE zpravy ADD COLUMN IF NOT EXISTS kanal TEXT NOT NULL DEFAULT 'expedice';
ALTER TABLE zpravy ADD COLUMN IF NOT EXISTS autor_jmeno TEXT NOT NULL DEFAULT '';

-- 2) expedice_id NULLABLE pro globální kanály (no-op, pokud už NULLABLE).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'zpravy' AND column_name = 'expedice_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE zpravy ALTER COLUMN expedice_id DROP NOT NULL;
  END IF;
END $$;

-- 3) Re-assert CHECKy (no-op, pokud constrainty už existují).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zpravy_kanal_check'
  ) THEN
    ALTER TABLE zpravy ADD CONSTRAINT zpravy_kanal_check
      CHECK (kanal IN ('expedice', 'dulezite', 'general'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'zpravy_kanal_expedice_check'
  ) THEN
    ALTER TABLE zpravy ADD CONSTRAINT zpravy_kanal_expedice_check
      CHECK (
        (kanal = 'expedice' AND expedice_id IS NOT NULL)
        OR (kanal IN ('dulezite', 'general') AND expedice_id IS NULL)
      );
  END IF;
END $$;

-- 4) Řazení globálních kanálů (WHERE kanal + ORDER BY created_at).
CREATE INDEX IF NOT EXISTS idx_zpravy_kanal_created
  ON zpravy (kanal, created_at);

-- 5) Sjednocené značky přečtení (bez inline FK/PK — DO blok níže, stejný vzor jako 0010).
CREATE TABLE IF NOT EXISTS konverzace_precteni (
  user_id UUID NOT NULL,
  conversation_key TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL
);

-- 6) Re-assert PK + FK + CHECK (no-op, pokud constrainty už existují).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'konverzace_precteni_pkey'
  ) THEN
    ALTER TABLE konverzace_precteni ADD CONSTRAINT konverzace_precteni_pkey
      PRIMARY KEY (user_id, conversation_key);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'konverzace_precteni_user_id_fkey'
  ) THEN
    ALTER TABLE konverzace_precteni ADD CONSTRAINT konverzace_precteni_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'konverzace_precteni_key_check'
  ) THEN
    ALTER TABLE konverzace_precteni ADD CONSTRAINT konverzace_precteni_key_check
      CHECK (char_length(conversation_key) >= 1);
  END IF;
END $$;
