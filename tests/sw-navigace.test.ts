import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jeNavigaceNaStranku, strankaZeSite } from "../src/lib/sw-navigace";

/** Funkce tak, jak ji dostane sw.js: jen z textu, bez okolního modulu. */
function zTextu<F>(funkce: F): F {
  return new Function(`return (${String(funkce)});`)() as F;
}

const jeStranka = zTextu(jeNavigaceNaStranku);
const obsluz = zTextu(strankaZeSite);

/** Node neumí vytvořit Request s mode "navigate". */
function pozadavek(cesta: string, mode = "navigate"): { request: Request; url: URL } {
  const url = new URL(cesta, "https://exapp.test");
  return { request: { mode, url: url.href } as Request, url };
}

describe("které navigace řeší service worker", () => {
  it("stránky ano, API nikdy", () => {
    expect(jeStranka(pozadavek("/"))).toBe(true);
    expect(jeStranka(pozadavek("/vypravy/12"))).toBe(true);
    expect(jeStranka(pozadavek("/profil?strava=ok"))).toBe(true);
    expect(jeStranka(pozadavek("/api/health"))).toBe(false);
    expect(jeStranka(pozadavek("/api/strava/callback?code=x&state=y"))).toBe(false);
    expect(jeStranka(pozadavek("/api"))).toBe(false);
  });

  it("běžné dotazy stránky nechá být", () => {
    expect(jeStranka(pozadavek("/vypravy", "cors"))).toBe(false);
    expect(jeStranka(pozadavek("/api/meetings", "cors"))).toBe(false);
  });
});

describe("odkud se vezme stránka", () => {
  const sit = vi.fn<typeof fetch>();
  const zCache = vi.fn<CacheStorage["match"]>();
  const otevri = () => obsluz(pozadavek("/vypravy"));

  beforeEach(() => {
    vi.useFakeTimers();
    sit.mockReset();
    zCache.mockReset();
    zCache.mockImplementation(async () => new Response("shell"));
    vi.stubGlobal("fetch", sit);
    // Jen match: kdyby obsluha začala něco ukládat, spadne na chybějící metodě.
    vi.stubGlobal("caches", { match: zCache });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("se sítí ze serveru, cache se ani neptá", async () => {
    sit.mockResolvedValue(new Response("server"));
    expect(await (await otevri()).text()).toBe("server");
    expect(zCache).not.toHaveBeenCalled();
  });

  it("404 projde beze změny", async () => {
    sit.mockResolvedValue(new Response("nic", { status: 404 }));
    expect((await otevri()).status).toBe(404);
  });

  it("bez sítě shell z precache", async () => {
    sit.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await (await otevri()).text()).toBe("shell");
    expect(zCache).toHaveBeenCalledWith("/index.html", { ignoreSearch: true, ignoreVary: true });
  });

  it("při 502 z proxy shell z precache", async () => {
    sit.mockResolvedValue(new Response("bad gateway", { status: 502 }));
    expect(await (await otevri()).text()).toBe("shell");
  });

  it("mlčící síť dostane 3 s, pak shell", async () => {
    sit.mockReturnValue(new Promise(() => {}));
    const hotovo = vi.fn();
    const cekani = otevri().then((odpoved) => odpoved.text()).then(hotovo);
    await vi.advanceTimersByTimeAsync(2900);
    expect(hotovo).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    await cekani;
    expect(hotovo).toHaveBeenCalledWith("shell");
  });

  it("bez uloženého shellu počká na pomalou síť", async () => {
    zCache.mockResolvedValue(undefined);
    sit.mockReturnValue(
      new Promise((vrat) => setTimeout(() => vrat(new Response("pozdě")), 8000)),
    );
    const cekani = otevri().then((odpoved) => odpoved.text());
    await vi.advanceTimersByTimeAsync(8000);
    expect(await cekani).toBe("pozdě");
  });

  it("bez sítě i shellu vrátí chybu sítě", async () => {
    zCache.mockResolvedValue(undefined);
    sit.mockRejectedValue(new TypeError("Failed to fetch"));
    expect((await otevri()).type).toBe("error");
  });
});
