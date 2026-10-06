# Role — finální model (P1–6 uzavřen)

> Single-source pravidlo: jediným zdrojem pravdy pro role je
> `src/config/roles.ts` (`Role` union + `ROLE_LIST` + `getRoleStyle`
> + helpery `je*()` + `chybaKombinaceRole` / `jeValidniKombinaceRole`).
> `src/data/mockClenove.ts`, `src/pages/AdminClenovePage.tsx`,
> `src/components/Admin/ClenoveTable.tsx` a `RoleBadge` role jen konzumují —
> nedefinují vlastní seznam rolí ani vlastní význam rolí.

## Seznam rolí (`ROLE_LIST`)

| ID | Název | Popis |
|----|-------|-------|
| `admin` | Admin | Správce aplikace (systémová, nerozšiřitelná). |
| `clen` | Člen | Základní člen oddílu (neaktivní báze). |
| `aktivni-clen` | Aktivní člen | Pravidelně se účastní výprav a schůzek (aktivní báze). |
| `clen-rady` | Člen rady | Podílí se na rozhodování oddílu (nadstavba). |
| `vedeni` | Vedení | Vedoucí oddílu, nejvyšší hodnost (nadstavba). |

## Pravidla kombinací (kontrakt z `chybaKombinaceRole`)

1. **Exkluzivita báze:** právě jedna z `clen` XOR `aktivni-clen`.
   Každý člen má povinně jednu bázi — buď `clen`, nebo `aktivni-clen`,
   nikdy obě zároveň a nikdy žádnou (výjimka viz bod 3).
2. **Nadstavba jen s aktivním:** `clen-rady` / `vedeni` pouze společně
   s `aktivni-clen`. Samotná nadstavba bez aktivní báze je nevalidní
   (`"Nadstavbové role (člen rady, vedení) vyžadují roli aktivní člen."`).
3. **Admin mimo exkluzivitu:** `admin` se nepočítá do báze ani do nadstavby.
   Samotný `admin` je validní kombinace; `admin` + validní báze
   (např. `["aktivni-clen", "vedeni", "admin"]` u `c01`) je také validní.
   Validace patří na hranici (formulář / API), vnitřní kód typům věří.

## Jak se pozná hodnost

Pouze dvě věci, nic jiného:

1. **Pole `role: Role[]`** u člena (`src/data/mockClenove.ts`, typ `RoleSet`).
   Žádná booleovská pole `aktivni` / `rada` / `vedeni` na datovém modelu
   neexistují — stav a zařazení se vždy odvozují z `role[]`.
2. **Badge v UI** — barva badge přes helper `getRoleStyle(role)`
   z deníkových tokenů (papír `#FBF8F1`, inkoust `#1A2E22`,
   smrk `#2D6A4F`, linka `#DCE7DE`, jantar `#A05E0C`, mech `#5C6B60`).
   Neznámá (budoucí vlastní) role neshazuje — vrací neutrální styl
   (stejný jako `clen`).

Odvození v kódu: `jeClen`, `jeAktivniClen`, `jeVRade`, `jeVeVedeni`,
`jeAdmin` (`role.includes(...)`), hranice `isKnownRole`,
chyby česky z `chybaKombinaceRole`, boolean z `jeValidniKombinaceRole`.

## Taby a tabulka (5 pohledů)

`AdminClenovePage` má 5 tabů, každý filtruje **pouze podle `role[]`**
stejným predikátem pro počet i pro výpis:

| Tab | Predikát |
|-----|----------|
| Všichni | bez filtru (`MOCK_CLENOVE.length`) |
| Aktivní | `jeAktivniClen(role)` |
| Rada | `jeVRade(role)` |
| Vedení | `jeVeVedeni(role)` |
| Členové | `jeClen(role)` (= základní neaktivní členové) |

Tabulka `ClenoveTable` nemá žádné booleany v datech. Sloupce:
Jméno · Role / Hodnost (`RoleBadge` za každou roli z `role[]`) ·
Stav (`jeAktivniClen` → „Aktivní člen“ / „Člen“) ·
Zařazení (`jeVRade` → „Rada“, `jeVeVedeni` → „Vedení“, jinak „—“).

Mock: 14 členů v `MOCK_CLENOVE`, pouze `role[]`, všechny kombinace validní
dle `jeValidniKombinaceRole` (admin výjimka `c01` viz výše).

## Jak přidat vlastní roli (jako nadstavbu)

Aditivně, nemazat existující ID:

1. Přidej ID do `Role` unionu + položku do `ROLE_LIST` (název, popis).
2. Přidej větev do `getRoleStyle` (deníkové tokeny; fallback už existuje).
3. Přidej helper `jeXVlastni(role: RoleSet): boolean`
   (`role.includes("moje-role")`) — stejný vzor jako `jeVRade`.
4. Rozšiř `chybaKombinaceRole`: nová role je nadstavba → vyžaduje
   `aktivni-clen` (stejně jako `clen-rady` / `vedeni`).
5. Volitelně: mock data, tab / filtr, badge text. Validaci nech na hranici.
6. Výhledově: správa rolí v admin UI bez zásahu do kódu.
