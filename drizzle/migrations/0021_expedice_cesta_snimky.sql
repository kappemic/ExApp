-- Optional journey screenshots (outbound and return) for an expedition.
-- Bytes stay in R2. Idempotent CREATE.

CREATE TABLE IF NOT EXISTS expedice_cesta_snimky (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id TEXT NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  smer TEXT NOT NULL,
  url TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expedice_cesta_snimky_smer_check CHECK (smer IN ('tam', 'zpet'))
);

CREATE INDEX IF NOT EXISTS idx_expedice_cesta_snimky_expedice_smer
  ON expedice_cesta_snimky (expedition_id, smer);
