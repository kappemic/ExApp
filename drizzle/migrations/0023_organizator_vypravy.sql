-- drizzle/migrations/0023_organizator_vypravy.sql — Organizátor výpravy
-- Idempotentní dostavba nad 0022. Pouze ADD COLUMN IF NOT EXISTS,
-- žádný DROP / DELETE / UPDATE — existující data nedotčena.
-- Když někdo vytvoří výpravu, uloží se jeho user_id jako organizátor.
-- Po uzavření (stav = 'proběhlá') dostává organizátor v leadherbordu
-- 2 body místo 1 (viz weighted COUNT v GET /api/zebricky).
-- Odpovídá kontraktu src/shared/api-types.ts: ApiExpedice.organizatorId.

ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS organizator_id UUID
    REFERENCES users(id) ON DELETE SET NULL;

-- Index pro rychlé vyhledání výprav dle organizátora (leadherbord, detail).
CREATE INDEX IF NOT EXISTS idx_expeditions_organizator_id
  ON expeditions (organizator_id);
