# Výpravy — návod ke stylu

Platí pro `/vypravy` a pro dialogy, které ta stránka otevře. Zdroj pravdy je kód: tokeny v `src/index.css`, plochy v `src/components/vypravy-nahled/nocturne.css`. Když se tenhle text a obrazovka rozejdou, platí obrazovka.

`tokens.md` a HTML makety ve stejné složce jsou archiv staršího deníku. Nové úpravy se jimi neřídí.

## 1. Věta

Bílý list, olivová značka, okrová jen na rozhodnutí. Písmo Onest na text, Bricolage Grotesque na nadpisy. Tvary jsou zaoblené. Prázdné stavy mají podklad `mlha`. Ostatní plochy jsou bílé.

## 2. Barvy

Tokeny jsou v `@theme` v `src/index.css`. Na `bg-okr` je vždy `text-inkoust`.

| Token | Hex | K čemu |
| --- | --- | --- |
| `papir` | `#ffffff` | pozadí, karty, dialog |
| `inkoust` | `#26301a` | text, focus |
| `smrk` | `#556b2f` | značka, vybraný den, odkaz |
| `jantar` | `#8f5f0a` | drobný okrový text, štítek schůzky |
| `mech` | `#5e6b4e` | druhý řádek, čas, popisek |
| `linka` | `#e7e9df` | vlasová linka, dělení sloupců |
| `mlha` | `#eef1e4` | prázdný stav, pruh po výpravě, hover řádku |
| `pole` | `#8c937b` | okraj polí a karet |
| `okr` | `#d99b26` | hlavní akce: přihlášení, nová výprava, schůzka |
| `okr-tmavy` | `#c4861a` | hover okrové plochy |

Čísla dnů mimo aktuální měsíc jsou `pole` na bílém pozadí. Pozadí buňky se kvůli tomu nemění.

## 3. Písmo

- Text: Onest (`--font-sans`).
- Nadpisy `h1`–`h3`: Bricolage Grotesque (`--font-display`), `letter-spacing: -0.02em`.
- Vstupy mají `16px`, ať iOS nepřibližuje.
- Časy a počty mají `tabular-nums`.
- Dotykový cíl běžného tlačítka je 44 px. Výjimka je značka u zprávy (tři tečky): malá, bez rámečku, `32px`.

## 4. Skladba `/vypravy`

1. Nadpis „Výpravy“. Kdo smí výpravy zakládat, vidí „Nová výprava“ okrově.
2. Hledání a přepínač Seznam / Kalendář. Hledání má `aria-label="Hledat podle jména"`. Křížek má popisek „Zrušit hledání“.
3. Bez hledání: vlevo nejbližší výprava, vpravo od `lg` sloupec „Brzy“. Pod tím sekce Další výpravy, Čeká na uzavření a Proběhlo. Sekce nemají věty o počtu ani o tom, že termín skončil.
4. Hledání bez výsledku nahradí seznam větou „Pro … tu není žádná výprava.“ Seznam bere živá data. Výprava, kterou server nevrátí, na stránce nezůstane.

### Nejbližší výprava

Snímek je vlevo, text vpravo. Od `lg` je text svisle na střed snímku. Odpočet („Za 5 dní“) má stejnou váhu jako datum. Silný je jen název. Kapacita je „1 z 12“ nebo „1 přihlášeno“. „Zbývá N míst“ se nepíše. Plno se řekne „plno“.

Snímek nadcházející výpravy je fotka z jiné, už proběhlé výpravy. Nesmí to být její náhled (`jeNahled`, jinak první fotka). Každá nadcházející výprava dostane jinou, dokud v zásobě jsou. Po skončení se vypůjčená fotka přestane ukazovat. Když fotka není, zůstane krajina z `KrajinaVypravy`: hřeben podle id, barva podle období, bez cesty a bez stromů.

### Řádek

Bílý, malý poloměr, vlevo snímek, vpravo název, sraz a kapacita. Stejná fotka jako u náhledu té výpravy. Neuzavřená po termínu má za kapacitou „neuzavřeno“.

### Brzy

Nejbližší výpravy a schůzky. Schůzka s časem `HH:MM` zmizí, jakmile ten čas v daný den uplyne. Bez času zůstane celý den. Na obrazovce je čas s tečkou, `16.20`.

### Kalendář

