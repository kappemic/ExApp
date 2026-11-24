/**
 * Odkazy ve zprávách: najít je v textu, poznat mapu a vytáhnout z ní bod.
 * Sdílí klient (vykreslení, náhled mapy) i server (náhled ostatních webů).
 */

export interface BodMapy {
  lat: number;
  lon: number;
  zoom: number | null;
}

export interface MapaZOdkazu {
  /** „Mapy.com“, „Google Mapy“… */
  poskytovatel: string;
  bod: BodMapy | null;
  /** Název místa, když je přímo v adrese. */
  nazev: string | null;
}

export type CastTextu = { druh: "text"; text: string } | { druh: "odkaz"; text: string; url: string };

const VZOR_ODKAZU = /(?:https?:\/\/|www\.|mapy\.(?:com|cz)\/)[^\s<>"'`]+/gi;

/** Tečka za větou nebo závorka kolem odkazu k němu nepatří. */
function orizniKonec(text: string): string {
  let cisty = text;
  for (;;) {
    const posledni = cisty.at(-1);
    if (posledni === undefined) return cisty;
    if (".,;:!?…".includes(posledni)) {
      cisty = cisty.slice(0, -1);
      continue;
    }
    if (posledni === ")" && !cisty.includes("(")) {
      cisty = cisty.slice(0, -1);
      continue;
    }
    return cisty;
  }
}

/** Jen http(s). Cokoli jiného (javascript:, data:) vrací null. */
export function bezpecnaUrl(text: string): string | null {
  const sProtokolem = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(sProtokolem);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username.length > 0 || url.password.length > 0) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function rozdelOdkazy(text: string): CastTextu[] {
  const casti: CastTextu[] = [];
  let od = 0;
  for (const shoda of text.matchAll(VZOR_ODKAZU)) {
    const index = shoda.index ?? 0;
    const surovy = orizniKonec(shoda[0]);
    const url = bezpecnaUrl(surovy);
    if (url === null) continue;
    if (index > od) casti.push({ druh: "text", text: text.slice(od, index) });
    casti.push({ druh: "odkaz", text: surovy, url });
    od = index + surovy.length;
  }
  if (od < text.length) casti.push({ druh: "text", text: text.slice(od) });
  return casti;
}

/** Adresy ve zprávě bez opakování. */
export function najdiOdkazy(text: string): string[] {
  const urls = rozdelOdkazy(text).flatMap((cast) => (cast.druh === "odkaz" ? [cast.url] : []));
  return [...new Set(urls)];
}

/** „mapy.com/cs/turisticka…“ místo adresy přes tři řádky. */
export function kratkyOdkaz(text: string, limit = 42): string {
  const cisty = text.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  return cisty.length > limit ? `${cisty.slice(0, limit - 1)}…` : cisty;
}

export function webOdkazu(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function platnyBod(lat: number, lon: number, zoom: number | null): BodMapy | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { lat, lon, zoom: zoom !== null && Number.isFinite(zoom) ? Math.min(18, Math.max(3, Math.round(zoom))) : null };
}

/** „50.08,14.42“ → [50.08, 14.42]. */
function dvojice(text: string | null): [number, number] | null {
  const shoda = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text ?? "");
  return shoda === null ? null : [Number(shoda[1]), Number(shoda[2])];
}

function cislo(text: string | null): number {
  return text === null || text.trim().length === 0 ? Number.NaN : Number(text);
}

function jeHost(host: string, ...domeny: string[]): boolean {
  return domeny.some((domena) => host === domena || host.endsWith(`.${domena}`));
}

function jeGoogle(host: string): boolean {
  return /^(?:(?:www|maps)\.)?google\.(?:com|cz|sk|de|at|pl|co\.uk)$/.test(host);
}

