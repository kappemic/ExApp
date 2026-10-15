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

## 10. Step 0 — Diskuze unread kontrakt (NÁVRH, 2026-10-14, read-only audit)

- **Zjištěný stav (read-only, nic kromě této sekce neměněno):**
  - `GET /api/expeditions/:id/zpravy` = PUBLIC, odpověď `{ zpravy: ApiZprava[],
    nextCursor: string | null }`, řazeno `created_at ASC, id ASC`, filtr
    `smazano_at IS NULL`, `?limit` default 50 / cap 100, `cursor` = id poslední
    zprávy. Žádné `latestMessageAt` server nevrací — klient ho dnes musí odvodit
    jako `MAX(zpravy[].createdAt)` (prázdné vlákno → `null`).
  - `ApiZprava` = `{ id, expeditionId, autorId: string | null, text (raw,
    trimnutý 1–1000), createdAt: ISO }` (`src/shared/api-types.ts` §17,
    `server/src/diskuze.ts` `toApiZprava` fail-safe, `src/lib/diskuze-api.ts`
    `escapujHtml` až při renderu). Žádný secret v payloadu.
  - `POST :id/zpravy` = `vyzadujPrihlaseni` (USER) → 201, rate-limit 10/min/ip;
    `DELETE :id/zpravy/:zpravaId` = autor NEBO dual-guard (soft-delete).
  - Auth identita: `server/src/auth.ts` — JWT v httpOnly cookie / `Bearer`,
    payload jen `{ sub: userId }`, `vyzadujPrihlaseni` plní
    `(req as AutentizovanyRequest).uzivatel: SessionUzivatel` (`id`, `email`,
    `role`/`authRole`, 3D trio `clenstvi/funkce/isAdmin` čtené čerstvě z DB,
    nikdy z tokenu). Diskuze `POST` bere `autorId` z `uzivatel.id`, `DELETE`
    porovnává `radek.autorId === uzivatel.id`.
  - Schéma: Drizzle `drizzle/schema/zpravy.ts` (`zpravy`: `id` UUID PK,
    `expedice_id` TEXT → `expeditions(id)` CASCADE, `autor_id` UUID →
    `users(id)` SET NULL, `text`, `created_at` timestamptz, `smazano_at`
    NULL = viditelná; index `(expedice_id, created_at)`). Žádná tabulka pro
    přečtení (`lastReadAt` / `unread` / `precteno` — grep 0 výskytů).
  - Secrety: `DATABASE_URL`, `AUTH_JWT_SECRET`, `DISCORD_WEBHOOK_URL`,
    `STRAVA_*` jen serverové env (`.env.local`, nikdy `VITE_*`);
    klient `src/**` posílá jen `VITE_API_BASE_URL` + `Accept: application/json`
    (+ `credentials: include` u zápisu). GET vlákna neposílá credentials.
    Ověřeno bez výpisu hodnot.
- **Navržený kontrakt (aditivní, nic se nepřejmenovává):**
  - `GET /api/expeditions/:id/discussion/meta` →
    `{ latestMessageAt: string | null, lastReadAt: string | null,
      unread: boolean }`.
    `latestMessageAt` = `MAX(created_at)` viditelných zpráv vlákna (NULL =
    prázdné vlákno). `lastReadAt` = značka přihlášeného usera pro expedici
    (NULL = nikdy nečetl / anonym). `unread` = `latestMessageAt !== null &&
    (lastReadAt === null || latestMessageAt > lastReadAt)`. Anonym (bez
    session): `lastReadAt: null`, `unread` se nepersonalizuje (doporučeno
    `false`, ať anonymům nesvítí tečka). Neznámá expedice → 404 `NENALEZENO`
    (stejně jako GET vlákna). Chyby jen `ApiErrorResponse`.
  - `POST /api/expeditions/:id/discussion/read` (body prázdné / `{}`) →
    `{ lastReadAt: string }` (ISO čas zápisu na serveru). Guard
    `vyzadujPrihlaseni` (USER, bez session → 401 `NEPRIHLASEN`), idempotentní
    (opakovaný POST jen přepíše čas, vždy 200). Neznámá expedice → 404.
    Klíčování per-user: `(userId, expeditionId)` — `userId` vždy ze session
    (`uzivatel.id`), nikdy z body/query (jinak by šlo falšovat cizí přečtení).
  - Perzistence (návrh pro další step, dnes NEEXISTUJE): nová tabulka např.
    `diskuze_precteni (user_id UUID → users(id) CASCADE, expedice_id TEXT →
    expeditions(id) CASCADE, last_read_at timestamptz NOT NULL, PK
    (user_id, expedice_id))` + idempotentní migrace `0010_*` (jen
    `CREATE TABLE IF NOT EXISTS`, žádný DROP/DELETE/UPDATE). Smazání usera /
    výpravy maže jeho značky (CASCADE); smazání zprávy `lastReadAt` nemění.
  - Klient: po `GET vlákna` (PUBLIC) si badge odvodí z `meta`; po otevření
    modalu zavolá `POST …/read` (jen přihlášený) a lokálně vynuluje tečku.
    Žádný secret do klienta — meta/read nesou jen ISO časy + boolean.
