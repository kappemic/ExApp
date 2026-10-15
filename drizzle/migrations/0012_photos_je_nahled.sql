-- drizzle/migrations/0012_photos_je_nahled.sql
-- Additive highlight flag on photos. Existing rows stay; the default fills them.
-- Idempotent: ALTER ADD COLUMN IF NOT EXISTS only.
-- No DROP / DELETE / UPDATE / TRUNCATE of user data.
-- At most one true per expedition_id is enforced in application code
-- (clear the other rows of that expedition, then set the chosen photo).

ALTER TABLE photos ADD COLUMN IF NOT EXISTS je_nahled BOOLEAN NOT NULL DEFAULT false;
