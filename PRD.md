# Product Requirements Document (PRD) – Klubová PWA Aplikace pro Výpravy

---

## 1. Přehled produktu (Product Overview)

### 1.1 Vize a cíl
Cílem projektu je vytvořit **Progresivní Webovou Aplikaci (PWA)** určenou pro turistické oddíly, kluby nebo skupiny přátel. Aplikace centralizuje plánování výprav, registraci účastníků, evidenci pravidelných schůzek, uchovávání statistik (propojení se **Strava API**) a interní komunikaci s automatickými notifikacemi do **Discordu**.

### 1.2 Cílové skupiny & Uživatelské role
1. **Člen / Účastník:**
   - Prohlíží si nadcházející výpravy a kalendář schůzek.
   - Přihlašuje se na výpravy a vidí, kdo další je přihlášen.
   - Sleduje své osobní statistiky (ujeté/usšlé km, převýšení, heatmapa tras, historie výprav).
   - Sleduje klubový žebříček (leaderboard).
2. **Admin / Vedoucí:**
   - Spravuje výpravy (vytváření, úprava, mazání, historie).
   - Generuje časově omezené registrační kódy (platné 10 minut).
   - Uzavírá proběhlé výpravy (docházka, nahrání fotek, propojení se Strava aktivitou).
   - Plánuje opakované schůzky a odesílá důležitá oznámení na Discord.

---

## 2. Funkční požadavky (Functional Requirements)

### 2.1 Autentizace & Registrační systém
- **Registrace s pozvánkovým kódem:**
  - Registrace nového uživatele je blokována bez platného kódu.
  - Admin může vygenerovat unikátní registrační kód s **exspirací 10 minut**.
  - Po úspěšné registraci se uživatelská data automaticky uloží do databáze.
- **Admin mód:**
  - Role jsou rozděleny na `Uživatel` a `Admin`.
  - Admin má přístup k rozšiřujícím ovládacím prvkům napříč celou aplikací.

### 2.2 Správa výprav & Přihlašování
- **Vytvoření výpravy:**
  - Admin zadává název, datum, sraz, popis a doplňující informace.
  - Vytvoření výpravy se automaticky propíše do Kalendáře.
- **Přihlašování na výpravu:**
  - Uživatel po kliknutí na výpravu uvidí **vyskakovací modal okno** s detailem akce.
  - Modal zobrazuje seznam již přihlášených účastníků a tlačítko pro přihlášení / odhlášení.
  - Pro Admina obsahuje modal navíc možnost **Upravit** a **Odstranit**.
- **Uzavření & Vyhodnocení výpravy (Po akci):**
  - Admin vybere reálné účastníky, kteří na výpravě byli.
  - Admin nahraje fotografie z akce.
  - Propojení se Stravou: Výprava se spáruje s poslední aktivitou ze Stravy (pokud ještě není přiřazena), čímž se automaticky doplní vzdálenost (km), převýšení a trasa.

### 2.3 Statistiky & Integrace se Strava API
- **Propojení účtu:** Uživatelský profil podporuje spárování se službou Strava.
- **Osobní statistiky uživatele:**
  - Počet absolvovaných výprav.
  - Celkový počet ušlých/ujetých km a nastoupané převýšení.
  - Seznam navštívených výprav.
  - **Heatmapa:** Vizuální mapa absolvovaných tras.
- **Leaderboard (Žebříček):**
  - Žebříček nejaktivnějších členů podle účasti na výpravách a nachozených kilometrů.

### 2.4 Kalendář & Schůzky
- **Integrovaný kalendář:**
  - Zobrazuje jak **výpravy**, tak **pravidelné schůzky**.
  - Výpravy se generují automaticky při vytvoření výpravy.
- **Opakované schůzky:**
  - Možnost naplánovat opakované schůzky s formulářovým políčkem pro zadání třídy / místnosti / oddílu.
- **Detail akce:**
  - Kliknutí na jakoukoliv událost v kalendáři otevře pop-up okno s podrobnými informacemi.

### 2.5 Komunikace & Discord Integrace
- **Interní komunikace:** Nástěnka / komunikátor v rámci aplikace pro diskuzi k výpravám.
- **Discord Oznámení:**
  - Důležitá oznámení a nové výpravy se automaticky odesílají do definovaného Discord kanálu pomocí **Discord Webhooku / Bota**.

---

## 3. Technická architektura (Technical Architecture)

```
[ PWA Frontend (React/Next.js/Vue) ]
          │
          ├── OAuth 2.0 ──────► [ Strava API ]
          │
          ├── Webhook / API ──► [ Discord API ]
          │
          └── Rest API / ORM ─► [ Backend & Neon.com (PostgreSQL) ]
                                 └── [ File Storage (Cloudinary/S3) pro fotky ]
```

### 3.1 Tech Stack
- **Frontend:** Progressive Web App (PWA) – možnost instalace na mobilní zařízení i desktop, responsive design.
- **Backend & Databáze:** Neon.com (Serverless PostgreSQL) pro ukládání uživatelů, výprav, kódů a statistik.
- **Media Storage:** Úložiště pro fotky z výprav (např. Cloudinary, Supabase Storage nebo AWS S3).
- **Integrace třetích stran:**
  - **Strava API:** Synchronizace aktivit (km, převýšení, trasy).
  - **Discord Webhook API:** Automatické zasílání notifikací.

---

## 4. Doporučený postup vývoje (Development Roadmap)

1. **Krok 1: PRD & Příprava databáze** *(Tento dokument)*
   - Návrh databázového schématu v Neon.com (Uživatelé, Kódy, Výpravy, Schůzky, Fotky, Účastníci).
2. **Krok 2: Frontend & UI/UX Wireframes**
   - Návrh rozvržení PWA (Dashboard, Kalendář, Detail výpravy modal, Statistiky, Leaderboard).
3. **Krok 3: Backend & Autentizace**
   - Logika pro 10minutové registrační kódy.
   - Správa rolí (Admin vs. Uživatel).
4. **Krok 4: Integrace Stravy & Discordu**
   - OAuth autorizace pro Stravu.
   - Párování aktivit a generování statistik + heatmapy.
   - Webhooky pro odesílání zpráv na Discord.
5. **Krok 5: PWA Optimalizace & Testování**
   - Offline podpora, ikony na plochu, manifest.