-- drizzle/migrations/0006_meeting_exceptions.sql — výjimky týdenních schůzek (B4)
-- Idempotentní dostavba: pouze CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Žádný DROP / RENAME / DELETE — nemaže žádná data.
-- Odpovídá drizzle/schema/meetings.ts (meetingExceptions):
--   series_id → meetings(id) ON DELETE CASCADE, occurrence_date DATE, created_by → users(id) ON DELETE SET NULL.
-- Opravuje 500 při DELETE /api/meetings/:id/occurrence (INSERT) i GET /api/meetings s týdenní řadou (SELECT),
-- kde chybějící tabulka házela „relation meeting_exceptions does not exist".

CREATE TABLE IF NOT EXISTS meeting_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_exceptions_series_date
  ON meeting_exceptions (series_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_meeting_exceptions_series
  ON meeting_exceptions (series_id);
