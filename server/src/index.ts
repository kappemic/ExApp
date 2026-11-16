/**
 * server/src/index.ts — thin BFF bootstrap.
 *
 * Handlers live in registruj* modules. This file wires middleware, health,
 * route registration, the /api 404, the static client, and listen.
 * Expired registration codes are removed on startup and every minute
 * by smazExpirovaneKody from ucty-routes.ts.
 */

import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { registrujAlba } from "./alba-routes";
import { posliChybu } from "./chyby";
import { registrujCestaSnimky } from "./cesta-snimky-routes";
import { registrujCleny } from "./clenove-routes";
import { doplnHostovanyPuvod, parseAllowedOrigins } from "./cors";
import { getDb } from "./db";
import { registrujDiskuzi } from "./diskuze-routes";
import { registrujFotkyVyprav } from "./fotky-routes";
import { vytvorOriginKontrolu } from "./origin-kontrola";
import { ctiEnv, jeProdukce, prostredi } from "./prostredi";
import { registrujSchuzky } from "./schuzky-routes";
import { registrujSkupiny } from "./skupiny";
import { kompreseOdpovedi } from "./komprese";
import { cestaKeKlientovi, maVestavenehoKlienta, registrujStatickehoKlienta } from "./staticky-klient";
import { registrujStatistiky } from "./statistiky-routes";
import { registrujStravu } from "./strava-routes";
import { registrujUcty, smazExpirovaneKody } from "./ucty-routes";
import { srovnejStavyObsazenosti } from "./vypravy";
import { registrujVypravy } from "./vypravy-routes";
import { registrujPush } from "./push-routes";
import { registrujZpevnik } from "./zpevnik-routes";

dotenv.config({ path: [".env.local", ".env"] });

const PORT = Number.parseInt(ctiEnv("PORT") ?? "3001", 10);
// Produkce: CLIENT_URL muze byt seznam oddeleny carkou
// ("https://app.example.cz,https://admin.example.cz").
// Parsovani je v server/src/cors.ts (testovane bez serveru).
const CLIENT_URL = doplnHostovanyPuvod(
  parseAllowedOrigins(ctiEnv("CLIENT_URL")),
  {
    railwayPublicDomain: ctiEnv("RAILWAY_PUBLIC_DOMAIN"),
    renderExternalUrl: ctiEnv("RENDER_EXTERNAL_URL"),
  },
);

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: jeProdukce(),
    frameguard: { action: "deny" },
  }),
);
app.set("trust proxy", 1);
// Text responses (HTML, JS, CSS, JSON). Hashed assets also get a long Cache-Control
// in staticky-klient. The TLS edge (Railway) speaks HTTP/2 to the browser; this
// process stays HTTP/1.1 behind that proxy.
app.use(kompreseOdpovedi);
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use("/api", vytvorOriginKontrolu(CLIENT_URL));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

registrujUcty(app);
registrujVypravy(app);
registrujCleny(app);
registrujFotkyVyprav(app);
registrujSchuzky(app);
registrujStravu(app);
registrujStatistiky(app);
registrujDiskuzi(app);
registrujAlba(app);
registrujSkupiny(app);
registrujCestaSnimky(app);
registrujZpevnik(app);
registrujPush(app);

/* Neznámá /api cesta → jednotná 404 (mimo /api necháváme statický hosting). */
app.use("/api", (_req: Request, res: Response) => {
  posliChybu(res, "NENALEZENO", "Tahle stránka API neexistuje.");
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError) {
    posliChybu(res, "BAD_REQUEST", "Požadavek není platný JSON.");
    return;
  }
  posliChybu(res, "VNITRNI_CHYBA", "Něco se pokazilo. Zkus to prosím později.");
});

const distKlient = cestaKeKlientovi();
if (maVestavenehoKlienta(prostredi(), distKlient)) {
  registrujStatickehoKlienta(app, distKlient);
}

const port = Number.isFinite(PORT) && PORT > 0 ? PORT : 3001;
const host = "0.0.0.0";
app.listen(port, host, () => {
  process.stdout.write(`ExApp BFF naslouchá na http://${host}:${port}\n`);
  void srovnejStavyObsazenosti(getDb()).catch(() => undefined);
  void smazExpirovaneKody().catch(() => undefined);
  const cisteniKodu = setInterval(() => {
    void smazExpirovaneKody().catch(() => undefined);
  }, 60_000);
  cisteniKodu.unref();
});
