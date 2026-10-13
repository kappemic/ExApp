-- drizzle/migrations/0008_zebricky_index.sql — indexy pro veřejný žebříček (Fáze 4, Krok 5)
-- Idempotentní dostavba: pouze CREATE INDEX IF NOT EXISTS, žádný DROP / RENAME /
-- DELETE / UPDATE — existující data nedotčena.
-- Dotaz GET /api/zebricky agreguje jedním GROUP BY:
--   participants(status='ucastnil_se') ⋈ users ⋈ expeditions
--   WHERE status + filtr roku rozsahem datum >= YYYY-01-01 AND datum < YYYY+1
--   GROUP BY user → ORDER BY vypravy DESC, km DESC, jmeno ASC LIMIT 50.
-- Bez složeného indexu by Postgres na 1000+ participants volil seq-scan;
-- s indexy drží index-scan + sort z malého GROUP BY (EXPLAIN ověřen staticky).
-- Odpovídá drizzle/schema/participants.ts + expeditions.ts
-- a kontraktu src/shared/api-types.ts §15c (ZEBRICKY_PATH).

-- 1) Rychlý filtr docházky + seskupení podle uživatele.
CREATE INDEX IF NOT EXISTS idx_participants_status_user
  ON participants (status, user_id);

-- 2) Filtr roku rozsahem data (od–do, aby šel použít index).
CREATE INDEX IF NOT EXISTS idx_expeditions_datum
  ON expeditions (datum);