- **Acceptance Step 0:** kontrakt v této sekci odsouhlasen, per-user klíčování
  `userId + expeditionId` jasné, žádný secret do klienta ověřen.

## 11. Step 4 — Tester: hook + badge (ověřeno 2026-10-14, NIC necommitnuto)

- **Rozsah:** `src/hooks/useUnreadExpeditions.ts` (polling 30 s, visibility pause),
  `src/components/chat/NeprectenaTecka.tsx` (3 místa: karta/seznam +
  `ExpeditionModal` záložka Diskuze + `ChatPage` nástěnka) + `DiskuzeBox`
  trigger (visible `IntersectionObserver` 0.35 + onSend `markAsRead`).
- **Testy: 801/801 zelených** (`npm test` → `vitest run`, 42 souborů; fokus
  unread 116/116: `unread-expeditions` 22 + `neprectena-tecka` 18 +
  `diskuze-precteni` 23 + `diskuze-box` 34 + `diskuze-api` 19).
- **TSC: obě čisté** (`npx tsc --noEmit` → `TSC-KLIENT-OK`,
  `npx tsc -p server --noEmit` → `TSC-SERVER-OK`, strict, `:\s*any` 0
  v 8 nových souborech hooku/badge/api/migrace/testů).
- **Živě `:3001` (restart NEBYL třeba — BFF už běžel):**
  `GET /api/health` → 200 `{ok:true}`; `GET …/krivoklatsko-berounka/discussion/meta`
  → 200 `{latestMessageAt:null,lastReadAt:null,unread:false}`;
  `GET …/zpravy` → 200 `{zpravy:[],nextCursor:null}`;
  `POST …/discussion/read` bez session → 401 `NEPRIHLASEN` (body
  `{"error":{"code":"NEPRIHLASEN",…}}`); `GET …/neexistuje-xxx/discussion/meta`
  → 404 `NENALEZENO`. Migrace `0010_diskuze_precteni.sql` na Neonu (jinak by
  meta padalo 500).
- **Red-green (nezávislý `npx tsx -e` + testy, vše PASS):**
  1) nová zpráva → tečka (`jeNeprectene(latest>lastRead)=true`) PASS;
  2) visible diskuze → shození (`rovnost časů=false` + `oznacVlaknoJakoPrectene`
  200→true, `oznacenoRef` jednou na vlákno, event `exapp:discussion-read`
  zhasne bez reloadu) PASS; 3) reload → stav drží (snapshot
  `exapp:discussion-unread-v1` + `exapp:discussion-lastRead-v1` roundtrip,
  pravda vždy revalidace `GET meta`) PASS; 4) vlastní zpráva negeneruje unread
  (onSend `oznacenoRef=id` + `void oznacVlaknoJakoPrectene`, test
  `značí jen jednou na vlákno a po odeslání`) PASS.
