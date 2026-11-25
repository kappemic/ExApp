# Pen redesign — integrace existujícího chování

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přepsat členské i admin obrazovky podle telefonních rámů v `file:///C:/Users/kilpa/Downloads/ExApp.pen` tak, aby na desktopu (1440 px) byly širší variantou stejných stránek, a napojit jen chování, které už má API nebo jde doplnit bez nové tabulky.

**Architecture:** Nejdřív shell (tokeny pera, písmo, spodní lišta, sheet, motion). Pak obrazovky v členském pořadí. `/vypravy` včetně kalendáře a formulářů už je redesign C2 — ty úkoly tokeny a layout srovnají s perem, nestaví stránku znovu. Desktopové rámy `ExApp · … (redesign)` a `ExApp · Přihlášení` / `ExApp · Registrace` jsou stejné komponenty od `lg` (1440). Telefon je 390 px, spodní lišta 76 px. Nové routy jen tam, kde obrazovka dnes nemá URL (`/vice`, `/nastaveni`, `/cleny/:id`). Sheety zůstávají nad aktuální stránkou. Žádná migrace, žádný zápis do `expeditions.generated.json`, žádný commit, dokud o něj uživatel nepožádá.

**Tech Stack:** Vite, React 19, Tailwind 4, Express 5 na `:3001`, Neon + Drizzle, JWT cookie `exapp_session`. Motion jen CSS (v repu není `motion` / `framer-motion`).

**Spec:** `file:///C:/Users/kilpa/Downloads/ExApp.pen` (rámy `Telefon · …` a stejnojmenné desktopové `ExApp · …`). Mimo stránky: Sitemap, knihovna vzorků, `ExApp · Stavy a limity`.

## Global Constraints

- Čeština v UI i doménových názvech. Komentáře v kódu anglicky.
- Oprávnění zůstávají na guardech `vyzadujPrihlaseni`, `vyzadujSpravceVyprav`, `vyzadujAdmina`, `vyzadujSuperadmina`. Role se čtou z DB, nikdy z tokenu.
- Mobile-first, dotykový cíl 44 px, vstupy `16px`, `prefers-reduced-motion`.
- Primární akcent pera je terracotta `#A8461C`. Okrová `#7A5B22` jen tam, kde ji rám opravdu používá. Na `bg-okr` zůstává `text-inkoust`.
- Okraj polí není `linka` (`#E4DFCE` je na to světlá). `--color-pole` nechat na kontrastu ≥ 3:1.
- Kontrakt v `src/shared/api-typy/` jen aditivně. `api-types.ts` je re-export.
- Hotovo až po `npm test`, `npm run typecheck`, `npm run server:typecheck`.
- Diff nesmí obsahovat přepsaný `src/data/expeditions.generated.json`, pokud nebyl záměr.
- Discord webhook je secret. Výpadek Discordu nesmí shodit request.
- Část testů čte zdroj jako text. Když po změně lišty nebo tokenu spadne, upravit ho jen když se změnilo záměrné chování (zejména `tests/navbar-mobil-nav.test.ts`).

## Review Focus

- Člen bez admina vidí Pozvánkové kódy, Smazat výpravu, Docházku nebo Správu člena. Očekávání: tlačítko není v DOM, API dál vrací 403. Test patří k úkolu 3, 4 a 10.
- Primární tlačítko zůstane okrové (`bg-okr` / `#d99b26`) místo terracotta. Očekávání: Přihlásit se, Vytvořit výpravu a Uložit docházku jedou na `bg-akcent`. Test patří k úkolu 1.
- Sheet nebo vstup stránky se hýbe při `prefers-reduced-motion: reduce`. Očekávání: bez translate a bez list entrance. Test patří k úkolu 1.
- Input na telefonu má font pod 16 px a iOS přiblíží stránku. Očekávání: textová pole auth, výpravy, schůzky a chatu mají `text-base`. Kontrola v úkolu 2 a 3.
- Spodní lišta má položku pod 44 px nebo schová Chat jen do hlavičky. Očekávání: pět položek Výpravy, Fotky, Zpěvník, Chat, Více, Chat drží unread tečku. Test `tests/navbar-mobil-nav.test.ts` v úkolu 1.

## Mapování tokenů (úkol 1 je závazný pro ostatní)

| Pero | CSS | Použití |
| --- | --- | --- |
| paper `#F7F4EB` | `--color-papir` | pozadí stránky |
| surface `#FFFDF6` | `--color-povrch` | karty, sheet |
| surface-2 `#F1EDE0` | `--color-povrch-2` | druhý podklad |
| ink `#1C2615` | `--color-inkoust` | text |
| ink-2 `#55604A` | `--color-mech` | druhý řádek |
| ink-3 `#6A7157` | `--color-ink-3` | meta |
| line `#E4DFCE` | `--color-linka` | vlasová linka, ne okraj inputu |
| brand `#2E4022` | `--color-smrk` | značka, vybraná položka |
| brand-100 `#E8EDDA` | `--color-mlha` | vybraný řádek, jemný podklad |
| accent `#A8461C` | `--color-akcent` | primární tlačítko, aktivní tab |
| accent-100 `#F7E7DC` | `--color-akcent-100` | jemný terracotta podklad |
| ochre `#7A5B22` | `--color-jantar` a `--color-okr` | jen okrový text a okrová plocha z rámu |
| ochre-100 `#F3EADB` | `--color-okr-100` | okrový podklad |
| sage `#7E9370` | `--color-salvej` | klidný stav, ne primární CTA |
| display | `--font-display` | Bricolage Grotesque Variable, už self-hosted |
| body | `--font-sans` | Onest Variable, už self-hosted |

