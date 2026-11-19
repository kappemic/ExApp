# Audit: návrh `ExApp.pen` proti aplikaci

Stav k 18. 11. 2026. Návrh: `C:\Users\kilpa\Downloads\ExApp.pen` (pen.dev), 84 rámců: 18 obrazovek počítač, ~35 telefon, 11 modálů (obě verze), 2 menu, „Stavy a limity“, 7 komponent.
Aplikace: `localhost:5174`, přihlášený admin, šířka 375 px, u Výprav a Chatu i 1440 px.

## Shrnutí

Paleta a písma v návrhu jsou **totožné** s `src/index.css` (`paper`=`papir`, `brand`=`smrk`, `accent`=`akcent`, `ochre`=`okr`…). Funkčně v kódu skoro všechno z návrhu existuje. Rozdíly jsou vizuální a systémové, ne chybějící funkce. Většinu jde opravit pár sdílenými komponentami, ne předěláváním stránek.

## A. Systémové rozdíly (opravit jednou, projeví se všude)

| # | Návrh | Aplikace | Priorita |
|---|---|---|---|
| A1 | Hlavní tlačítko = **tmavě olivová `brand`** (26× brand, 3× accent). Terakota jen u hero CTA na počítači a u destruktivních akcí. | Většina primárních akcí je **terakotová** (`akcent`): Detail a přihlášení na telefonu, Pozvat, Vygenerovat kód, Uložit změny, Zapnout oznámení. Detail výpravy už olivový má, chování je nekonzistentní. Komentář v `index.css` říká „Primary actions use --color-akcent“. | Vysoká |
| A2 | Karty bez výrazného okraje: vlasová linka `$line` (607×), bílý `surface` na krémovém `paper`. | Hodně karet má **tmavý 1,5–2px okraj `inkoust`**: skupiny chatu, tabulka členů, karta kódu, karta Diskuze, rámeček tabulky žebříčku. | Vysoká |
| A3 | Řádek seznamu = avatar s iniciálami (barevný kruh) + název + podtitul + chevron `>`, řádky v jedné kartě oddělené linkou. | Členové a Žebříčky jsou **tabulky** se záhlavím sloupců, Více má řádky bez ikon a chevronů. | Vysoká |
| A4 | Zpět = kulaté tlačítko se šipkou vlevo, titulek uprostřed, akce vpravo (Upravit/Zrušit). | Holá šipka (detail), textový odkaz „← Zpět do zpěvníku“ (Návrhy písní), „Zrušit“ vlevo (Nová výprava). | Střední |
| A5 | Prázdný stav = ikona + vysvětlení + jedna akce („Nikdy jen ‚Nic tu není‘“). | „Žádná píseň.“, „Žádný návrh.“, „Zatím se nikdo nepřihlásil.“ jako holý text. | Střední |
| A6 | Filtrační čipy se vejdou celé, krátké popisky (`2026`, `2025`). | Chat: čipy useknuté na „V…“, „Globál…“, „K výpravá…“, „Soukro…“. Žebříčky: „Rok 2026“. | Vysoká (Chat je chyba) |
| A7 | Hlavička stránky: velký titulek + podtitul s počtem („12 členů“, „42 písní“) + primární tlačítko s ikonou vpravo nahoře. | Většinou sedí. Výjimky: Členové (Pozvat pod titulkem, terakota, bez ikony), Fotky (dvě tlačítka „Přidat album“ + „Nahrát“), Chat má navíc štítek „KONVERZACE“. | Střední |

## B. Pravidla ze „Stavy a limity“

| Pravidlo | Stav v kódu |
|---|---|
| Pravý sloupec: 3 položky + „Zobrazit všech N“, nikdy nescrolluje | Na počítači je „Brzy“, sekce „Čeká na uzavření“ chybí. Ověřit. |
| Hlavní seznam: 10 řádků, pak stránkování 1/2/3 | Nenalezeno |
| Mřížka karet: 6 položek, pak „Načíst další“ | Nenalezeno (Fotky) |
| Zpěvník: 12, pak „Načíst dalších 12“ | Hotovo |
| Dlouhá karta scrolluje uvnitř, přechod dole | Neověřeno |
| Prázdný stav s ikonou a akcí | Viz A5 |
| Plná kapacita: tlačítko vidět, neaktivní, řekne proč | Text „obsazeno“ v kódu je, vizuál neověřen |
| Filtr bez výsledku: „Nic jsme nenašli“ + „Zrušit filtry“ | Text je ve Výpravách, tlačítko „Zrušit filtry“ chybí |
| Offline proužek „Zkusit znovu“ | Neověřeno |

