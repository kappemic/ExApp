/**
 * scripts/over-strava.ts — Krok 9: kontrola Strava OAuth bez secretů.
 *
 * Co dělá (jen čte env, nic nemění):
 * - zkontroluje STRAVA_CLIENT_ID (musí být číselné — Strava app id),
 *   STRAVA_REDIRECT_URI, CLIENT_URL a STRAVA_MOCK,
 * - vytiskne sestavenou authorize URL (jen veřejné client_id — nikdy
 *   secret ani tokeny),
 * - vytiskne návod Strava portal → .env.local → restart → klik.
 *
 * Spuštění: `npm run over-strava` (BFF běžet nemusí).
 * Exit 0 = reálné ID nebo MOCK režim; exit 1 = chybí konfigurace.
 * BEZPEČNOST: nikdy netiskne STRAVA_CLIENT_SECRET ani tokeny.
 */

import dotenv from "dotenv";
import { resolve } from "node:path";
import {
  STRAVA_SCOPE_DEFAULT,
  ctiKlientskyPuvod,
  ctiStravaClientId,
  ctiStravaRedirectUri,
  jeRealneClientId,
  sestavStravaAuthUrl,
} from "../server/src/strava";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

function maskaId(id: string): string {
  // Číselné ID není secret — tiskne se celé pro kontrolu v URL.
  return id;
}

function main(): void {
  const clientId = ctiStravaClientId();
  const realne = jeRealneClientId(clientId);
  const mock = (process.env["STRAVA_MOCK"] ?? "").trim() === "1";
  const redirectUri = ctiStravaRedirectUri();
  const puvod = ctiKlientskyPuvod();

  process.stdout.write("== Strava OAuth kontrola (Krok 9) ==\n");
  process.stdout.write(
    `STRAVA_CLIENT_ID: ${realne ? `OK (${maskaId(clientId.trim())})` : "CHYBÍ / není číselné"}\n`,
  );
  process.stdout.write(`STRAVA_REDIRECT_URI: ${redirectUri}\n`);
  process.stdout.write(`CLIENT_URL (cíl 302): ${puvod}\n`);
  process.stdout.write(`STRAVA_MOCK: ${mock ? "1 (fixture pro testy)" : "vypnuto"}\n`);
  process.stdout.write(`Scope: ${STRAVA_SCOPE_DEFAULT}\n`);

  if (realne) {
    const url = sestavStravaAuthUrl({
      clientId: clientId.trim(),
      redirectUri,
      state: "kontrola",
      scope: STRAVA_SCOPE_DEFAULT,
    });
    const parsed = new URL(url);
    process.stdout.write("\nAuthorize URL (bez secretu):\n");
    process.stdout.write(`${url}\n`);
    process.stdout.write("\nParametry:\n");
    for (const klic of [
      "client_id",
      "response_type",
      "redirect_uri",
      "scope",
      "approval_prompt",
      "state",
    ]) {
      process.stdout.write(`  ${klic}=${parsed.searchParams.get(klic) ?? ""}\n`);
    }
    process.stdout.write("\nSTAV: OK — reálný flow jde ověřit.\n");
    return;
  }

  if (mock) {
    process.stdout.write(
      "\nSTAV: MOCK — testy projdou s fixture výměnou, reálný redirect na Stravu nefunguje.\n",
    );
    process.stdout.write(
      "Pro reálný flow nastav číselné STRAVA_CLIENT_ID a MOCK vypni.\n",
    );
    return;
  }

  process.stdout.write("\nSTAV: NENASTAVENO — /api/strava/auth-url vrátí 503.\n");
  process.stdout.write("\nNávod (5 minut):\n");
  process.stdout.write(
    "1) Strava portal (Settings → My API Application): zkopíruj Client ID (číslo)\n",
  );
  process.stdout.write(
    "   a Client Secret; do Authorization Callback Domain dej localhost (bez portu).\n",
  );
  process.stdout.write("2) Do .env.local (server-only, nikdy VITE_ pro secret):\n");
  process.stdout.write("     STRAVA_CLIENT_ID=123456\n");
  process.stdout.write("     STRAVA_CLIENT_SECRET=sem-secret\n");
  process.stdout.write(
    `     STRAVA_REDIRECT_URI=${redirectUri}\n`,
  );
  process.stdout.write("     VITE_STRAVA_CLIENT_ID=123456\n");
  process.stdout.write("   (MOCK pro reálný flow smaž / nastav na 0.)\n");
  process.stdout.write("3) Restartuj BFF (npm run server:dev) — env se čte při startu.\n");
  process.stdout.write(
    "4) Otevři Profil → Připojit Stravu → potvrď na Stravě → návrat ?strava=propojeno.\n",
  );
  process.exitCode = 1;
}

main();
