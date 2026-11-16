-- Custom chat groups. Idempotent CREATE only.
-- Read/write is stored per role. Write implies read.

CREATE TABLE IF NOT EXISTS chat_skupiny (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_skupiny_nazev_check CHECK (char_length(nazev) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS chat_skupina_prava (
  skupina_id UUID NOT NULL REFERENCES chat_skupiny(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  cist BOOLEAN NOT NULL,
  psat BOOLEAN NOT NULL,
  PRIMARY KEY (skupina_id, role),
  CONSTRAINT chat_skupina_prava_role_check CHECK (
    role IN ('clen', 'aktivni-clen', 'clen-rady', 'vedeni', 'admin')
  ),
  CONSTRAINT chat_skupina_prava_psat_check CHECK (NOT psat OR cist)
);

CREATE TABLE IF NOT EXISTS skupina_zpravy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skupina_id UUID NOT NULL REFERENCES chat_skupiny(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  autor_jmeno TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  smazano_at TIMESTAMPTZ,
  CONSTRAINT skupina_zpravy_text_check CHECK (char_length(text) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_skupina_zpravy_skupina_created
  ON skupina_zpravy (skupina_id, created_at);
