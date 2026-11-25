/**
 * Vite plugin pro `npm run dev:demo`: ukázkové API pod `/__demo/api/…`
 * a generované obrázky krajiny pro fotky. Běží jen ve vývojovém serveru
 * (`apply: "serve"`), do produkčního sestavení se nedostane a do databáze
 * nic nezapisuje. Změny (zprávy, přihlášení) drží jen v paměti procesu.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";
import { roleKoduNeboClen } from "../src/config/roles.ts";
import type { PravoSkupiny } from "../src/lib/skupiny-pristup.ts";
import type { ApiZpravaPriloha } from "../src/shared/api-types.ts";
import {
  ALBA,
  FOTKY_VYPRAV,
  JA,
  KODY,
  NAVRHY,
  PISNE,
  SCHUZKY,
  SKUPINY,
  UCASTNICI,
  UZIVATELE,
  VYPRAVY,
  ZPRAVY,
  fotkyAlba,
  konverzace,
  seznamUzivatelu,
  zebricek,
} from "./data.ts";

const PREFIX = "/__demo";

function posli(res: ServerResponse, status: number, telo: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(telo));
}

function chyba(res: ServerResponse, status: number, message: string): void {
  posli(res, status, { error: { code: status === 404 ? "NENALEZENO" : "DEMO", message } });
}

async function ctiTelo(req: IncomingMessage): Promise<Record<string, unknown>> {
  const casti: Buffer[] = [];
  for await (const kus of req) casti.push(kus as Buffer);
  if (casti.length === 0) return {};
  const typ = req.headers["content-type"] ?? "";
  if (typ.startsWith("multipart/form-data")) {
    const form = await new Response(new Uint8Array(Buffer.concat(casti)), { headers: { "Content-Type": typ } }).formData();
    const telo: Record<string, unknown> = { soubory: form.getAll("soubor") };
    for (const [klic, hodnota] of form.entries()) if (typeof hodnota === "string") telo[klic] = hodnota;
    return telo;
  }
  try {
    const data: unknown = JSON.parse(Buffer.concat(casti).toString("utf8"));
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Jednoduchá krajina (obloha, slunce, tři pásy kopců) podle semínka. */
function krajina(seminko: string, sirka = 1600, vyska = 1067): string {
  let h = 0;
  for (let i = 0; i < seminko.length; i += 1) h = (h * 31 + seminko.charCodeAt(i)) >>> 0;
  const palety = [
    ["#f3d9a8", "#e9b77a", "#c8794a", "#8f4b2c", "#5b2e1d"],
    ["#dfe7d2", "#b6c79a", "#7e9370", "#4f6640", "#2e4022"],
    ["#d9e4ea", "#a9c0cc", "#7593a4", "#4c6a7c", "#2c4252"],
    ["#f0e1c8", "#d6b98a", "#a98a52", "#7a5b22", "#4a3612"],
    ["#ece3f0", "#cdb6d6", "#9c7fa8", "#6b5276", "#3f2e48"],
  ];
  const p = palety[h % palety.length];
  const vlna = (zaklad: number, amp: number, faze: number): string => {
    const body: string[] = [];
    for (let x = 0; x <= sirka; x += sirka / 8) {
      const y = zaklad + Math.sin((x / sirka) * Math.PI * 2 + faze) * amp;
      body.push(`${x.toFixed(0)},${y.toFixed(0)}`);
    }
    return `M0,${vyska} L${body.join(" L")} L${sirka},${vyska} Z`;
  };
  const f = (h % 100) / 15;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sirka} ${vyska}" width="${sirka}" height="${vyska}">
<defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient></defs>
<rect width="${sirka}" height="${vyska}" fill="url(#o)"/>
<circle cx="${(sirka * (0.3 + (h % 40) / 100)).toFixed(0)}" cy="${(vyska * 0.28).toFixed(0)}" r="${(vyska * 0.07).toFixed(0)}" fill="${p[3]}" opacity="0.75"/>
<path d="${vlna(vyska * 0.55, vyska * 0.06, f)}" fill="${p[2]}"/>
<path d="${vlna(vyska * 0.68, vyska * 0.05, f + 1.7)}" fill="${p[3]}"/>
<path d="${vlna(vyska * 0.82, vyska * 0.04, f + 3.1)}" fill="${p[4]}"/>
</svg>`;
}

function stranka<T>(polozky: T[], url: URL): { data: T[]; pagination?: { page: number; pageSize: number; totalItems: number; totalPages: number } } {
  const page = Number(url.searchParams.get("page") ?? "0");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "0");
  if (!page || !pageSize) return { data: polozky };
  const zacatek = (page - 1) * pageSize;
  return {
    data: polozky.slice(zacatek, zacatek + pageSize),
    pagination: { page, pageSize, totalItems: polozky.length, totalPages: Math.max(1, Math.ceil(polozky.length / pageSize)) },
  };
}

let citac = 1000;

/** Přílohy poslané v ukázce, jen v paměti procesu. */
const NAHRANE = new Map<string, { typ: string; data: Buffer }>();

async function obsluz(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const cesta = url.pathname.slice(PREFIX.length);
  const metoda = req.method ?? "GET";

  if (/\/(soubor|nahled|avatar)$/.test(cesta)) {
    const id = cesta.split("/").slice(-2, -1)[0] ?? cesta;
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "max-age=3600");
    // Rozměry jako v datech, jinak by fotka na výšku přišla na šířku.
    const fotka = [...FOTKY_VYPRAV.values()].flat().find((f) => f.id === id);
    const poradi = Number(/-f(\d+)$/.exec(id)?.[1] ?? "1") - 1;
    const naVysku = fotka === undefined && poradi % 2 === 1;
    res.end(krajina(id, fotka?.sirka ?? (naVysku ? 1000 : 1600), fotka?.vyska ?? (naVysku ? 1300 : 1067)));
    return;
  }

  // ---- čtení ----
  if (metoda === "GET") {
    if (cesta === "/api/health") return posli(res, 200, { ok: true });
    if (cesta === "/api/me") return posli(res, 200, { ...JA, user: JA });
    if (cesta === "/api/users") return posli(res, 200, { users: seznamUzivatelu() });
    if (cesta === "/api/expeditions") {
      const stav = url.searchParams.get("stav");
      const ucastnik = url.searchParams.get("ucastnik");
      let seznam = [...VYPRAVY].sort((a, b) => a.datum.localeCompare(b.datum));
      if (stav === "proběhlá") seznam = seznam.filter((v) => v.stav === "proběhlá").reverse();
      if (ucastnik !== null) seznam = seznam.filter((v) => (UCASTNICI.get(v.id) ?? []).some((u) => u.userId === ucastnik));
      const s = stranka(seznam, url);
      return posli(res, 200, { expedice: s.data, ...(s.pagination ? { pagination: s.pagination } : {}) });
    }
    let m = /^\/api\/expeditions\/([^/]+)$/.exec(cesta);
    if (m) {
      const v = VYPRAVY.find((x) => x.id === m?.[1]);
      return v ? posli(res, 200, { expedice: v, cestaTam: [], cestaZpet: [] }) : chyba(res, 404, "Výprava nenalezena.");
    }
    m = /^\/api\/expeditions\/([^/]+)\/ucastnici$/.exec(cesta);
    if (m) {
      const v = VYPRAVY.find((x) => x.id === m?.[1]);
      return v ? posli(res, 200, { ucastnici: UCASTNICI.get(v.id) ?? [], expedice: v }) : chyba(res, 404, "Výprava nenalezena.");
    }
    m = /^\/api\/expeditions\/([^/]+)\/fotky$/.exec(cesta);
    if (m) return posli(res, 200, { fotky: FOTKY_VYPRAV.get(m[1]) ?? [] });
    m = /^\/api\/expeditions\/([^/]+)\/zpravy$/.exec(cesta);
    if (m) return posli(res, 200, { zpravy: ZPRAVY.get(`expedice:${m[1]}`) ?? [], nextCursor: null });
    m = /^\/api\/expeditions\/([^/]+)\/discussion\/meta$/.exec(cesta);
    if (m) {
      const seznam = ZPRAVY.get(`expedice:${m[1]}`) ?? [];
      return posli(res, 200, { latestMessageAt: seznam[seznam.length - 1]?.createdAt ?? null, lastReadAt: null, unread: false });
    }
    if (cesta === "/api/meetings") return posli(res, 200, { schuzky: SCHUZKY });
    if (cesta === "/api/alba") {
      // Stejné pořadí jako server: výpravy od nejnovější, pak ostatní alba.
      const datum = (id: string | null): string => VYPRAVY.find((v) => v.id === id)?.datum ?? "";
      return posli(res, 200, {
        alba: [...ALBA].sort((a, b) => datum(b.expeditionId).localeCompare(datum(a.expeditionId))),
      });
    }
    m = /^\/api\/alba\/([^/]+)\/fotky$/.exec(cesta);
    if (m) return posli(res, 200, { fotky: fotkyAlba(m[1]) });
    m = /^\/api\/diskuze\/prilohy\/([^/]+)$/.exec(cesta);
    if (m) {
      const nahrana = NAHRANE.get(m[1]);
      if (nahrana !== undefined) {
        res.setHeader("Content-Type", nahrana.typ);
        res.end(nahrana.data);
        return;
      }
      if (m[1].startsWith("chat-s")) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.end("Ukázkový soubor");
        return;
      }
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(krajina(m[1]));
      return;
    }
    if (cesta === "/api/nahled-odkazu") {
      const odkaz = url.searchParams.get("url") ?? "";
      const strava = odkaz.includes("strava.com");
      return posli(res, 200, {
        nahled: strava
          ? { url: odkaz, druh: "web", web: "strava.com", titulek: "Sněžka z Pece přes Obří důl", popis: "14,2 km, převýšení 860 m", obrazekUrl: `${PREFIX}/api/diskuze/prilohy/strava-trasa`, bod: null }
          : null,
      });
    }
    if (cesta === "/api/diskuze/konverzace") return posli(res, 200, { konverzace: konverzace() });
    if (cesta === "/api/diskuze/zpravy") {
      const kanal = url.searchParams.get("channel") ?? "general";
      return posli(res, 200, { zpravy: ZPRAVY.get(kanal) ?? [], nextCursor: null });
    }
    if (cesta === "/api/diskuze/soukrome") {
      return posli(res, 200, { zpravy: ZPRAVY.get(url.searchParams.get("klic") ?? "") ?? [], nextCursor: null });
    }
    if (cesta === "/api/diskuze/skupiny") {
      return posli(res, 200, { skupiny: SKUPINY, muzeSpravovat: true });
    }
    m = /^\/api\/diskuze\/skupiny\/([^/]+)\/zpravy$/.exec(cesta);
    if (m) return posli(res, 200, { zpravy: ZPRAVY.get(`skupina:${m[1]}`) ?? [], nextCursor: null });
    if (cesta === "/api/zebricky") return posli(res, 200, { obdobi: url.searchParams.get("obdobi") ?? "celkem", zebricky: zebricek() });
    if (cesta === "/api/zebricky/trasy") {
      const obdobi = url.searchParams.get("obdobi") ?? "celkem";
      const trasy = VYPRAVY.filter((v) => v.trasaPolyline !== null && (obdobi === "celkem" || v.datum.startsWith(obdobi))).map((v) => ({
        id: v.id,
        nazev: v.nazev,
        datum: v.datum,
        km: v.km,
        trasaPolyline: v.trasaPolyline,
      }));
      return posli(res, 200, { obdobi, trasy });
    }
    if (cesta === "/api/statistiky/moje") {
      const moje = VYPRAVY.filter((v) => v.stav === "proběhlá" && (UCASTNICI.get(v.id) ?? []).some((u) => u.userId === JA.id && u.status === "ucastnil_se"));
      return posli(res, 200, {
        userId: JA.id,
        jmeno: `${JA.jmeno} ${JA.prijmeni ?? ""}`.trim(),
        vypravy: moje.length,
        kmCelkem: moje.reduce((s, v) => s + (v.km ?? 0), 0),
        prevyseniCelkem: moje.reduce((s, v) => s + (v.prevyseniM ?? 0), 0),
        aktivity: moje.map((v) => ({ id: `a-${v.id}`, expeditionId: v.id, km: v.km ?? null, prevyseniM: v.prevyseniM ?? null, stravaActivityId: null, trasaPolyline: v.trasaPolyline ?? null, nazev: v.nazev, datum: v.datum, status: "ucastnil_se" })),
      });
    }
    if (cesta === "/api/strava/stav") return posli(res, 200, { propojeno: false, stravaId: null, scope: null, expirace: null });
    if (cesta === "/api/admin/codes") return posli(res, 200, {
      kody: KODY.map((k, i) => ({ ...k, expiresAt: new Date(Date.now() + (i === 0 ? 6.5 : 2.5) * 60_000).toISOString() })),
    });
    if (cesta === "/api/zpevnik" || cesta === "/api/zpevnik/") return posli(res, 200, { pisne: PISNE });
    if (cesta === "/api/zpevnik/navrhy") return posli(res, 200, { navrhy: NAVRHY });
    m = /^\/api\/zpevnik\/navrhy\/([^/]+)$/.exec(cesta);
    if (m) {
      const navrh = NAVRHY.find((n) => n.id === m?.[1]);
      return navrh ? posli(res, 200, { navrh }) : chyba(res, 404, "Návrh nenalezen.");
    }
    m = /^\/api\/zpevnik\/([^/]+)$/.exec(cesta);
    if (m) {
      const pisen = PISNE.find((p) => p.id === m?.[1]);
      return pisen ? posli(res, 200, { pisen }) : chyba(res, 404, "Píseň nenalezena.");
    }
    if (cesta === "/api/meta/skoly-tridy") return posli(res, 200, { skoly: ["SSPŠ"], tridy: ["1.A", "1.B", "2.A", "2.B", "3.A", "4.B"] });
    return chyba(res, 404, "V ukázkovém režimu tahle data nejsou.");
  }

  // ---- zápisy (jen v paměti) ----
  const telo = await ctiTelo(req);
  const text = typeof telo["text"] === "string" ? telo["text"] : "";
  const prilohy: ApiZpravaPriloha[] = [];
  for (const soubor of Array.isArray(telo["soubory"]) ? telo["soubory"] : []) {
    if (!(soubor instanceof File)) continue;
    citac += 1;
    const id = `nahrana-${citac}`;
    NAHRANE.set(id, { typ: soubor.type || "application/octet-stream", data: Buffer.from(await soubor.arrayBuffer()) });
    prilohy.push({ id, nazev: soubor.name, bajty: soubor.size, contentType: soubor.type, jeObrazek: soubor.type.startsWith("image/") });
  }
  const novaZprava = (klic: string, channel: string, expeditionId: string | null): unknown => {
    citac += 1;
    const zprava = {
      id: `demo-${citac}`,
      expeditionId,
      autorId: JA.id,
      authorName: `${JA.jmeno} ${JA.prijmeni ?? ""}`.trim(),
      authorAvatarUrl: null,
      channel,
      text,
      prilohy,
      createdAt: new Date().toISOString(),
    };
    const seznam = ZPRAVY.get(klic) ?? [];
    seznam.push(zprava as never);
    ZPRAVY.set(klic, seznam);
    return { zprava };
  };
  const ucet = /^\/api\/users\/([^/]+)$/.exec(cesta);
  if (ucet) {
    const i = UZIVATELE.findIndex((u) => u.id === ucet[1]);
    const uzivatel = UZIVATELE[i];
    if (uzivatel === undefined) return chyba(res, 404, "Uživatel nenalezen.");
    if (metoda === "DELETE") {
      if (uzivatel.id === JA.id) return chyba(res, 403, "Vlastní účet z administrace smazat nejde.");
      UZIVATELE.splice(i, 1);
      return posli(res, 200, { ok: true });
    }
    if (metoda === "PATCH") {
      Object.assign(uzivatel, telo);
      return posli(res, 200, { user: seznamUzivatelu()[i] });
    }
  }
  if (metoda === "POST" && cesta === "/api/admin/codes") {
    const role = roleKoduNeboClen(telo["role"]);
    const ted = Date.now();
    const kod = { code: randomUUID().replace(/[^2-9a-f]/g, "").slice(0, 8).toUpperCase().padEnd(8, "X"), expiresAt: new Date(ted + 10 * 60_000).toISOString(), role };
    KODY.unshift(kod);
    return posli(res, 201, { id: randomUUID(), kod: kod.code, createdAt: new Date(ted).toISOString(), expiresAt: kod.expiresAt, role });
  }
  if (metoda === "POST" && cesta === "/api/diskuze/zpravy") {
    const kanal = typeof telo["channel"] === "string" ? telo["channel"] : "general";
    return posli(res, 201, novaZprava(kanal, kanal, null));
  }
  if (metoda === "POST" && cesta === "/api/diskuze/skupiny") {
    const skupina = { id: randomUUID(), nazev: String(telo["nazev"] ?? ""), prava: telo["prava"] as PravoSkupiny[] };
    SKUPINY.push(skupina);
    return posli(res, 201, { id: skupina.id });
  }
  const mazana = /\/zpravy\/([^/]+)$/.exec(cesta);
  if (metoda === "DELETE" && mazana) {
    for (const seznam of ZPRAVY.values()) {
      const i = seznam.findIndex((z) => z.id === mazana[1]);
      if (i >= 0) seznam.splice(i, 1);
    }
    return posli(res, 200, { ok: true });
  }
  const upravovana = /^\/api\/diskuze\/skupiny\/([^/]+)$/.exec(cesta);
  if (upravovana) {
    const skupina = SKUPINY.find((x) => x.id === upravovana[1]);
    if (skupina === undefined) return chyba(res, 404, "Skupina nenalezena.");
    if (metoda === "DELETE") {
      SKUPINY.splice(SKUPINY.indexOf(skupina), 1);
      return posli(res, 200, { ok: true });
    }
    skupina.nazev = String(telo["nazev"] ?? skupina.nazev);
    skupina.prava = telo["prava"] as PravoSkupiny[];
    return posli(res, 200, { id: skupina.id });
  }
  if (metoda === "POST" && cesta === "/api/diskuze/soukrome") {
    const klic = typeof telo["klic"] === "string" ? telo["klic"] : "";
    return posli(res, 201, novaZprava(klic, "soukrome", null));
  }
  let m = /^\/api\/diskuze\/skupiny\/([^/]+)\/zpravy$/.exec(cesta);
  if (metoda === "POST" && m) return posli(res, 201, novaZprava(`skupina:${m[1]}`, "skupina", null));
  m = /^\/api\/expeditions\/([^/]+)\/zpravy$/.exec(cesta);
  if (metoda === "POST" && m) return posli(res, 201, novaZprava(`expedice:${m[1]}`, "expedice", m[1]));
  m = /^\/api\/expeditions\/([^/]+)\/(prihlasit|odhlasit)$/.exec(cesta);
  if (metoda === "POST" && m) {
    const v = VYPRAVY.find((x) => x.id === m?.[1]);
    if (!v) return chyba(res, 404, "Výprava nenalezena.");
    const seznam = UCASTNICI.get(v.id) ?? [];
    if (m[2] === "prihlasit" && !seznam.some((u) => u.userId === JA.id)) {
      const ucastnik = { id: `demo-u-${Date.now()}`, expeditionId: v.id, userId: JA.id, clenId: null, jmeno: `${JA.jmeno} ${JA.prijmeni ?? ""}`.trim(), status: "prihlasen" as const, createdAt: new Date().toISOString(), avatarUrl: null };
      seznam.push(ucastnik);
      v.kapacita.prihlaseno += 1;
      UCASTNICI.set(v.id, seznam);
      return posli(res, 201, { ucastnik, expedice: v });
    }
    if (m[2] === "odhlasit") {
      UCASTNICI.set(v.id, seznam.filter((u) => u.userId !== JA.id));
      v.kapacita.prihlaseno = Math.max(0, v.kapacita.prihlaseno - 1);
      return posli(res, 200, { ok: true, expedice: v });
    }
    return posli(res, 200, { expedice: v });
  }
  if (cesta.endsWith("/read")) return posli(res, 200, { ok: true, lastReadAt: new Date().toISOString() });
  return chyba(res, 503, "V ukázkovém režimu se tahle změna neukládá.");
}

export default function demoApi(): Plugin {
  return {
    name: "exapp-demo-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://demo.local");
        if (!url.pathname.startsWith(`${PREFIX}/`)) return next();
        void obsluz(req, res, url).catch(() => chyba(res, 500, "Ukázkový server selhal."));
      });
      const pocty = `${UZIVATELE.length} uživatelů, ${VYPRAVY.length} výprav, ${PISNE.length} písní`;
      server.config.logger.info(`\n  ExApp demo: ukázková data (${pocty}) pod ${PREFIX}/api\n`);
    },
  };
}