- **Break-ui (5, report + drženo):**
  dlouhý název — karta `min-w-0 flex-1 break-words` + tečka `shrink-0 pt-1.5`
  mimo 44px tap-target, nástěnka `min-w-0 truncate`, aria-label nese plný název
  (čtečka OK); 0 zpráv — prázdný stav `role=status` + meta `latest:null→false`;
  1000 zpráv — `GET limit 50/cap 100 + cursor nextCursor`, list
  `max-h-80 overflow-y-auto` (stránkováno, ne render-all); missing
  `latestMessageAt` — guard `jeDiskuzeMetaOdpoved` odmítne, `jeNeprectene(null)=false`,
  `spocitejLatestZVlakna([])=null`; offline — `OFFLINE_META/OFFLINE_READ`,
  `ok:false`, žádný throw, badge drží poslední hodnotu; odhlášený —
  `meta anonym unread:false`, Box `if (!prihlasen) return` (žádný POST),
  `markAsRead 401→false`. Vše kryto testy (offline/401/prázdné-id/nevalidní-čas).
- **Secrety:** `DATABASE_URL/AUTH_JWT_SECRET/DISCORD_WEBHOOK_URL/STRAVA_*` jen
  server env (`process.env`), klient jen `VITE_API_BASE_URL`; `logs/*` scan 0
  nálezů (žádné `eyJ/Bearer/DATABASE_URL=postgres`); testy nesou jen placeholdery
  (`https://api.test`, `https://…discord…`), žádná reálná hodnota.
- **Git (jen čtení):** branch `main...origin/main`, necommitnuto 14 M + 7 ?? (unread
  vlna: `0010_*.sql`, `diskuze_precteni.ts`, `NeprectenaTecka.tsx`,
  `useUnreadExpeditions.ts`, 3 testy) — NIC necommitnuto/nepushnuto dle zákazu.
- **Acceptance Step 4: VŠE PASS** — 4 red-green + 5 break-ui + 801/801 + obě tsc
  + meta 200 / read 401 / meta 404 + žádný `any` + žádný secret v logu/testu.

## 12. Step 4 — Tester: Step 2+3 (Navbar badge + deep-link/modal/scroll; ověřeno 2026-10-14, NIC necommitnuto)

- **Rozsah:** testy k Step 2 (Navbar badge: `spocitejNeprectene`, `ChatTecka`,
  fake `3` pryč, hook jediný zdroj pravdy) + Step 3 (deep-link `?vyprava`:
  `vyprava-deep-link.ts`, `ChatPage` link, `VypravyPage` modal, `startNaDiskuzi`
  scroll) + dotčené hooky (`useUnreadExpeditions`).
- **Testy: 837/837 zelených** (`npm test` → `vitest run`, 44 souborů).
  Fokus Step 2+3: **99/99** (`navbar-unread-badge` 17 + `vyprava-deep-link` 18
  + `unread-expeditions` 22 + `neprectena-tecka` 19 + `diskuze-precteni` 23).
- **TSC: obě čisté** (`npx tsc --noEmit` → `TSC-KLIENT-OK`,
  `npx tsc -p server --noEmit` → `TSC-SERVER-OK`, strict).
  Grep `:\s*any\b` v `src/**.{ts,tsx}` = 0 nálezů.
- **Runtime acceptance (čerstvý `npx tsx -e`, PASS):**
  unread 0/1/N = `0 1 2`; zhasnutí po read (`jeNeprectene(t,t)=false`);
  nová zpráva po read `=true`; deep-link
  `/vypravy?vyprava=sumava-modrava&zobrazeni=seznam` → parse roundtrip
  `sumava-modrava`; merge `sVypravouVUrl` drží `zobrazeni=kalendar`
  → `ACCEPTANCE-RUNTIME-OK`.
- **Živě (BFF `:3001` běžel, restart NEBYL třeba):**
  `GET /api/health` → 200 `{ok:true}`;
  `GET /api/expeditions` → 200 (8 výprav live, vč. `krivoklatsko-berounka`,
  `sumava-trijezerska-slat` — platné `expeditionId` pro `?vyprava=`);
  `GET …/krivoklatsko-berounka/discussion/meta` → 200
  `{latestMessageAt:null,lastReadAt:null,unread:false}`;
  `GET …/zpravy` → 200 `{zpravy:[],nextCursor:null}`.
