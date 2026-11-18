# ExApp

Klubová PWA školního expedičního klubu: výpravy, kalendář a schůzky, fotky, chat, zpěvník, žebříčky, Strava a Discord. Používá se hlavně na mobilu. UI i doménové názvy v kódu jsou česky.

Když se dokument a kód rozcházejí, platí kód.

## Stack

Vite + React 19 + Tailwind 4 | Express 5 BFF na `:3001` | Postgres na Railway + Drizzle (driver `pg`, `drizzle-orm/node-postgres`) | JWT v cookie `exapp_session` | Cloudflare R2 na fotky | Vitest | nasazení na Railway jako jeden origin (BFF servíruje i klienta).

## Vývoj

- Spuštění: `npm run dev` a `npm run server:dev`. Server čte `.env.local` relativně k CWD, spouštěj ho z kořene repa.
- Prázdné `VITE_API_BASE_URL` znamená offline/demo klienta: výpravy jedou ze snapshotu `src/data/expeditions.generated.json` nebo z mocků a schůzky zůstanou prázdné. Prázdný kalendář proto nemusí být chyba UI.
- `GET /api/health` vrací 200 i při mrtvé DB. Funkčnost DB ověř na datové routě, třeba `GET /api/meetings`.
- Hotovo je, až projdou `npm test`, `npm run typecheck` a `npm run server:typecheck`. Klient a server mají oddělené tsconfigy, hostovaný build (`build:hosted`) typy nekontroluje.
- `npm run build` nejdřív přepíše `src/data/expeditions.generated.json` daty z DB. Tuhle změnu do diffu nezahrnuj, pokud nebyla záměrem.
- Část testů čte zdrojáky jako text a hlídá v nich konkrétní řetězce a počty. Když po refaktoru selže takový test, rozhodni, jestli se změnilo chování, nebo jen zápis.

## Živá data

Databáze je Postgres na Railway, ve stejném projektu jako aplikace. Neon se od listopadu 2026 nepoužívá: free tier nestačil a HTTP driver `neon-http` byl nahrazen za `pg`. Aplikace na Railway bere `DATABASE_URL` jako referenci `${{Postgres.DATABASE_URL}}` (interní síť), lokálně patří do `.env.local` veřejná `DATABASE_PUBLIC_URL`.

`.env.local` může mířit na živou databázi. Seed skript odmítne běh jen při `NODE_ENV=production`, sám tedy před živou DB nechrání. Migrace, seed i smoke skripty, které zapisují, spouštěj až po potvrzení uživatelem.

## Architektura

- **Kontrakt:** typy API, cesty, `VALIDACE` a `VALIDACNI_ZPRAVY` jsou v `src/shared/api-typy/`, `api-types.ts` je jen re-exportuje. Sdílí je klient i server. Kontrakt rozšiřuj aditivně.
- **Server:** `server/src/index.ts` je jen bootstrap. Routy patří do `*-routes.ts` jako `registruj*(app)`, čistá logika do sousedního modulu.
- **Prostředí:** na serveru `process.env` čte jen `server/src/prostredi.ts`.
- **Chyby a validace:** odpovědi jdou přes `posliChybu` s českou hláškou. Vstup se validuje na hranici (`validace.ts`, `validace-domeny/`), vnitřní kód typům věří.
- **Oprávnění:** každá zapisující routa má guard z `server/src/auth.ts`: `vyzadujPrihlaseni`, `vyzadujSpravceVyprav`, `vyzadujAdmina` nebo `vyzadujSuperadmina`. Skutečná práva určuje guard na routě. Role se čtou čerstvě z DB, nikdy z tokenu.
- **Role:** model je v `src/config/roles.ts`, tvoří ho `clenstvi`, `funkce`, `isAdmin` a `isSuperadmin`. Sloupec `users.role` je jen zrcadlo pro zpětnou kompatibilitu a zapisuje se atomicky spolu s nimi.
- **Klient:** business logika patří do `src/lib` a `src/hooks`, komponenty ji jen používají.

## Migrace

Není tu `drizzle.config` ani `db:migrate`. Změna schématu znamená:

1. Upravit `drizzle/schema/`.
2. Přidat další číslovaný soubor do `drizzle/migrations/`, idempotentně (`IF NOT EXISTS`) a aditivně. CHECK constrainty žijí jen v SQL.
3. Nasadit jednorázovým skriptem podle vzoru `scripts/migrace-0022-zpevnik.ts`, viz [Živá data](#živá-data).

## Design

Aplikace má dva vizuální systémy, nejdřív urči, do kterého změna patří:

- **Redesign C2, paleta 12f (probíhá):** bílé pozadí, olivová značka, okrová tlačítka s tmavým textem, písma Onest a Bricolage Grotesque (self-hosted), zaoblené tvary. `/vypravy` včetně detailu, kalendáře a formulářů už je v C2. Stav popisuje začátek `docs/navrhy-vypravy/DESIGN.md`.
- **`.nocturne`:** obaluje celou aplikaci (`DenikPlocha`), drží jen proměnné v paletě 12f a přechody dialogů. Styly jsou v `src/components/vypravy-nahled/nocturne.css`. `tokens.md` a HTML makety ve stejné složce jsou archiv.
- **Tokeny:** `src/index.css` (`papir`, `inkoust`, `smrk`, `jantar`, `mech`, `linka`, nově `okr`, `okr-tmavy`, `mlha`, `pole`). Na `bg-okr` patří vždy `text-inkoust`, bílý text tam nemá kontrast. Okraj polí formulářů je `border-pole`, `linka` je na to moc světlá.

Všude platí mobile-first, dotykové cíle 44 px, vstupy `16px` (bez zoomu na iOS) a podpora `prefers-reduced-motion`.

## Pravidla

- Přísný TypeScript, místo `any` použij `unknown` a zúžení.
- Secrety patří jen do `.env.local`. Prefix `VITE_` se dostane do klientského bundlu, takže jen pro veřejné hodnoty. URL Discord webhooku je secret, nepatří ani do logů.
- Discord je fail-open: jeho výpadek nesmí shodit request aplikace.
- Commituj jen na vyžádání, ve formátu `typ(oblast): popis`. `logs/`, `build.log` a skripty `_tmp-*` do commitu nepatří.
- Planner subagenta spouštěj v Claude Code jen u větších úkolů: změna napříč více oblastmi, nová funkce nebo produktové či architektonické rozhodnutí. Menší úkoly dělej rovnou. Má to přednost před sekcí „Coordinator (planner)“ v `AGENTS.md`.

## Kam se podívat

- `PRD.md`: produktové požadavky a popis rolí.
- `AGENTS.md`: roadmapa po fázích a pravidla koordinace agentů.
- `ROLE_DOC.md`: model rolí, mapování na auth, rozhodnutí kolem rolí. Výčet práv ověř proti guardům.
- `docs/testovaci-ucty.md`: testovací účty a matice viditelnosti podle role.
- `docs/bezpecnostni-rizika.md`: známá rizika auth a profilu. Před změnou přihlášení nebo `PATCH /api/me` ověř, co už je opravené.
- `HANDOFF.md`: historie vln a důkazy, stav ke konkrétnímu datu, ne aktuální stav.
- `TODO_STRAVA.md`, `TODO_DISCORD.md`: co zbývá ověřit proti reálné službě.