Primární tlačítko: `bg-akcent text-papir`. Okrová plocha dál `bg-okr text-inkoust`, ale nové obrazovky ji nedávají na hlavní akci.

## Klasifikace, která zůstává v tomto plánu

- **EXISTS** — API i chování už jsou, mění se layout.
- **PARTIAL** — bez nové tabulky. U každého je napsaný endpoint, nebo že jde o čistě klientskou změnu.

Do plánu B patří jen to, co potřebuje novou tabulku nebo sloupec, nebo model, který v DB není (online presence, uzávěrka přihlášek, konec řady schůzek, role a popisek kódu, historie použitých kódů, vzkaz u přihlášky, kategorie písně, přehrávání, editovatelné pravomoci a Discord přepínače).

---

### Task 1: Shell, tokeny, lišta, sheet, motion

**Vizuální zdroj:** `Telefon · Spodní lišta`, `Telefon · Stavový řádek` (bez falsování systémového času), desktopové rámy od `lg`.

**Files:**
- Modify: `src/index.css` (`@theme` a existující `prefers-reduced-motion` bloky)
- Modify: `src/components/vypravy-nahled/nocturne.css` (`.nahled-press`, přechody dialogu; paleta 12f drží jen proměnné z úkolu)
- Modify: `src/components/Navbar/Navbar.tsx` (`MOBIL_POLOZKY`, `MobileBar`, `AppHeader`)
- Modify: `src/App.tsx` (odstup nad lištou, routy `/vice` a `/nastaveni` až jako prázdné napojení v úkolu 9)
- Create: `src/components/shell/SpodniSheet.tsx`
- Modify: `tests/navbar-mobil-nav.test.ts`
- Test: `tests/navbar-mobil-nav.test.ts`, nový `tests/pen-tokeny.test.ts` (čte `src/index.css` jako text)

**Interfaces:**
- Consumes: nic z pozdějších úkolů.
- Produces: třídy `bg-papir`, `bg-povrch`, `bg-akcent`, `text-inkoust`, `font-display`, `font-sans`. Komponenta `SpodniSheet({ otevreno, titulek, onZavrit, children })`. Lišta vede na `/vypravy`, `/fotky`, `/zpevnik`, `/chat`, `/vice`. Unread chat zůstává na položce Chat (`useKonverzacePrehled`). Od `lg` spodní lišta mizí a zůstává horní navigace na stejné cíle plus Profil. Motion třídy: `exapp-vstup` (stránka), `exapp-sheet` (sheet zdola), `exapp-radek` (krátký vstup řádku), existující `nahled-press` (stisk). Pod `prefers-reduced-motion: reduce` jsou transform i animace vypnuté.

- [ ] **Step 1:** V `tests/pen-tokeny.test.ts` očekávat hex z tabulky výše (`#F7F4EB`, `#A8461C`, `#7A5B22`, `#2E4022`) a v `tests/navbar-mobil-nav.test.ts` pět cílů v tomto pořadí: `/vypravy`, `/fotky`, `/zpevnik`, `/chat`, `/vice`.
- [ ] **Step 2:** `npx vitest run tests/pen-tokeny.test.ts tests/navbar-mobil-nav.test.ts` — oba spadnou na starých tokenech a staré liště.
- [ ] **Step 3:** Přepsat tokeny a lištu. `SpodniSheet` je portal, `role="dialog"`, zavření Esc a křížkem, focus na první tlačítko, návrat focusu po zavření. Primární akce v shellu (žádná, dokud obrazovky) nepřidávat. `--color-pole` neměnit na `#E4DFCE`.
- [ ] **Step 4:** Stejný vitest projde. V prohlížeči na 390 px je lišta pět položek, každá ≥ 44 px; na 1440 px lišta není a horní nav vede na stejné stránky. Zapnuté reduced motion nese na `SpodniSheet` třídu bez animace (kontrola ve DevTools).

---

### Task 2: Vstup — přihlášení, kód, registrace

**Vizuální zdroj:** `Telefon · Přihlášení`, `Telefon · Pozvánkový kód`, `Telefon · Registrace`. Desktop: `ExApp · Přihlášení`, `ExApp · Registrace`, `ExApp · Pozvánkový kód`.

