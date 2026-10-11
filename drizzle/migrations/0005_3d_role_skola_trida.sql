-- drizzle/migrations/0005_3d_role_skola_trida.sql — 3D role + škola/třída
-- Idempotentní dostavba nad 0004. Pouze ADD COLUMN IF NOT EXISTS / UPDATE
-- backfill / ADD CONSTRAINT IF NOT EXISTS — žádný DROP / RENAME / DELETE.
-- Pořadí je záměrné: nejdřív ADD sloupce → pak backfill UPDATE → pak ADD CHECK
-- (CHECK musí vidět jen zkonvertovaná data).
-- Odpovídá kontraktu src/shared/api-types.ts + src/config/roles.ts:
--   Clenstvi 'clen' | 'aktivni_clen', Funkce 'vedeni' | 'rada' | null,
--   isAdmin ortogonální boolean, skola/trida TEXT '' = nevyplněno.
-- Mapování staré role → 3D (stejné jako mapujRoliNaProfil):
--   admin → (aktivni_clen, NULL, TRUE)
--   clen → (clen, NULL, FALSE)
--   aktivni-clen → (aktivni_clen, NULL, FALSE)
--   clen-rady → (aktivni_clen, 'rada', FALSE)
--   vedeni → (aktivni_clen, 'vedeni', FALSE)
--   neznámé hodnoty → (clen, NULL, FALSE) — pojistka.
-- drizzle/schema/users.ts se mění jen o sloupce — CHECK žije pouze v SQL
-- (stejně jako dosud u users.role).

-- 1) ADD sloupce (idempotentní).
ALTER TABLE users ADD COLUMN IF NOT EXISTS clenstvi TEXT NOT NULL DEFAULT 'clen';
ALTER TABLE users ADD COLUMN IF NOT EXISTS funkce TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skola TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS trida TEXT NOT NULL DEFAULT '';

-- 2) Backfill ze staré role (jen řádky se starými hodnotami; opakovatelný).
UPDATE users SET clenstvi = 'aktivni_clen', funkce = NULL, is_admin = TRUE
  WHERE role = 'admin'
    AND (clenstvi IS DISTINCT FROM 'aktivni_clen'
      OR funkce IS DISTINCT FROM NULL
      OR is_admin IS DISTINCT FROM TRUE);

UPDATE users SET clenstvi = 'clen', funkce = NULL, is_admin = FALSE
  WHERE role = 'clen'
    AND (clenstvi IS DISTINCT FROM 'clen'
      OR funkce IS DISTINCT FROM NULL
      OR is_admin IS DISTINCT FROM FALSE);

UPDATE users SET clenstvi = 'aktivni_clen', funkce = NULL, is_admin = FALSE
  WHERE role = 'aktivni-clen'
    AND (clenstvi IS DISTINCT FROM 'aktivni_clen'
      OR funkce IS DISTINCT FROM NULL
      OR is_admin IS DISTINCT FROM FALSE);

UPDATE users SET clenstvi = 'aktivni_clen', funkce = 'rada', is_admin = FALSE
  WHERE role = 'clen-rady'
    AND (clenstvi IS DISTINCT FROM 'aktivni_clen'
      OR funkce IS DISTINCT FROM 'rada'
      OR is_admin IS DISTINCT FROM FALSE);

UPDATE users SET clenstvi = 'aktivni_clen', funkce = 'vedeni', is_admin = FALSE
  WHERE role = 'vedeni'
    AND (clenstvi IS DISTINCT FROM 'aktivni_clen'
      OR funkce IS DISTINCT FROM 'vedeni'
      OR is_admin IS DISTINCT FROM FALSE);

-- Pojistka neznámých hodnot role (mimo 5 známých) → bezpečný default.
UPDATE users SET clenstvi = 'clen', funkce = NULL, is_admin = FALSE
  WHERE role NOT IN ('admin', 'clen', 'aktivni-clen', 'clen-rady', 'vedeni')
    AND (clenstvi IS DISTINCT FROM 'clen'
      OR funkce IS DISTINCT FROM NULL
      OR is_admin IS DISTINCT FROM FALSE);

-- 3) ADD CHECK (idempotentní DROP + ADD — stejné názvy i definice).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_clenstvi_check;
ALTER TABLE users ADD CONSTRAINT users_clenstvi_check
  CHECK (clenstvi IN ('clen', 'aktivni_clen'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_funkce_check;
ALTER TABLE users ADD CONSTRAINT users_funkce_check
  CHECK (funkce IS NULL OR funkce IN ('vedeni', 'rada'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_funkce_vyzaduje_aktivniho_check;
ALTER TABLE users ADD CONSTRAINT users_funkce_vyzaduje_aktivniho_check
  CHECK (funkce IS NULL OR clenstvi = 'aktivni_clen');