Měsíc sdílí buňku `DenKalendare`. Výprava je pás v barvě její palety, krátké jméno jen na začátku pásu. Schůzka je okrová tečka, v buňce bez jména. Dny mimo měsíc mají tišší číslo, stejné bílé pozadí. V denním dialogu je u schůzky čas vedle třídy (`16.20 · 216`). „Jednorázová“ a „Týdenní“ se v tom řádku nepíšou. Tužka a koš jsou vlevo na řádku se štítkem, název je pod nimi přes celou šířku.

### Formuláře

Datum je `dd.mm.rrrr`, čas `hh.mm`. Vyskakovací kalendář, sloupce hodin a seznam jsou plné bílé, `z-index` nad dialogem. Okraj pole je `pole`. Focus textového pole je olivový okraj, ne druhý obrys.

## 5. Dialog výpravy

List je bílý, nahoře snímek. Nadcházející výprava má od `lg` dva sloupce: vlevo popis a lidé, vpravo diskuze. Proběhlá výprava je jeden sloupec. Nahoře lidé, pod nimi na celou šířku listu vedle sebe kilometry a fotky. Ušlá trasa leží na světlé mapě a drží skutečný tvar. Diskuze je pod tím, bez velkého nadpisu. Výška jde podle zpráv a zastaví se na stropu. Prázdné vlákno nezabírá prázdný panel.

- Přihlásit se a Odhlásit se jsou okrové a sedí hned pod srazem.
- Lidé jsou vlastní blok „Kdo jede“ nebo „Kdo byl“. Vidí ho každý. Na telefonu jsou avatary nad jmény, ať věta zabere celou šířku. Od `sm` je to jeden řádek: překryté avatary, počet a všechna jména. Druhý seznam se nerozjíždí.
- Pruh „Výprava proběhla“ a tlačítko Upravit výpravu patří správě. Seznam lidí v něm není.
- Stavový štítek na snímku (`neuzavřeno`, `volno`, `proběhlá`) se nekreslí.
- Uzavření se ptá jen na potvrzení. Přihlášení se zapíšou jako účastníci. Docházka se dál upravuje ve formuláři výpravy.
- Správa na konci listu je vpravo, bez nadpisu „Správa výpravy“.

### Diskuze u výpravy

Vlastní karta, oddělená od zbytku listu. Cizí vzkaz má plochu, vlastní má okrový nádech. Poslat není okrové, okrová patří přihlášení. Při psaní se pole nezvýrazňuje rámečkem. Tři tečky u zprávy jsou malé, bez tlačítkového rámu, a menu se otevře až z nich. Sedí vpravo nahoře vedle textu, takže ho nepřekrývají a z řádku nepřetékají. Navazující zprávy téhož člověka ve stejný den nemají jméno ani datum. Čas se u nich ukáže až po najetí, stejně jako tři tečky. Nový den začne znovu jménem a datem.

## 6. Pohyb

Křivka je `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.

| Věc | Čas | Vlastnosti |
| --- | --- | --- |
| Stisk tlačítka | 160 ms | `transform: scale(0.97)` |
| Okno a závoj | 220 ms | průhlednost a krátký posun |
| Řádek seznamu, buňka kalendáře, pole výběru | žádný scale | sdílejí hranu nebo mřížku |

- Animuj `transform` a `opacity`. `transition: all` se nepoužívá.
- Hover jen při `@media (hover: hover) and (pointer: fine)`.
- Při `prefers-reduced-motion` zmizí posun i scale.
- Escape zavře hned. Zavření ukazatelem přehraje vstup pozpátku a teprve potom odmountuje.

## 7. Jak přidat nový kus

1. Barvu ber z tokenů v `src/index.css`. Nový odstín nepatří do palety, dokud není v tom souboru.
2. Okrová je rozhodnutí (přihlášení, založení, schůzka). Druhá akce ve stejném dialogu okrová není.
3. `mlha` je prázdno a klidný pruh, ne každé tlačítko.
4. Okraj formuláře je `pole`. `linka` je na to moc světlá.
5. Vyskakovací panel mimo strom aplikace potřebuje vlastní plné pozadí. Třída `nocturne` je průhledná schválně.
6. Ověř změnu na `/vypravy` v prohlížeči, na telefonní i široké šířce, když se mění skladba.
