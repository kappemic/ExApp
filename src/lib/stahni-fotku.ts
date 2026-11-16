/**
 * Authenticated photo download / mobile share via BFF stream URLs.
 */

export type MetodaStahnuti = "share" | "download" | "zruseno";

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

/** Phone and tablet: a bulk save should open the system sheet, not a ZIP. */
export function jeDotykoveZarizeni(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Several photos on a phone go to the gallery when the browser can share files. */
export function maStahnoutDoGalerie(telefon: boolean, lzeSdilet: boolean, pocet: number): boolean {
  return telefon && lzeSdilet && pocet >= 1;
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

interface ZapisovatelnyProud {
  write(data: Blob | ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
}

interface SouborKZapisu {
  createWritable(): Promise<ZapisovatelnyProud>;
}

export interface SlozkaKZapisu {
  getFileHandle(nazev: string, volby: { create: true }): Promise<SouborKZapisu>;
  removeEntry?: (nazev: string) => Promise<void>;
}

interface OknoSVyberem {
  showSaveFilePicker?: (volby: { suggestedName: string }) => Promise<SouborKZapisu>;
  showDirectoryPicker?: (volby?: { mode?: "readwrite" }) => Promise<SlozkaKZapisu>;
}

function oknoSVyberem(): OknoSVyberem {
  return window as unknown as OknoSVyberem;
}

function jeZruseni(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** User picks one file. Null when the browser has no save picker. */
export async function vyberSouborKUlozeni(
  suggestedName: string,
): Promise<SouborKZapisu | "zruseno" | null> {
  const vyber = oknoSVyberem().showSaveFilePicker;
  if (vyber === undefined) return null;
  try {
    return await vyber({ suggestedName });
  } catch (err: unknown) {
    if (jeZruseni(err)) return "zruseno";
    return null;
  }
}

/** User picks a folder for several photos. Null when the browser cannot ask. */
export async function vyberSlozkuKUlozeni(): Promise<SlozkaKZapisu | "zruseno" | null> {
  const vyber = oknoSVyberem().showDirectoryPicker;
  if (vyber === undefined) return null;
  try {
    return await vyber({ mode: "readwrite" });
  } catch (err: unknown) {
    if (jeZruseni(err)) return "zruseno";
    return null;
  }
}

async function zapisDoProudu(proud: ZapisovatelnyProud, blob: Blob): Promise<void> {
  await proud.write(await blob.arrayBuffer());
  await proud.close();
}

async function zahodProud(proud: ZapisovatelnyProud): Promise<void> {
  try {
    if (proud.abort !== undefined) await proud.abort();
    else await proud.close();
  } catch {
    // The stream is already closed, or the browser rejected the abort.
  }
}

async function smazPrazdneSoubory(slozka: SlozkaKZapisu, nazvy: readonly string[]): Promise<void> {
  for (const nazev of nazvy) {
    try {
      await slozka.removeEntry?.(nazev);
    } catch {
      // An empty placeholder may remain when the browser cannot delete it.
    }
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
  const vysledek = await sdilejSoubory(nav, [soubor]);
  return vysledek === "ok" || vysledek === "zruseno";
}

/** Opens the system share sheet so a phone can save the images into its gallery. */
export async function sdilejSoubory(
  nav: Navigator,
  soubory: readonly File[],
): Promise<"ok" | "zruseno" | "nelze"> {
  if (nav.share === undefined || soubory.length === 0) return "nelze";
  const files = [...soubory];
  try {
    if (nav.canShare !== undefined && !nav.canShare({ files })) return "nelze";
    await nav.share({ files });
    return "ok";
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return "zruseno";
    return "nelze";
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

  let proud: ZapisovatelnyProud | null = null;
  if (!lzeSdiletSoubory(nav)) {
    const vyber = await vyberSouborKUlozeni(nazevSouboru);
    if (vyber === "zruseno") return { ok: true, metoda: "zruseno" };
    if (vyber !== null) {
      try {
        // Open the stream before the download. Chrome drops write permission after the fetch.
        proud = await vyber.createWritable();
      } catch {
        proud = null;
      }
    }
  }

  let odpoved: Response;
  try {
    odpoved = await fetch(url, { credentials: "include" });
  } catch {
    if (proud !== null) await zahodProud(proud);
    return { ok: false, chyba: CHYBA_OFFLINE };
  }

  if (!odpoved.ok) {
    if (proud !== null) await zahodProud(proud);
    return { ok: false, chyba: CHYBA_OBECNA };
  }

  let blob: Blob;
  try {
    blob = await odpoved.blob();
  } catch {
    if (proud !== null) await zahodProud(proud);
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

  if (proud !== null) {
    try {
      await zapisDoProudu(proud, blob);
      return { ok: true, metoda: "download" };
    } catch {
      await zahodProud(proud);
      return { ok: false, chyba: CHYBA_OBECNA };
    }
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

export type StahniGaleriiVysledek =
  | { ok: true; pocet: number; zruseno?: boolean }
  | { ok: false; chyba: string; uspech: number; soubory?: File[] };

const CHYBA_GALERIE = "Fotky se nepodařilo uložit do galerie. Zkus to znovu.";

/**
 * Fetches each photo, then hands the files to the system share sheet.
 * On a phone that sheet can save them straight into the gallery.
 * When the browser drops the tap gesture during the fetch, `soubory` is
 * returned so the caller can share them from a fresh tap.
 */
export async function stahniFotkyDoGalerie(
  polozky: readonly { url: string; nazevSouboru: string }[],
  onPrubeh?: PrubehStahovaniZip,
  nav: Navigator = navigator,
): Promise<StahniGaleriiVysledek> {
  if (polozky.length === 0) return { ok: true, pocet: 0 };
  if (typeof nav.onLine === "boolean" && !nav.onLine) {
    return { ok: false, chyba: CHYBA_OFFLINE, uspech: 0 };
  }

  const soubory: File[] = [];
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
    soubory.push(new File([blob], nazev, { type: blob.type || `image/${pripona}` }));
    uspech += 1;
    onPrubeh?.(index, "hotovo");
  }

  const sdileni = await sdilejSoubory(nav, soubory);
  if (sdileni === "ok") return { ok: true, pocet: uspech };
  if (sdileni === "zruseno") return { ok: true, pocet: 0, zruseno: true };
  return { ok: false, chyba: CHYBA_GALERIE, uspech, soubory };
}

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

  const { default: JSZip } = await import("jszip");
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

/**
 * Writes each photo into a folder the user already picked.
 */
export async function stahniFotkyDoSlozky(
  polozky: readonly { url: string; nazevSouboru: string }[],
  slozka: SlozkaKZapisu,
  onPrubeh?: PrubehStahovaniZip,
  nav: Navigator = navigator,
): Promise<StahniZipVysledek> {
  if (polozky.length === 0) return { ok: true, pocet: 0 };
  if (typeof nav.onLine === "boolean" && !nav.onLine) {
    return { ok: false, chyba: CHYBA_OFFLINE, uspech: 0 };
  }

  const pouziteNazvy = new Set<string>();
  const cile: { nazev: string; proud: ZapisovatelnyProud }[] = [];

  // Create the files before any fetch. A missing-file probe, or opening the
  // file after the download, leaves the picked folder empty in desktop Chrome.
  for (const polozka of polozky) {
    const nazev = unikatniNazevVSouboru(polozka.nazevSouboru, pouziteNazvy);
    pouziteNazvy.add(nazev);
    try {
      const soubor = await slozka.getFileHandle(nazev, { create: true });
      cile.push({ nazev, proud: await soubor.createWritable() });
    } catch {
      for (const cil of cile) await zahodProud(cil.proud);
      await smazPrazdneSoubory(
        slozka,
        cile.map((cil) => cil.nazev),
      );
      return { ok: false, chyba: CHYBA_OBECNA, uspech: 0 };
    }
  }

  const zrusOd = async (odIndexu: number): Promise<void> => {
    await zahodZbyleProudy(cile, odIndexu);
    await smazPrazdneSoubory(
      slozka,
      cile.slice(odIndexu).map((cil) => cil.nazev),
    );
  };

  let uspech = 0;

  for (let index = 0; index < polozky.length; index += 1) {
    const polozka = polozky[index];
    const cil = cile[index];
    if (polozka === undefined || cil === undefined) {
      await zrusOd(index);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }
    onPrubeh?.(index, "probiha");
    if (polozka.url.length === 0) {
      await zrusOd(index);
      onPrubeh?.(index, "chyba", CHYBA_OBECNA);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }

    let odpoved: Response;
    try {
      odpoved = await fetch(polozka.url, { credentials: "include" });
    } catch {
      await zrusOd(index);
      onPrubeh?.(index, "chyba", CHYBA_OFFLINE);
      return { ok: false, chyba: CHYBA_OFFLINE, uspech };
    }
    if (!odpoved.ok) {
      await zrusOd(index);
      onPrubeh?.(index, "chyba", CHYBA_OBECNA);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }

    let blob: Blob;
    try {
      blob = await odpoved.blob();
    } catch {
      await zrusOd(index);
      onPrubeh?.(index, "chyba", CHYBA_OBECNA);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }

    try {
      await zapisDoProudu(cil.proud, blob);
    } catch {
      await zrusOd(index);
      onPrubeh?.(index, "chyba", CHYBA_OBECNA);
      return { ok: false, chyba: CHYBA_OBECNA, uspech };
    }
    uspech += 1;
    onPrubeh?.(index, "hotovo");
  }

  return { ok: true, pocet: uspech };
}

async function zahodZbyleProudy(
  cile: readonly { nazev: string; proud: ZapisovatelnyProud }[],
  odIndexu: number,
): Promise<void> {
  for (let index = odIndexu; index < cile.length; index += 1) {
    await zahodProud(cile[index].proud);
  }
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
