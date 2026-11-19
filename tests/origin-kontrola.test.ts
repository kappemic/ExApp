import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import cookieParser from "cookie-parser";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizujPuvod } from "../server/src/cors";
import { smiPuvod, vytvorOriginKontrolu } from "../server/src/origin-kontrola";

const POVOLENE = new Set(["https://klub.example.cz"]);
const zaklad = {
  metoda: "POST",
  origin: "https://klub.example.cz",
  bearerBezCookie: false,
  vlastniPuvod: "https://app.up.railway.app",
};

describe("smiPuvod", () => {
  it("povolený původ projde, i s lomítkem z CLIENT_URL po normalizaci", () => {
    expect(smiPuvod(zaklad, POVOLENE)).toBe(true);
    expect(normalizujPuvod("https://klub.example.cz/")).toBe("https://klub.example.cz");
  });

  it("cizí, null a nečitelný Origin neprojde", () => {
    for (const origin of ["https://zly.example", "null", "není-url"]) {
      expect(smiPuvod({ ...zaklad, origin }, POVOLENE)).toBe(false);
    }
  });

  it("podobná doména není shoda", () => {
    expect(smiPuvod({ ...zaklad, origin: "https://klub.example.cz.zly.example" }, POVOLENE)).toBe(false);
  });

  it("vlastní původ projde mimo seznam (jeden origin na hostingu)", () => {
    expect(smiPuvod({ ...zaklad, origin: "https://app.up.railway.app" }, POVOLENE)).toBe(true);
  });

  it("bez Origin projde (skripty, nativní klienti)", () => {
    expect(smiPuvod({ ...zaklad, origin: undefined }, POVOLENE)).toBe(true);
  });

  it("jiný port na localhost projde jen když je smyčka v seznamu a je to zapnuté", () => {
    const lokalni = new Set(["http://localhost:5173"]);
    const zVite = { ...zaklad, origin: "http://localhost:5174", vlastniPuvod: "http://localhost:3011" };
    expect(smiPuvod(zVite, lokalni)).toBe(false);
    expect(smiPuvod(zVite, lokalni, true)).toBe(true);
    expect(smiPuvod(zVite, POVOLENE, true)).toBe(false);
  });

  it("čtení projde, zápis z cizího původu ne, u všech metod", () => {
    const origin = "https://zly.example";
    for (const metoda of ["GET", "HEAD", "OPTIONS"]) {
      expect(smiPuvod({ ...zaklad, metoda, origin }, POVOLENE)).toBe(true);
    }
    for (const metoda of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(smiPuvod({ ...zaklad, metoda, origin }, POVOLENE)).toBe(false);
    }
  });
});

describe("middleware na /api", () => {
  let server: Server;
  let zakladUrl: string;

  beforeAll(async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(cookieParser());
    app.use("/api", vytvorOriginKontrolu(["https://klub.example.cz/"]));
    app.all("/api/test", (_req, res) => {
      res.json({ ok: true });
    });
    await new Promise<void>((hotovo) => {
      server = app.listen(0, "127.0.0.1", hotovo);
    });
    zakladUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((hotovo) => server.close(hotovo));
  });

  function posli(hlavicky: Record<string, string>, telo?: FormData): Promise<Response> {
    return fetch(`${zakladUrl}/api/test`, { method: "POST", headers: hlavicky, body: telo ?? null });
  }

  it("cizí multipart s cookie dostane 403", async () => {
    const telo = new FormData();
    telo.append("soubor", new Blob(["x"]), "x.jpg");
    const odpoved = await posli({ origin: "https://zly.example", cookie: "exapp_session=t" }, telo);
    expect(odpoved.status).toBe(403);
    const data = (await odpoved.json()) as { error: { code: string } };
    expect(data.error.code).toBe("ZAKAZANO");
  });

  it("povolený původ a požadavek bez Origin projdou", async () => {
    expect((await posli({ origin: "https://klub.example.cz" })).status).toBe(200);
    expect((await posli({ cookie: "exapp_session=t" })).status).toBe(200);
  });

  it("Bearer projde jen bez session cookie", async () => {
    const origin = "https://zly.example";
    expect((await posli({ origin, authorization: "Bearer t" })).status).toBe(200);
    expect(
      (await posli({ origin, authorization: "Bearer t", cookie: "exapp_session=t" })).status,
    ).toBe(403);
  });

  it("za proxy se vlastní původ čte z X-Forwarded-*", async () => {
    const odpoved = await posli({
      origin: "https://app.up.railway.app",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "app.up.railway.app",
    });
    expect(odpoved.status).toBe(200);
  });
});

describe("zapojení v index.ts", () => {
  it("kontrola běží po cookieParser a před parsováním těla", () => {
    const zdroj = readFileSync("server/src/index.ts", "utf8");
    const cookie = zdroj.indexOf("app.use(cookieParser())");
    const kontrola = zdroj.indexOf('app.use("/api", vytvorOriginKontrolu(CLIENT_URL, { lokalniPorty }))');
    const json = zdroj.indexOf("app.use(express.json(");
    expect(cookie).toBeGreaterThan(-1);
    expect(kontrola).toBeGreaterThan(cookie);
    expect(json).toBeGreaterThan(kontrola);
  });
});