**Klasifikace:** EXISTS `POST /api/login`, `POST /api/register` přes `useAuth.login` / `useAuth.register` (`src/hooks/useAuth.ts`, `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`). PARTIAL, bez tabulky: dvoukrokový klient na jedné registrační stránce; ověření kódu před účtem rozšíří `POST /api/register` tak, že nové volání `POST /api/kody/overit` jen čte `registration_codes` (platný = `expires_at > now()`, kód se nespotřebuje). PARTIAL: `POST /api/login` přijme aditivní `{ zustat?: boolean }`. `zustat: true` nechá dnešní `SESSION_MAX_AGE_MS` (7 dní). `zustat: false` nebo chybějící pole nastaví session cookie bez `maxAge`. Role kódu, popisek a historie použitých kódů se neukládají (plán B) — na kartě kódu je jen samotný kód a „ověřeno“.

**Files:**
- Modify: `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`, `src/hooks/useAuth.ts`
- Modify: `server/src/ucty-routes.ts` (`registrujUcty`)
- Modify: `src/shared/api-typy/ucty.ts` (aditivní tělo loginu a odpověď ověření: `{ platny: true, expiresAt: string }`)
- Test: `tests/validace.test.ts` nebo nový `tests/overeni-kodu.test.ts` na validaci kódu; existující registrační testy nesmí začít vyžadovat roli kódu

**Interfaces:**
- Consumes: `SpodniSheet` se tu nepoužívá. Tokeny z úkolu 1.
- Produces: `overKod(kod: string): Promise<{ ok: true, expiresAt: string } | { ok: false, chyba: string }>`. Po úspěchu krok 2 volá stávající `register`.

- [ ] **Step 1:** Test: neznámý kód na `POST /api/kody/overit` → 422 / česká hláška z `VALIDACNI_ZPRAVY`, platný kód → 200 a v `registration_codes` se řádek nesmaže. Login bez `zustat` zůstane platný (starý klient).
- [ ] **Step 2:** Test spadne, dokud route není.
- [ ] **Step 3:** Obrazovky srovnat s rámy. Krok 1 = kód + Vložit (clipboard) + Ověřit kód + odkaz na login. Krok 2 = jméno, příjmení, e-mail, heslo, Vytvořit účet. Login: e-mail, heslo, Zůstat přihlášený, odkaz „Zadej kód“. Žádný popisek role „Člen“ jako uložený údaj kódu. Inputy `text-base`, tlačítka `min-h-11 bg-akcent text-papir`.
- [ ] **Step 4:** `npx vitest run tests/overeni-kodu.test.ts tests/registrace-skola-trida.test.ts`. V prohlížeči: špatný kód zůstane na kroku 1, platný kód pustí na krok 2, registrace skončí přihlášením na `/vypravy`. Na 1440 px stejný formulář ve středu, bez spodní lišty.

---

### Task 3: Výpravy, detail, kdo jede, přihláška, smazání, nová výprava

**Vizuální zdroj:** `Telefon · Výpravy`, `Telefon · Detail výpravy`, `Telefon · Detail výpravy · proběhlá`, `Telefon · Detail výpravy · víc lidí`, `Telefon · Kdo jede`, `Telefon · Nová výprava`, `Telefon · Modul · Přihlášení na výpravu`, `Telefon · Modul · Smazat výpravu`. Desktop: `ExApp · Výpravy (redesign)`, `ExApp · Detail výpravy (redesign)`, `ExApp · Nová výprava (redesign)`, `ExApp · Kdo jede`.

**Klasifikace:** EXISTS a jde jen srovnat, protože C2 už běží v `src/pages/VypravyNahledPage.tsx`. Seznam a detail: `useExpeditions`, `src/lib/expeditions-api.ts` (`GET /api/expeditions`, `GET /api/expeditions/:id`). Účast: `GET /api/expeditions/:id/ucastnici`, `POST …/prihlasit`, `DELETE …/odhlasit` (`src/lib/expeditions-ucast.ts`). Smazání: `DELETE /api/expeditions/:id` pod `vyzadujSpravceVyprav`. Formulář: `ExpeditionForm` už má `nazev`, `datum`, `datumDo`, `sraz`, `popis`, `trasaOdkaz`, `kapacitaCelkem` a snímky cesty (`POST /api/expeditions/:id/cesta-snimky`). Diskuze na detailu: `GET/POST /api/expeditions/:id/zpravy`. Deep link zůstává `?vyprava=` (`src/lib/vyprava-deep-link.ts`).

PARTIAL, jen klient:
- Filtry Vše / Nejbližší / Neuzavřené a sekce Probíhající, Nadcházející, Čeká na uzavření, Proběhlo skládat z `datum`, `datumDo` a `stav` (probíhající = dnes leží v rozsahu a stav není `proběhlá`; čeká na uzavření = konec je v minulosti a stav není `proběhlá`). Žádný nový stav v DB.
- `Telefon · Kdo jede` je plná plocha nad stejným `GET …/ucastnici`. `createdAt` je datum přihlášení, `organizatorId` označí „Organizuje“, `kapacitaCelkem - prihlaseno` jsou volná místa. Hledání filtruje pole na klientu.
- Počty v sheetu Smazat (docházka, fotky, zprávy) sečíst z existujících `GET …/ucastnici`, `GET …/fotky`, `GET …/zpravy`. Nemazat, dokud uživatel nepotvrdí `DELETE`.
- Přihláška volá `POST …/prihlasit` bez těla. Pole „Vzkaz pro vedoucího“ a řádek „Uzávěrka“ nevykreslovat (plán B).

