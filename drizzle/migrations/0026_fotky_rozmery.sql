-- Optional pixel size of the stored image (after orientation is baked in).
-- Null on rows uploaded before these columns existed. No backfill.

ALTER TABLE photos ADD COLUMN IF NOT EXISTS sirka integer;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS vyska integer;

ALTER TABLE alba_fotky ADD COLUMN IF NOT EXISTS sirka integer;
ALTER TABLE alba_fotky ADD COLUMN IF NOT EXISTS vyska integer;

ALTER TABLE expedice_cesta_snimky ADD COLUMN IF NOT EXISTS sirka integer;
ALTER TABLE expedice_cesta_snimky ADD COLUMN IF NOT EXISTS vyska integer;
