import JSZip from "jszip";

/**
 * Authenticated photo download / mobile share via BFF stream URLs.
 */

export type MetodaStahnuti = "share" | "download";

export type StahniVysledek =
  | { ok: true; metoda: MetodaStahnuti }
  | { ok: false; chyba: string };

const CHYBA_OFFLINE = "Jsi offline. Připoj se k internetu a zkus to znovu.";
const CHYBA_OBECNA = "Fotku se nepodařilo uložit. Zkus to prosím znovu.";

/** Safe segment for download filenames (ids are UUIDs; strip path chars). */
export function segmentDoNazvu(hodnota: string): string {
  return hodnota.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "fotka";
}

export function nazevSouboruVypravy(
  expeditionId: string,
  fotkaId: string,
  pripona = "jpg",
): string {
  return `vyprava-${segmentDoNazvu(expeditionId)}-${segmentDoNazvu(fotkaId)}.${pripona}`;
}

export function nazevSouboruAlba(
  albumId: string,
  fotkaId: string,
  pripona = "jpg",
): string {
  return `album-${segmentDoNazvu(albumId)}-${segmentDoNazvu(fotkaId)}.${pripona}`;
}

/** Archive filename for a bulk album download (browser ZIP). */
export function nazevZipAlba(albumId: string, nazevAlba?: string): string {
  const jadro =
    nazevAlba !== undefined && nazevAlba.trim().length > 0
      ? segmentDoNazvu(nazevAlba.trim())
      : segmentDoNazvu(albumId);
  return `album-${jadro}.zip`;
}

export function priponaZTypuObsahu(typ: string): string {
  const normal = typ.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normal === "image/png") return "png";
  if (normal === "image/webp") return "webp";
  if (normal === "image/jpeg" || normal === "image/jpg") return "jpg";
  if (normal.startsWith("image/")) {
    const cast = normal.slice("image/".length);
    if (/^[a-z0-9+.-]+$/.test(cast)) return cast.replace("+", "");
  }
  return "jpg";
}

export function upravPriponuNazvu(nazev: string, pripona: string): string {
  const zaklad = nazev.replace(/\.[a-zA-Z0-9]+$/, "");
  return `${zaklad}.${pripona}`;
}

/** Prefer Web Share with files on capable mobile browsers. */
export function rozhodniMetoduStahnuti(lzeSdiletSoubory: boolean): MetodaStahnuti {
  return lzeSdiletSoubory ? "share" : "download";
}

export function lzeSdiletSoubory(nav: Navigator | undefined): boolean {
  if (nav === undefined || nav.canShare === undefined) return false;
  try {
    const soubor = new File(["x"], "probe.jpg", { type: "image/jpeg" });
    return nav.canShare({ files: [soubor] });
  } catch {
    return false;
  }
}

