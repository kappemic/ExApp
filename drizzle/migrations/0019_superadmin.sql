-- Superadmin flag on users. Additive only.
-- is_superadmin implies is_admin. users.role CHECK is left unchanged.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CHECK via pg_constraint,
-- and a one-time promotion of the single oldest admin.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_is_superadmin_requires_admin_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_is_superadmin_requires_admin_check
      CHECK (is_superadmin = false OR is_admin = true);
  END IF;
END $$;

-- Promote exactly one row: oldest is_admin by created_at, then id.
-- No-op once any superadmin already exists, so a re-run adds nobody.
UPDATE users
SET is_superadmin = true
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE is_superadmin = true
)
AND id = (
  SELECT id
  FROM users
  WHERE is_admin = true
  ORDER BY created_at ASC, id ASC
  LIMIT 1
);