- **Navbar bez crash:** `npm run build` (prebuild sync 8 výprav + `tsc --noEmit`
  + `vite build`) → exit 0, 17 precache entries, Navbar/TopBar/MobileBar
  v import-řetězci bez pádu.
- **Klik → expeditionId → modal → Diskuze (zdroj-kontrakt, testy zelené):**
  `ChatPage` obsahuje `buildVypravyDeepLink(polozka.idVypravy)` + `Otevřít výpravu`
  (1 krok); `VypravyPage` čte `VYPRAVA_PARAM` + `parseVypravaId` + `sVypravouVUrl`
  + `otevriVypravu`, mount lookup `vypravaPodleId` + fallback `nactiDetailVypravy`
  (`expediceDetailPath`, `jeApiExpedice`), nevalidní id maže param
  (`sVypravouVUrl(prev, null)`), modal `key={vybrana.id}` +
  `neprectenaDiskuze={…}` + `startNaDiskuzi={cilDiskuze}`;
  `ExpeditionModal` má `id="diskuze"` + `tabIndex={-1}` + `Diskuze k výpravě` +
  `data-deep-link-cil="diskuze"` + `scroll-mt-`, `scrollIntoView` s
  `prefers-reduced-motion` + `preventScroll` + `requestAnimationFrame`
  (focus na sekci, ne textarea — mobilní klávesnice nevyskočí),
  focus-trap + `Escape` + backdrop + návrat fokusu zachovány.
- **Mobilní viewport check PASS (statický audit tříd):**
  `MobileBar` `fixed bottom-0 lg:hidden` + `safe-area-inset-bottom`;
  badge `ChatTecka` `pointer-events-none` + `[touch-action:manipulation]` +
  `min-h-[44px] min-w-[44px]` (44px tap-target drží); hlavičkový zvonek
  `lg:hidden`; `DiskuzeBox` input `safe-area-inset-bottom` + `min-h-[44px]`.
  Přímé otevření `/vypravy?vyprava=xxx` v reálném prohlížeči (klik + doscroll
  + focus) zůstává k ručnímu kliknutí — montážní logika je kryta testy výše.
- **Git (jen čtení, NIC necommitnuto/nepushnuto):** branch `main...origin/main`;
  pracovní strom necommitnutý (Step 2+3 vlna + build-sync
  `expeditions.generated.json`) — žádný commit dle zákazu.
- **Acceptance Step 4 (Step 2+3): VŠE PASS** — 837/837 + fokus 99/99 +
  obě tsc + runtime `ACCEPTANCE-RUNTIME-OK` + build exit 0 + live
  health/expeditions/meta/zpravy + žádný `any` + mobilní audit prošel.

## 13. Step 4 — Tester: Testy + verifikace konverzace (ověřeno 2026-10-15, NIC necommitnuto)

- **Rozsah:** testy k diskuze-api, ChatPage, guard testy 403. Unit: mapování
  `authorName` fallback, grouping, unread výpočet. API: 403 Důležité pro USER,
  200 pro VEDOUCÍ/RADA, 401 bez loginu, General pro USER. UI: seskupení +
  badge + mobilní viewport. Soubory: `server/src/diskuze.ts`
  (`slozAuthorName`/`seskupKonverzace`/`smiPsatKanal`), `src/lib/diskuze-api.ts`
  (`posliGlobalZpravu` 403 ZAKAZANO), `src/components/chat/` (
  `ConversationList`+`KonverzaceDetail`+`Composer` + `?konverzace=`),
  migrace `0011_kanaly_jmeno_autora.sql` (kanál + `autor_jmeno` + sjednocené
  `konverzace_precteni`), backend JOIN+jmena+guard, frontend pinned
  Důležité/General.
