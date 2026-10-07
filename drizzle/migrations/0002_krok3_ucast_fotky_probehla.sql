-- drizzle/migrations/0002_krok3_ucast_fotky_probehla.sql — Krok 3: účast + fotky + proběhlá
-- Idempotentní dostavba nad 0001_faze1.sql. Pouze ADD / CREATE IF NOT EXISTS,
-- žádný DROP / DELETE / UPDATE — 7 řádků expeditions zůstává nedotčeno.
-- Odpovídá kontraktu src/shared/api-types.ts:
--   StavVypravy 'volno' | 'skoro plno' | 'proběhlá',
--   StatusUcasti 'prihlasen' | 'ucastnil_se' | 'omluven',
--   právě jedna identita user_id XOR clen_id, UNIQUE dvojice.
-- Ověřeno na produkci i test-faze1-migrace: stav 3× volno / 2× skoro plno /
--   2× proběhlá, participants + photos prázdné (0), takže CHECK projde.
-- drizzle/schema/*.ts se nemění — CHECK žije pouze v SQL (stejně jako v 0001).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) expeditions.stav — CHECK dosud chyběl (popis v expeditions.ts ho zmiňuje).
--    Data konformní (ověřeno SELECTem), takže validace 7 řádků projde.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expeditions_stav_check'
  ) THEN
    ALTER TABLE expeditions ADD CONSTRAINT expeditions_stav_check
      CHECK (stav IN ('volno', 'skoro plno', 'proběhlá'));
  END IF;
END $$;

-- Filtr historie GET /api/expeditions?stav=proběhlá (Krok 2 kontrakt).
CREATE INDEX IF NOT EXISTS idx_expeditions_stav ON expeditions (stav);

-- 2) participants — re-assert 0001 pro čerstvé DB (na živé DB no-op).
--    Status pro přihlášení + docházku (uzavření adminem).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participants_status_check'
  ) THEN
    ALTER TABLE participants ADD CONSTRAINT participants_status_check
      CHECK (status IN ('prihlasen', 'ucastnil_se', 'omluven'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participants_xor_check'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participants_check'
  ) THEN
    ALTER TABLE participants ADD CONSTRAINT participants_xor_check
      CHECK ((user_id IS NULL) <> (clen_id IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participants_expedition_id_fkey'
  ) THEN
    ALTER TABLE participants ADD CONSTRAINT participants_expedition_id_fkey
      FOREIGN KEY (expedition_id) REFERENCES expeditions(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participants_user_id_fkey'
  ) THEN
    ALTER TABLE participants ADD CONSTRAINT participants_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participants_clen_id_fkey'
  ) THEN
    ALTER TABLE participants ADD CONSTRAINT participants_clen_id_fkey
      FOREIGN KEY (clen_id) REFERENCES clenove(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_expedition_user
  ON participants (expedition_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_expedition_clen
  ON participants (expedition_id, clen_id);
CREATE INDEX IF NOT EXISTS idx_participants_expedition ON participants (expedition_id);
-- Docházka při uzavření: filtr podle stavu účasti v rámci výpravy.
CREATE INDEX IF NOT EXISTS idx_participants_status ON participants (status);

-- 3) photos — re-assert 0001 pro čerstvé DB (na živé DB no-op).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'photos_expedition_id_fkey'
  ) THEN
    ALTER TABLE photos ADD CONSTRAINT photos_expedition_id_fkey
      FOREIGN KEY (expedition_id) REFERENCES expeditions(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'photos_uploaded_by_fkey'
  ) THEN
    ALTER TABLE photos ADD CONSTRAINT photos_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'photos_url_check'
  ) THEN
    ALTER TABLE photos ADD CONSTRAINT photos_url_check
      CHECK (char_length(url) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photos_expedition ON photos (expedition_id);
