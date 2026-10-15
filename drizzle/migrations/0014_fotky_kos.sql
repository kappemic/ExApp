-- Soft-delete for club photos (expedition `photos` + extra `alba_fotky`).
-- NULL = visible in albums; NOT NULL = in admin trash (Koš).

ALTER TABLE photos ADD COLUMN IF NOT EXISTS smazano_at TIMESTAMPTZ;

ALTER TABLE alba_fotky ADD COLUMN IF NOT EXISTS smazano_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS photos_smazano_at_idx ON photos (smazano_at)
  WHERE smazano_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS alba_fotky_smazano_at_idx ON alba_fotky (smazano_at)
  WHERE smazano_at IS NOT NULL;
