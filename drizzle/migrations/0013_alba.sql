-- drizzle/migrations/0013_alba.sql
-- Extra albums (`vlastni`) and their photos. Expedition albums are not stored here.
-- Idempotent and additive. No DROP / DELETE / UPDATE / TRUNCATE.
-- users.id is uuid (drizzle/schema/users.ts).

CREATE TABLE IF NOT EXISTS alba (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alba_fotky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES alba(id) ON DELETE CASCADE,
  url text NOT NULL,
  je_nahled boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
