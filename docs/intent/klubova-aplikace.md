# Klubová aplikace

Čtenáři tohoto dokumentu jsou autor aplikace a budoucí agent. Uživatelé aplikace jsou členové a vedoucí jednoho školního expedičního klubu.

Tento soubor popisuje cílový produkt. Co je převzaté z `PRD.md` a z kódu, je záměr, ne tvrzení, že je to hotové. `PRD.md` se nemění.

Když se záměr a kód rozcházejí v chování, platí kód. Když se rozcházejí v tom, co do produktu patří, platí tento záměr.

## Záměr

### V rozsahu

- výpravy
- kalendář a opakované schůzky
- fotky
- chat nebo nástěnka k výpravě
- zpěvník
- osobní statistiky a žebříček
- propojení se Stravou
- oznámení na Discord
- teplotní mapa dokončených tras
- instalace jako PWA a offline historie

### Mimo rozsah

- pokladna a peníze
- účty rodičů nebo školy
- veřejný web
- víc klubů v jedné instalaci
- živá mapa a sledování lidí během výpravy

## Shrnutí

Štítek u schopnosti říká, odkud popis je: `PRD`, `kód`, nebo `potvrzený záměr`. Štítek neznamená, že je schopnost nasazená a ověřená.

### Kdo to používá

Členové a vedoucí jednoho klubu, jedna instalace. Dovnitř se jde pozvánkovým kódem na 10 minut (`PRD`, `kód`).

Hodnosti jsou v `src/config/roles.ts`: člen, aktivní člen, člen rady, vedení. Základna je právě jedna, rada a vedení jen u aktivního člena. Technické právo je vedle hodnosti: admin spravuje aplikaci, hlavní admin smí cizí profil a povýšení (`kód`, `ROLE_DOC.md`). Vedení oddílu může v autentizaci zůstat běžný uživatel.

Rodiče a škola účet nemají (`potvrzený záměr`).

### Co to umí

#### Výpravy

`PRD`, `kód`. Cíl: vedoucí zadá název, datum, sraz a popis. Člen se přihlásí a vidí ostatní. Po akci se zapíše docházka a i potom jde účastníka přidat nebo odebrat. Zakládat smí admin nebo aktivní člen.

V kódu jsou ke směru cesty statické snímky „tam“ a „zpět“. Nejsou to živé polohy.

#### Kalendář a opakované schůzky

`PRD`, `kód`. Cíl: výpravy a schůzky jsou na jedné ploše. Schůzka unese opakování a místo (třída, klubovna, oddíl). Detail se otevře z události. V klientu je tahle plocha na `/vypravy`.

#### Fotky

`PRD`, `kód`. Cíl: přihlášený člen nahraje fotky k proběhlé výpravě, admin je maže a volí náhled. Bajty jdou do Cloudflare R2. V kódu jsou i alba mimo výpravu.

#### Chat nebo nástěnka k výpravě

`PRD`, `kód`. Cíl: přihlášený člen píše k výpravě. V kódu je k tomu konverzace, přílohy, přečtení a skupiny s odděleným čtením a psaním. Discord zůstává kanál oznámení, ne náhrada nástěnky (`potvrzený záměr`).

#### Zpěvník

`kód`, `potvrzený záměr`. V `PRD.md` zpěvník není. Cíl: vydané písně jsou kniha, návrh čeká ve frontě, schválení ho vydá a odmítnutí řádek smaže bez zprávy. Text jde zapsat, vzít z fotky, nebo z PDF.

#### Osobní statistiky a žebříček

`PRD`, `kód`. Cíl: počet výprav, kilometry, převýšení a pořadí členů podle účasti a kilometrů. Kilometry jdou ze spárované aktivity, nebo ručně bez data a bez odkazu (`kód`).

#### Propojení se Stravou

`PRD`, `kód`. Cíl: člen připojí účet a k uzavřené výpravě se spáruje jedna aktivita pro všechny, kdo se zúčastnili. Cesty v kódu jsou. Ostré klíče a průchod proti skutečné Stravě jsou pořád otevřený úkol v `TODO_STRAVA.md`, ne hotové ověření.

#### Oznámení na Discord