**Files:**
- Modify: `src/pages/VypravyNahledPage.tsx`, `src/components/vypravy-nahled/*`, `src/components/expeditions/ExpeditionForm.tsx`, `src/components/expeditions/ExpeditionModal.tsx` (detail může zůstat na `?vyprava=`, vizuálně full-screen sheet na telefonu a širší panel na `lg`)
- Modify: `src/lib/expedice-filtr.ts` (sekce a „probíhající“)
- Test: `tests/expedice-filtr.test.ts`, `tests/vyprava-deep-link.test.ts`, `tests/obsazenost-vypravy.test.ts`

**Interfaces:**
- Consumes: `SpodniSheet`, tokeny.
- Produces: `rozdelVypravy(seznam, dnes: string): { probihajici, nadchazejici, cekaNaUzavreni, probehle }` v `src/lib/expedice-filtr.ts`. Detail dál čte `?vyprava=`.

- [ ] **Step 1:** Testy na `rozdelVypravy`: výprava s `datum <= dnes <= datumDo` a stavem jiným než `proběhlá` spadne do probíhajících; po konci a před uzavřením do „čeká“; `stav: "proběhlá"` do proběhlých.
- [ ] **Step 2:** `npx vitest run tests/expedice-filtr.test.ts` spadne na nové větvi.
- [ ] **Step 3:** Srovnat seznam, detail (málo lidí, víc lidí, proběhlá s km a odkazem na album), Kdo jede, sheet přihlášky a sheet smazání. Nová výprava používá existující pole formuláře, primární tlačítko `bg-akcent`. Smazat a Upravit jen když `vyzadujSpravceVyprav` na klientu odpovídá stejnému pravidlu jako server (správce výprav). Popis, kapacita a odkaz na trasu zůstanou v datech, i když je rám schová do srazu.
- [ ] **Step 4:** `npx vitest run tests/expedice-filtr.test.ts tests/vyprava-deep-link.test.ts tests/obsazenost-vypravy.test.ts`. Prohlížeč 390 px: seznam → detail → přihlášení změní „1 z 15“ po refreshi z API. Člen tlačítko Smazat nevidí. 1440 px: stejný detail širší, lišta dole není.

---

### Task 4: Kalendář a schůzky

**Vizuální zdroj:** `Telefon · Kalendář`, `Telefon · Modul · Nová schůzka`, `Telefon · Modul · Detail schůzky`. Desktop: `ExApp · Kalendář (redesign)`.

**Klasifikace:** EXISTS. Kalendář je režim `/vypravy?zobrazeni=kalendar` (`NahledKalendar`, `src/lib/kalendar.ts`, `src/lib/agenda.ts`). Schůzky: `GET/POST/PATCH/DELETE /api/meetings` a `DELETE /api/meetings/:id/occurrence` přes `src/lib/schuzky-api.ts`. Guard zápisu: `vyzadujSpravceVyprav`. Opakování jen `jednorazova | tydenni`.

PARTIAL, klient: přepínač Seznam / Kalendář na výpravách vede na existující `zobrazeni`. Sheet nové schůzky posílá `nazev`, `datum`, `cas`, `opakovani`, `mistnost`. Datum „do 15. 12.“ neposílat a neukládat (plán B). Detail ukáže výskyty, které `vyskytySchuzky` už umí, včetně zrušení jednoho výskytu.

**Files:**
- Modify: `src/pages/VypravyNahledPage.tsx`, `src/components/vypravy-nahled/NahledKalendar.tsx`, `src/components/kalendar/SchuzkaForm.tsx`, `src/components/kalendar/UdalostModal.tsx`
- Test: `tests/kalendar.test.ts`, `tests/schuzky-validace.test.ts`

**Interfaces:**
- Consumes: `SpodniSheet`. `vytvorSchuzku` / `upravSchuzku` / `smazSchuzku` beze změny signatury.
- Produces: nic nového pro pozdější úkoly. Docházka výpravy není schůzka (úkol 10 ji nevolá).

- [ ] **Step 1:** Neměnit kontrakt `OpakovaniSchuzky`. Test kalendáře dál očekává týdenní výskyt bez data konce.
- [ ] **Step 2:** Spustit `npx vitest run tests/kalendar.test.ts tests/schuzky-validace.test.ts` a nechat ho zelený před úpravou UI, ať je vidět, že se kontrakt nerozbil.
- [ ] **Step 3:** Kalendář srovnat s rámem (měsíc, vybraný den, seznam událostí dne, vícedenní výprava). Sheety přes `SpodniSheet`. Člen bez správy výprav nevidí „Nová schůzka“, „Upravit“ ani „Zrušit termín“.
- [ ] **Step 4:** Stejné dva testy projdou. Prohlížeč: vytvořená schůzka je po refreshi v `GET /api/meetings` a v daném dni. Reduced motion: sheet neskáče.

---

### Task 5: Fotky, album, nahrání

