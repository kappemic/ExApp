# TODO_DISCORD — reálný webhook E2E (Fáze 5, zbývá)

Stav: jednotkové + integrační testy Discordu zelené (`tests/discord.test.ts`
24/24), živý smoke `npm run smoke:faze5-discord` prochází jen fail-open
bez reálné URL (4 PASS, 0 FAIL, 2 SKIP). Reálné doručení embedu do kanálu
Discord **nebylo ověřeno** — vědomě odloženo, neblokuje diskuzi ani guardy.

## Checklist (česky, s výslovným souhlasem uživatele)

1. V Discordu založit testovací kanál + příchozí webhook (kopírovat URL).
2. Do `.env.local` (NIKDY do Gitu, NIKDY s prefixem `VITE_`) přidat:
   `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`
3. Restartovat BFF (`npm run server:start`), ověřit `GET /api/health` → 200.
4. Nastavit `SMOKE_ADMIN_EMAIL` + `SMOKE_ADMIN_HESLO`, spustit
   `npm run smoke:faze5-discord` — očekáváno 6 PASS (včetně `POST
   /api/oznameni` → 201 a `POST /api/expeditions` → 201 s doručením).
5. V Discord kanálu zkontrolovat embed (titulek „Nová výprava: …", pole
   Datum/Sraz/Odkaz, barva `0x22c55e`).
6. Úklid: smazat testovací výpravu (`DELETE`, admin) i webhook v Discordu;
   URL z `.env.local` po testu smazat nebo přepsat.
7. Tento soubor po zeleném E2E smazat (nebo převést na jeden řádek v HANDOFF).

## Bezpečnost

- URL webhooku je secret — nikdy do logů, dokumentů ani commitu (server
  loguje jen `discord_preskocen` / `discord_neodeslano` bez URL a bez těla).
- Allowlist platí dál: jen `https://discord.com/api/webhooks/` a
  `https://discordapp.com/api/webhooks/`; vše ostatní je no-op před fetch.
- Fail-open zůstává: pád Discordu nikdy nesmí shodit request aplikace.