/** Rozpozná mapový odkaz. Krátké odkazy (mapy.com/s/…) bod nemají, dohledá ho server. */
export function rozparsujMapu(adresa: string): MapaZOdkazu | null {
  let url: URL;
  try {
    url = new URL(adresa);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const p = url.searchParams;

  if (jeHost(host, "mapy.com", "mapy.cz")) {
    const stred = dvojice(p.get("marker")?.split(";")[0] ?? null) ?? dvojice(p.get("center"));
    const misto = p.get("source") === "coor" ? dvojice(p.get("id")) : null;
    const lonLat = misto ?? stred;
    const zoom = cislo(p.get("z") ?? p.get("zoom"));
    const bod =
      lonLat !== null
        ? platnyBod(lonLat[1], lonLat[0], zoom)
        : platnyBod(cislo(p.get("y")), cislo(p.get("x")), zoom);
    const trasa = p.has("planovani-trasy") || p.has("rc") || p.has("rut");
    return { poskytovatel: "Mapy.com", bod, nazev: trasa ? "Naplánovaná trasa" : null };
  }

  if (jeHost(host, "goo.gl") && (host.startsWith("maps.") || url.pathname.startsWith("/maps"))) {
    return { poskytovatel: "Google Mapy", bod: null, nazev: null };
  }
  if (jeGoogle(host) && (url.pathname.startsWith("/maps") || host.startsWith("maps."))) {
    const misto = /\/maps\/place\/([^/@]+)/.exec(url.pathname)?.[1];
    let nazev: string | null = null;
    if (misto !== undefined) {
      try {
        const text = decodeURIComponent(misto.replace(/\+/g, " ")).trim();
        nazev = dvojice(text) === null && text.length > 0 ? text : null;
      } catch {
        nazev = null;
      }
    }
    const presne = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url.href);
    const stred = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/.exec(url.pathname);
    const dotaz = p.get("query") ?? p.get("q") ?? p.get("destination") ?? p.get("ll");
    const zoom = stred?.[3] === undefined ? null : Number(stred[3]);
    const par = dvojice(dotaz);
    const bod =
      presne !== null
        ? platnyBod(Number(presne[1]), Number(presne[2]), zoom)
        : par !== null
          ? platnyBod(par[0], par[1], zoom)
          : stred !== null
            ? platnyBod(Number(stred[1]), Number(stred[2]), zoom)
            : null;
    if (nazev === null && par === null && dotaz !== null && dotaz.trim().length > 0) nazev = dotaz.trim().slice(0, 120);
    return { poskytovatel: "Google Mapy", bod, nazev };
  }

  if (jeHost(host, "openstreetmap.org")) {
    const hash = /map=(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash);
    const bod =
      platnyBod(cislo(p.get("mlat")), cislo(p.get("mlon")), hash === null ? null : Number(hash[1])) ??
      (hash === null ? null : platnyBod(Number(hash[2]), Number(hash[3]), Number(hash[1])));
    return { poskytovatel: "OpenStreetMap", bod, nazev: null };
  }

  if (host === "maps.apple.com") {
    const par = dvojice(p.get("ll")) ?? dvojice(p.get("coordinate"));
    return {
      poskytovatel: "Apple Mapy",
      bod: par === null ? null : platnyBod(par[0], par[1], cislo(p.get("z"))),
      nazev: p.get("name") ?? p.get("q"),
    };
  }

  if (jeHost(host, "waze.com")) {
    const par = dvojice(p.get("ll")) ?? dvojice(p.get("latlng"));
    return { poskytovatel: "Waze", bod: par === null ? null : platnyBod(par[0], par[1], null), nazev: null };
  }
  return null;
}

/**
 * Weby, ze kterých server smí stáhnout náhled. Pevný seznam je zároveň ochrana:
 * bez něj by šlo server poslat na libovolnou (i vnitřní) adresu.
 */
export function maNahled(adresa: string): boolean {
  let url: URL;
  try {
    url = new URL(adresa);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || (url.port !== "" && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  if (jeGoogle(host)) return url.pathname.startsWith("/maps") || host.startsWith("maps.");
  return (
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && url.pathname.startsWith("/maps")) ||
    jeHost(
      host,
      "mapy.com",
      "mapy.cz",
      "strava.com",
      "youtube.com",
      "youtu.be",
      "wikipedia.org",
      "komoot.com",
      "idos.cz",
      "cd.cz",
      "chmi.cz",
      "kct.cz",
    )
  );
}
