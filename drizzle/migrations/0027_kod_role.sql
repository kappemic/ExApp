-- Role the new account gets when it registers with this code.
-- 'admin' is not allowed on purpose: a code is shared and reusable.
ALTER TABLE registration_codes ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'clen';

ALTER TABLE registration_codes DROP CONSTRAINT IF EXISTS registration_codes_role_check;
ALTER TABLE registration_codes ADD CONSTRAINT registration_codes_role_check
  CHECK (role IN ('clen', 'aktivni-clen', 'clen-rady', 'vedeni'));