`PRD`, `kód`. Cíl: nová výprava a důležitá oznámení jdou webhookem do jednoho kanálu. Výpadek Discordu nezruší žádost v aplikaci. Adresa webhooku zůstává jen na serveru. Doručení do skutečného kanálu popisuje `TODO_DISCORD.md` jako ještě neověřené.

#### Teplotní mapa dokončených tras

`PRD`, `kód`. Cíl: profil a žebříček ukážou už projeté trasy. Mapa neukazuje, kde kdo právě je (`potvrzený záměr`).

#### Instalace jako PWA a offline historie

`PRD`, `potvrzený záměr`. Cíl: aplikace jde na plochu a historie se dá prohlížet bez sítě. V kódu je manifest, service worker a síťově první cache navigace. Komentář ve `vite.config.ts` říká, že to není plná offline cache dat. Offline historie dat tedy zůstává záměr, obal instalace je v kódu.

### Jak to funguje

Člen se na telefonu přihlásí. Vidí výpravy a schůzky, přihlásí se na akci a po ní dodá fotky. Kdo výpravu vede, zapíše docházku a může k ní připojit aktivitu ze Stravy. Z docházky a kilometrů vzniknou statistiky, žebříček a teplotní mapa hotových tras. Nová výprava se zkusí oznámit na Discord. Zpěvník je kniha klubu vedle výprav. Bez sítě má jít aspoň prohlížet historii.

Jeden prohlížeč mluví s Express serverem na `:3001`. Server jediný zná Neon Postgres přes Drizzle, Cloudflare R2, Stravu a Discord. Relace je JWT v cookie `exapp_session`. Role se čtou z databáze, ne z tokenu. V produkci server servíruje i klienta, nasazení je Railway. Jazyk obrazovek je čeština, vzhled výprav je světlý: bílá, olivová, okrová tlačítka s tmavým textem.

## Specifikace

Předpoklady: jedna instalace, jeden školní klub, PWA v prohlížeči, relace v cookie `exapp_session`, čeština v UI, stack z tohoto repa.

### Mapa schopností

| Id | Zodpovědnost | Závisí na |
| --- | --- | --- |
| identita | Účet, pozvánkový kód, cookie, čtení práv z DB | — |
| vypravy | Výprava, přihlášení, docházka | identita |
| kalendar-schuzky | Kalendář a opakované schůzky | identita, vypravy |
| fotky | Fotky výprav v R2 | vypravy |
| nastenka | Zprávy k výpravě | identita, vypravy |
| zpevnik | Vydané písně a fronta návrhů | identita |
| strava | Připojení účtu a spárování jedné aktivity k výpravě | identita, vypravy |
| statistiky | Kilometry, účast, žebříček, ruční zápis | vypravy, strava |
| mapa-tras | Teplotní mapa hotových tras, bez živé polohy | statistiky |
| discord | Oznámení webhookem, fail-open | vypravy |
| pwa | Instalace na plochu a offline historie | klient všech modulů výše |

Pořadí: identita → vypravy → kalendar-schuzky, fotky, nastenka, zpevnik → strava → statistiky → mapa-tras, a discord souběžně po vypravy → pwa poslední.

`mapa-tras` je jen teplotní mapa dokončených tras.

### Objective

Uzavřená aplikace, ve které jeden školní expediční klub plánuje výpravy a schůzky, schází se u fotek, nástěnky a zpěvníku a vidí statistiky ze docházky a ze Stravy. Úspěch: agent z tohoto souboru postaví rozsah ze záměru a nepřidá položky mimo rozsah.

### Commands

```
npm run dev
npm run server:dev
npm test
npm run typecheck
npm run server:typecheck
```

Oba dev příkazy se spouštějí z kořene repa. Server čte `.env.local`. `GET /api/health` vrací 200 i bez databáze. Datová zkouška je `GET /api/meetings`. Zápis do živé databáze, seed, migrace a smoke, který mění data, jen po výslovném souhlasu.

### Project Structure

```
src/pages, src/lib, src/hooks   klient, logika mimo obrazovky
src/shared/api-typy/            smlouva API
src/config/roles.ts             hodnosti
server/src/index.ts             složení, ne obchodní pravidla
server/src/*-routes.ts          registruj*(app)
server/src/prostredi.ts         jediné čtení process.env
drizzle/schema, drizzle/migrations
docs/intent/klubova-aplikace.md záměr, shrnutí, spec i úkoly
```

### Code Style