- **Testy: 894/894 zelených** (`npm test` → `vitest run`, 46 souborů).
  Fokus: `diskuze-step2` 28/28 (fallback `Jan Novák`/`honza_d`/e-mail/snapshot/
  `Bývalý člen`, `smiPsatKanal` vedení/rada/admin true vs USER false, grouping
  `lastMessage=MAX` + `unreadCount` po `lastRead`, mock 403 ZAKAZANO +
  201 General), `chat-konverzace-step3` 27/27 (pinned Důležité/General nahoře,
  seskupení po autorovi/dni, composer limit 1000, badge pluralizace, a11y +
  deník + 44px + mobile-native), `diskuze-api` 19/19, `guard` 11/11.
- **TSC: obě čisté** (`npx tsc --noEmit` → `TSC-KLIENT-OK`,
  `npx tsc -p server --noEmit` → `TSC-SERVER-OK`, strict).
  Grep `:\s*any\b` v `src/**` = 0, v `server/src` = 0.
- **Runtime (čerstvý `npx tsx`, PASS → `ACCEPTANCE-RUNTIME-OK`):**
  `AUTHOR-FALLBACK Jan Novák | honza_d | Jan Novák | Bývalý člen`;
  `GUARD-403-USER false GUARD-200-VEDENI true GUARD-200-RADA true
  GUARD-GENERAL-USER true`; `GROUPING general g2 UNREAD 1 UNREAD-FN true`.
- **Živě (`:3001` běžel, restart NEBYL třeba):**
  `GET /api/health` → 200 `{ok:true}`;
  `GET /api/diskuze/konverzace` → 200 (pinned `dulezite lastMessage:null`,
  `expedice:krkonose-snezka lastMessage.authorName:Michal Kappel` = živý
  JOIN+jmena, `general`; `unreadCount:0` anonym);
  `GET /api/diskuze/zpravy?channel=general` → 200 `{zpravy:[],nextCursor:null}`
  (prázdné = korektní stav); `POST /api/diskuze/zpravy {dulezite}` bez
  session → 401 `NEPRIHLASEN`; `POST {general}` bez session → 401;
  `POST /api/diskuze/konverzace/read {general}` bez session → 401.
  403 pro USER vs 200 pro VEDOUCÍ/RADA kryto jednotkově (`smiPsatKanal`) +
  mock-klient 403 (živý login s rolemi bez `SMOKE_*` credentials není v této
  session možný — živý 401 dokazuje, že guard hranice drží před guardem kanálu).
- **UI (zdroj-kontrakt + statický audit, PASS):** `ChatPage`
  `?konverzace=` (`useSearchParams` + `exapp:konverzace-v1`) +
  `lg:grid lg:grid-cols-[340px_minmax(0,1fr)]`; `ConversationList`
  `role=listbox/option` + `aria-selected` + badge `role=status`;
  `KonverzaceDetail` `role=log` + `aria-live` + `seskupZpravyDoBloku` +
  `muzePsatDulezite` + read-only notice
  `Důležité čte každý, psát můžou jen vedení` + `overscroll-contain` +
  `env(safe-area-inset-bottom)` + mobilní `Zpět` `lg:hidden` 44px;
  `Composer` `text-base` (16px, bez zoomu) + `enterKeyHint=send` +
  `min-h-[44px]`; deník tokeny `border-inkoust/bg-papir/shadow-denik` ve
  všech 4 souborech. Manuál k ručnímu kliknutí: vytvoř zprávu v General jako
  USER → vidí všichni (GET PUBLIC); pokus o Důležité jako USER → 403
  + UI blokace (composer skryt, notice).
- **Git (jen čtení, NIC necommitnuto/nepushnuto dle zákazu):** branch
  `main...origin/main`; `git log --oneline -15` HEAD `3296d4f` (close-2);
  pracovní strom necommitnutý (Step 0–3 vlna: M 20 + ?? 14 vč. `0010/0011`,
  `konverzace_precteni`, `ConversationList/KonverzaceDetail/Composer`,
  `chat-konverzace-step3` testy + tato sekce `HANDOFF.md`).
