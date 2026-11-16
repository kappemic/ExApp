-- Club songbook. One row is a proposal or a published song.
-- Rejection deletes the row. Idempotent CREATE, never DROP.

CREATE TABLE IF NOT EXISTS zpevnik_pisne (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev TEXT NOT NULL DEFAULT '',
  autor TEXT NOT NULL DEFAULT '',
  par_klic TEXT NOT NULL,
  telo JSONB NOT NULL,
  stav TEXT NOT NULL DEFAULT 'navrh',
  navrhovatel_id UUID REFERENCES users(id) ON DELETE SET NULL,
  schvalil_id UUID REFERENCES users(id) ON DELETE SET NULL,
  schvaleno_at TIMESTAMPTZ,
  nahled_url TEXT,
  problem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zpevnik_pisne_stav_check CHECK (stav IN ('navrh', 'schvalena')),
  CONSTRAINT zpevnik_pisne_problem_check CHECK (
    problem IS NULL OR problem IN ('chybi_autor', 'chybi_text', 'spatne_akordy', 'duplicita')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS zpevnik_pisne_par_schvalena
  ON zpevnik_pisne (par_klic)
  WHERE stav = 'schvalena';
