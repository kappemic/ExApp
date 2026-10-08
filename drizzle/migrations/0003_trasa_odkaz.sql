-- drizzle/migrations/0003_trasa_odkaz.sql — Odkaz na trasu výpravy (mapy.com)
-- Idempotentní dostavba nad 0002. Pouze ADD COLUMN IF NOT EXISTS,
-- žádný DROP / DELETE / UPDATE — data zůstávají nedotčena.
-- Odpovídá kontraktu src/shared/api-types.ts:
--   ApiExpedice.trasaOdkaz (string, "" = bez odkazu),
--   VytvoritExpediciRequest.trasaOdkaz? + UpravitExpediciRequest.trasaOdkaz?
--   (nepovinné, prázdné se normalizuje na "", max 2048, https:// URL).
-- Staré řádky dostanou "" (bez odkazu), nová validace je čistě na hranici
-- API (CHECK není potřeba — viz popis, který CHECK nemá taky).

ALTER TABLE expeditions
  ADD COLUMN IF NOT EXISTS trasa_odkaz TEXT NOT NULL DEFAULT '';
