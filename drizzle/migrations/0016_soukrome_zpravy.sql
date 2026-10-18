-- Private 1:1 messages. Idempotent CREATE only.
-- Key format: soukrome:<lower-uuid>:<higher-uuid>

CREATE TABLE IF NOT EXISTS soukrome_zpravy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  klic TEXT NOT NULL,
  autor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  autor_jmeno TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  smazano_at TIMESTAMPTZ,
  CONSTRAINT soukrome_zpravy_text_check CHECK (char_length(text) BETWEEN 1 AND 1000),
  CONSTRAINT soukrome_zpravy_klic_check CHECK (
    klic ~ '^soukrome:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_soukrome_zpravy_klic_created
  ON soukrome_zpravy (klic, created_at);
