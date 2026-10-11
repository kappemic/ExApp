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

## Mapování na auth (binární `USER` / `ADMIN`)

Auth je binární (dle `AGENTS.md:15`): `jeAdmin(role)` → `ADMIN`, jinak `USER`.
Hodnostní model (`role[]`) se tím nemění — zůstává zdrojem pravdy pro UI.

| Hodnost (`Role`) | Auth role | Poznámka |
|------------------|-----------|----------|
| `admin` | `ADMIN` | Přístup k rozšiřujícím ovládacím prvkům napříč aplikací. |
| `clen` | `USER` | Čtení (výpravy, kalendář, statistiky); bez správy výprav. |
| `aktivni-clen` | `USER` | Čtení + dle `PRD.md:32-33` může vytvářet a upravovat výpravy. |
| `clen-rady` | `USER` | Čtení + podíl na rozhodování oddílu; auth se nemění. |
| `vedeni` | `USER` | Nejvyšší hodnost v UI; v auth stále `USER` (není `ADMIN`). |

Pravidla:

- Kombinace s `admin` (např. `["aktivni-clen", "vedeni", "admin"]`) → `ADMIN`.
- Vše ostatní (jakákoliv validní kombinace bez `admin`) → `USER`.
- Demo flag `?admin=1` zůstává do `Fáze1-auth` (pouze pro lokální demo, nenahrazuje auth).
---
## Dodatek — 3D model clenstvi + skola/trida (Krok 9, vlna 3D role)

> Tento dodatek pouze PRIDAVA. Kapitoly vyse (Seznam roli, Pravidla kombinaci,
> Jak se pozna hodnost, Taby, Jak pridat roli, Mapovani na auth) se NEMENI —
> stary `Role` union + `ROLE_LIST` + `chybaKombinaceRole` zustavaji zdrojem
> pravdy pro UI; novy 3D model je aditivni nadstavba (kontrakt se nelame).

### 1. Tri osy 3D modelu

Zdroj pravdy: `src/config/roles.ts` (`Clenstvi`, `Funkce`, `ClenskyProfil`
+ `mapujRoliNaProfil`, `chybaKombinace3D`, `smiNaVypravy`).

- `clenstvi: "clen" | "aktivni_clen"` — zakladni prislusnost (baze).
- `funkce: "vedeni" | "rada" | null` — nadstavba (`null` = bez funkce).
- `isAdmin: boolean` — ortogonalni technicky priznak (neni hodnost).

Server: `server/src/auth.ts` (`SessionUzivatel` nese trio ctene vzdy cerstve
z DB, nikdy z tokenu; `trioNaRoli` = normativni dual-write mirror trio -> stara
`role`; `ctiTrioZRadku` = bezpecny default pro neznama data).
DB: `drizzle/schema/users.ts` (+ `clenstvi` NOT NULL DEFAULT 'clen',
`funkce` nullable, `is_admin` NOT NULL DEFAULT FALSE, `skola`/`trida`
NOT NULL DEFAULT ''). CHECK zije jen v SQL migraci 0005 (stejne jako dosud
u `users.role`).

### 2. Mapovaci tabulka stara role -> 3D profil (`mapujRoliNaProfil`)

| Stara `Role` | `clenstvi` | `funkce` | `isAdmin` |
|---|---|---|---|
| `clen` | `clen` | `null` | `false` |
| `aktivni-clen` | `aktivni_clen` | `null` | `false` |
| `clen-rady` | `aktivni_clen` | `rada` | `false` |
| `vedeni` | `aktivni_clen` | `vedeni` | `false` |
| `admin` | `aktivni_clen` | `null` | `true` |
| `USER` (auth) | `clen` | `null` | `false` |
| `ADMIN` (auth) | `aktivni_clen` | `null` | `true` |
| neznamy string | `clen` | `null` | `false` (bezpecny default) |

Obratne (`trioNaRoli`, normativni poradi): `isAdmin` -> `'admin'`;
aktivni + `vedeni` -> `'vedeni'`; aktivni + `rada` -> `'clen-rady'`;
aktivni -> `'aktivni-clen'`; jinak `'clen'`. Cista funkce bez DB; registr
i PATCH users zapisuji trio + mirror `role` atomicky v temze UPDATE
(nikdy oddelene).

### 3. Pravidlo funkce-jen-s-aktivnim

`clen` + funkce (`vedeni`/`rada`) = chyba
(`"Funkci (vedeni/rada) muze mit jen aktivni clen."`).
Vynuceno ve 3 vrstvach: DB CHECK `users_funkce_vyzaduje_aktivniho_check`
(`funkce IS NULL OR clenstvi = 'aktivni_clen'`), `chybaKombinace3D`
(`src/config/roles.ts`, `isAdmin` se ignoruje), a `validujUpravuUzivatele`
(`server/src/validace.ts`, efektivni trio = merge s DB radkem, takze ani
parcialni `clenstvi: clen` pri stavajici funkci neprojde).
Klient zrcadli: `ClenDetailModal` hlida `chybaKombinace3D` na hranici formulare.

### 4. `isAdmin` je ortogonalni

Guardy nectou `role === 'admin'` ani token — jen cerstve `is_admin` z DB
(`vyzadujPrihlaseni` ho vzdy nacte z radku; `toApiUser.authRole` =
`isAdmin ? ADMIN : USER`; `jeSystemBezAdmina` = `is_admin = TRUE`).
Stara `role` je jen mirror pro zpetnou kompatibilitu
(`ZastaralaRole` alias, `UpravitUzivateleRequest { role }` deprecated).

