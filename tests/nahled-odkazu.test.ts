import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NAHLEDY_ZA_MINUTU,
  cilPresmerovani,
  nahledOdkazu,
  prectiOpenGraph,
  resetNahledu,
  smiNahled,
} from "../server/src/nahled-odkazu";
import { dlazdiceKolem } from "../src/lib/dlazdice-mapy";
import { bezpecnaUrl, kratkyOdkaz, maNahled, najdiOdkazy, rozdelOdkazy, rozparsujMapu } from "../src/shared/odkazy";

function html(obsah: string): Response {
  return new Response(`<html><head>${obsah}</head></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

describe("odkazy v textu zprávy", () => {
  it("najde odkaz bez tečky za větou a bez závorek kolem", () => {
    expect(najdiOdkazy("Sraz (https://mapy.com/s/abc). Pak www.idos.cz!")).toEqual([
      "https://mapy.com/s/abc",
      "https://www.idos.cz/",
    ]);
  });

  it("pozná mapy.com i bez protokolu a text kolem zachová", () => {
    const casti = rozdelOdkazy("Trasa mapy.com/s/abc tady");
    expect(casti.map((cast) => cast.text).join("")).toBe("Trasa mapy.com/s/abc tady");
    expect(casti[1]).toEqual({ druh: "odkaz", text: "mapy.com/s/abc", url: "https://mapy.com/s/abc" });
  });

  it("nebezpečné adresy neprojdou", () => {
    expect(bezpecnaUrl("javascript:alert(1)")).toBeNull();
    expect(bezpecnaUrl("https://uzivatel:heslo@mapy.com/")).toBeNull();
    expect(najdiOdkazy("javascript:alert(1) data:text/html,x")).toEqual([]);
  });

  it("dlouhou adresu zkrátí", () => {
    expect(kratkyOdkaz("https://www.mapy.com/")).toBe("mapy.com");
    expect(kratkyOdkaz(`https://mapy.com/${"a".repeat(80)}`)).toHaveLength(42);
  });
});

describe("rozpoznání map", () => {
  it("Mapy.com: x je délka, y šířka, bod z id má přednost", () => {
    expect(rozparsujMapu("https://mapy.com/cs/turisticka?x=14.4&y=50.1&z=12")?.bod).toEqual({ lat: 50.1, lon: 14.4, zoom: 12 });
    expect(rozparsujMapu("https://mapy.cz/?source=coor&id=15.5%2C49.9&x=14&y=50")?.bod).toEqual({ lat: 49.9, lon: 15.5, zoom: null });
    expect(rozparsujMapu("https://mapy.com/cs/?planovani-trasy&x=14.4&y=50.1")?.nazev).toBe("Naplánovaná trasa");
    expect(rozparsujMapu("https://mapy.com/s/abc")).toEqual({ poskytovatel: "Mapy.com", bod: null, nazev: null });
  });

  it("Google: přesné místo má přednost před středem mapy", () => {
    const mapa = rozparsujMapu("https://www.google.com/maps/place/Hrad+Kokořín/@50.4,14.5,15z/data=!3d50.44!4d14.57");
    expect(mapa?.bod).toEqual({ lat: 50.44, lon: 14.57, zoom: 15 });
    expect(mapa?.nazev).toBe("Hrad Kokořín");
    expect(rozparsujMapu("https://maps.google.com/?q=50.08,14.42")?.bod).toEqual({ lat: 50.08, lon: 14.42, zoom: null });
  });

  it("OSM a nesmyslné souřadnice", () => {
    expect(rozparsujMapu("https://www.openstreetmap.org/#map=13/50.1/14.4")?.bod).toEqual({ lat: 50.1, lon: 14.4, zoom: 13 });
    expect(rozparsujMapu("https://mapy.com/?x=999&y=50")?.bod).toBeNull();
    expect(rozparsujMapu("https://example.com/maps")).toBeNull();
  });
});

describe("dlaždice mapy", () => {
  it("pokryjí celý výřez a bod je uprostřed", () => {
    const { dlazdice, zoom } = dlazdiceKolem({ lat: 50.08, lon: 14.42, zoom: 13 }, 360, 150);
    expect(zoom).toBe(13);
    expect(Math.min(...dlazdice.map((d) => d.x))).toBeLessThanOrEqual(-180);
    expect(Math.max(...dlazdice.map((d) => d.x + 256))).toBeGreaterThanOrEqual(180);
    expect(Math.min(...dlazdice.map((d) => d.y))).toBeLessThanOrEqual(-75);
    expect(Math.max(...dlazdice.map((d) => d.y + 256))).toBeGreaterThanOrEqual(75);
    expect(dlazdice[0]?.src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/13\/\d+\/\d+\.png$/);
  });
});

describe("náhled na serveru", () => {
  beforeEach(() => resetNahledu());

  it("chodí jen na povolené weby", async () => {
    expect(maNahled("http://mapy.com/s/a")).toBe(false);
    expect(maNahled("https://127.0.0.1/")).toBe(false);
    expect(maNahled("https://mapy.com.utocnik.cz/")).toBe(false);
    expect(maNahled("https://mapy.com:8443/")).toBe(false);
    expect(maNahled("https://www.google.com/search?q=a")).toBe(false);
    const fetchFn = vi.fn<typeof fetch>();
    expect(await nahledOdkazu("https://169.254.169.254/latest", fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("přesměrování mimo povolené weby nenásleduje", async () => {
    expect(cilPresmerovani("http://169.254.169.254/", "https://strava.com/a")).toBeNull();
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: "https://localhost/" } }));
    expect(await nahledOdkazu("https://www.strava.com/a", fetchFn)).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("krátký odkaz na mapu dohledá bod přes přesměrování", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 302, headers: { location: "/cs/turisticka?x=14.4&y=50.1&z=13" } }),
    );
    const nahled = await nahledOdkazu("https://mapy.com/s/abc", fetchFn);
    expect(nahled?.bod).toEqual({ lat: 50.1, lon: 14.4, zoom: 13 });
    expect(nahled?.url).toBe("https://mapy.com/s/abc");
    expect(nahled?.druh).toBe("mapa");
  });

  it("souhlas Googlu přeskočí na cíl", () => {
    const cil = "https://www.google.com/maps/@50.1,14.4,12z";
    expect(cilPresmerovani(`https://consent.google.com/m?continue=${encodeURIComponent(cil)}`, "https://maps.app.goo.gl/a")).toBe(cil);
  });

  it("přečte Open Graph, dekóduje entity a výsledek si pamatuje", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      html('<meta content="Výlet &amp; hory" property="og:title"><meta property="og:image" content="/o.jpg">'),
    );
    const nahled = await nahledOdkazu("https://www.strava.com/activities/1", fetchFn);
    expect(nahled?.titulek).toBe("Výlet & hory");
    expect(nahled?.obrazekUrl).toBe("https://www.strava.com/o.jpg");
    await nahledOdkazu("https://www.strava.com/activities/1", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(prectiOpenGraph("<title>Jen nadpis</title>").titulek).toBe("Jen nadpis");
  });

  it("výpadek webu nevyhodí chybu", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new Error("timeout");
    });
    expect(await nahledOdkazu("https://www.komoot.com/tour/1", fetchFn)).toBeNull();
  });

  it("omezí počet dotazů na člověka", () => {
    for (let i = 0; i < NAHLEDY_ZA_MINUTU; i += 1) expect(smiNahled("u", 1000)).toBe(true);
    expect(smiNahled("u", 1000)).toBe(false);
    expect(smiNahled("jiny", 1000)).toBe(true);
    expect(smiNahled("u", 62_000)).toBe(true);
  });
});