**Vizuální zdroj:** `Telefon · Fotky`, `Telefon · Album`, `Telefon · Modul · Nahrát fotky`. Desktop: `ExApp · Fotky (redesign)`, `ExApp · Album (redesign)`.

**Klasifikace:** EXISTS. Alba výprav jsou `GET /api/expeditions/:id/fotky`. Vlastní alba: `GET/POST /api/alba`, `GET/POST /api/alba/:id/fotky`, mazání a koš v `src/lib/alba-api.ts`. Stránka `src/pages/FotkyPage.tsx` na `/fotky` a `/fotky/:albumId`. Stahování: `src/lib/fotky-stahovani.ts`, `src/hooks/useFotkyStahovani.ts`.

PARTIAL, klient: hledání alba filtruje načtený seznam. Segmenty Všechna / Výpravy / Různé = výpravová alba versus `druh` vlastního alba (`popisekDruhu` v `alba-api`). Sheet nahrání pošle soubory na existující `POST` alba nebo výpravových fotek. Limit 8 MB nechat na serverové validaci, text v sheetu smí říct to, co validace opravdu vrací.

**Files:**
- Modify: `src/pages/FotkyPage.tsx`, `src/components/fotky/*`
- Test: `tests/fotky-slozky-layout.test.ts`, `tests/alba-fotky-klient.test.ts`

**Interfaces:**
- Consumes: `SpodniSheet`, tokeny.
- Produces: nic, na co sahá úkol 6+. Detail proběhlé výpravy z úkolu 3 odkazuje na `/fotky/:albumId` nebo existující expediční album.

- [ ] **Step 1:** Pokud `tests/fotky-slozky-layout.test.ts` hlídá staré třídy, přepsat assertion na nové obaly jen tam, kde se mění záměrný layout (ne počet alb).
- [ ] **Step 2:** `npx vitest run tests/fotky-slozky-layout.test.ts tests/alba-fotky-klient.test.ts`.
- [ ] **Step 3:** Seznam, album a sheet. Stáhnout v albu volá existující stahování. Nahrát jen pro roli, kterou pustí daná route dnes.
- [ ] **Step 4:** Testy projdou. Prohlížeč: nahrání jedné malé fotky do vlastního alba ji po refreshi ukáže. Prázdné album ukáže prázdný stav, ne spadlý layout. 390 i 1440.

---

### Task 6: Zpěvník, píseň, návrhy

**Vizuální zdroj:** `Telefon · Zpěvník`, `Telefon · Píseň`, `Telefon · Návrhy písní`, `Telefon · Modul · Návrh písně`. Desktop: `ExApp · Zpěvník (redesign)`, `ExApp · Píseň (redesign)`, `ExApp · Návrhy písní (redesign)`.

**Klasifikace:** EXISTS. `GET /api/zpevnik`, `GET /api/zpevnik/:id`, `PATCH/DELETE /api/zpevnik/:id`, návrhy `GET/POST /api/zpevnik/navrhy`, `POST …/schvalit`, `DELETE …/navrhy/:id`, import `POST /api/zpevnik/import` (`src/lib/zpevnik-api.ts`, `src/pages/ZpevnikPage.tsx`, `ZpevnikPisenPage.tsx`, `ZpevnikNavrhPage.tsx`, `ZpevnikFrontaPage.tsx`). Transpozice je v `src/lib/zpevnik-transpozice.ts`.

PARTIAL, klient: „Načíst dalších 12“ řeže už načtenou knihu, API stránkování nemá. Hledání zůstává klientské. Akordový proužek dole je výpis akordů z `telo`, ne přehrávač. Návrh písně: záložky Zapsat / Z fotky / Z PDF volají existující `vytvorNavrh` a `nahrejSoubor` / import. Filtry fronty Ručně / Z fotky / Z PDF nefiltrovat podle neexistujícího sloupce — fronta ukáže všechny `stav: "navrh"` a `nahledUrl` jen jako náhled. Čipy Táborové / Klubové a tlačítko „1,0× Zastavit“ nevykreslovat (plán B). Schválit smí jen role, kterou pustí `schvalNavrh` dnes.

**Files:**
- Modify: `src/pages/ZpevnikPage.tsx`, `src/pages/ZpevnikPisenPage.tsx`, `src/pages/ZpevnikNavrhPage.tsx`, `src/pages/ZpevnikFrontaPage.tsx`, `src/components/zpevnik/*`
- Test: `tests/zpevnik-stranka.test.ts`, `tests/zpevnik-akordy.test.ts`

**Interfaces:**
- Consumes: tokeny, `SpodniSheet` pro návrh.
- Produces: odkaz z Více (úkol 9) na `/zpevnik/fronta` beze změny URL.

- [ ] **Step 1:** Test stránky nesmí začít vyžadovat kategorie ani audio prvek.
- [ ] **Step 2:** `npx vitest run tests/zpevnik-stranka.test.ts tests/zpevnik-akordy.test.ts`.
- [ ] **Step 3:** Seznam, detail písně (transpozice zůstává), fronta Vydat = `schvalNavrh`, Odmítnout = `smazNavrh`, sheet návrhu.
- [ ] **Step 4:** Testy projdou. Prohlížeč: návrh textem se objeví ve frontě; člen bez práva schválit nevidí Vydat. 390 i 1440.

