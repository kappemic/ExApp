# Testovací účty (DEV) — co vidí která role

Seed skript vytvoří/aktualizuje 3 účty v DB, na kterou ukazuje `DATABASE_URL`
z `.env.local`. **Nikdy jej nespouštěj proti produkci** — při `NODE_ENV=production`
skript odmítne.

## Jak vytvořit / aktualizovat

```powershell
# Hesla nejdřív nastav do .env.local (git-ignorováno), min. 8 znaků:
#   TEST_SEED_HESLO_VEDOUCI=TestVedouci2026
#   TEST_SEED_HESLO_AKTIVNI=TestAktivni2026
#   TEST_SEED_HESLO_CLEN=TestClen2026
$env:TEST_SEED_HESLO_VEDOUCI="..."; $env:TEST_SEED_HESLO_AKTIVNI="..."; $env:TEST_SEED_HESLO_CLEN="..."
npm run seed:test-uzivatele
```

Není-li proměnná nastavená (nebo má < 8 znaků), vygeneruje se náhodné heslo
a vypíše **jednou** na stdout — ulož si ho do `.env.local`. Hesla z env se
nikdy netisknou. Hash bcryptjs cost 10 (stejně jako server). Skript je
idempotentní — opakovaný běh účty jen aktualizuje.

## Účty

| E-mail | Role (mirror) | členství | funkce | admin | Heslo (env) |
|---|---|---|---|---|---|
| `test-vedouci@example.cz` | `admin` | `aktivni_clen` | `vedeni` | ano | `TEST_SEED_HESLO_VEDOUCI` |
| `test-aktivni@example.cz` | `aktivni-clen` | `aktivni_clen` | — | ne | `TEST_SEED_HESLO_AKTIVNI` |
| `test-clen@example.cz` | `clen` | `clen` | — | ne | `TEST_SEED_HESLO_CLEN` |

Přihlášení: web `/login`, nebo `POST /api/login { email, heslo }`.
`test-aktivni@` má navíc účast na první proběhlé výpravě (`participants.status =
ucastnil_se`), aby měl v statistikách/heatmapě data.

## Matice viditelnosti

Zdroj pravdy pro práva: `src/config/roles.ts` (`smiNaVypravy` = členství
`aktivni_clen`) + ortogonální příznak `isAdmin`.

| Co | vedoucí | aktivní člen | běžný člen |
|---|---|---|---|
| Výpravy, kalendář, schůzky, žebríček, diskuse | čte | čte | čte |
| Přihlásit / odhlásit se na výpravu | ano | ano | ano |
| **Vytvořit výpravu** | ano | ano | ne |
| **Upravit výpravu** | ano | ano | ne |
| Uzavřít výpravu + docházka/účastníci | ano | ano | ne |
| **Odstranit výpravu** | ano | ano | ne |
| **Správa schůzek** (vytvořit/upravit/smazat) | ano | ano | ne |
| **Strava párování + Odpojit + ruční km** (v Upravit, proběhlá) | ano | ano | ne |
| Nahrát fotku (URL) | ano | ne | ne |
| Smazat fotku | ano | ne | ne |
| **Admin členové** (`/admin/clenove`) | ano | ne | ne |
| Vlastní statistiky / heatmapa | ano | ano | ano |

Poznámky:
- `smiNaVypravy` nečte `isAdmin` — jen aktivní členství (`aktivni_clen`).
  Vedoucí splňuje obě podmínky zároveň (aktivní členství + `isAdmin`).
- Správa výprav i schůzek je za dual-guardem `vyzadujSpravceVyprav`
  (= členství `aktivni_clen`), takže **aktivní člen vidí Upravit, Uzavřít,
  Strava párování i ruční zápis km** stejně jako vedoucí.
- Fotky (nahrání i smazání) i sekce Admin členové jsou za `vyzadujAdmina`
  — tam stačí aktivní členství ONO, potřebuje se `is_admin`.
- Ruční zápis km i párování ze Stravy jdou jen u výpravy ve stavu `proběhlá`
  (jinak 409 `VYPRAVA_UZAVRENA`).
- Sekce „Ušlé na výpravě" v detailu je jen u `proběhlá`.

## Prověření

```powershell
$h = New-Object System.Net.Http.HttpClient
# přihlášení a přečtení /api/me — ověř role/celnegstvio/isAdmin
```

Důkazy posledního běhu (všechny 3 účty `HTTP 200`):

| účet | role | členství | funkce | isAdmin |
|---|---|---|---|---|
| test-vedouci@example.cz | admin | aktivni_clen | vedeni | True |
| test-aktivni@example.cz | aktivni-clen | aktivni_clen | — | False |
| test-clen@example.cz | clen | clen | — | False |