Přísný TypeScript, bez `any`. Neznámý vstup je `unknown`. Komentáře v kódu anglicky, text pro člověka česky. Zápis má stráž `vyzadujPrihlaseni`, `vyzadujSpravceVyprav`, `vyzadujAdmina`, nebo `vyzadujSuperadmina`. Chyba ven jde českou hláškou. Kontrakt API se rozšiřuje přidáváním polí.

```ts
export function smiNaVypravy(profil: ClenskyProfil): boolean {
  return profil.clenstvi === "aktivni_clen";
}
```

### Testing Strategy

Vitest (`npm test`). K tomu `npm run typecheck` a `npm run server:typecheck`. Část testů čte zdrojáky jako text a hlídá v nich řetězce. Když takový test spadne, nejdřív se rozliší změna chování od změny zápisu. Nové chování dostane test, který před implementací padá.

### Boundaries

- Always: čeština v UI a hláškách, práva z DB, Discord fail-open, tajemství jen v `.env.local`, migrace jen přidávají, dotyk 44 px, pole 16 px, na okrové ploše tmavý text.
- Ask first: schéma a zápis do živé DB, nová závislost, změna toho, kdo smí zakládat výpravy nebo povyšovat admina, ostré ověření Stravy a Discordu.
- Never: měnit `PRD.md`, secrety v gitu, zápis do živé DB bez potvrzení, pokladna a peníze, účty rodičů nebo školy, veřejný web, víc klubů v jedné instalaci, živá mapa a sledování lidí během výpravy.

### Success Criteria

- Registrace bez platného kódu účet nevytvoří. Nepřihlášený nedostane výpravy, nástěnku, zpěvník, fotky, žebříček ani profil.
- Aktivní člen nebo admin založí výpravu. Ostatní členové se přihlásí a vidí seznam. Po uzavření jde upravit docházku.
- Kalendář ukáže výpravy i opakovanou schůzku s místem.
- Přihlášený člen nahraje fotku k výpravě. Smazání a náhled udělá admin.
- Nástěnka přijme zprávu k výpravě od přihlášeného člena.
- Návrh písně není mezi vydanými, dokud ho někdo s právem nevydá.
- Statistiky a žebříček čtou účast a kilometry. Ruční zápis přijme jen kilometry a převýšení.
- Teplotní mapa kreslí hotové trasy a nemá živou polohu člena.
- Vytvoření výpravy zůstane úspěšné, i když Discord webhook selže.
- Aplikace má manifest a jde přidat na plochu. Bez sítě zůstane aspoň dřív otevřená historie prohlížení.
- V produktu není platba, rodičovský účet, veřejná registrace, přepínač klubů ani živá poloha.
- `npm test`, `npm run typecheck` a `npm run server:typecheck` projdou.

### Open Questions

## Úkoly k obnově

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obnovit cílový produkt z tohoto souboru na stávajícím stacku, bez tvrzení, že dnešní kód už záměr splnil.

**Architecture:** Express BFF drží databázi, R2, Stravu a Discord. Klient je PWA. Moduly jdou v pořadí mapy schopností.

**Tech Stack:** Node >= 22, React 19, Vite, Tailwind 4, Express 5, Drizzle, Neon, JWT v cookie `exapp_session`, Cloudflare R2, Vitest.

**Spec:** `docs/intent/klubova-aplikace.md`

Tento běh plán jen zapisuje. `git commit` se nespouští. Kroky commitu jsou práce pro pozdější běh.

### Global Constraints

- Node `>=22`. UI česky, komentáře anglicky.
- Cookie `exapp_session`, `httpOnly`, v produkci `secure`.
- Registrační kód platí 10 minut.
- Výpravu založí admin nebo `clenstvi === "aktivni_clen"`.
- Discord je fail-open a URL webhooku není v klientu, logu ani gitu.
- Mimo rozsah: pokladna a peníze, účty rodičů nebo školy, veřejný web, víc klubů v jedné instalaci, živá mapa a sledování lidí během výpravy.
- `PRD.md` se nemění. Živá databáze se bez souhlasu nezapisuje.
- Ověření úkolu: `npm test`, `npm run typecheck`, `npm run server:typecheck`.

### Review Focus