---

### Task 7: Chat a obecný kanál

**Vizuální zdroj:** `Telefon · Chat`, `Telefon · Chat · Obecný`. Desktop: `ExApp · Chat (redesign)`.

**Klasifikace:** EXISTS. `src/pages/ChatPage.tsx`, `src/lib/diskuze-api.ts`: `GET /api/diskuze/konverzace`, `GET/POST /api/diskuze/zpravy` (general), `dulezite`, `GET/POST /api/diskuze/soukrome`, skupiny `getSkupiny` / `getSkupinaZpravy` / `posliSkupinaZpravu`, výpravová vlákna `GET/POST /api/expeditions/:id/zpravy`. Unread: `useKonverzacePrehled`.

PARTIAL, klient: segmenty Vše / Globální / K výpravám / Soukromé filtrují už vrácený seznam. „Obecný“ je kanál `general`, ne nová tabulka. Počet členů u obecného vlákna = počet z `GET /api/users` (každý přihlášený). Řádek „2 online“ nevykreslovat (plán B). Ukázkové skupiny Vedení, Digitál, Archiv jsou data v `chat_skupiny`, ne hardcoded názvy.

**Files:**
- Modify: `src/pages/ChatPage.tsx`, `src/components/chat/ConversationList.tsx`, `src/components/chat/KonverzaceDetail.tsx`, `src/components/chat/Composer.tsx`
- Test: `tests/chat-konverzace-step3.test.ts`, `tests/navbar-unread-badge.test.ts`

**Interfaces:**
- Consumes: tokeny. Lišta z úkolu 1 už ukazuje unread.
- Produces: z profilu člena (úkol 10) půjde otevřít existující soukromé vlákno `soukrome:<userId>`.

- [ ] **Step 1:** Nepřidávat presence pole do kontraktu diskuze. Test unread pořád čeká tečku, ne číslo online.
- [ ] **Step 2:** `npx vitest run tests/chat-konverzace-step3.test.ts tests/navbar-unread-badge.test.ts`.
- [ ] **Step 3:** Seznam a vlákno Obecné srovnat s rámy. Odeslání volá `posliGlobalZpravu`. Přílohy nechat na existujícím `VyberPriloh`, pokud se do šířky 390 vejdou bez nové funkce.
- [ ] **Step 4:** Testy projdou. Prohlížeč: zpráva v Obecném zůstane po refreshi. Filtr Soukromé schová výpravová vlákna. 390 i 1440.

---

### Task 8: Žebříčky a statistiky

**Vizuální zdroj:** `Telefon · Žebříčky`, `Telefon · Statistiky`, `Telefon · Modul · Spárovat aktivitu`, `Telefon · Modul · Ruční zápis`. Desktop: `ExApp · Žebříčky (redesign)`, `ExApp · Statistiky (redesign)`.

**Klasifikace:** EXISTS. `GET /api/zebricky?obdobi=celkem|YYYY` (`src/lib/zebricky-api.ts`, `src/pages/ZebrickyPage.tsx`). `GET /api/statistiky/moje` (`src/lib/statistiky-api.ts`). Strava: `GET /api/strava/stav`, `GET /api/strava/neparovane`, `POST /api/expeditions/:id/strava-parovani`, `POST /api/expeditions/:id/aktivita-ruchne` (`src/lib/strava-api.ts`). Heatmapa: `GET /api/zebricky/trasy` a `src/components/profil/Heatmapa.tsx`.

PARTIAL, klient: čipy Celkem / rok čtou existující `obdobi`. Ruční zápis a spárování jsou sheety nad uzavřenou výpravou, ne samostatná stránka bez `expeditionId`. Statistiky dnes žijí na záložce profilu — nová plocha `/` ne, ale sekce nebo trasa `/profil?tab=statistiky` smí vypadat jako `Telefon · Statistiky`, data pořád z `getMojeStatistiky`. „Zapsat kilometry ručně“ otevře sheet až po výběru proběhlé výpravy z `aktivity` v odpovědi statistik.

**Files:**
- Modify: `src/pages/ZebrickyPage.tsx`, `src/pages/ProfilPage.tsx` (záložka statistik jako plocha rámu), `src/components/zebricky/ZebrickyHeatmapa.tsx`, `src/components/profil/Heatmapa.tsx`
- Create: sheety mohou žít v `src/components/statistiky/SparovatAktivituSheet.tsx` a `RucniZapisSheet.tsx`
- Test: `tests/zebricky.test.ts`, `tests/statistiky.test.ts`, `tests/aktivita-rucne.test.ts`, `tests/strava-parovani.test.ts`

**Interfaces:**
- Consumes: `SpodniSheet`, `sparujAktivitu(expeditionId, activityId)`, `ulozRucniAktivitu` (existující funkce v `strava-api` — implementace použije dnešní export, signaturu nemění).
- Produces: Více odkazuje na `/zebricky` a na statistiky profilu.