### 5. Prava: kdo smi vypravy / kody / cleny / fotky

- **Vypravy (dual-guard, 6 rout):** `vyzadujSpravceVyprav` =
  `isAdmin` NEBO `smiNaVypravy` (jen `aktivni_clen`; samotny admin priznak
  nestaci, `smiNaVypravy` `isAdmin` zamerne necte). Plati pro
  `POST /api/expeditions`, `PATCH /api/expeditions/:id`,
  `DELETE /api/expeditions/:id`, `PATCH /api/expeditions/:id/uzavrit`,
  `POST /api/expeditions/:id/ucastnici`,
  `DELETE /api/expeditions/:id/ucastnici/:ucastnikId`.
  Klient: `useAuth.mu­zeSpravovatVypravy` (stejny predikat).
- **Kody + clenove (jen ADMIN):** `POST /api/admin/codes`
  (vc. bootstrap bez session), `GET /api/users`, `PATCH /api/users/:id`,
  `GET /api/clenove`, `PATCH /api/clenove/:id` = `vyzadujAdmina`
  (`is_admin = TRUE`). `PATCH /api/users/:id` bere parcialni trio
  (`clenstvi?/funkce?/isAdmin?/skola?/trida?`) NEBO samotne stare `{ role }`
  (pres `mapujRoliNaProfil`); oboji najednou -> 422.
- **Fotky (jen ADMIN, zamerne mimo dual-guard):**
  `POST /api/expeditions/:id/fotky` a
  `DELETE /api/expeditions/:id/fotky/:fotkaId` = `vyzadujAdmina`.
  `GET /api/expeditions/:id/fotky` = verejne (jen proběhlá logika v route).
- **Verejne / USER:** `GET /api/expeditions`, `GET /api/expeditions/:id`,
  ucast (`GET /:id/ucastnici`, `POST /:id/prihlasit`, `DELETE /:id/odhlasit`)
  = PUBLIC / prihlaseny USER (beze zmen).

### 6. Registrace skola/trida + meta endpoint

- Nepovinne, trim na hranici, prazdna/whitespace -> `""`
  (`overSkolaTrida`, max 120: `VALIDACE.skolaMaxDelka/tridaMaxDelka`,
  ceske hlasky `skolaDlouha/tridaDlouha`). Server: `validujRegistraci`
  -> `CistaRegistrace { skola, trida }` -> `POST /api/register` ulozi.
  Klient: `RegisterPage` (datalist) + `useAuth` mirror validace.
- `PATCH /api/users/:id`: `skola?/trida?` parcialni (jen ADMIN);
  skola/trida roli NEMENI (mirror `role` se prepocitava jen pri zmene tria).
- `GET /api/meta/skoly-tridy` (PUBLIC, `META_SKOLY_TRIDY_PATH`):
  jen `{ skoly: string[], tridy: string[] }` — zadne osobni udaje
  (nikdy `user_id`/e-maily); DISTINCT otrimovanych neprazdnych hodnot,
  case-insensitive dedup (prvni original vitezi), razeni podle lowercase,
  LIMIT 200 + 200, `Cache-Control: public, max-age=60`.
  Tvar hlida `jeSkolyTridyOdpoved` (cizi klice odpoved odmitnou).
  Klient: `src/lib/skoly-tridy.ts` (`nactiSkolyTridy`, zadny secret,
  jen `VITE_API_BASE_URL`, tichy fallback na prazdne seznamy).
  Volny text povolen: nova hodnota z registrace se objevi v budoucim
  naseptavani (server cte distinct z `users`).

### 7. Rozhodnuti vlny (zaznam)

1. **vedeni/rada = prava aktivniho.** `smiNaVypravy` cte jen `clenstvi`;
   funkce prava nerozsiruje (ani `vedeni`). Dual-guard na 6 expedition routach,
   fotky zustavaji jen ADMIN.
2. **Tridy globalne.** Zadny ciselnik s vazbou skola->trida; obe datalistu
   jsou globalni distinct (viz meta endpoint vyse).
3. **Backfill pravidla (migrace `0005_3d_role_skola_trida.sql`, APLIKOVANA):**
   `admin` -> (`aktivni_clen`, NULL, TRUE); `clen` -> (`clen`, NULL, FALSE);
   `aktivni-clen` -> (`aktivni_clen`, NULL, FALSE);
   `clen-rady` -> (`aktivni_clen`, 'rada', FALSE);
   `vedeni` -> (`aktivni_clen`, 'vedeni', FALSE);
   nezname -> (`clen`, NULL, FALSE). Produkcni overeni: 2x admin
   -> aktivni+admin, 3x clen -> clen. Migrace je idempotentni a jen
   `ADD COLUMN IF NOT EXISTS` / `UPDATE` backfill / `ADD CONSTRAINT`
   (zadny DROP sloupce, zadny DELETE, zadny RENAME).
4. **Kontrakt aditivni.** `Role` union, `MATICE`, `AuthRole` nedotceny;
   trio v `ApiUser`/`AdminClen`/`ClenPrehled`/`UserListItem` je optional,
   `RegistraceRequest.skola?/trida?` optional, `VALIDACE`/`VALIDACNI_ZPRAVY`
   jen pridavaji `skola/trida` klice. Stare `{ role }` PATCH funguje dal.

### 8. Dukazy Kroku 9

`npm test` 219/219; `tsc --noEmit` (klient) cisty;
`tsc -p server --noEmit` cisty; `GET /api/health` -> `{ ok: true }`;
`GET /api/meta/skoly-tridy` -> `{ skoly, tridy }` realna data, zadna PII.
