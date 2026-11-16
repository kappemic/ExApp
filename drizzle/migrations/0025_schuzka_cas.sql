-- Optional clock time for a meeting. Null means the whole day.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cas text;

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_cas_tvar;
ALTER TABLE meetings ADD CONSTRAINT meetings_cas_tvar
  CHECK (cas IS NULL OR cas ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
