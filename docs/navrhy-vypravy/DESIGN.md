# Deník — návod ke stylu výprav

Tento soubor popisuje vzhled stránky `/vypravy`. Stará adresa `/vypravy/nahled` jen přesměruje sem a zachová query. Starší marketingový Nocturne (razítko, hero, newsletter, tmavá patička) se nepoužívá.

## 1. Kam styl patří

Platí na `/vypravy` a u dialogů, které ta stránka otevře s příznakem `denik` (třídy `nahled-modal` a `nahled-ovladani`). Styly jsou v `src/components/vypravy-nahled/nocturne.css`. `tokens.md` a HTML makety v této složce jsou archiv, ne zdroj pravdy.

Nástěnka, profil, žebříčky a fotky tenhle list nemají. Sdílený modal, galerie a denní dialog bez `denik` zůstávají kulaté.

## 2. Věta, kterou styl drží

Papírový deník: sépiový inkoust, béžový list, rámeček jako u staré fotky. Barva jde od béžové skoro do žluta. Žádná druhá sytá barva, žádný stín, žádný kulatý roh kromě avatarů.

## 3. Barvy

Tokeny žijí na `.nocturne`, ne v globálním `index.css`.

```
--background: 38 32% 91%
--foreground: 26 32% 12%
--card: 40 36% 94%
--secondary: 36 22% 85%
--muted-foreground: 30 12% 38%
--border / --input: 30 16% 70%
--hairline: 30 14% 62%
--ink: 26 30% 9%
--ink-foreground: 38 30% 88%
--film-ruz: 36 24% 87%
--film-mech: 46 32% 86%
--film-nebe: 42 26% 83%
```

Uvnitř náhledu se produkční barvy přemapují na stejnou sépii, aby kalendář a tlačítka nezezelenaly: `--color-smrk` i `--color-jantar` jsou inkoust, `--color-papir` je karta.

Lázně sekcí (třídy `nahled-odstin-ruz`, `nahled-odstin-mech`, `nahled-odstin-nebe`):

| Sekce | Lázeň |
| --- | --- |
| Neuzavřené | `--film-ruz` |
| Probíhá | `--film-mech` |
| Nadcházející | papír, bez lázně |
| Historie a kalendář | `--film-nebe` |

Rám stránky (`NahledRamec`) je `10px` inkoustu. Uvnitř je linka `1px` (`--hairline`) a viněta `.nahled-snimek`: `box-shadow: inset 0 0 90px hsl(32 28% 18% / 0.07)`. Šířka listu je `max-w-[90rem]`.

## 4. Písmo

Jedno písmo: Archivo.

- `.font-expanded` — `font-stretch: 122%`, nadpisy karet a názvy
- `.font-condensed` — `font-stretch: 74%`, data, přepínač, drobné popisky
- `h1` je světlý, velký, `text-balance`
- Žádné druhé písmo, žádné anglické razítko značky

## 5. Skladba stránky

1. Nadpis „Výpravy“. Kdo smí výpravy zakládat, vidí vedle něj „Nová výprava“.
2. Jeden řádek: hledání vlevo, přepínač Seznam / Kalendář vpravo, svisle vycentrovaný na pole.
3. Hlášení výsledku hledání je **pod** řádkem, aby přepínač nesjel dolů.
4. Sekce mají svislý štítek a číslo. Výška sekce drží obsah. `min-height` na prázdno se nepoužívá.
5. Uzavřené výpravy jsou karty. Ostatní jsou řádky s datem.

### Hledání

Viditelný štítek „JMÉNO“ tam není. Pole má `aria-label="Hledat podle jména"`, `name="nazev"`, `autoComplete="off"`. Placeholder končí výpustkou. Při psaní se zvýrazní **spodní linka** celého pole (`:focus-within`), ne plovoucí rámeček. Obrys na samotném inputu je vypnutý schválně, náhrada je ta linka. Křížek na smazání má 44 px a popisek „Zrušit hledání“.

### Přepínač

`NahledPrepinac` je `role="group"`. Vedle hledání má `roztahnout={false}`. Aktivní díl je inkoust (`--ink`), ne zelená.

### Řádky