- Registrace bez platného kódu účet nevytvoří. Test je v `identita`.
- Člen se základnou `clen` výpravu nezaloží. Test je ve `vypravy`.
- Selhání Discord webhooku nezmění úspěch vytvoření výpravy. Test je v `discord`.
- Teplotní mapa nepřijme živou polohu. Test je v `mapa-tras`.
- Seznam členů bez cookie vrátí 401. Test je v `identita`.

### Task: identita

**Files:**
- Modify: `server/src/ucty-routes.ts`
- Modify: `server/src/auth.ts`
- Modify: `server/src/prostredi.ts`
- Test: `tests/identita-registrace.test.ts`

**Interfaces:**
- Consumes: nic
- Produces: `registrujUcty(app)`, `vyzadujPrihlaseni`, cookie `exapp_session`

- [ ] **Step 1: Write the failing test** — registrace bez platného kódu vrátí 400 a počet uživatelů zůstane 0. Samostatný test: `GET` seznamu členů bez cookie vrátí 401.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/identita-registrace.test.ts`
- [ ] **Step 3: Implement** — kód na 10 minut, hash hesla, JWT jen v cookie, `process.env` jen v `prostredi.ts`, práva při požadavku z DB.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(identita): require a valid registration code"`

### Task: vypravy

**Files:**
- Modify: `server/src/vypravy-routes.ts`
- Modify: `drizzle/schema/expeditions.ts`
- Modify: `drizzle/schema/participants.ts`
- Test: `tests/vypravy-pravo.test.ts`

**Interfaces:**
- Consumes: `vyzadujPrihlaseni`
- Produces: `registrujVypravy(app)`, `vyzadujSpravceVyprav`

- [ ] **Step 1: Write the failing test** — cookie člena se základnou `clen` dostane při založení výpravy 403.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/vypravy-pravo.test.ts`
- [ ] **Step 3: Implement** — založení jen pro admina nebo aktivního člena, přihlášení pro přihlášeného člena, docházka i po uzavření. Hák na Discord v tomto úkolu nic neposílá.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(vypravy): limit creation to active members and admins"`

### Task: kalendar-schuzky

**Files:**
- Modify: `server/src/schuzky-routes.ts`
- Modify: `drizzle/schema/meetings.ts`
- Test: `tests/schuzky-opakovani.test.ts`

**Interfaces:**
- Consumes: `vyzadujSpravceVyprav`
- Produces: `registrujSchuzky(app)`

- [ ] **Step 1: Write the failing test** — týdenní schůzka s místem „klubovna“ jde uložit a znovu přečíst.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/schuzky-opakovani.test.ts`
- [ ] **Step 3: Implement** — opakování, místo, úprava, smazání schůzky i jednoho výskytu. Zápis jen pro správce výprav.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(kalendar): store a recurring meeting with a place"`

### Task: fotky

**Files:**
- Modify: `server/src/fotky-routes.ts`
- Test: `tests/fotky-vypravy.test.ts`

**Interfaces:**
- Consumes: id výpravy, R2 ze serverového prostředí
- Produces: `registrujFotkyVyprav(app)`

- [ ] **Step 1: Write the failing test** — přihlášený člen fotku k výpravě nahraje, člen bez cookie dostane 401.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/fotky-vypravy.test.ts`
- [ ] **Step 3: Implement** — bajty do R2, smazání a náhled jen pro admina.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(fotky): store expedition photos in R2"`

### Task: nastenka

**Files:**
- Modify: `server/src/diskuze-routes.ts`
- Test: `tests/nastenka-vypravy.test.ts`

**Interfaces:**
- Consumes: `vyzadujPrihlaseni`, id výpravy
- Produces: `registrujDiskuzi(app)`

- [ ] **Step 1: Write the failing test** — přihlášený člen vloží zprávu k výpravě a dostane ji ve výpisu.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/nastenka-vypravy.test.ts`
- [ ] **Step 3: Implement** — zpráva má autora a čas. Cizí zprávu maže admin.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(nastenka): post a message on an expedition"`

### Task: zpevnik

**Files:**
- Modify: `server/src/zpevnik-routes.ts`
- Modify: `src/shared/zpevnik.ts`
- Test: `tests/zpevnik-fronta.test.ts`

**Interfaces:**
- Consumes: `vyzadujPrihlaseni`
- Produces: `registrujZpevnik(app)`

