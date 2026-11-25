# Bezpečnostní rizika a známá omezení — profil / auth (review Steps 3–5)

Krátký rizikový záznam k must-fix 1 + 3 (Q3, rate-limit, CSRF).
Threat model: důvěryhodnost hranice = HTTP požadavek se session cookie
(`exapp_session`, `sameSite: lax`, `httpOnly`); asset = e-mail + heslo
(převzetí účtu) a dostupnost login/profil endpointů.

## Změna e-mailu a hesla (OPRAVENO, zbývají dvě omezení)

- **Stav:** `PATCH /api/me` cílí vždy na `session.user.id` (IDOR vyloučen
  konstrukcí — žádné `:id` v URL). Změna hesla i skutečná změna e-mailu
  vyžadují `soucasneHeslo`, které server ověří přes `overHeslo` proti hashi
  z DB (`server/src/ucty-routes.ts`). Ověření běží před kontrolou kolize
  e-mailu, takže session bez hesla přes 409 nezjistí cizí adresy.
- **Zbývá (riziko):** nová adresa se neověřuje, změna e-mailu neprokazuje
  vlastnictví schránky. Staré session po změně hesla platí dál do vypršení,
  protože JWT nese jen `{ sub }`, takže změna hesla útočníka s ukradenou
  session neodhlásí.
- **Follow-up:** verifikační krok na novou adresu a zneplatnění session
  po změně hesla.

## Rate-limit je jen částečný (ZNÁMÉ OMEZENÍ)

- **Stav:** `POST /api/login` a `POST /api/register` mají společný limit
  10 pokusů/min/IP (`server/src/prihlaseni-limit.ts`, odpověď
  `429 MOC_POZADAVKU`). `PATCH /api/me` má 5 pokusů/min/účet
  (`server/src/profil-limit.ts`). Vlastní limity má i odesílání zpráv
  a oznámení. Čítače jsou v paměti procesu, takže na více instancích limit
  neplatí společně a restart ho vynuluje. Přihlášení se počítá jen podle IP.
  `POST /api/admin/codes` limit nemá.
- **Riziko (DDoS / brute-force):** pomalejší hádání hesla z více IP adres
  (enumerace přes načasování). S ukradenou session zůstává hádání
  současného hesla omezené jen na 5 pokusů za minutu.
- **Follow-up (povinný):** limity ve sdíleném úložišti a limit přihlášení
  i podle e-mailu. Do té doby držet krátké expirace kódů (10 min)
  a jednotné 401 bez rozlišení e-mail/heslo.

## CSRF — kontrola Origin (OPRAVENO, zbývají omezení)

- **Stav:** session je cookie `exapp_session` (`httpOnly`, `sameSite: lax`,
  `secure` jen v produkci — `server/src/auth.ts` `nastavSessionCookie`) +
  `Authorization: Bearer` fallback. Všechny metody kromě GET, HEAD a OPTIONS
  na `/api` procházejí kontrolou `Origin` (`server/src/origin-kontrola.ts`).
  Povolený je seznam z `CLIENT_URL` a vlastní veřejná adresa požadavku,
  ostatní dostanou 403 `ZAKAZANO`.
- **Výjimky:** požadavek bez hlavičky `Origin` projde (skripty, nativní
  klienti, velmi staré prohlížeče) a projde i samotný Bearer bez session
  cookie, protože cizí stránka tu hlavičku bez preflightu nepošle.
- **Zbývá:** GET se zápisem (`GET /api/strava/callback` chráněný `state`,
  `GET /api/strava/stav?obnovit=1`) kontrola nepokrývá. `secure` platí jen
  v produkci.
- **Provoz:** adresa klienta musí být v `CLIENT_URL` nebo shodná s adresou
  serveru. Vite na jiném portu než 5173 bez úpravy `CLIENT_URL` dostane
  403 i u uploadů.

## Offline kopie účtu v telefonu (PŘIJATÉ OMEZENÍ)

- **Stav:** poslední ověřený účet je v `localStorage` (`exapp:ucet-v1`,
  `src/lib/ulozeny-ucet.ts`). Nese jen výčet polí pro zobrazení, žádný token.
  Session drží dál jen httpOnly cookie a role z kopie nic neotevírá, rozhoduje
  guard na serveru. Platí nejvýš 30 dní bez ověření. Bez „Zůstat přihlášený“
  je v `sessionStorage`.
- **Mazání:** odhlášení, 401 z `GET /api/me` a přihlášení jiného účtu smažou
  kopii i soukromá data. Odhlášení bez sítě se serveru dožene po připojení.
- **Zbývá:** do připojení na telefonu zůstává platná cookie odhlášeného.
  Obrázky (`Cache-Control: private, max-age`) drží HTTP cache prohlížeče i po
  odhlášení.

## Ověření po opravě (must-fix 1–3)

- `skola` / `trida` round-trip: `toApiUser` je vrací (`server/src/auth.ts`),
  `ApiUser.skola/trida` aditivně optional (`src/shared/api-types.ts`),
  `ProfileForm zApi` je předvyplňuje (ulož → reload drží).
- `tsc` klient + server čisté, žádný `any`.
