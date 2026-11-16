import http from "node:http";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { jdeKomprimovat, kompreseOdpovedi, vyberKodovani } from "../server/src/komprese";

const servery: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servery.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((chyba) => (chyba ? reject(chyba) : resolve()));
        }),
    ),
  );
});

function poslouchej(): Promise<number> {
  const app = express();
  app.use(kompreseOdpovedi);
  app.get("/text", (_req, res) => {
    res.type("text/plain").send("a".repeat(4000));
  });
  app.get("/maly", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/obrazek", (_req, res) => {
    res.type("webp").send(Buffer.alloc(4000, 7));
  });
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const adresa = server.address();
      servery.push(server);
      resolve(typeof adresa === "object" && adresa !== null ? adresa.port : 0);
    });
  });
}

function stahni(
  port: number,
  cesta: string,
  acceptEncoding: string,
): Promise<{ encoding: string | undefined; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const pozadavek = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: cesta,
        headers: { "accept-encoding": acceptEncoding },
      },
      (odpoved) => {
        const kusy: Buffer[] = [];
        odpoved.on("data", (kus: Buffer) => kusy.push(kus));
        odpoved.on("end", () => {
          const encoding = odpoved.headers["content-encoding"];
          resolve({
            encoding: Array.isArray(encoding) ? encoding[0] : encoding,
            body: Buffer.concat(kusy),
          });
        });
      },
    );
    pozadavek.on("error", reject);
    pozadavek.end();
  });
}

describe("výběr kódování", () => {
  it("dává přednost Brotli", () => {
    expect(vyberKodovani("gzip, deflate, br")).toBe("br");
    expect(vyberKodovani("br;q=0, gzip")).toBe("gzip");
    expect(vyberKodovani("identity")).toBeNull();
    expect(jdeKomprimovat("text/css; charset=utf-8", undefined)).toBe(true);
    expect(jdeKomprimovat("image/webp", undefined)).toBe(false);
    expect(jdeKomprimovat("font/woff2", undefined)).toBe(false);
    expect(jdeKomprimovat("text/plain", "br")).toBe(false);
  });
});

describe("komprese odpovědi", () => {
  it("text zmenší Brotli a malý JSON i obrázek nechá být", async () => {
    const port = await poslouchej();
    const text = await stahni(port, "/text", "br, gzip");
    expect(text.encoding).toBe("br");
    expect(brotliDecompressSync(text.body).toString("utf8")).toBe("a".repeat(4000));

    const gzip = await stahni(port, "/text", "gzip");
    expect(gzip.encoding).toBe("gzip");
    expect(gunzipSync(gzip.body).toString("utf8")).toBe("a".repeat(4000));

    const maly = await stahni(port, "/maly", "br, gzip");
    expect(maly.encoding).toBeUndefined();
    expect(maly.body.toString("utf8")).toContain("ok");

    const obrazek = await stahni(port, "/obrazek", "br, gzip");
    expect(obrazek.encoding).toBeUndefined();
    expect(obrazek.body.length).toBe(4000);
  });
});