- [ ] **Step 1: Write the failing test** — návrh není v seznamu vydaných písní.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/zpevnik-fronta.test.ts`
- [ ] **Step 3: Implement** — schválení návrh vydá, odmítnutí řádek smaže a nepošle zprávu.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(zpevnik): keep proposals out of the published book"`

### Task: strava

**Files:**
- Modify: `server/src/strava-routes.ts`
- Test: `tests/strava-parovani.test.ts`

**Interfaces:**
- Consumes: uzavřená výprava, docházka
- Produces: `registrujStravu(app)`, jedna aktivita na výpravu

- [ ] **Step 1: Write the failing test** — bez klíčů vrátí auth-url 503 a nespáruje aktivitu.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/strava-parovani.test.ts`
- [ ] **Step 3: Implement** — OAuth a párování jen na serveru. Jedna aktivita se rozdělí všem, kdo se zúčastnili. Ostrý průchod proti Stravě se v tomto úkolu nespouští.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(strava): pair one activity with an expedition"`

### Task: statistiky

**Files:**
- Modify: `server/src/statistiky-routes.ts`
- Test: `tests/aktivita-rucne.test.ts`

**Interfaces:**
- Consumes: docházka, případně spárovaná aktivita
- Produces: `registrujStatistiky(app)`, ruční tělo `{ km, prevyseni_m }`

- [ ] **Step 1: Write the failing test** — ruční zápis s polem `datum` vrátí 400.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/aktivita-rucne.test.ts`
- [ ] **Step 3: Implement** — statistiky a žebříček z účasti a kilometrů. Ruční zápis nemá datum a nemá URL.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(statistiky): accept manual distance without a date"`

### Task: mapa-tras

**Files:**
- Modify: `src/components/profil/Heatmapa.tsx`
- Test: `tests/mapa-tras.test.ts`

**Interfaces:**
- Consumes: uložené trasy ze statistik
- Produces: teplotní mapa hotových tras

- [ ] **Step 1: Write the failing test** — vstup s živou polohou (`lat` a `lng` člena „teď“) mapa odmítne a nevykreslí bod osoby.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/mapa-tras.test.ts`
- [ ] **Step 3: Implement** — kreslit jen uložené trasy dokončených výprav.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(mapa-tras): draw completed routes only"`

### Task: discord

**Files:**
- Modify: `server/src/discord.ts`
- Modify: hák ve `server/src/vypravy-routes.ts`
- Test: `tests/discord-fail-open.test.ts`

**Interfaces:**
- Consumes: vytvořená výprava
- Produces: odeslání, které při síťové chybě nepropustí výjimku ven

- [ ] **Step 1: Write the failing test** — vytvoření výpravy zůstane úspěšné, když webhook hodí síťovou chybu.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/discord-fail-open.test.ts`
- [ ] **Step 3: Implement** — URL jen z `prostredi.ts`. Log bez adresy. Ostré doručení do kanálu se v tomto úkolu nespouští.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(discord): keep expedition create successful when webhook fails"`

### Task: pwa

**Files:**
- Modify: `vite.config.ts`
- Modify: `public/manifest.webmanifest`
- Test: `tests/pwa-manifest.test.ts`

**Interfaces:**
- Consumes: klientské cesty
- Produces: instalovatelný manifest a service worker s rezervou pro offline navigaci

- [ ] **Step 1: Write the failing test** — manifest má `display` vhodné pro instalaci na plochu a service worker registruje cache navigace.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- tests/pwa-manifest.test.ts`
- [ ] **Step 3: Implement** — instalace a offline rezerva pro už otevřené dokumenty. Datové API se v tomto úkolu neprohlašuje za plně offline.
- [ ] **Step 4: Run tests and typechecks** — `npm test`, `npm run typecheck`, `npm run server:typecheck`
- [ ] **Step 5: Commit (later run)** — `git commit -m "feat(pwa): install the app and keep a navigation fallback"`

### Self-review

Mapa schopností má id `identita`, `vypravy`, `kalendar-schuzky`, `fotky`, `nastenka`, `zpevnik`, `strava`, `statistiky`, `mapa-tras`, `discord`, `pwa`. Každé má úkol výše. Mimo rozsah je v Global Constraints. `statistiky` a `mapa-tras` stojí na `strava` a `vypravy`. `pwa` je poslední. Plán nepopisuje chování jako hotové.
