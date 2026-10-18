-- drizzle/migrations/0015_profil_avatar_bio_narozeniny.sql — profil uživatele (Step 3)
-- Idempotentní dostavba nad 0005. Pouze ADD COLUMN IF NOT EXISTS — žádný
-- DROP / RENAME / DELETE. Odpovídá drizzle/schema/users.ts:
--   avatar_url TEXT NULL (= nevyplněno, POUZE URL — upload až Step 4),
--   bio TEXT NOT NULL DEFAULT '' ("" = nevyplněno, trim na hranici),
--   narozeniny DATE NULL (YYYY-MM-DD, NULL = nevyplněno).
-- Photos tabulka je vázána na expedition_id — avatar se do ní NEUKLÁDÁ.
-- Spouštět PŘÍMOU (non-pooled) connection stringou, ne přes -pooler
-- (skill neon-postgres: migrace = direct URL).

-- 1) ADD sloupce (idempotentní).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS narozeniny DATE;

-- 2) CHECK pro rozumné narozeniny (idempotentní DROP + ADD).
-- NULL = nevyplněno; jinak datum mezi 1900-01-01 a dneškem.
-- (Aplikační validace hlídá totéž na hranici — DB je druhá hráz.)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_narozeniny_check;
ALTER TABLE users ADD CONSTRAINT users_narozeniny_check
  CHECK (narozeniny IS NULL
    OR (narozeniny >= DATE '1900-01-01' AND narozeniny <= CURRENT_DATE));
