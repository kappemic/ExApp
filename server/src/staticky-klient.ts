/**
 * Serves the Vite production build from the same process as the API.
 * Same origin keeps the session cookie working without a second host.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

export function cestaKeKlientovi(cwd: string = process.cwd()): string {
  return path.resolve(cwd, "dist");
}

/** Production (or SERVE_CLIENT=1) and a built index.html. */
export function maVestavenehoKlienta(env: NodeJS.ProcessEnv, distDir: string): boolean {
  const zapnuto = env["NODE_ENV"] === "production" || env["SERVE_CLIENT"] === "1";
  return zapnuto && existsSync(path.join(distDir, "index.html"));
}

/** Public origin from the proxy headers Railway (or any TLS proxy) sends. */
export function puvodPozadavku(req: Request): string {
  const hostRaw = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  const host = hostRaw.split(",")[0]?.trim() ?? "";
  const protoRaw = req.get("x-forwarded-proto") ?? req.protocol;
  const proto = protoRaw.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}

/** Tells the client to call the API on the host that served this page. */
export function htmlSAktualnimApi(html: string, origin: string): string {
  const bez = html.replace(
    /<script>window\.__EXAPP_API_BASE__=.*?<\/script>/g,
    "",
  );
  const tag = `<script>window.__EXAPP_API_BASE__=${JSON.stringify(origin)};</script>`;
  if (bez.includes("</head>")) return bez.replace("</head>", `${tag}</head>`);
  return `${tag}${bez}`;
}

function posliIndex(req: Request, res: Response, indexHtml: string): void {
  const html = readFileSync(indexHtml, "utf8");
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(htmlSAktualnimApi(html, puvodPozadavku(req)));
}

/**
 * Hashed Vite files can stay in the browser for a year. HTML and the service
 * worker must revalidate so a new deploy is picked up.
 */
export function cacheStatickehoSouboru(cesta: string): string {
  const normal = cesta.replace(/\\/g, "/");
  const jmeno = normal.slice(normal.lastIndexOf("/") + 1);
  if (jmeno === "index.html") return "no-store";
  if (
    jmeno === "sw.js" ||
    jmeno === "push-sw.js" ||
    jmeno === "registerSW.js" ||
    jmeno === "manifest.webmanifest"
  ) {
    return "no-cache";
  }
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(normal)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=86400";
}

/** Client-side routes get index.html. API and real files do not. */
export function jeSpaFallback(method: string, pathname: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname.startsWith("/api")) return false;
  const posledni = pathname.split("/").pop() ?? "";
  return !posledni.includes(".");
}

export function registrujStatickehoKlienta(app: Express, distDir: string): void {
  const indexHtml = path.join(distDir, "index.html");
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path !== "/" && req.path !== "/index.html") {
      next();
      return;
    }
    posliIndex(req, res, indexHtml);
  });
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, cesta) {
        res.setHeader("Cache-Control", cacheStatickehoSouboru(cesta));
      },
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!jeSpaFallback(req.method, req.path)) {
      next();
      return;
    }
    posliIndex(req, res, indexHtml);
  });
}
