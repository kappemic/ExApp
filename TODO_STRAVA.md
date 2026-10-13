# Strava připojování – zbývá dodělat

Ponecháno po Kroku 10: OAuth (`GET /api/strava/auth-url`, `GET /api/strava/callback`,
`DELETE /api/strava/odpojit`, `GET /api/strava/neparovane`, `POST :id/strava-parovani`)
+ ruční zápis km/převýšení BEZ data a BEZ odkazu
(`POST /api/expeditions/:id/aktivita-ruchne { km, prevyseni_m }`).
Odebráno: `POST :id/strava-odkaz`, `parseStravaOdkaz`, `validujStravaOdkaz`,
typy §15e, UI sekce odkazu, datum z ručního zápisu.
Expedition-level sdílení PONECHÁNO: jedna aktivita na expedici → všem `ucastnil_se`.

## Checklist

- [ ] Reálné `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` v server env
  (dnes jen `STRAVA_MOCK=1` fixture, `GET /api/strava/auth-url` bez klíčů vrací 503).
- [ ] Authorization Callback Domain na Stravě: nastavit na localhost
  (default server callback `http://localhost:3001/api/strava/callback`,
  případně vlastní `STRAVA_REDIRECT_URI`) + `CLIENT_URL` pro návrat na profil.
- [ ] Skript `npm run over-strava` prošel OK (auth-url → callback → tokeny → neparovane).
- [ ] End-to-end klik v prohlížeči: Profil → Propojit se Stravou → souhlas →
  `?strava=propojeno` → návrh → Potvrdit k proběhlé výpravě.
- [ ] Refresh tokenů v produkci: `zajistiPlatnyAccessToken` obnovuje před expirací
  (rezerva 5 minut), session tím netrpí — ověřit proti reálné Stravě po nasazení
  (expirace ~6 h), ne jen s mockem.
