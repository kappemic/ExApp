# Návrhy výprav — 5 hi-fi prototypů

Izolované klikatelné preview soubory. **Nemění** `src/pages/*`, `src/components/expeditions/*`, `server/*`. Čistá statika — otevřít dvojklikem, bez buildu, bez BFF/DB.

## Otevření

- `A-denik.html` — otevřít v prohlížeči (dvojklik nebo `start docs\navrhy-vypravy\A-denik.html`)
- `B-fotokarty.html` — dtto
- `C-osa.html` — dtto
- `D-srazovka.html` — dtto
- `E-stopa.html` — dtto

Z repo-rootu: `C:/dev/ExApp/docs/navrhy-vypravy/A-denik.html` atd.

## Stejný obsah všech variant

7 výprav z `src/lib/mock-expeditions.ts` (beze změny, zkopírováno do souborů):

1. Podzimní Šumava – Tříjezerní slať · 17. 10. 2026 · Praha hl. n. 7:40 · 8/18 · volno · **nepřečtené**
2. Český ráj – Prachovské skály · 24. 10. 2026 · Turnov 9:00 · 14/16 · skoro plno · **nepřečtené**
3. Brdy – výšlap na Tok · 7. 11. 2026 · Příbram 8:15 · 5/20 · volno
4. Krkonoše – Sněžka přes Obří důl · 21. 11. 2026 · Pec 7:30 · 11/12 · skoro plno · **nepřečtené**
5. Podyjí – vinice a vyhlídky · 5. 12. 2026 · Znojmo 9:30 · 3/15 · volno
6. Křivoklátsko – údolím Berounky · 19. 9. 2026 · **proběhlo** · 16/16 plno
7. Adršpašské skály a Broumovsko · 5. 9. 2026 · **proběhlo** · 12/14

A–C obsahují: header · přepínač **Seznam / Kalendář** · filtr (Vše/Volno/Skoro plno/Proběhlé) · kartu (název, datum, sraz, kapacita, unread tečka) · modal/detail (název, datum, sraz, kapacita, stav, popis, akce) · česky.

D a E berou stejných 7 výprav a stejný dialog. D nemá filtr ani kalendář — stránka je lístek, fronta a sbalený archiv. E filtruje jen ušlou stopu (Vše / Spárováno / Bez stopy).

## Která varianta co řeší

| Varianta | Co řeší | Jedno odvážné rozhodnutí | Kdy vybrat |
|---|---|---|---|
| **A · Deníkový seznam** (`#F6F1E7` papír, `#1C1A16` inkoust, `#1E3A2B` smrk, `#C78D2C` jantar, `#5F6F5A` mech, `#DCD2BC` linka) | Rychlé skenování + pocit oddílového deníku. Jeden sloupec řádků, razítko data vlevo. | Razítko data natočené o −3° jako jediný dekor; zbytek přísně linkovaný. | Chceme klid, čitelnost, nejlevnější vývoj. |
| **B · Fotokronika** (`#101511` lesní čerň, `#F4EEE1` papír, `#2E5233` smrk, `#E8B44A` jantar, `#8AA88B` mech-mlha) | Emoce + nábor nováčků. Feature fotka týdne, horizontální snap-pás, tmavá galerie proběhlých. | Full-bleed hero + filmstrip; proběhlé jako desaturovaná galerie. | Chceme prodávat zážitek, fotky jsou hrdina. |
| **C · Kalendář-first / osa** (`#FBF8F0` papír, `#1B211C` inkoust, `#234434` smrk, `#E4A82B` jantar, `#7A8B7A` mech) | Plánování v čase. Sticky měsíční kalendář + svislá osa dnů, schůzky + deep-link `exapp.cz/vypravy/<id>`. | Páteř osy + sticky kalendář; klik na den skočí na den v ose. | Chceme kalendářové myšlení, propojení se schůzkami. |
| **D · Srazovka** | Nejbližší nástup. Lístek se srazem a „Přihlásit se“, pod tím krátká fronta termínů. | Hrdinou je místo srazu; datum je věta pod ním. | Chceme nejdřív nejbližší sraz a přihlášení. |
| **E · Stopa** | Co zůstalo po výpravě: účast, kilometry, převýšení a spárování se Stravou. | Čísla ušlé stopy jsou hrdina; fotka je jen čtverec na kraji řádku. | Chceme po výpravě účast a stopu ze Stravy. |

D a E nepřidávají paletu. Klubové tokeny zůstávají stejné: papír, inkoust, smrk, jantar, mech, linka.

## Revize proti generickým defaultům

- Žádný fialový/indigo gradient, žádné `rounded-2xl` všude, žádná stejná SaaS kartová mřížka.
- A se záměrně vyhýbá kartám vůbec (řádky deníku); B je tmavá, ne krémová; C je osa, ne grid.
- Typografie: systémové řezy (Georgia pro deník, systémové sans jinde) — žádné externí fonty, funguje offline.
- Jediný pohyb na variantu (hover/stisk), vše vypíná `prefers-reduced-motion`.

## Acceptance checks

1. ✅ Všech 5 variant renderuje stejných 7 mock výprav a jde otevřít bez BFF/DB (file:// stačí).
2. ✅ Responsive 360 / 768 / 1280 — `minmax(0,1fr)`, `overflow-wrap:anywhere`, mobilní kalendář v C, žádný horizontální scroll.
3. ✅ Viditelný `:focus-visible` (3px, barva dle varianty), kontrast: tmavý inkoust na papíru, papír na tmavém podkladu; jantar jen pro velké prvky/tečky s textovým doprovodem stavu.
4. ✅ `@media (prefers-reduced-motion: reduce)` — vypíná animace/přechody i natočení razítka.
5. ✅ Žádná změna v `src/pages/*`, `src/components/expeditions/*`, `server/*` — pouze nové soubory v `docs/navrhy-vypravy/`.
