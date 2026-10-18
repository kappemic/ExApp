# Mini design-systém — Výpravy (Step 3 polish)

Společné tokeny pro prototypy `A-denik.html`, `B-fotokarty.html`, `C-osa.html`.
Vrstvy: **primitive → semantic → component**. Žádné nové gradienty mimo deníkovou linku (povoleno jen `repeating-linear-gradient` na papíru v A + stávající hero/galérie v B).

## 1 · Primitive (raw hex, 6 barev)

| Token | Hex | Použití |
|---|---|---|
| `--papir` | `#F6F1E7` | světlý podklad A/C, text na tmavé v B |
| `--inkoust` | `#1C1A16` | text, rámečky, razítka |
| `--smrk` | `#1E3A2B` | primární akce, razítko, osa, focus |
| `--jantar` | `#C78D2C` | badge / tečka / plno (jen s textovým stavem) |
| `--mech` | `#5F6F5A` | sekundární text, linka popisu |
| `--linka` | `#DCD2BC` | dělicí linky, obrysy kalendáře |

Tmavá varianta B mapuje stejně: `--les: #101511` (= inkoust-deep), `--papir` zůstává text, `--smrk` → `#2E5233` na tmavé, `--jantar` → `#E8B44A` na tmavé (větší plocha, kontrast s černou). Textový jantar na papíru **vždy** tmavý `#8A5E0A` / `#7A5A12`, nikdy `#C78D2C` na `#F6F1E7` pro malý text (kontrast).

## 2 · Semantic (účel)

```css
--bg: var(--papir);
--fg: var(--inkoust);
--brand: var(--smrk);
--accent: var(--jantar);
--muted: var(--mech);
--line: var(--linka);
--card: #FFFDF6; /* A/C karta, v B #1A211C */
--focus: var(--smrk); /* B: var(--jantar) na tmavé */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

## 3 · Component

| Komponenta | Tokeny |
|---|---|
| Tlačítko primární | `bg: var(--jantar)` (B: `#E8B44A`), `fg: var(--inkoust)`, `border: 2.5px var(--inkoust)`, `radius: 8–10px`, `min-height: 44px`, `shadow: 2px 2px 0 inkoust` |
| Tlačítko sekundární / duch | `bg: var(--card)` / transparent, `border: 2–2.5px` |
| Badge kapacita | `border 1.5px var(--mech)`, `radius: 999px`, `font .8rem/800` · `.plno` → `border/text var(--jantar-tm)` |
| Tečka nepřečtené | `10–12px`, `bg: var(--jantar)`, `border: 2px var(--inkoust)` + `ring-2 var(--papir)` (viz `NeprectenaTecka.tsx`), `pointer-events: none`, nikdy samotná — vždy `aria-label` / text „nové / nepřečtené“ |
| Razítko data (A) | `border 2.5px var(--smrk)`, `radius 6px`, `rotate(-3deg)`, vypíná `prefers-reduced-motion` |
| Shadow-deník | `2px 2px 0 rgba(28,26,22,.9)` (karty), `3px 3px 0` (kalendář), `5px 5px 0` (modal) — žádný blur, drží papírový pocit |
| Prázdný stav | `role="status"`, nadpis + popis + **CTA** (primární 44px), `border-dashed` |
| Diskuze offline | `role="status"`, text „Jsi offline — diskuze se načte po připojení“ + tlačítko „Zkusit znovu“ |

## 4 · Spacing / radius / type

- Spacing: `4 / 8 / 12 / 16 / 22 / 32` (gap 8–12, padding karty 12–18, sekce 22–26).
- Radius: pill `999px` (přepínač, filtry, kapacita), karty `10–14px` (A modal 10, B 14–16, C 12–14), razítko `6px`.
- Type: nadpisy `Georgia, serif` (A) / systémové sans (B/C); tělo `system-ui, "Segoe UI"`; `line-height 1.55`; meta `.85–.92rem`; inputy **`font-size: 16px`** (bez zoomu na iOS).
- Layout: A `max 760px` jeden sloupec · B `max 1120px` + snap-pás `minmax(220px,280px)` · C `300px + 1fr`, pod `900px` jeden sloupec.

## 5 · Pravidla pro tečku / badge (sjednoceno s `NeprectenaTecka.tsx`)

1. Tečka nikdy bez textu pro čtečku: `aria-label="…, nepřečtené"` na kartě + `title`/text „nové“ vedle.
2. Vizuál: bílý/papírový kroužek `ring-2 ring-papir` + tmavý obrys, ne jen barva. Na papíru tmavší jantar pro text.
3. Velikost `8px` v nadpisu / `10–12px` v kartě, `shrink-0`, `pointer-events-none`.
4. Puls jen `motion-safe`, `motion-reduce: none`.
5. Kapacita: `plno` stav má **slovo** („plno“ / „16/16 · plno“), ne jen barvu. Plné tlačítko je `disabled` + „Náhradník“.

## 6 · Interakce (emil-design-eng detaily)

- Press: `transition: transform 160ms var(--ease-out); :active { transform: scale(0.97) }` na všech `.btn / .filtr / .karta / .radek / .snap`.
- Vstup modalu z `scale(0.95) + opacity 0`, nikdy `scale(0)`; exit rychlejší než enter.
- Hover jen `@media (hover:hover) and (pointer:fine)`.
- Animace jen `transform + opacity`; délky `125–250ms`, nic nad `300ms` pro UI.
- `prefers-reduced-motion: reduce` vypíná rotaci, přechody i stagger.
- Focus: `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px }`.
- Worst-case odolnost: `min-width: 0` na textových sloupech, `overflow-wrap: anywhere`, `text-overflow: ellipsis` + `truncate` na názvech, `max-height + overflow auto` na 1000-znakovém popisu.
- Safe-area: `padding-bottom: env(safe-area-inset-bottom)` na `.obal` + sticky mobilní lišta (C) s `padding-bottom: calc(10px + env(safe-area-inset-bottom))`.

## 7 · Mapování na existující kód

- `ExpeditionEmpty.tsx` → `role="status"` + CTA vzor převzat do worst-case sekcí (prototypy přidávají chybějící CTA).
- `ExpeditionSkeleton.tsx` → kostra drží stejný grid; prototypy ji neporušují.
- `NeprectenaTecka.tsx` → pravidla výše (ring, role=status, bez focusu).
- `format-cas.ts` → datumy „17. 10. 10:00“ stylem `cs-CZ`, v prototypech zkráceně „17. 10.“.

## 8 · Co se neměnilo (Step 2 → Step 3)

Barvy, fonty, layout koncepty variant zůstávají. Step 3 jen přidává: `tokens.md`, worst-case sekci v každém HTML, `44px` tap-targety, `16px` inputy, `safe-area`, `truncate/break-words/min-w-0`, CTA v prázdném stavu. Beze změny v `src/pages`, `src/components/expeditions`, `server`.