- [ ] **Step 1:** Testy kontraktu žebříčku a ruční aktivity nechat zelené před vizuální změnou (`npx vitest run tests/zebricky.test.ts tests/aktivita-rucne.test.ts`).
- [ ] **Step 2:** Sheety nesmí posílat km bez `expeditionId`.
- [ ] **Step 3:** Žebříček a statistiky srovnat s rámy. Primární „Připojit Stravu“ = existující OAuth redirect. Ochre jen pokud ji daný rám má na štítku, ne na hlavním tlačítku.
- [ ] **Step 4:** `npx vitest run tests/zebricky.test.ts tests/statistiky.test.ts tests/aktivita-rucne.test.ts tests/strava-parovani.test.ts`. Prohlížeč: přepnutí roku znovu zavolá `GET /api/zebricky?obdobi=YYYY`. Ruční uložení se po refreshi objeví v `GET /api/statistiky/moje`.

---

### Task 9: Profil, Více, plocha, nastavení jen pro čtení

**Vizuální zdroj:** `Telefon · Profil`, `Telefon · Více`, `Telefon · Modul · Přidat na plochu`, `Telefon · Nastavení`. Desktop: `ExApp · Profil (redesign)`, `ExApp · Nastavení (redesign)`, `Menu · Více`.

**Klasifikace:** EXISTS. Profil: `GET/PATCH /api/me`, `POST /api/me/avatar` (`src/hooks/useProfile.ts`, `ProfileForm`). Odhlášení: `POST /api/logout`. Push: `src/lib/push-odber.ts` (`zapniOznameni` / `vypniOznameni`). PWA: `src/lib/pwa-historie.ts` a existující manifest. Položky, které profil už ukládá: e-mail, telefon, Discord, škola, třída, narozeniny.

PARTIAL, klient: `/vice` je nová stránka se seznamem odkazů. Žebříčky → `/zebricky`, Členové → `/cleny`, Statistiky → profilová plocha z úkolu 8, Pozvánkové kódy → `/admin/kody` jen pro admina (`RequireAuth adminOnly`), Návrhy písní → `/zpevnik/fronta` jen když uživatel frontu smí, Nastavení → `/nastaveni`, Odhlásit se → `odhlasit`. Nápověda a O ExApp jsou statické sheety bez API. „Přidat na plochu“ chytí `beforeinstallprompt`, když prohlížeč event dá; jinak krátká česká nápověda (iOS Sdílet). Žádná tabulka.

`Telefon · Nastavení` v tomto plánu ukáže pravomoci jako text z `src/config/roles.ts` (kdo zakládá výpravu, kdo schůzku, kdo povyšuje). Bez tlačítka Uložit a bez přepínačů Discordu (plán B). Push oznámení na této stránce volají existující `zapniOznameni`.

**Files:**
- Create: `src/pages/VicePage.tsx`, `src/pages/NastaveniPage.tsx`
- Modify: `src/App.tsx` (routy), `src/pages/ProfilPage.tsx`, `src/components/profil/ProfileForm.tsx`
- Test: `tests/profil-step7.test.ts`, `tests/pwa-historie.test.ts`, nový `tests/vice-odkazy.test.ts` (zdrojový kontrakt: admin položka kódů není v `VicePage` mimo větev admina)

**Interfaces:**
- Consumes: `useAuth` (`user`, `odhlasit`, příznaky admin / superadmin už v hooku).
- Produces: `/vice`, `/nastaveni`.

- [ ] **Step 1:** `tests/vice-odkazy.test.ts` očekává, že odkaz na `/admin/kody` je uvnitř podmínky admina.
- [ ] **Step 2:** Test spadne, dokud stránka neexistuje.
- [ ] **Step 3:** Profil jako read-only karta rámu plus editace přes existující formulář (stejná pole, ne nová). Sheet instalace. Nastavení jen ke čtení plus existující push.
- [ ] **Step 4:** `npx vitest run tests/vice-odkazy.test.ts tests/profil-step7.test.ts tests/pwa-historie.test.ts`. Prohlížeč jako člen: Více nemá kódy. Jako admin: má. Odhlášení skončí na `/login`. 390 i 1440.

---

### Task 10: Členové, člen, správa, docházka, kódy

**Vizuální zdroj:** `Telefon · Členové`, `Telefon · Člen`, `Telefon · Modul · Správa člena`, `Telefon · Modul · Docházka`, `Telefon · Pozvánkové kódy`. Desktop: `ExApp · Členové (redesign)`, `ExApp · Člen (redesign)`, `ExApp · Pozvánkové kódy (redesign)`.

**Klasifikace:** EXISTS. Seznam účtů: `GET /api/users` pro každého přihlášeného (`server/src/clenove-routes.ts`), telefon jen když `vidiTelefonyClenu`. Úprava trojice: `PATCH /api/users/:id` pod `vyzadujSuperadmina` (`src/lib/admin-clenove.ts` `ulozRoliClena`). Docházka: `PATCH /api/expeditions/:id/uzavrit` s `{ dochazka }` (`uzavritVypravu` v `src/lib/expeditions-ucast.ts`), guard `vyzadujSpravceVyprav`. Kódy: `POST /api/admin/codes` (`useAuth.generujKod`). `GET /api/clenove` je starý read model `clenove` jen pro admina — obrazovka členů čte `GET /api/users`, ne tuhle legacy tabulku.