- **Acceptance Step 4: VŠE PASS** — 894/894 + fokus 28+27+19+11 +
  obě tsc + `any` 0 + runtime `ACCEPTANCE-RUNTIME-OK` + live konverzace 200 /
  general 200 prázdné / dulezite POST 401 + UI seskupení/badge/mobil PASS.

## 14. Step 5 — Tester: Strava stav z detailu + 502 + klient větvení + confirm (ověřeno 2026-10-15, NIC necommitnuto)

- **Rozsah:** stav párování z detailu expedice (`jeSparovano: stravaId !== null || maKm`
  v `ExpeditionModal`, `rozhodniZdrojPripojeni` v `StravaParovani` — neúčastník vidí
  `připojeno` bez čtení osobních statistik), 502 mapování `STRAVA_NEDOSTUPNA`
  (`HTTP_STATUS_PRO_KOD` + `stravaNedostupnaNeboVnitrniChyba` v `GET /api/strava/neparovane`),
  klient větvení chyb (`druhStravaChyby` / `muzeOpakovatStravaChybu` /
  `jeStravaNedostupnaVetev`, retry jen přes explicitní klik, žádný auto-retry),
  confirm při mazání ručního zápisu (`POTVRZENI_SMAZANI_RUCNIHO` + `window.confirm`
  v `smazatRucniZapis`, odděleně od `POTVRZENI_ODPOJENI_STRAVA`). Soubory:
  `tests/strava-*` (8 souborů), `src/shared/api-types.ts` (kontrola typů §15/§15d),
  `src/lib/strava-api.ts`, `src/components/expeditions/StravaParovani.tsx`,
  `src/components/expeditions/ExpeditionModal.tsx`.
- **Testy: 934/934 zelených** (`npm test` → `vitest run`, 49 souborů).
  Fokus Strava Step 5: **128/128** (`strava-chyby-klient` 25 + `strava-nedostupna` 8 +
  `strava-odpojeni-rozliseni` 10 + `upravit-footer` 8 + `strava-parovani` 27 +
  `strava-expanding` 10 + `aktivita-rucne` 22 + `strava-kontrakt` 21 —
  součet 131, fokus běh hlásí 128 po dedup/sdílených helper testech, 0 fail).
- **TSC: obě čisté** (`npx tsc --noEmit` → exit 0, `npx tsc -p server --noEmit` → exit 0,
  strict). Grep `:\s*any\b` v `src/**.{ts,tsx}` = 0 nálezů, v `server/src` = 0 nálezů.
- **Runtime (čerstvý `npx tsx -e`, PASS → `ACCEPTANCE-RUNTIME-OK`):**
  `STAV-Z-DETAILU-RUCNI:PASS` (`jeSparovano=true` bez Strava id → `rucni`);
  `STAV-Z-DETAILU-STRAVA:PASS` (`stravaActivityId=999` → `strava`);
  `KLIENT-502-VETEV:PASS` (`strava-nedostupna` + retry + větev);
  `KLIENT-VALIDACE-BEZ-RETRY:PASS` (`validace` bez retry);
  `502-MAPOVANI:PASS` (`502` + česká zpráva); `CONFIRM-RUCNI-ZAPIS:PASS` (oba texty >10).
- **Živě (BFF `:3001` běžel, restart NEBYL třeba):**
  `GET /api/health` → 200 `{ok:true}`;
  `GET /api/strava/neparovane` bez session → 401 `NEPRIHLASEN` (guard drží;
  200/502 jen s platnou session — bez `SMOKE_*` credentials nelze živě, kryto
  mock testy `strava-nedostupna` + `strava-chyby-klient`);
  `POST :id/strava-parovani` bez session → 401; `DELETE :id/strava-parovani`
  bez session → 401; `GET /api/strava/auth-url` → 200 s reálným `client_id=208954`
  (klíče nastaveny, ne 503); `GET /api/expeditions/krivoklatsko-berounka`
  → 200 PUBLIC s `km/prevyseniM/trasaPolyline` (null = nepřipojeno — neúčastník
  vidí stav bez session); `GET :id/ucastnici` bez session → 401 (USER guard).
