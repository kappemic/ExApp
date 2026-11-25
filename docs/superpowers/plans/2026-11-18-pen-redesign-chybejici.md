# Pen redesign — chybějící chování

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doplnit jen to, co telefonní rámy v `file:///C:/Users/kilpa/Downloads/ExApp.pen` ukazují a co dnešní model neumí. Tento plán startuje až po dokončení `docs/superpowers/plans/2026-11-18-pen-redesign-integrace.md`.

**Architecture:** Každá mezera je samostatný úkol s vlastním rozhodnutím, jestli stačí klient, nový endpoint nad starými tabulkami, nebo nový sloupec. SQL migrace se tu nepíše. Až bude úkol schválený, migrace půjde aditivně do `drizzle/migrations/` a jednorázovým skriptem, a jen po potvrzení uživatelem, protože `.env.local` může mířit na živou DB.

**Tech Stack:** Vite, React 19, Tailwind 4, Express 5, Neon + Drizzle, JWT cookie `exapp_session`. Guardy beze změny významu, dokud úkol výslovně nemění produktové pravidlo.

**Spec:** stejné rámy jako plán A. Sitemap, vzorky a `ExApp · Stavy a limity` pořád nejsou stránky.

## Global Constraints

- Nezačínat, dokud plán A neprošel `npm test`, `npm run typecheck` a `npm run server:typecheck`.
- Žádný commit, dokud o něj uživatel nepožádá. `src/data/expeditions.generated.json` do diffu nepatří.
- Nová tabulka nebo sloupec není součást plánu A. Tady se smí navrhnout, SQL se nepíše.
- Role z DB, ne z tokenu. Discord webhook zůstává secret a fail-open.
- Čeština v UI. Kontrakt jen aditivně v `src/shared/api-typy/`.
- Nejistota je u úkolu označená. Nejasný úkol se neimplementuje „pro jistotu“.

## Review Focus

- Úkol přidá migraci, kterou uživatel neschválil, a zapíše ji do živé DB. Očekávání: skript se nespustí bez výslovného potvrzení.
- Editovatelné „Nastavení“ obchází guardy a práva začnou žít jen v klientu. Očekávání: i po uložení politiky rozhoduje serverový guard.
- Historie kódů začne ukládat e-mail v logu nebo v odpovědi pro člena. Očekávání: použitý kód vidí jen admin.
- Vzkaz u přihlášky nebo online presence unikne do `GET` bez `vyzadujPrihlaseni`. Očekávání: stejné guards jako dnešní účast a chat.
- Konec řady schůzek se dopočítá na klientu a po refreshi zmizí. Očekávání: dokud není sloupec, UI z plánu A konec řady neukazuje.

---

### Task 1: Pozvánkový kód — popisek, role, použité

**Rám:** `Telefon · Pozvánkové kódy`, `Telefon · Pozvánkový kód`, `Telefon · Registrace` (řádek „Člen“).

**Co rám ukazuje:** u nového kódu popisek („Pro Adama – nový člen“), roli „Člen“ a sekci Použité se jménem, datem a kódem.

**Co chybí:** `registration_codes` má `code`, `created_by`, `expires_at`, legacy `used_at` / `used_by`. Popisek se v `POST /api/admin/codes` validuje a zahodí (`server/src/ucty-routes.ts`). Role kódu se neukládá; nový účet dostane výchozí roli z registrace. Platný kód je sdílený a po expiraci se řádek maže, takže historie „Použité“ nemá odkud číst. `GET` seznamu živých kódů je až v plánu A a historii nevrací.

**Návrh:** sloupec `poznamka` a volitelný předvolený profil role na `registration_codes`. Samostatná historie spotřeby (kdo a kdy), protože jeden `used_by` vícenásobný kód neunese. Registrace pak smí předvyplnit roli jen v rozsahu, který admin smí udělit. Do té doby plán A popisek, roli a sekci Použité nevykresluje.

**Start:** až po plánu A, úkol 2 a 10.