Mřížka `4.25rem` + zbytek, minimální výška 72 px. Vlevo den a zkratka měsíce. Fotka v řádku není. Kapacita: u uzavřené „archiv“, u neuzavřené po termínu „neuzavřeno“, u budoucí „zbývá N míst“. Neuzavřené vidí jen člen, který smí výpravy spravovat.

### Karty archivu

Čtverec, `1px` rámeček barvy inkoustu, bez stínu, bez zaoblení. Fotka 4:3 nahoře. Mřížka nejvýš dva sloupce (`md:grid-cols-2`). Celá karta je jedno tlačítko. Prázdný stav a stránkování zůstávají.

## 6. Dialog

`ExpeditionModal` s `denik` dostane kořen `nocturne nahled-modal`. Uvnitř je vše čtvercové a bez stínu. Avatary mají výjimku `.avatar-kruh { border-radius: 9999px }`.

- Prázdný tácek fotky (linkovaný papír 4:3) se v deníku nevykreslí. V produkci zůstává.
- Odeslání vzkazu je slovo **Poslat**, bez šipky, na prvním řádku rostoucího pole. Výška pole se neanimuje.
- Zavření ukazatelem (křížek, pozadí, Zavřít, Zrušit u nové výpravy a schůzky) přehraje vstup pozpátku 220 ms a teprve potom odmountuje. Úspěšné odeslání formuláře okno sundá hned, aby hned mohlo najet další.
- Escape zavře hned.
- Odkaz do diskuze v deníku skáče `behavior: "auto"`, aby nesoutěžil s nájezdem okna.
- Galerie fotek v deníku má stejný nájezd a odjezd. Escape ji zavře hned. Přechod mezi snímky klávesnicí se neanimuje.

## 7. Pohyb

Křivka: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.

| Věc | Čas | Vlastnosti |
| --- | --- | --- |
| Stisk tlačítka | 160 ms | `transform: scale(0.97)` |
| Barva, linka, pozadí | 160 ms | jen vyjmenované vlastnosti |
| Okno, závoj, galerie | 220 ms | průhlednost a `translateY(8px)`, závoj jen `background-color` |
| Najíždění listu | 220 ms | jednou při vstupu na stránku, ne při každém přepnutí Seznam / Kalendář |
| Najetí na fotku karty | 220 ms | `scale(1.03)`, jen při hoveru myší |
| Nová výprava, Nová schůzka | 180 ms | inkoust přejede `clip-path` zleva, text zesvětlá; jen jemná myš |

Pravidla:

- Animuj jen `transform` a `opacity`. Závoj je výjimka: mění `background-color`, ne průhlednost obalu, jinak by zprůhlednělo i okno.
- `transition: all` se nepoužívá.
- Hover jen v `@media (hover: hover) and (pointer: fine)`.
- Při `prefers-reduced-motion` zmizí posun i scale. Barva smí skočit. Okno a galerie se zavřou hned.
- Klávesové akce (Escape, šipky mezi fotkami, přepnutí, které uživatel dělá pořád) se neanimují.
- Řádek seznamu a segment přepínače se nesmršťují celé. Řádek při stisku změní podklad na `--card`. U segmentu se zmenší jen vnitřní text, aby nepraskla společná linka.
- Buňka kalendáře se nesmršťuje, jinak se rozestoupí pás výprav.
- Posuvník stránky je tenký a zviditelní se jen při rolování (`html.nahled-stranka`).

## 8. Jak přidat nový kus

1. Nový povrch obal třídou `nocturne`, nebo ho nech uvnitř `NahledRamec`.
2. Barvu ber z tokenů výše. Nový odstín smí být jen další krok béžové do žluta.
3. Rámy `1px`, rohy `0`, stín žádný. Kruh nech jen avataru.
4. Tlačítko dostane stisk `scale(0.97)` za 160 ms, pokud nesdílí hranu s sousedem. Sdílenou hranu neškáluj.
5. Vstup a odchod okna řeš přechodem, ne keyframes. Únik klávesou je okamžitý.
6. Produkční komponentu rozšiř příznakem. Bez příznaku nesmí přibýt třída `nocturne`, `nahled-modal` ani `nahled-ovladani`.
7. Ověř `/vypravy` v prohlížeči. Ostatní stránky nemají deníkový rám.