## C. Po obrazovkách (telefon)

- **Přihlášení:** v záhlaví fotka místo ilustrace hory. Pole e-mailu má ikonu obálky, aplikace má u obou polí zámek. Odkaz „Zadej kód“ na vlastním řádku.
- **Výpravy:** hero na telefonu s olivovým CTA (A1). V návrhu jsou sekce *Probíhající* a *Čeká na uzavření*, v aplikaci jen Nadcházející a Proběhlo (možná jen chybějí data, ověřit). Řádky Nadcházejících v návrhu jsou v kartě s chevronem a ukazatelem obsazenosti.
- **Výpravy, počítač:** hero je v návrhu vodorovný (fotka vlevo, text a CTA vpravo, nízký), v aplikaci přes celou šířku a velmi vysoký. Pravý sloupec: „Brzy“ + „Čeká na uzavření“.
- **Detail výpravy:** blízko návrhu. Zpět (A4), okraj Diskuze (A2). Ikony upravit/smazat dole v návrhu nejsou, tam je jen „Upravit“ v hlavičce.
- **Nová výprava:** návrh bez obalové karty „Základní údaje“, Datum od/do vedle sebe, pole „Odkaz na trasu“ a „Cesta tam/zpět“ s výběrem fotky.
- **Fotky:** jedno tlačítko „Nahrát“ s ikonou. Album „Koš“ v návrhu v mřížce není. Placeholder obalu bez fotek.
- **Zpěvník:** prázdný stav (A5). „Stáhnout do telefonu“ v návrhu na seznamu není.
- **Návrhy písní:** karty s „Vydat“ (olivová) / „Odmítnout“ (světle terakotová) u každého návrhu. Hromadné „Vydat vše / Odmítnout vše“ a „Nahrát PDF nebo fotku“ jako textové odkazy v návrhu nejsou.
- **Chat:** chyba s useknutými čipy (A6). Tlačítko „Nová skupina“ přes celou šířku v návrhu není. Seznam má sekce Skupiny / K výpravám / Soukromé s avatary, časem a odznakem nepřečtených. Na počítači je seznam v kartě vlevo, konverzace vpravo.
- **Žebříčky:** návrh má jen seznam (pořadí, avatar, jméno, „8 výprav · 108,4 km“). Aplikace má navíc mapu „Ušlé výpravy“ a tabulku bez čísel výprav a km.
- **Více:** návrh má ikony, chevrony, sekce v kartách, odznak počtu u Návrhů písní a tlačítko „Odhlásit se“ ve světle terakotové kartě.
- **Členové:** návrh má seznam s avatarem, rolí a chevronem a „Pozvat“ olivově s ikonou vpravo nahoře. Aplikace má tabulku, která **přetéká vodorovně** (odkazy „Karta / Deta…“ useknuté).
- **Profil:** návrh má zobrazení (avatar uprostřed, odznak role, 3 dlaždice Výpravy/Kilometry/Fotky, karta Přidat na plochu, seznam údajů jen ke čtení, Odhlásit se). Aplikace otevírá rovnou editační formulář.
- **Nastavení:** návrh má sekci Oprávnění jako přehled (kdo smí co) a kartu Discord s odznakem „připojeno“. Push oznámení v návrhu není (rozhodnout, zda zůstane).
- **Pozvánkové kódy:** formulář „Nový kód“ se Zrušit / Vytvořit kód (olivová s ikonou). Aktivní kódy jako řádky s ikonou, kopírováním a smazáním a se sekcí „Použité“.
- **Statistiky, Člen, Album, Píseň, Kdo jede, Kalendář:** tady jsem ověřil jen, že komponenty existují, vizuálně jsem je s návrhem nesrovnával (chybí data nebo jsou za interakcí).

## D. Modály

Návrh: všechny modály na telefonu jako spodní panel (úchyt, nadpis, kontext pod ním, pole, dole dvojice Zrušit (světlá) + primární olivová). V kódu existují (`*Sheet.tsx`), vizuálně neověřeno.

## Stav oprav (18. 11. 2026)

