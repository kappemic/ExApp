-- Chat attachments for zpravy, soukrome_zpravy, and skupina_zpravy.
-- Polymorphic parent: druh picks the table, zprava_id is that row's UUID.
-- No foreign key, because the parent table varies.
-- Idempotent: CREATE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- and DROP CONSTRAINT IF EXISTS before re-adding CHECKs.

CREATE TABLE IF NOT EXISTS zprava_prilohy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  druh TEXT NOT NULL,
  zprava_id UUID NOT NULL,
  nazev TEXT NOT NULL,
  klic TEXT NOT NULL,
  bajty INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  vytvoreno TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zprava_prilohy_druh_check CHECK (druh IN ('zprava', 'soukroma', 'skupina')),
  CONSTRAINT zprava_prilohy_nazev_check CHECK (char_length(nazev) BETWEEN 1 AND 120),
  CONSTRAINT zprava_prilohy_klic_key UNIQUE (klic)
);

CREATE INDEX IF NOT EXISTS idx_zprava_prilohy_druh_zprava
  ON zprava_prilohy (druh, zprava_id);

-- Empty text is allowed (attachment-only messages). Length stays <= 1000.
ALTER TABLE zpravy DROP CONSTRAINT IF EXISTS zpravy_text_check;
ALTER TABLE zpravy ADD CONSTRAINT zpravy_text_check
  CHECK (char_length(text) <= 1000);

ALTER TABLE soukrome_zpravy DROP CONSTRAINT IF EXISTS soukrome_zpravy_text_check;
ALTER TABLE soukrome_zpravy ADD CONSTRAINT soukrome_zpravy_text_check
  CHECK (char_length(text) <= 1000);

ALTER TABLE skupina_zpravy DROP CONSTRAINT IF EXISTS skupina_zpravy_text_check;
ALTER TABLE skupina_zpravy ADD CONSTRAINT skupina_zpravy_text_check
  CHECK (char_length(text) <= 1000);
