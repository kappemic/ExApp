# AGENTS.md – Instrukce pro AI Agenty & Roadmapa Vývoje

Tento dokument slouží jako hlavní kontextová příručka pro AI vývojové agenty (Cursor, Windsurf, GitHub Copilot) pracující na projektu **Klubová PWA Aplikace pro Výpravy**.

---

## 1. Technický Stack & Kontext

Při generování kódů a navrhování architektury se striktně drž následujícího stacku:

* **Frontend Framework:** Next.js (App Router) nebo React + Vite s PWA konfigurací.
* **Styling:** Tailwind CSS (Mobile-first, moderní čistý vzhled).
* **Databáze:** Neon.com (Serverless PostgreSQL).
* **ORM:** Prisma nebo Drizzle ORM (s typově bezpečným TypeScriptem).
* **Autentizace:** NextAuth.js / Auth.js nebo Custom JWT autentizace s podporou rolí (`USER`, `ADMIN`).
* **Integrace:**
  * **Strava API:** OAuth 2.0 + REST API pro čtení aktivit.
  * **Discord:** Webhook API pro automatická oznámení.
  * **File Storage:** Cloudinary nebo Supabase Storage pro ukládání fotografií.

---

## 2. Základní pravidla pro AI Agenta (Coding Standards)

1. **TypeScript First:** Všechny soubory musí používat přísný TypeScript (`strict: true`). Žádný typ `any`.
2. **Mobile-First UX:** Aplikace bude nejčastěji používána na mobilních telefonech. Veškeré UI komponenty musí být plně responzivní.
3. **Kódová čistota & Modularita:**
   * Odděluj business logiku (custom hooks, services) od UI komponent.
   * Modální okna (přihlašování na výpravy, detaily akci) vytvářej jako znovupoužitelné komponenty.
4. **Bezpečnost:**
   * Nikdy nehardcoduj API klíče, tokeny ani tajná hesla (vždy používej `.env.local`).
   * Registrace vyžaduje ověření platnosti 10minutového kódu z DB.
   * Admin operace (mazání, úpravy výprav, generování kódů) musí být zabezpečeny na úrovni API serverových cest (middleware/API routes).

---

## 3. Postup vývoje podle Fází (Feature Implementation Roadmap)

Při vývoji postupuj striktně v následujícím pořadí:

### Fáze 1: Základní infrastruktura, DB & Autentizace
1. **Inicializace projektu:** Nastavení Next.js/Reactu, Tailwind CSS a PWA manifestu.
2. **Databázové schéma:** Vytvoření Prisma / Drizzle schématu na Neon.com (`User`, `RegistrationCode`, `Expedition`, `Meeting`, `Photo`, `Participant`).
3. **Autentizační systém:**
   * Generování 10minutových registračních kódů v Admin panelu.
   * Registrační formulář vyžadující platný kód.
   * Přihlášení uživatele & rozlišení rolí (`Admin` / `User`).

### Fáze 2: Správa Výprav & Přihlašování
1. **Vytvoření výpravy (Admin):** Formulář pro založení výpravy (název, datum, sraz, popis).
2. **Seznam & Detail výpravy:**
   * Výpis nadcházejících výprav na hlavní stránce.
   * **Modal okno:** Po kliknutí na výpravu se otevře pop-up s detailem, seznamem přihlášených a tlačítkem „Přihlásit se / Odhlásit se“.
   * Admin akce v modalu (Tlačítka „Upravit“ a „Odstranit“).
3. **Historie & Uzavření výpravy:**
   * Označení výpravy jako proběhlá.
   * Výběr reálných účastníků (docházka).
   * Nahrávání fotografií k proběhlé výpravě.

### Fáze 3: Kalendář & Schůzky
1. **Komponenta Kalendáře:**
   * Zobrazení měsíčního/týdenního přehledu.
   * Automatické propisování výprav do kalendáře.
2. **Opakované schůzky:**
   * Přidání logiky pro plánování schůzek s možností volby opakování a políčkem pro třídu/klubovnu.
3. **Unified Modal:** Unifikovaný vyskakovací detail pro jakoukoliv událost z kalendáře.

### Fáze 4: Statistiky, Leaderboard & Strava Integrace
1. **OAuth Strava:** Připojení účtu Strava v profilu uživatele.
2. **Párování aktivit:** Logika pro přiřazení poslední nepárované aktivity ze Stravy k uzavřené výpravě (doplnění km, převýšení, trasy).
3. **Osobní statistiky & Heatmapa:** Profil uživatele s přehledem kilometrů, výprav a mapou tras.
4. **Leaderboard:** Žebříček nejaktivnějších členů.

### Fáze 5: Discord Integrace & Komunikace
1. **Discord Webhook Service:** Pomocná funkce pro odesílání formátovaných zpráv na Discord (Embeds).
2. **Notifikace:** Automatické odeslání zprávy při vytvoření nové výpravy nebo důležitém oznámení.
3. **Interní chat/nástěnka:** Jednoduchá diskuze k jednotlivým výpravám.

### Fáze 6: PWA Optimalizace & Finální ladění
1. **Offline podpora & Service Worker:** Cache pro prohlížení historických dat offline.
2. **PWA Instalační prompt:** Nastavení ikonek, splash screenu a manifestu pro možnost přidání na plochu.
3. **Testování & Výkon:** Otestování reálné funkčnosti na mobilních zařízeních.