async function stahniPresOdkaz(blob: Blob, nazev: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const odkaz = document.createElement("a");
    odkaz.href = url;
    odkaz.download = nazev;
    odkaz.rel = "noopener";
    odkaz.style.display = "none";
    document.body.appendChild(odkaz);
    odkaz.click();
    odkaz.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function sdilejSoubor(nav: Navigator, soubor: File): Promise<boolean> {
  if (nav.share === undefined) return false;
  try {
    await nav.share({ files: [soubor] });
    return true;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return true;
    return false;
  }
}

/**
 * Fetches the stream with session cookies, then shares or downloads.
 */
export async function stahniFotkuZeUrl(
  url: string,
  nazevSouboru: string,
  nav: Navigator = navigator,
): Promise<StahniVysledek> {
  if (typeof nav.onLine === "boolean" && !nav.onLine) {
    return { ok: false, chyba: CHYBA_OFFLINE };
  }
  if (url.length === 0) {
    return { ok: false, chyba: CHYBA_OBECNA };
  }

  let odpoved: Response;
  try {
    odpoved = await fetch(url, { credentials: "include" });
  } catch {
    return { ok: false, chyba: CHYBA_OFFLINE };
  }

  if (!odpoved.ok) {
    return { ok: false, chyba: CHYBA_OBECNA };
  }

  let blob: Blob;
  try {
    blob = await odpoved.blob();
  } catch {
    return { ok: false, chyba: CHYBA_OBECNA };
  }

  const pripona = priponaZTypuObsahu(blob.type || odpoved.headers.get("content-type") || "");
  const nazev = upravPriponuNazvu(nazevSouboru, pripona);
  const soubor = new File([blob], nazev, { type: blob.type || `image/${pripona}` });

  const sdilet = lzeSdiletSoubory(nav) && nav.canShare !== undefined && nav.canShare({ files: [soubor] });
  const metoda = rozhodniMetoduStahnuti(sdilet);

  if (metoda === "share") {
    const ok = await sdilejSoubor(nav, soubor);
    if (ok) return { ok: true, metoda: "share" };
  }

  try {
    await stahniPresOdkaz(blob, nazev);
    return { ok: true, metoda: "download" };
  } catch {
    return { ok: false, chyba: CHYBA_OBECNA };
  }
}

export type StahniDavkaVysledek =
  | { ok: true; pocet: number }
  | { ok: false; chyba: string; uspech: number };

export type PrubehStahovaniZip = (
  index: number,
  faze: "probiha" | "hotovo" | "chyba",
  chyba?: string,
) => void;

/**
 * Downloads multiple photos one after another (legacy helper; prefer ZIP batch).
 * Stops on the first failure and reports how many succeeded.
 */
export async function stahniFotkyPostupne(
  polozky: readonly { url: string; nazevSouboru: string }[],
  nav: Navigator = navigator,
): Promise<StahniDavkaVysledek> {
  let uspech = 0;
  for (const polozka of polozky) {
    const vysledek = await stahniFotkuZeUrl(polozka.url, polozka.nazevSouboru, nav);
    if (!vysledek.ok) {
      return { ok: false, chyba: vysledek.chyba, uspech };
    }
    uspech += 1;
  }
  return { ok: true, pocet: uspech };
}

export type StahniZipVysledek =
  | { ok: true; pocet: number }
  | { ok: false; chyba: string; uspech: number };

/**
 * Fetches each photo, packs a single ZIP in the browser, triggers one download.
 */
export async function stahniFotkyJakoZip(
  polozky: readonly { url: string; nazevSouboru: string }[],
  nazevArchivu: string,
  onPrubeh?: PrubehStahovaniZip,
  nav: Navigator = navigator,
): Promise<StahniZipVysledek> {
  if (polozky.length === 0) return { ok: true, pocet: 0 };
  if (typeof nav.onLine === "boolean" && !nav.onLine) {
    return { ok: false, chyba: CHYBA_OFFLINE, uspech: 0 };
  }

  const zip = new JSZip();
  let uspech = 0;
  const pouziteNazvy = new Set<string>();

  for (let index = 0; index < polozky.length; index += 1) {
    const polozka = polozky[index];
    onPrubeh?.(index, "probiha");

    if (polozka.url.length === 0) {
      onPrubeh?.(index, "chyba", CHYBA_OBECNA);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }

    let odpoved: Response;
    try {
      odpoved = await fetch(polozka.url, { credentials: "include" });
    } catch {
      onPrubeh?.(index, "chyba", CHYBA_OFFLINE);
      return { ok: false, chyba: CHYBA_OFFLINE, uspech };
    }

    if (!odpoved.ok) {
      onPrubeh?.(index, "chyba", CHYBA_OBECNA);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }

    let blob: Blob;
    try {
      blob = await odpoved.blob();
    } catch {
      onPrubeh?.(index, "chyba", CHYBA_OBECNA);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }

    const pripona = priponaZTypuObsahu(blob.type || odpoved.headers.get("content-type") || "");
    let nazev = upravPriponuNazvu(polozka.nazevSouboru, pripona);
    nazev = unikatniNazevVSouboru(nazev, pouziteNazvy);
    pouziteNazvy.add(nazev);
    zip.file(nazev, blob);
    uspech += 1;
    onPrubeh?.(index, "hotovo");
  }

  let archiv: Blob;
  try {
    archiv = await zip.generateAsync({ type: "blob" });
  } catch {
    return { ok: false, chyba: CHYBA_OBECNA, uspech: 0 };
  }

  const zipNazev = nazevArchivu.endsWith(".zip") ? nazevArchivu : `${nazevArchivu}.zip`;
  try {
    await stahniPresOdkaz(archiv, zipNazev);
  } catch {
    return { ok: false, chyba: CHYBA_OBECNA, uspech };
  }

  return { ok: true, pocet: uspech };
}

function unikatniNazevVSouboru(nazev: string, existujici: ReadonlySet<string>): string {
  if (!existujici.has(nazev)) return nazev;
  const bodka = nazev.lastIndexOf(".");
  const zaklad = bodka > 0 ? nazev.slice(0, bodka) : nazev;
  const pripona = bodka > 0 ? nazev.slice(bodka) : "";
  let cislo = 2;
  while (existujici.has(`${zaklad}-${cislo}${pripona}`)) cislo += 1;
  return `${zaklad}-${cislo}${pripona}`;
}
