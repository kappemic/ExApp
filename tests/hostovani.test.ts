import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { doplnHostovanyPuvod } from "../server/src/cors";
import {
  cacheStatickehoSouboru,
  htmlSAktualnimApi,
  jeSpaFallback,
  maVestavenehoKlienta,
} from "../server/src/staticky-klient";

const docasne: string[] = [];

afterEach(() => {
  for (const slozka of docasne.splice(0)) {
    rmSync(slozka, { recursive: true, force: true });
  }
});

describe("hostovaný původ", () => {
  it("bez platformy nechá lokální seznam", () => {
    expect(
      doplnHostovanyPuvod(["http://localhost:5173"], {}),
    ).toEqual(["http://localhost:5173"]);
  });

  it("přidá Railway a Render jen jednou", () => {
    expect(
      doplnHostovanyPuvod(["https://exapp.up.railway.app"], {
        railwayPublicDomain: "exapp.up.railway.app",
        renderExternalUrl: "https://exapp.onrender.com/",
      }),
    ).toEqual([
      "https://exapp.up.railway.app",
      "https://exapp.onrender.com",
    ]);
  });
});

describe("aktuální API v HTML", () => {
  it("vloží původ stránky před head", () => {
    const html = htmlSAktualnimApi(
      "<head><title>x</title></head>",
      "https://exapp.up.railway.app",
    );
    expect(html).toContain(
      '<script>window.__EXAPP_API_BASE__="https://exapp.up.railway.app";</script></head>',
    );
  });
});

describe("SPA fallback", () => {
  it("vrací stránku pro klientské cesty", () => {
    expect(jeSpaFallback("GET", "/")).toBe(true);
    expect(jeSpaFallback("GET", "/vypravy")).toBe(true);
    expect(jeSpaFallback("HEAD", "/chat")).toBe(true);
  });

  it("nechá API a soubory projít dál", () => {
    expect(jeSpaFallback("GET", "/api/health")).toBe(false);
    expect(jeSpaFallback("POST", "/vypravy")).toBe(false);
    expect(jeSpaFallback("GET", "/assets/app.js")).toBe(false);
    expect(jeSpaFallback("GET", "/sw.js")).toBe(false);
  });
});

describe("cache statických souborů", () => {
  it("hashované assety drží rok, HTML a service worker se berou znovu", () => {
    expect(cacheStatickehoSouboru("C:/app/dist/assets/index-a1b2c3d4.js")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(cacheStatickehoSouboru("/app/dist/assets/pisma-deadbeef.woff2")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(cacheStatickehoSouboru("/app/dist/index.html")).toBe("no-store");
    expect(cacheStatickehoSouboru("/app/dist/sw.js")).toBe("no-cache");
    expect(cacheStatickehoSouboru("/app/dist/manifest.webmanifest")).toBe("no-cache");
    expect(cacheStatickehoSouboru("/app/dist/favicon.png")).toBe("public, max-age=86400");
  });
});

describe("nasazení se ukáže i v nainstalované aplikaci", () => {
  it("stránku bere nejdřív ze sítě, uložená kopie je jen offline", () => {
    const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(vite).toContain('handler: "NetworkFirst"');
    expect(vite).toContain('request.mode === "navigate"');
    expect(vite).not.toContain("navigateFallback:");
  });
});

describe("vestavěný klient", () => {
  it("v produkci chce hotový index.html", () => {
    const koren = mkdtempSync(path.join(tmpdir(), "exapp-"));
    docasne.push(koren);
    expect(maVestavenehoKlienta({ NODE_ENV: "production" }, koren)).toBe(false);
    writeFileSync(path.join(koren, "index.html"), "<!doctype html>");
    expect(maVestavenehoKlienta({ NODE_ENV: "production" }, koren)).toBe(true);
    expect(maVestavenehoKlienta({ NODE_ENV: "development" }, koren)).toBe(false);
    expect(maVestavenehoKlienta({ SERVE_CLIENT: "1" }, koren)).toBe(true);
  });

  it("ignoruje složku bez indexu", () => {
    const koren = mkdtempSync(path.join(tmpdir(), "exapp-"));
    docasne.push(koren);
    mkdirSync(path.join(koren, "assets"));
    expect(maVestavenehoKlienta({ NODE_ENV: "production" }, koren)).toBe(false);
  });
});