Hotovo, neověřeno commitem: A1 (olivová primární), A2 (vlasové okraje), A3 (`SeznamKarta`: Členové, Žebříčky, Více, Chat), A4 (`HlavickaZpet` v 10 obrazovkách), A5 (`PrazdnyStav`), A6 (čipy Chatu, tabulka Členů), bod 5 (Profil se zobrazením a „Upravit údaje", hero Výprav od 1440 px vodorovně, pravý sloupec „Brzy" + „Čeká na uzavření" po třech, Pozvánkové kódy jako seznam). Bod 6: stránkování po 10 (`Strankovani`, `useStrankovani`) ve Výpravách (seznamy řádků), Žebříčcích a Členech, „Načíst další" po 6 v mřížce alb (`useNacistDalsi`). Vizuálně neověřeno, data mají méně než 10 řádků a 6 alb.

Bod 7 (19. 11. 2026), ověřeno na 375 px proti snímkům z návrhu:

- **Statistiky:** bez obalové karty v Profilu, seznam aktivit nad souhrnem sezóny (pořadí z návrhu), prázdný stav `PrazdnyStav` s akcí „Na výpravy“, „Připojit Stravu“ na tokenu `akcent-100`. S daty (aktivity, souhrn) neověřeno, testovací účet nemá kilometry.
- **Člen:** přestavěno podle návrhu: avatar uprostřed se štítkem role, 3 dlaždice, karta „Soukromá zpráva“, seznam údajů jen ke čtení, výpravy jako `SeznamKarta` se stavem „Jede“ / „Proběhla“, „Spravovat“ v hlavičce i dole. Sdílené kusy s Profilem jsou v `ProfilKusy.tsx`.
- **Album:** `HlavickaZpet` místo odkazu „← Přehled alb“, ikony u Nahrát / Stáhnout, prázdný stav `PrazdnyStav` (nově umí `children` pro vlastní akci). Mřížka s fotkami neověřena, testovací alba jsou prázdná.
- **Kalendář:** hlavička v jednom řádku „‹ Listopad 2026 ›“ a vpravo „Dnes“ (`KalendarHlavicka` bere `posun`). Pásy výprav přes dny zůstávají, návrh má jen tečky (záměrně, nesou název).
- **Modály:** `SpodniSheet` má úchyt na telefonu, nadpis 22 px a tmavší pozadí. Nová schůzka má Den a Čas vedle sebe a dole Zrušit + Vytvořit vedle sebe (lepivá patička). Ruční zápis má pole vedle sebe a už neukazuje interní ID výpravy. Správa člena má dvojici Zrušit + Uložit. Ostatní panely už dvojici měly. Vizuálně ověřeny Nová schůzka a Ruční zápis.

## Shoda do detailu (19. 11. 2026, hodnoty čtené přímo z ExApp.pen)

Hotovo a ověřené v prohlížeči na 375 px i 1440 px:

- **Základ:** zaoblení podle návrhu (`rounded-xl` 12, `2xl` 16, `3xl` 18 px), stíny `shadow-denik` / `jemny` / `panel` / `modal`, ikony Lucide v `Ikona.tsx`, posuvník z „Počítač · Posuvník“ (globálně pro myš, `.posuvnik` užší).
- **Oprava breakpointu:** `min-[1440px]:` Tailwind řadil před `lg:`, na počítači proto vyhrávaly tabletové třídy. Všude nahrazeno `min-[90rem]:` / `max-[90rem]:` (321 výskytů), pravidlo je v `CLAUDE.md`.
- **Navigace:** hlavička (logo 36 px, název v Bricolage, pilulka účtu s iniciálami a šipkou, ikony 16 px), spodní kapsle s bílou linkou.
- **Výpravy:** hlavička (lupa a „Nová“ s ikonou na telefonu, pole hledání a „Nová výprava“ na počítači), přepínač Seznam / Kalendář v pilulce, čipy, nově **řazení Podle data / Podle názvu**, hero (fotka 148 px, štítek odpočtu, ikony, obsazenost, „Kdo jede“), řádky v kartě (datum, sraz s ikonou, ukazatel obsazenosti, štítek „Probíhá“), karty proběhlých výprav, pravý sloupec „Brzy“ / „Čeká na uzavření“.
- **Kalendář:** buňky 44 px s tečkami a proužky (telefon), 128 px se štítky událostí (počítač), barvy výprav (terakota, olivová, okr) a schůzek (okr), navigace měsíce a legenda v liště, seznam dne a pravý sloupec s kartou výpravy. Nově **„Přihlásit se“ otevře detail rovnou s přihlášením** (`?prihlasit=1`).
- **Fotky a Album:** hlavička 46 px s hledáním, „Nahrát fotky“, „Vytvořit album“, čipy včetně Koše, počet alb a fotek, mřížka 2 sloupce s obalem 200 px a prázdným obalem „Zatím žádné fotky“, detail alba s nadpisem 46 px a mřížkou fotek se zaoblenými dlaždicemi a mezerami 8 / 14 px.
- **Vyskakovací prvky:** výběr data (292 px), výběr času (sloupce Hodina / Minuta, po 5 minutách), nabídka voleb s fajfkou, stín a náběh podle návrhu.
- **Modály:** telefon 24 px rohy, úchyt, nadpis 24 px, tlačítka 48 px; počítač 20 px rohy, nadpis 19 px, zavírací tlačítko 30 px, teplá patička (`PATICKA_SHEETU`). Pole formulářů `formular-tridy.ts`. „Spárovat aktivitu“ má nově výběr a potvrzení v patičce.
- **Animace:** náběh vyskakovacích panelů a závoje pod modálem, otočení šipky u nabídky, vše vypnuté při `prefers-reduced-motion`.

Vědomé odchylky: okraj polí `border-pole` místo světlejší linky (kontrast 3 : 1), zavírací × zůstává i na telefonu, týdenní kalendář zůstává (v návrhu není), „nahrál …“ u alba chybí (API autora nevrací).

Druhé kolo (19. 11. 2026): **Detail výpravy** (nadpis 46 px, pás fotky, karty O výpravě / Kdo jede / Diskuze, pravý sloupec Přihlášeno + Sraz a doprava; telefon s fotkou 180 px), **Nová výprava** (karty Základní údaje / Místo a čas / Popis a fotky, kontrolní seznam vpravo, výběr fotek jako plocha), **Kdo jede** (tabulka na počítači, filtry Všichni / Organizuje / Volná místa, barevné avatary), **Zpěvník** (seznam v kartě, tónina, čip Podle abecedy), kostra načítání bez falešné hlavičky, **Chat** rozvržení (hlavička, panel Konverzace jako karta, karta vlákna). Neověřeno vizuálně: Chat po úpravě, řádky písní (v DB nejsou písně).

Třetí kolo (19. 11. 2026): **Chat** (seznam konverzací bez vnitřní karty, kompaktní záložky na počítači, záhlaví vlákna s avatarem, bubliny `#F1EDE0` / olivové, čas pod bublinou, pole zprávy s kulatým tlačítkem odeslání), **Žebříčky** (tabulka s kolečkem pořadí a ukazatelem km), **Členové** (tabulka Člen / E-mail / Základna / Rada a vedení / Admin / Výpravy, barevné avatary), **Profil** na počítači (levá karta s identitou, statistikami a instalací, záložky jako přepínač, Odhlásit v hlavičce), **Nastavení** (karty, přepínače `Prepinac.tsx`, dva sloupce), **menu Více a Profil** (ikony, řádky 34 px, odznak návrhů). Vypínače „Veřejný profil“ a „Zobrazit v žebříčku“ z návrhu nejsou implementované (backend je nemá).

Zbývá projít do detailu: Přihlášení a Registrace (vyžaduje odhlášení), Pozvánkové kódy na počítači (pravý sloupec Použité), Píseň, Návrhy písní, Chat, Žebříčky, Členové, Člen, Profil, Statistiky, Nastavení, Pozvánkové kódy, Přihlášení a Registrace, zbylé modály (Docházka, Nahrát fotky, Návrh písně, Správa člena, Smazat výpravu) a menu Více / Profil.

## E. Doporučené pořadí

1. **A1 + A2** v `index.css` a sdílených tlačítkách a kartách. Největší efekt, malý zásah. Opravit i komentář v `index.css` a popis C2 v `CLAUDE.md` (krémové pozadí, olivová primární).
2. **A6** (Chat čipy) a přetékání tabulky Členů. Jsou to chyby.
3. **A3**: sdílená komponenta řádku seznamu (avatar + text + chevron), nasadit do Členů, Žebříčků, Více a Chatu.
4. **A4 + A5**: sdílená hlavička se zpět a sdílený prázdný stav.
5. Obrazovky s velkým rozdílem: Profil (zobrazení vs. editace), Výpravy na počítači (hero, pravý sloupec), Pozvánkové kódy.
6. Pravidla z části B (stránkování, Načíst další, Zrušit filtry).
7. Ověřit zbytek s daty: Statistiky, Člen, Album, Kalendář, modály.

## Otevřené otázky

- Terakota pro hero CTA na počítači vs. olivová na telefonu: v návrhu se to liší, je to záměr?
- Zůstanou prvky, které v návrhu nejsou: mapa v Žebříčcích, Push oznámení, album Koš, „Stáhnout do telefonu“, hromadné akce u návrhů písní?