- [ ] **Step 1:** Potvrdit s uživatelem, že kód má nést roli a že historie přežije smazání expirovaného řádku.
- [ ] **Step 2:** Napsat migraci až v tom kroku, ne v tomto souboru, a nespouštět ji bez potvrzení.
- [ ] **Step 3:** Aditivně rozšířit `POST /api/admin/codes` a admin `GET`. UI karet doplnit popisek, roli a Použité.
- [ ] **Step 4:** Test: člen `GET` historie nedostane; admin vidí spotřebu bez hashů a bez webhooků.

---

### Task 2: Přihláška — vzkaz a uzávěrka

**Rám:** `Telefon · Modul · Přihlášení na výpravu`.

**Co rám ukazuje:** „Vzkaz pro vedoucího“ a řádek „Uzávěrka“ (pátek 28. listopadu).

**Co chybí:** `POST /api/expeditions/:id/prihlasit` bere přihlášení sebe bez těla. `participants` nemá sloupec vzkazu. `expeditions` nemá uzávěrku přihlášek, jen `datum` / `datumDo` / kapacitu.

**Návrh:** sloupec vzkazu na účasti (krátký text, limit jako dnešní `poznamkaMaxDelka` až při návrhu kontraktu) a sloupec uzávěrky na výpravě. Po uzávěrce `prihlasit` vrací 422. Plán A sheet vzkaz ani uzávěrku neukazuje a dál volá přihlášení bez těla.

**Start:** až po plánu A, úkol 3.

- [ ] **Step 1:** Ověřit na `drizzle/schema/participants.ts` a `expeditions.ts`, že sloupce pořád nejsou.
- [ ] **Step 2:** Po potvrzení uživatelem přidat sloupce migrací (SQL až v implementaci).
- [ ] **Step 3:** Rozšířit formulář nové výpravy a sheet přihlášky. Guard zůstává `vyzadujPrihlaseni` pro přihlášku a `vyzadujSpravceVyprav` pro zápis uzávěrky.
- [ ] **Step 4:** Test: vzkaz delší než limit → 422; po uzávěrce → 422; cizí uživatel vzkaz jiného nevidí, pokud produkt neřekne jinak (nejistota: rám neříká, kdo vzkaz čte — před UI se zeptat).

---

### Task 3: Konec opakované schůzky

**Rám:** `Telefon · Modul · Nová schůzka`, `Telefon · Modul · Detail schůzky` („Každý týden do 15. 12.“ / „do 15. prosince“).

**Co rám ukazuje:** týdenní řada s datem konce a seznam dalších termínů.

**Co chybí:** `meetings.opakovani` je jen `jednorazova | tydenni`. `vyskytySchuzky` v `src/lib/kalendar.ts` sype výskyty dál bez data konce. `meeting_exceptions` umí vynechat jeden den, ne ukončit řadu.

**Návrh:** sloupec `opakovat_do` (DATE, null = jako dnes, bez konce). `vyskytySchuzky` výskyt po tom datu nevrátí. Plán A datum konce neposílá.

**Start:** až po plánu A, úkol 4.

- [ ] **Step 1:** Test kalendáře: týdenní schůzka s koncem nevrátí den po `opakovat_do`, pořád vrací dny před ním a respektuje `vynechaneVyskyty`.
- [ ] **Step 2:** Migrace až po potvrzení. `POST/PATCH /api/meetings` pole přijme aditivně.
- [ ] **Step 3:** Sheety z plánu A doplnit o datum konce.
- [ ] **Step 4:** `npx vitest run tests/kalendar.test.ts tests/schuzky-validace.test.ts`.

---

### Task 4: Nastavení klubu a Discord přepínače

**Rám:** `Telefon · Nastavení`.

**Co rám ukazuje:** přepínatelné věty „Výpravu smí založit“, „Schůzku smí založit“, „Povyšovat členy smí“, „Profil jiného člena smí měnit“, stav Discordu `#oznameni` / připojeno a dva přepínače (nová výprava, důležitá oznámení) plus „Uložit změny“.

**Co chybí:** pravidla jsou v kódu (`src/config/roles.ts` a guardy na routách), ne v tabulce. Discord webhook je env secret v `server/src/prostredi.ts`, odeslání je fail-open z `server/src/vypravy-routes.ts`. Per-event vypínač v DB není. Plán A stránku `/nastaveni` kreslí jen ke čtení a push bere z `push-odber`.

