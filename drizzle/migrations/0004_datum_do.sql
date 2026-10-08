-- drizzle/migrations/0004_datum_do.sql — Vícedenní výpravy (od–do)
-- Idempotentní dostavba nad 0003. Pouze ADD COLUMN IF NOT EXISTS,
-- žádný DROP / DELETE / UPDATE — data zůstávají nedotčena.
-- Odpovídá kontraktu src/shared/api-types.ts:
--   ApiExpedice.datumDo (YYYY-MM-DD | null, null = jednodenní),
--   VytvoritExpediciRequest.datumDo? + UpravitExpediciRequest.datumDo?
--   (nepovinné, prázdné se normalizuje na NULL, konec >= začátek).
-- Staré řádky dostanou NULL (jednodenní), kontrola rozsahu je čistě
-- na hranici API (CHECK není potřeba — rozsah závisí na dvou sloupcích).

ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS datum_do DATE NULL;