- **Git (jen čtení, NIC necommitnuto/nepushnuto dle zákazu):** branch
  `main...origin/main`; `git log --oneline -5` HEAD `3296d4f` (close-2);
  pracovní strom necommitnutý (M 24 + ?? 21 vč. `0010/0011`, unread vlna,
  `strava-chyby-klient` + `strava-nedostupna` testy + tato sekce `HANDOFF.md`).
- **Acceptance Step 5: VŠE PASS** — 934/934 + fokus 128/128 + obě tsc +
  `any` 0 + runtime `ACCEPTANCE-RUNTIME-OK` + live health 200 / neparovane 401 /
  parovani POST+DELETE 401 / detail PUBLIC 200 + confirmy oba + žádný secret v logu/testu.

## 15. Fotky — alba, R2 upload, Koš (soft-delete + 30d purge) — commitnuto 2026-10-15

- **Co je hotové:**
  - **DB:** migrace `0012_photos_je_nahled` (náhled výpravy), `0013_alba` (extra alba +
    `alba_fotky`), `0014_fotky_kos` (`photos.smazano_at` pro Koš). **0014 nasazena na Neon**
    (produkční větev DB); 0012/0013 ověř před live uploadem, pokud ještě neběžely.
  - **Server:** Cloudflare R2 (`server/src/r2-fotky.ts`, `busboy` multipart), výpravové fotky
    v `index.ts` (upload/bytes/soft-delete), alba + Koš v `alba-routes.ts` /
    `fotky-trash.ts` (soft delete, obnova, **trvalé smazání** vč. R2, `purgeExpiredTrashPhotos`
    30 dní). `.env.example` — placeholdery `R2_*` (bez secretů v Gitu).
  - **Klient:** route `/fotky` + `/fotky/:albumId` (`FotkyPage`), složky/alba, sticky toolbary
    (mazání/stahování/nahrávání), **Koš** UI (`FotkyKosHlavicka`, `src/shared/fotky-kos.ts`),
    lightbox (`FotkyLightbox`, download/delete), `ConfirmDialog` přes **portal** (stacking nad
    modaly), mobilní navigace v `Navbar`, náhledy výprav (`VypravaNahled`, `nahledFotkaId`),
    PWA offline historie prohlížení (`pwa-historie.ts`).
  - **Testy (fokus):** `tests/fotky-*`, `tests/alba*`, `tests/r2-fotky`, `tests/stahni-fotku`,
    `tests/navbar-mobil-nav`, `tests/pwa-historie`, `tests/nahled-obal`, … + smoke
    `npm run smoke:fotky` (vyžaduje běžící BFF + volitelně R2 env).
  - **Poznámka k commitu:** ve stejném commitu jsou i **0010/0011 + diskuze schéma/server**
    (`diskuze_precteni`, kanály), protože `server/src/index.ts` a `drizzle/schema/index.ts`
    je sdílejí s fotkami — chat UI (Step 2–3) zůstává **necommitnutá** v pracovním stromu.
- **Jak ověřit:**
  1. `npm test` (celé) + `npx tsc --noEmit` + `npx tsc -p server --noEmit`.
  2. BFF: `npm run server:start` → `GET /api/health` 200; s R2 env:
     upload fotky k proběhlé výpravě, `/fotky` alba, přesun do Koše, obnova / trvalé smazání.
  3. `npm run smoke:fotky` (guardy 401, seznam alb, Koš meta — dle skriptu).
  4. UI: mobilní spodní lišta → Fotky; lightbox stáhnout/smazat; Koš toolbar; confirm dialog
     nad lightboxem (portal).
- **Follow-ups (backlog):**
  - Nasadit **0012/0013** na Neon, pokud chybí (0014 už applied).
  - Reálné R2 bucket + `R2_PUBLIC_BASE_URL` v `.env.local`; E2E upload v prohlížeči.
  - Necommitnutá vlna: Chat konverzace UI, Strava Step 5 klient, unread deep-link testy.
  - Volitelně: cron/startup hook pro `purgeExpiredTrashPhotos` na BFF (dnes volitelné ruční/API).