**Návrh:** neměnit guardy tak, aby je přepsal klient. Až produkt řekne, že se pravidla smí měnit za běhu, jedna řádka nastavení (nebo sloupce) a guardy čtou ji z DB při requestu. Discord přepínače jsou booleany vedle webhooku; URL webhooku se do API nevrací. Než to bude, tlačítko Uložit na tomhle rámu není.

**Nejistota:** rám může být vysvětlení pevných pravidel, ne editor. Když uživatel potvrdí, že věty jsou jen text, úkol se škrtá a zůstane plán A.

**Start:** až po plánu A, úkol 9, a až po produktovém potvrzení.

- [ ] **Step 1:** Zeptat se, jestli se věty editují. Když ne, úkol uzavřít bez migrace.
- [ ] **Step 2:** Když ano, navrhnout sloupec a teprve potom migraci po potvrzení.
- [ ] **Step 3:** `Uložit změny` volá admin/superadmin endpoint. Guard výprav po uložení čte novou hodnotu z DB, ne z tokenu.
- [ ] **Step 4:** Test: vypnutá „nová výprava“ nepošle webhook a založení výpravy pořád vrátí 201. V logu není URL webhooku.

---

### Task 5: Online v chatu

**Rám:** `Telefon · Chat · Obecný` („6 členů · 2 online“).

**Co rám ukazuje:** počet členů kanálu a počet právě připojených.

**Co chybí:** `src/shared/api-typy/diskuze.ts` ani schéma zpráv nemají presence. Počet členů obecného kanálu plán A bere z `GET /api/users`. Online odnikud.

**Návrh:** až bude potřeba, krátkodobá presence (heartbeat), ne trvalý seznam „kdo byl online včera“, pokud to rám nevyžaduje. Bez nové tabulky to nejde čistě, pokud se heartbeat nemá držet v paměti jednoho procesu (na Railway po restartu zmizí). Plán A řádek „online“ nekreslí.

**Nejistota:** „2 online“ může být jen maketa. Když uživatel presence nechce, úkol se škrtá.

**Start:** až po plánu A, úkol 7.

- [ ] **Step 1:** Potvrdit, že online je produkt, ne výplň makety.
- [ ] **Step 2:** Zvolit heartbeat v DB versus paměť procesu. SQL až potom a až po potvrzení.
- [ ] **Step 3:** Do hlavičky vlákna doplnit počet. Seznam uživatelů online neukazovat, rám ho nechce.
- [ ] **Step 4:** Test: odhlášený request presence nedostane; po timeoutu heartbeat počet klesne.

---

### Task 6: Kategorie zpěvníku

**Rám:** `Telefon · Zpěvník` (čipy Všechny / Táborové / Klubové).

**Co rám ukazuje:** filtr písní podle druhu.

**Co chybí:** `zpevnik_pisne` má název, autora, tělo, stav, návrhovatele a náhled. Sloupec kategorie není (`drizzle/schema/zpevnik_pisne.ts`).

**Návrh:** textový sloupec s pevnou množinou, kterou produkt pojmenuje (rám má aspoň táborové a klubové). Filtr je query na `GET /api/zpevnik`. Plán A čipy nekreslí.

**Nejistota:** množina hodnot je jen z makety, ne z PRD. Před migrací seznam potvrdit.

**Start:** až po plánu A, úkol 6.

- [ ] **Step 1:** Potvrdit výčet kategorií.
- [ ] **Step 2:** Migrace po potvrzení. Staré písně dostanou prázdnou kategorii a padnou jen do „Všechny“.
- [ ] **Step 3:** Čipy a pole v návrhu písně.
- [ ] **Step 4:** Test: neznámá kategorie → 422; píseň bez kategorie je ve „Všechny“ a v konkrétním čipu není.

---

### Task 7: Přehrání písně

**Rám:** `Telefon · Píseň` („1,0× Zastavit“).

**Co rám ukazuje:** ovládání tempa a stop, tedy zvuk, ne jen transpozici akordů.

