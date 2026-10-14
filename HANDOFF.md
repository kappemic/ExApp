# HANDOFF — ExApp: Fáze 4 HOTOVA (žebříčky + statistiky + heatmapa; Strava OAuth skipnuta)

Datum: 2026-10-11 | Pracovní adresář: `C:\dev\ExApp` | Branch: `main`
Předchozí HEAD: `c4c509d` (vlna 3D role + škola/třída). Změny této vlny
NEJSOU commitnuté (4 modifikované + 6 nových, viz §4) — k rozdělení do
atomických commitů + push.

## 1. Objective + tech stack

Cíl projektu: Klubová PWA aplikace pro výpravy dle `AGENTS.md` / `PRD.md`.
Stack: Vite + React 19 + Tailwind CSS v4 (mobile-first, „deníkový" vzhled),
Express BFF na `:3001` (`server/src/index.ts`), Neon Serverless PostgreSQL +
Drizzle ORM, Auth JWT + 3D role (`clen` / `aktivni_clen` + `funkce` + `isAdmin`,
viz `ROLE_DOC.md`), Vitest testy, PWA (manifest + service worker).
Aktuální fáze: **Fáze 3 HOTOVA** (měsíční kalendář + CRUD schůzek + unified
modal dne). Rozsah potvrzen otázkami: jen měsíční (bez týdenního přehledu),
plné CRUD API, opakování jednorázová + týdenní, kalendář ve Výpravách
(přepínač seznam/kalendář, žádná nová route). `PRD.md` / `AGENTS.md` nedotčeny.

## 2. Co se udělalo v této vlně (Kroky 1–4)

1. **Kontrakt `src/shared/api-types.ts` (§14, aditivní):** `MEETINGS_PATH`
   (`/api/meetings`), `MEETING_DETAIL_VZOR`, `OpakovaniSchuzky`
   (`jednorazova` | `tydenni`), `ApiSchuzka` (id, nazev, datum YMD, mistnost
   null = venku, popis, opakovani), request/response typy + `schuzkaDetailPath`,
   `MATICE_SCHUZKY` (GET = PUBLIC, zápis = dual-guard). `VALIDACE`:
   `schuzkaNazevMin/MaxDelka` (3/120), `schuzkaMistnostMaxDelka` (120),
   `schuzkaPopisMaxDelka` (2000). `VALIDACNI_ZPRAVY`: 6 českých hlášek
   (`schuzkaNazevPovinny/Kratky/Dlouhy`, `schuzkaDatumPovinne/Neplatne`,
   `schuzkaMistnostDlouha`, `schuzkaPopisDlouhy`, `schuzkaOpakovaniNeplatne`).
   Minulost data Povolena i při vytvoření (rozdíl proti výpravám — opakovaná
   schůzka mohla začít dřív).
2. **Server:** `server/src/schuzky.ts` (nový, `toApiSchuzka` + fail-safe skip
   nevalidních řádků); `server/src/validace.ts` (+`validujVytvoreniSchuzky` /
   `validujUpravuSchuzky`, parciální PATCH, `mistnost ""` → null);
   `server/src/index.ts` (4 routy: `GET /api/meetings` PUBLIC řazeno datem,
   `GET /api/meetings/:id` PUBLIC, `POST` / `PATCH` / `DELETE` dual-guard
   `vyzadujSpravceVyprav` = ADMIN nebo aktivní člen; DELETE → 404 při opakování).
   Žádná migrace — tabulka `meetings` v Neonu existuje (ověřeno
   `information_schema`: id, nazev, datum, mistnost, popis, opakovani,
   created_by, created_at).
3. **Klient lib:** `src/lib/kalendar.ts` (nový, čistá logika bez Reactu:
   `mesicMrizka` Po–Ne, `dnyVypravy` datum..datumDo vč. cap 62, `vyskytySchuzky`
   jednorázová 0–1 / týdenní stejný weekday od prvního výskytu, `udalostiProMesic`
   sjednocení s řazením výpravy → schůzky → název); `src/lib/schuzky-api.ts`
   (nový: `getSchuzky` s fallbackem na `[]` + `jeSchuzka` guard, mutace
   `vytvorSchuzku` / `upravSchuzku` / `smazSchuzku` s českými chybami a 422
   `chybyPoli`).
4. **Komponenty + integrace:** `src/components/kalendar/` (nový:
   `KalendarMesic.tsx` — mřížka, navigace ←/→/Dnes, tečky smrk = výprava /
   jantar = schůzka, gridcell a11y, 48px buňky; `SchuzkaForm.tsx` — deníkový
   formulář se stejným vzorem jako `ExpeditionForm`; `UdalostModal.tsx` —
   unifikovaný detail dne: výprava → proklik na `ExpeditionModal`, schůzka →
   inline detail + Upravit/Odebrat pro správce + „Nová schůzka v tento den").
   `src/pages/VypravyPage.tsx`: placeholder `KalendarPlaceholder` NAHRAZEN
   živým kalendářem (fetch schůzek po mountu, mutace lokálně bez refetche,
   formulářová a day-modal vrstva nad `ExpeditionModal`).
5. **+31 testů (226 → 257 zelených):** `tests/kalendar.test.ts` (15: mřížka,
   od–do vč. přes měsíce, týdenní rozpad + hranice začátku + další měsíc,
   sjednocení + řazení), `tests/schuzky-validace.test.ts` (16: vytvoření vč.
   minulosti/defaultů/422 větví, parciální PATCH vč. `mistnost: null`,
   `jeSchuzka` guard).
6. **BFF restartován a ověřen živě:** starý proces (PID 51308, bez nových rout)
   zastaven, nový start přes `cmd /c npm run server:start` (log
   `logs/bff-faze3.log`): `GET /api/health` → 200 `{ok:true}`;
   `GET /api/meetings` → 200 `{"schuzky":[]}`; `POST /api/meetings` bez session
   → 401 `NEPRIHLASEN`; `GET /api/meetings/:uuid` neznámé → 404 `NENALEZENO`.
7. **Texty pro školní expediční klub (dodatečně, stejná vlna):** hlavičky všech
   stránek `ExApp · podzim 2026` → `Školní expediční klub`; `VypravyPage` H1
   `Výpravy` → `Klubové výpravy` + podtitul s počtem výprav a schůzek;
   `SchuzkaForm`: label `Třída / klubovna` → `Třída`, smazány 3 demo
   placeholdery (`Oddílová schůzka`, `Klubovna / venku`, `Program schůzky…`);
   `oddíl` → `klub` v `DomuPage` (nástěnka, správa, novinky) a `AdminClenovePage`
   (popisky tabů + hlavička); komentáře `klubovna` → `místnost` v kontraktu §14
   a `drizzle/schema/meetings.ts`. Role (`roles.ts`, `ROLE_DOC.md`) a hinty
   login/registrace beze změny. Testy 257/257 + obě tsc stále čisté.
8. **Redukce textů (dodatečně, stejná vlna):** smazán eyebrow `Školní expediční
   klub` + podtitul na Domů (`Nástěnka školního klubu…`) i na Výpravách
   (`Přehled N výprav a M schůzek…`) — zůstal jen H1; v hlavičce s logem
   (`Navbar`/`AppHeader`) smazán podtitul `Klubové výpravy` — zůstalo jen
   `ExApp`. Testy 257/257 + obě tsc stále čisté.

## 3. Diagnostika serveru (BFF :3001) — 3 odrážky

- **Server neběží = `ECONNREFUSED`** — BFF není spuštěný → kalendář ukazuje jen
  výpravy ze snapshotu/BFF a žádné schůzky (`getSchuzky` fallback `[]`);
  řešení: `npm run server:start` (nebo `server:dev`), ověřit `GET /api/health`.
- **`500` = DB vrstva** — zkontrolovat `DATABASE_URL` v `.env.local`, připojení
  na Neon, Drizzle schéma; logy v `logs/bff-faze3.log`.
- **`health 200 ≠ meetings 200`** — health prochází i při mrtvé DB; zdrojem
  pravdy je až `GET /api/meetings` (200 + `schuzky[]`). Dnes: vše zelené (viz §2.6).

## 4. Stav (testy / tsc / git) — důkazy

- **Testy: 257/257 zelených** (`npm test` → `vitest run`, 13 souborů).
- **TSC čisté** — `npx tsc --noEmit` + `npx tsc -p server --noEmit` bez výstupu.
  Strict TS, žádný `any` v nových souborech
  (`src/lib/kalendar.ts`, `src/lib/schuzky-api.ts`, `src/components/kalendar/`,
  `server/src/schuzky.ts` — grep 0 výskytů).
- **Git: NEPUSHNUTO, NECOMMITNUTO (tato vlna):** modifikováno (10):
  `server/src/index.ts`, `server/src/validace.ts`, `src/pages/VypravyPage.tsx`,
  `src/shared/api-types.ts`, `src/pages/DomuPage.tsx`, `src/pages/ChatPage.tsx`,
  `src/pages/ProfilPage.tsx`, `src/pages/ZebrickyPage.tsx`,
  `src/pages/AdminClenovePage.tsx`, `src/components/kalendar/SchuzkaForm.tsx`,
  `drizzle/schema/meetings.ts` (jen komentář); untracked (6): `server/src/schuzky.ts`,
  `src/components/kalendar/` (3 soubory), `src/lib/kalendar.ts`,
  `src/lib/schuzky-api.ts`, `tests/kalendar.test.ts`,
  `tests/schuzky-validace.test.ts` (+ tento `HANDOFF.md`, `graphify-out/`,
  `logs/bff-faze3*.log` — logy NEcommitovat). Doporučení: 3 atomické commity
  (kontrakt+validace+testy / server CRUD / klient+kalendář+VypravyPage), pak push.
- **Předchozí vlny:** HEAD `c4c509d`, pracovní strom před touto vlnou čistý
  (necommitnutá práce z minulého HANDOFFu už je v `a06feb7`–`c4c509d`).

## 5. Review verdikt (self-review, 5 os)

- **Correctness / Readability / Architecture / Security / Performance:**
  schváleno. Bezpečnost: secrety jen v env, zápis schůzek dual-guard (stejný
  jako výpravy), čtení PUBLIC, validace na hranici česky, `rel` N/A (žádný
  externí odkaz), `any` = 0. Kalendář počítá jen cílový měsíc (O(dní) + O(akcí)),
  týdenní rozpad bez rekurze; `dnyVypravy` cap 62.
- **Should-fix (neblokující Fázi 4, backlog):** (a) `GET /api/meetings` bez
  stránkování (schůzek jsou desítky — `pagination` aditivně až bude potřeba);
  (b) smazání schůzky bez confirm dialogu (jedno kliknutí = DELETE); (c) `title`
  na disabled tlačítkách se v části prohlížečů nezobrazí (stejný dluh z Fáze 2);
  (d) kalendář neumí vícedenní schůzku (hlavička má jen jedno `datum` — vědomé,
  kontrakt se nemění); (e) týdenní schůzka se v `UdalostModal` maže jako celek
  (hlavička), ne jednotlivý výskyt — potvrdit, že to tak má zůstat.
- **Nits:** `KalendarMesic` počítá česky „akce" pro 1–4 i 5+ stejně (skloňování
  5+ „akcí" je v `popisek` jen pro gridcell, nadpis dne v modalu má plné pravidlo);
  `nazevMesice` lowercase („říjen 2026") — záměrně dle `Intl`.
- **Design-check:** deníkové tokeny dodrženy (border-inkoust, bg-papir,
  shadow-denik, smrk/jantar tečky, 44px+ cíle, `touch-action:manipulation`,
  `role="dialog/gridcell/alert"`); žádné nové gradienty/karty.

## 6. Next move + odložená témata

Next move = **Fáze 4 (statistiky, leaderboard, Strava)** dle `AGENTS.md`: OAuth
Strava v profilu, párování poslední nepárované aktivity k uzavřené výpravě
(km/převýšení/trasa), osobní statistiky + heatmapa, leaderboard. Vstupní stav
čistý: Fáze 3 zelená (důkazy výše), BFF běží s novými routami, git k commitnutí.

Odložená témata (neblokují Fázi 4): **týdenní přehled kalendáře** (vědomě mimo
rozsah této vlny), **binární upload fotek / bucket** (stále jen URL-minimum),
**Discord webhooky** (Fáze 5), should-fix backlog z §5, `GET /api/meetings`
stránkování.

Relevant files: `src/pages/VypravyPage.tsx`, `src/components/kalendar/`,
`src/lib/kalendar.ts`, `src/lib/schuzky-api.ts`, `src/shared/api-types.ts` (§14),
`server/src/index.ts` (schůzky CRUD), `server/src/validace.ts` (schůzky),
`server/src/schuzky.ts`, `tests/kalendar.test.ts`, `tests/schuzky-validace.test.ts`.

## 7. Pravidla pro další session

- Komunikace **česky**.
- Strict TypeScript, **žádný `any`**.
- Secrety pouze v `.env.local` / env — **nevypisovat, necommitovat** (žádné secrety, hashe ani hesla do logů/dokumentů).
- **Nedestruktivní SQL bez potvrzení**; destruktivní MCP nástroje jen s explicitním souhlasem.
- Odkazy na existující artefakty uváděj cestou, nekopíruj jejich obsah.
- `logs/` NEcommitovat (běžící BFF loguje do `logs/bff-faze3*.log`).

## Suggested skills (pro dalšího agenta — volat přes Skill tool)

- `handoff` — na konci další session aktualizovat tento dokument.
- `test-driven-development` — pro Fázi 4 (Strava + statistiky).
- `verification-before-completion` — před tvrzením „hotovo / zelené" (testy + tsc + E2E).
- `git-workflow-and-versioning` — atomické commity necommitnuté práce z §4, push.
- `systematic-debugging` — pokud `500` z DB vrstvy nebo `ECONNREFUSED` přetrvá.

## 8. Fáze 4 HOTOVA (Krok 11 — ověřeno 2026-10-13, Strava OAuth skipnuta dle uživatele)

- **Stav: Fáze 4 HOTOVA s výjimkou Strava OAuth.** Rozsah dle `AGENTS.md`
  (leaderboard, osobní statistiky, heatmapa, párování aktivit) je živě zelený.
  Strava OAuth (reálné `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`, callback
  doména, `npm run over-strava`, E2E klik v prohlížeči, refresh tokenů)
  je vědomě skipnuta dle rozhodnutí uživatele — zbytek viz `TODO_STRAVA.md`.
- **Expedition-level sdílení km funguje přes ruční zápis:** odebrán odkaz-flow
  (`POST :id/strava-odkaz`, `parseStravaOdkaz`, typy §15e, UI sekce odkazu)
  i datum z ručního zápisu; ponecháno
  `POST /api/expeditions/:id/aktivita-ruchne { km, prevyseni_m }` — jedna
  aktivita na expedici se propíše všem s `ucastnil_se`.
- **Leaderboard / statistiky / heatmapa live zelené:** `GET /api/zebricky`
  vrací 200 i na produkční DB (migrace `0007_faze4_strava` + `0008_zebricky_index`
  nasazeny na produkci); BFF guard `GET /api/strava/auth-url` bez klíčů správně
  vrací 503 `STRAVA_NENI_NASTAVENA`.
- **Důkazy (čerstvě ověřeno v této session):**
  - Testy: **538/538 zelených** (`npm test` → `vitest run`, 26 souborů).
  - TSC: **obě čisté** (`npx tsc --noEmit` → `TSC-KLIENT-OK`,
    `npx tsc -p server --noEmit` → `TSC-SERVER-OK`, strict, žádné nové `any`).
  - Smoke `npm run smoke:faze4`: **6 PASS, 0 FAIL, 3 SKIP, ÚSPĚCH** (žebříčky
    celkem + 2025 PASS, nesmysl-období 422 PASS, 401 guardy PASS; strava-auth-url
    SKIP bez `STRAVA_MOCK=1`, login-větve SKIP bez `SMOKE_ADMIN_*` — dle guardů
    skriptu, ne chyba).
  - Curl 5 endpointů živě (`:3001`): `GET /api/health` → 200;
    `GET /api/zebricky` → 200 (2 řádky live dat); `?obdobi=2025` → 200;
    `?obdobi=nesmysl-ne-obdobi` → 422 `VALIDATION_ERROR`;
    `GET /api/strava/auth-url` → 503 `STRAVA_NENI_NASTAVENA` (správně bez klíčů).
- **Git (jen čtení, NIC necommitnuto dle zákazu):** branch `main`
  (`main...origin/main`), necommitnuté změny Fáze 3+4 k rozdělení do atomických
  commitů v další session (viz `git status --short --branch`).
- **Další krok:** rest Strava OAuth dle checklistu v `TODO_STRAVA.md`; pak
  Fáze 5 (Discord) dle `AGENTS.md`.

## 9. Fáze 5 — FINÁLNÍ BRÁNA (Krok close-2 — ověřeno 2026-10-14, tester, UZAVŘENO)

- **Close-2 live PASS po nasazení migrace 0009 (tato session, čerstvé důkazy):**
  - Migrace `drizzle/migrations/0009_faze5_diskuze.sql` nasazena (dle kontextu
    `public.zpravy` existuje); živý BFF `:3001` restartován s routami diskuze.
  - `GET /api/health` → **200** `{ok:true}` (PASS).
  - `GET /api/expeditions/krivoklatsko-berounka/zpravy` → **200**
    `{"zpravy":[],"nextCursor":null}` (PASS — dříve 500 před migrací, nyní
    zelené; prázdné vlákno = korektní stav bez zpráv).
  - Guardy: `POST :id/zpravy` bez session → **401 `NEPRIHLASEN`** (PASS);
    `DELETE :id/zpravy/:uuid` bez session → **401** (PASS);
    `GET :id/zpravy` neznámé id → **404 `NENALEZENO`** (PASS).
  - Testy: **738/738 zelených** (`npm test` → `vitest run`, 39 souborů) (PASS).
  - TSC: **obě čisté** (`npx tsc --noEmit` → `TSC-KLIENT-OK`,
    `npx tsc -p server --noEmit` → `TSC-SERVER-OK`) (PASS).
  - Smoke `npm run smoke:faze5-discord`: **4 PASS, 0 FAIL, 2 SKIP, ÚSPĚCH**
    (login-větve SKIP bez `SMOKE_ADMIN_*` — dle guardů skriptu, ne chyba) (PASS).
  - Reálný Discord webhook E2E zůstává vědomý skip — viz `TODO_DISCORD.md`
    (fail-open bez reálné URL, doručení embedu do kanálu neověřeno, neblokuje
    uzavření diskuze ani guardů).
- **Verdikt: Fáze 5 UZAVŘENA (close-2).** Diskuze živě 200 + guardy 401/404,
  testy 738/738, obě tsc čisté, smoke ÚSPĚCH. Níže 3 atomické commity + push.

- **Rozsah (3 body dle `AGENTS.md`):**
  1. **Discord webhook service — HOTOVO (kód + testy):**
     `server/src/discord.ts` (`sestavEmbedNovaVyprava`, `posliDiscordEmbed`
     fire-and-forget s timeoutem 5 s, allowlist prefixů `discord.com` /
     `discordapp.com`, bez URL/secretu v logu). `DISCORD_WEBHOOK_URL` jen
     serverové env (`.env.local`, nikdy `VITE_*`, nikdy do bundlu).
  2. **Notifikace při nové výpravě / oznámení — HOTOVO (kód), ŽIVĚ ČÁSTEČNĚ:**
     `POST /api/expeditions` (dual-guard `vyzadujSpravceVyprav` → 201) i
     `POST /api/oznameni` (dual-guard) volají `upozorniDiscordBezBlokovani`
     (fail-open: bez URL / neplatná URL / pád fetch = tichý skip, request
     nikdy nepadne). Smoke `npm run smoke:faze5-discord`: **4 PASS, 0 FAIL,
     2 SKIP** (login-větve SKIP bez `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_HESLO` —
     `POST` s loginem → 201 + Discord mock živě NEověřen).
  3. **Diskuze k výpravám — KÓD + TESTY HOTOVO, ŽIVĚ FAIL (blokuje uzavření):**
     Schéma `drizzle/schema/zpravy.ts` + idempotentní migrace
     `drizzle/migrations/0009_faze5_diskuze.sql` (jen `CREATE TABLE/INDEX IF
     NOT EXISTS` + `DO $$` re-assert FK/CHECK, žádný DROP/DELETE/UPDATE);
     `server/src/diskuze.ts` (`toApiZprava` fail-safe, rate-limit 10/min/ip
     in-memory + `resetDiskuzeLimitu`); validace `validujZpravu` (trim,
     1–1000 znaků, české hlášky); routy v `server/src/index.ts` (pracovní
     strom, NEcommitnuto): `GET :id/zpravy` PUBLIC (limit default 50/cap 100
     + cursor, filtr `smazano_at IS NULL`, řazení `created_at,id` ASC),
     `POST :id/zpravy` `vyzadujPrihlaseni` → 201 (429 `MOC_POZADAVKU` při
     limitu), `DELETE :id/zpravy/:zpravaId` autor NEBO dual-guard
     (soft-delete `smazano_at`); UI `src/components/chat/DiskuzeBox.tsx` +
     `ZpravaBublina.tsx`, `src/lib/format-cas.ts` (`formatCasKratce`,
     re-exporty `formatCasZpravy`/`formatCasNastenky`), `ChatPage` nástěnka.
- **Důkazy (čerstvé, tato session):**
  - Testy: **738/738 zelených** (`npm test` → `vitest run`, 39 souborů;
    diskuze/discord jádro: `discord` 24, `diskuze-validace` 21,
    `zpravy-schema` 14, `diskuze-api` 19, `diskuze-box` 34 — vysoko nad
    cílem „538 + ~30 nových").
  - TSC: **obě čisté** (`npx tsc --noEmit` → `TSC-KLIENT-OK`,
    `npx tsc -p server --noEmit` → `TSC-SERVER-OK`, strict, žádné nové `any`).
  - Živě `:3001`: `GET /api/health` → 200 `{ok:true}`; `POST :id/zpravy`
    bez session → **401**; `DELETE :id/zpravy/:uuid` bez session → **401**;
    `GET :id/zpravy` neznámé id → **404**; `GET /api/expeditions/<existuje>/
    zpravy` → **500 `VNITRNI_CHYBA` (FAIL)**.
  - Příčina FAIL: tabulka `zpravy` v Neonu **neexistuje**
    (`get_database_tables`: 9 tabulek — `clenove`, `expeditions`,
    `meeting_exceptions`, `meetings`, `participants`, `photos`,
    `registration_codes`, `strava_tokens`, `users`; migrace `0009`
    nenasazena na tuto větev DB). Jednotkové/integrační testy diskuze tím
    nejsou dotčeny (mock/validace), ale živé vlákno bez migrace nepojede.
- **Secrety / guardy:** `.env.local` jen klíče (hodnoty redakovány),
  `.env.example` jen placeholdery; klient `src/**` bez secretů (jen 2
  komentáře); `git diff --staged` scan na `DISCORD_WEBHOOK`/`STRAVA_*`/
  `DATABASE_URL`/`JWT_SECRET` čistý; admin operace guardnuté
  (`POST /api/expeditions`, `POST /api/oznameni`, `DELETE zpravy` =
  dual-guard; `POST zpravy` = `vyzadujPrihlaseni`; čtení vláken PUBLIC).
- **Git (NIC nepushnuto, NIC necommitnuto — jen připraveno):** branch `main`
  (`main...origin/main [ahead 16]` — Fáze 3–5 v 16 commitech); pracovní strom
  necommitnutý: modifikováno (5): `index.html`,
  `server/src/index.ts` (+221 diskuze-routy), `ExpeditionModal.tsx`,
  `expeditions.generated.json`, `ChatPage.tsx`; untracked (4):
  `src/components/chat/` (2 soubory), `src/lib/format-cas.ts`,
  `tests/diskuze-box.test.tsx` (+ tento `HANDOFF.md`, `TODO_DISCORD.md`).
  `logs/` ignorováno (`.gitignore`), v `git status` se neobjevuje.
  Návrh 3 atomických commitů (NEPOUŠTĚT bez souhlasu, nepushovat):
  `git add server/src/discord.ts server/src/index.ts server/src/diskuze.ts
  server/src/validace.ts tests/discord.test.ts && git commit -m "feat(server):
  Discord notifikace + diskuze API (guardy, rate-limit)"`;
  `git add drizzle/schema/zpravy.ts drizzle/migrations/0009_faze5_diskuze.sql
  drizzle/schema/index.ts && git commit -m "feat(db): vlakno diskuze zpravy
  (migrace 0009)"`;
  `git add src/components/chat/ src/lib/format-cas.ts src/pages/ChatPage.tsx
  src/components/expeditions/ExpeditionModal.tsx tests/diskuze-box.test.tsx
  tests/diskuze-api.test.ts tests/diskuze-validace.test.ts
  tests/zpravy-schema.test.ts && git commit -m "feat(klient): diskuze k
  vyprave + nastenka (format-cas)"` — POZOR: nejdřív nasadit migraci 0009
  a přeměřit živý smoke (viz níže), commity až po zelené.
- **Verdikt (close-2): Fáze 5 UZAVŘENA.** Migrace `0009` nasazena, živě
  `GET :id/zpravy` 200 + guardy 401/404 + `GET /api/health` 200, testy 738/738,
  obě tsc čisté, smoke `faze5-discord` ÚSPĚCH (4 PASS / 2 SKIP bez admin env).
  Reálný webhook E2E = vědomý skip — viz `TODO_DISCORD.md`.
