-- drizzle/migrations/0001_faze1.sql — Fáze 1: users, registration_codes, meetings, photos, participants
-- Idempotentní návrh: pouze CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS,
-- nic se nemaže ani nepřepisuje (expeditions + clenove zůstávají nedotčené).
-- Předpoklad (Neon větev br-icy-boat-b58qwqgx): existují tabulky
--   expeditions(id TEXT, 7 řádků) a clenove(id TEXT, 14 řádků c01–c14).
--   Ty se NEMAZOU ani nemění — nové tabulky na ně pouze odkazují.
-- Pořadí je záměrné: nejdřív users (cíl FK), pak zbytek.
-- 10minutová expirace kódů: expires_at = created_at + interval '10 minutes'
--   (nastavuje API při INSERT, nikdy default). Platný kód:
--   used_at IS NULL AND expires_at > now().
-- Odpovídá drizzle schématům v drizzle/schema/*.ts a rolím v src/config/roles.ts.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) users — identita (auth + profil). Můstek clen_id → clenove(id), role 1:1 z roles.ts.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clen_id TEXT REFERENCES clenove(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  jmeno TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'clen'
    CHECK (role IN ('admin', 'clen', 'aktivni-clen', 'clen-rady', 'vedeni')),
  strava_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_clen_id ON users (clen_id);

-- Krok 2 profilové sloupce (server/src/index.ts je vyžaduje při registraci):
-- idempotentní dostavba pro DB založené pouze touto migrací.
ALTER TABLE users ADD COLUMN IF NOT EXISTS prijmeni TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS telefon TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_nick TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

-- 2) registration_codes — jednorázové 10minutové pozvánkové kódy (PRD 2.1).
CREATE TABLE IF NOT EXISTS registration_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at)
);
-- Rychlé hledání platných kódů: WHERE used_at IS NULL AND expires_at > now()
CREATE INDEX IF NOT EXISTS idx_regcodes_expires_unused
  ON registration_codes (expires_at) WHERE used_at IS NULL;

-- 3) meetings — opakované schůzky (PRD 2.4). Bez FK na expeditions:
-- kalendář sjednocuje meetings + expeditions až v read vrstvě (UNION).
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nazev TEXT NOT NULL,
  datum DATE NOT NULL,
  mistnost TEXT,
  popis TEXT NOT NULL DEFAULT '',
  opakovani TEXT NOT NULL DEFAULT 'jednorazova'
    CHECK (opakovani IN ('jednorazova', 'tydenni')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_datum ON meetings (datum);

-- 4) photos — fotky k proběhlé výpravě (jen URL do Cloudinary / Supabase / S3).
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id TEXT NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(url) > 0),
  popis TEXT NOT NULL DEFAULT '',
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_expedition ON photos (expedition_id);

-- 5) participants — přihlášení (před akcí) + docházka (uzavření adminem).
-- Právě jedna identita: user_id XOR clen_id. Duplicitní přihláška zakázána.
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id TEXT NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  clen_id TEXT REFERENCES clenove(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'prihlasen'
    CHECK (status IN ('prihlasen', 'ucastnil_se', 'omluven')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NULL) <> (clen_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_expedition_user
  ON participants (expedition_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_expedition_clen
  ON participants (expedition_id, clen_id);
CREATE INDEX IF NOT EXISTS idx_participants_expedition ON participants (expedition_id);