**Co chybí:** v `zpevnik_pisne` není audio URL ani MIDI. `ZpevnikPisenPage` umí transpozici (`src/lib/zpevnik-transpozice.ts`) a vykreslení akordů. Plán A proužek akordů jen vypisuje.

**Návrh:** nepouštět Web Speech jako náhradu. Buď pozdější soubor ke písni (sloupec / objekt v úložišti), nebo úkol škrtnout. Do té doby tlačítko v UI není.

**Nejistota:** vysoká. Rám může znamenat budoucí metronom. Bez potvrzení nestavět.

**Start:** až po plánu A, úkol 6, a až po rozhodnutí, co se přehrává.

- [ ] **Step 1:** Zeptat se, jestli jde o audio soubor, metronom, nebo jen statický proužek (ten už řeší plán A).
- [ ] **Step 2:** Když soubor: návrh úložiště, migrace až po potvrzení, žádný secret ve veřejné URL navíc proti dnešním fotkám.
- [ ] **Step 3:** Ovládání 1,0× a Zastavit napojit na ten zdroj. `prefers-reduced-motion` zvuk nevypíná; vypíná ho jen Zastavit a ztlumení.
- [ ] **Step 4:** Test: píseň bez souboru tlačítko neukáže, stránka akordů zůstane.

---

### Task 8: Filtr zdroje návrhu písně

**Rám:** `Telefon · Návrhy písní` (Vše / Ručně / Z fotky / Z PDF).

**Co rám ukazuje:** frontu rozdělenou podle toho, jak text vznikl.

**Co chybí:** `nahledUrl` a `problem` na návrhu jsou, sloupec `zdroj` není. Import fotky a PDF může skončit stejným náhledem, takže z URL nepoznáme PDF od fotky. Ruční návrh má `nahledUrl` null — to jediné je dnes jisté a plán A podle toho nefiltruje, jen ukáže náhled.

**Návrh:** sloupec `zdroj` s hodnotami `rucne | fotka | pdf`, plněný v `POST /api/zpevnik/navrhy` a `POST /api/zpevnik/import`. Čipy filtrují `GET /api/zpevnik/navrhy`.

**Nejistota:** střední. Když implementace importu ukládá MIME mimo sloupec (v objektu, který jsem v `zpevnik_pisne` nenašel), stačí ho vyčíst a sloupec není potřeba. Před migrací znovu otevřít `server/src/zpevnik-import.ts`.

**Start:** až po plánu A, úkol 6.

- [ ] **Step 1:** V `zpevnik-import.ts` ověřit, jestli se druh souboru někam zapisuje. Když ano, filtr je klientský a migrace se škrtá.
- [ ] **Step 2:** Když ne, sloupec až po potvrzení migrace.
- [ ] **Step 3:** Čipy na frontě.
- [ ] **Step 4:** Test: ruční návrh není v „Z PDF“; PDF návrh není v „Z fotky“.

---

## Co v plánu B není, protože to plán A pokryje bez nové tabulky

- Ověření kódu před registrací (`POST /api/kody/overit` jen čte existující řádky).
- „Zůstat přihlášený“ jako jiný `maxAge` cookie, bez sloupce.
- Sekce probíhajících a neuzavřených výprav z `datum` a `stav`.
- Kdo jede z `GET /api/expeditions/:id/ucastnici` (`createdAt`, kapacita, organizátor).
- Počty ve sheetu smazání z fotek, zpráv a účastníků.
- Sheety schůzky bez data konce, docházka přes `PATCH …/uzavrit`, ruční km a Strava přes existující endpointy.
- `GET /api/admin/codes` pro živé kódy.
- `narozeniny` a `pocetFotek` na `UserListItem` z existujících sloupců.
- `GET /api/expeditions?ucastnik=` joinem `participants`.
- Instalace na plochu přes `beforeinstallprompt`.
- Počet členů obecného chatu z `GET /api/users`.

## Ověření po všech vybraných úkolech

- [ ] `npm test`, `npm run typecheck`, `npm run server:typecheck`.
- [ ] V prohlížeči jen ty rámy, jejichž úkol uživatel pustil. Ostatní mezery zůstávají schované, jak je nechal plán A.
- [ ] Migraci nespouštět v tomto plánovacím kroku.