PARTIAL, bez tabulky:
- Route `/cleny/:id` složí kartu z položky `GET /api/users`. `narozeniny` v `UserListItem` chybí, sloupec `users.narozeniny` existuje — aditivně ho přidat do položky seznamu (stejné pravidlo viditelnosti jako telefon, ať se cizí datum nerozlije všem, pokud `vidiTelefonyClenu` je už ta hranice; když je telefon vidět všem správcům, narozeniny jedou stejnou větví).
- Km a počet výprav člena vzít z `GET /api/zebricky?obdobi=celkem` podle `userId` (odpověď už má `vypravy` a `km`). Seznam jeho výprav: aditivní query `GET /api/expeditions?ucastnik=<userId>` joinuje existující `participants`, žádná nová tabulka. Když se query nestihne bezpečně, karta ukáže souhrn ze žebříčku a seznam výprav schová — nehádat řádky.
- Počet fotek: `COUNT` přes existující `photos.uploaded_by` a `alba_fotky.uploaded_by` jako aditivní pole `pocetFotek` na `UserListItem`. Žádná nová tabulka.
- „Napsat zprávu“ otevře soukromý chat z úkolu 7.
- Správa člena je `SpodniSheet` a `PATCH /api/users/:id` s `clenstvi`, `funkce`, `isAdmin`, `isSuperadmin`. Vidí ho jen superadmin.
- Docházka je sheet nad proběhlou / uzavíranou výpravou, stavy `ucastnil_se | omluven`, existující validace `dochazkaNeuplna`.
- Kódy: aditivní `GET /api/admin/codes` vrací živé řádky (`code`, `expiresAt`), guard `vyzadujAdmina`. Popisek, role kódu a sekce Použité neukládat a nevykreslovat (plán B). Poznámka ve formuláři se dnes zahazuje — pole Popisek v tomto plánu není, ať UI nelže.

**Files:**
- Modify: `src/pages/AdminClenovePage.tsx`, `src/pages/AdminKodyPage.tsx`, `src/components/Admin/CodesPanel.tsx`, `src/lib/admin-clenove.ts`, `src/hooks/useAuth.ts`
- Create: `src/pages/ClenDetailPage.tsx`
- Modify: `src/App.tsx` (`/cleny/:id`), `server/src/clenove-routes.ts`, `server/src/ucty-routes.ts`, `server/src/vypravy-routes.ts` (query `ucastnik`)
- Modify: `src/shared/api-typy/uzivatele.ts`, `src/shared/api-typy/ucty.ts`, `src/shared/api-typy/expedice.ts` (aditivní query)
- Test: `tests/admin-clenove.test.ts`, `tests/role-visibility.test.ts`, `tests/ucastnici-po-uzavreni.test.ts`, `tests/guard.test.ts`

**Interfaces:**
- Consumes: `SpodniSheet`, soukromý chat, `ulozRoliClena`, `uzavritVypravu`, `generujKod`.
- Produces: `GET /api/admin/codes` → `{ kody: { code: string, expiresAt: string }[] }`. `UserListItem.pocetFotek: number` a `narozeniny: string | null` (null když divák telefon nevidí). `ExpediceListQuery.ucastnik?: string`.

- [ ] **Step 1:** Test: `GET /api/admin/codes` bez admin session → 401/403; s adminem vrací jen neexpirované kódy a nikdy `usedBy`. `PATCH /api/users/:id` bez superadmina → 403. Query `ucastnik` neznámého id → prázdný seznam, ne 500.
- [ ] **Step 2:** Testy spadnou, dokud route a pole nejsou.
- [ ] **Step 3:** Obrazovky srovnat s rámy. Pozvat na seznamu členů vede na `/admin/kody`. Docházkový sheet neotvírá člen bez správy výprav.
- [ ] **Step 4:** `npx vitest run tests/admin-clenove.test.ts tests/role-visibility.test.ts tests/ucastnici-po-uzavreni.test.ts tests/guard.test.ts`. Prohlížeč: superadmin změní členství, refresh ukáže novou roli z `GET /api/users`. Vygenerovaný kód je v seznamu po novém načtení stránky (díky GET, ne jen paměti panelu).

---

### Task 11: Ověření celku

**Files:**
- Modify: jen testy, které v úkolech 1–10 záměrně změnily zdrojový kontrakt.
- Nemodifikovat: `src/data/expeditions.generated.json`.

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run typecheck` a `npm run server:typecheck`
- [ ] **Step 3:** Projít v prohlížeči na 390 px a 1440 px smyčku: login → výpravy → detail → kalendář → fotky → zpěvník → chat → žebříčky → profil → více. Admin navíc kódy a člena. Reduced motion zapnout u sheetu přihlášky a u vstupu seznamu výprav.
- [ ] **Step 4:** `git status` nesmí ukazovat `expeditions.generated.json` jako záměr. Commit nedělat.
