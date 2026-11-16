-- Favorite color on the personal profile. Additive only.
-- "" means unset. Trim happens at the API boundary.

ALTER TABLE users ADD COLUMN IF NOT EXISTS oblibena_barva TEXT NOT NULL DEFAULT '';
