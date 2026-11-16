/**
 * Reads the JPEG EXIF fields the lightbox info panel shows.
 * Missing tags stay null; PNG and WebP return an empty reading.
 */

export interface ExifCteni {
  datumRaw: string | null;
  offset: string | null;
  make: string | null;
  model: string | null;
  expozice: { citatel: number; jmenovatel: number } | null;
  iso: number | null;
  clona: { citatel: number; jmenovatel: number } | null;
  ohnisko: { citatel: number; jmenovatel: number } | null;
  sirka: number | null;
  vyska: number | null;
}

export interface UdajeFotky {
  datum: string | null;
  cas: string | null;
  nazev: string | null;
  megapixely: string | null;
  rozmery: string | null;
  velikost: string | null;
  pristroj: string | null;
  expozice: string | null;
  iso: string | null;
  clona: string | null;
  ohnisko: string | null;
}

const DNY = ["ne", "po", "út", "st", "čt", "pá", "so"] as const;

const PRAZDNY_EXIF: ExifCteni = {
  datumRaw: null,
  offset: null,
  make: null,
  model: null,
  expozice: null,
  iso: null,
  clona: null,
  ohnisko: null,
  sirka: null,
  vyska: null,
};

export function ctiExif(bajty: Uint8Array): ExifCteni {
  if (bajty.length < 4 || bajty[0] !== 0xff || bajty[1] !== 0xd8) return { ...PRAZDNY_EXIF };
  let i = 2;
  while (i + 4 < bajty.length) {
    if (bajty[i] !== 0xff) break;
    const znacka = bajty[i + 1] ?? 0;
    if (znacka === 0xd8) {
      i += 2;
      continue;
    }
    if (znacka === 0xda || znacka === 0xd9) break;
    const delka = ((bajty[i + 2] ?? 0) << 8) | (bajty[i + 3] ?? 0);
    if (delka < 2 || i + 2 + delka > bajty.length) break;
    if (znacka === 0xe1 && shoda(bajty, i + 4, "Exif\0\0")) {
      return ctiTiff(bajty, i + 10, i + 2 + delka);
    }
    i += 2 + delka;
  }
  return { ...PRAZDNY_EXIF };
}

export function sestavUdaje(vstup: {
  exif: ExifCteni;
  sirka: number | null;
  vyska: number | null;
  bajty: number | null;
  nazevSouboru: string | null;
  zalozniCas: string | null;
}): UdajeFotky {
  const casExifu = rozlozExifCas(vstup.exif.datumRaw, vstup.exif.offset);
  const casZalohy = casExifu === null ? rozlozIso(vstup.zalozniCas) : null;
  const cas = casExifu ?? casZalohy;
  const sirka = vstup.sirka ?? vstup.exif.sirka;
  const vyska = vstup.vyska ?? vstup.exif.vyska;
  return {
    datum: cas?.datum ?? null,
    cas: cas?.cas ?? null,
    nazev: vstup.nazevSouboru,
    megapixely: sirka !== null && vyska !== null ? formatMegapixelu(sirka, vyska) : null,
    rozmery: sirka !== null && vyska !== null ? `${sirka} × ${vyska}` : null,
    velikost: vstup.bajty !== null && vstup.bajty > 0 ? formatVelikosti(vstup.bajty) : null,
    pristroj: slozPristroj(vstup.exif.make, vstup.exif.model),
    expozice: formatExpozice(vstup.exif.expozice),
    iso: vstup.exif.iso !== null ? `ISO ${vstup.exif.iso}` : null,
    clona: formatClony(vstup.exif.clona),
    ohnisko: formatOhniska(vstup.exif.ohnisko),
  };
}

export function radkyUdaju(udaje: UdajeFotky): string[] {
  return [
    udaje.datum,
    udaje.cas,
    udaje.nazev,
    udaje.megapixely,
    udaje.rozmery,
    udaje.velikost,
    udaje.pristroj,
    udaje.expozice,
    udaje.iso,
    udaje.clona,
    udaje.ohnisko,
  ].filter((radek): radek is string => radek !== null && radek.length > 0);
}

/** Last path segment when it is not a generated uuid file name. */
export function nazevZAdresy(adresa: string): string | null {
  const bezDotazu = adresa.split("?")[0] ?? "";
  const kus = decodeURIComponent(bezDotazu.split("/").pop() ?? "").trim();
  if (!/.[.][A-Za-z0-9]{2,5}$/.test(kus)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(kus)) {
    return null;
  }
  return kus;
}

function ctiTiff(bajty: Uint8Array, zacatek: number, konec: number): ExifCteni {
  const vysledek: ExifCteni = { ...PRAZDNY_EXIF };
  if (zacatek + 8 > konec) return vysledek;
  const view = new DataView(bajty.buffer, bajty.byteOffset, bajty.byteLength);
  const mala = bajty[zacatek] === 0x49 && bajty[zacatek + 1] === 0x49;
  const velka = bajty[zacatek] === 0x4d && bajty[zacatek + 1] === 0x4d;
  if (!mala && !velka) return vysledek;
  const ifd0 = zacatek + view.getUint32(zacatek + 4, mala);
  const podIfd = projdiIfd(view, mala, zacatek, konec, ifd0, vysledek, false);
  if (podIfd !== null) projdiIfd(view, mala, zacatek, konec, podIfd, vysledek, true);
  return vysledek;
}

function projdiIfd(
  view: DataView,
  mala: boolean,
  tiff: number,
  konec: number,
  ifd: number,
  cil: ExifCteni,
  jeExif: boolean,
): number | null {
  if (ifd < tiff || ifd + 2 > konec) return null;
  const pocet = view.getUint16(ifd, mala);
  let exifIfd: number | null = null;
  for (let n = 0; n < pocet; n += 1) {
    const vstup = ifd + 2 + n * 12;
    if (vstup + 12 > konec) break;
    const tag = view.getUint16(vstup, mala);
    const typ = view.getUint16(vstup + 2, mala);
    const count = view.getUint32(vstup + 4, mala);
    if (tag === 0x8769 && !jeExif) {
      exifIfd = tiff + view.getUint32(vstup + 8, mala);
      continue;
    }
    zapisTag(view, mala, tiff, konec, vstup + 8, tag, typ, count, cil);
  }
  return exifIfd;
}

function zapisTag(
  view: DataView,
  mala: boolean,
  tiff: number,
  konec: number,
  pole: number,
  tag: number,
  typ: number,
  count: number,
  cil: ExifCteni,
): void {
  if (tag === 0x010f) cil.make = ctiAscii(view, mala, tiff, konec, pole, count);
  else if (tag === 0x0110) cil.model = ctiAscii(view, mala, tiff, konec, pole, count);
  else if (tag === 0x9003 || (tag === 0x0132 && cil.datumRaw === null)) {
    cil.datumRaw = ctiAscii(view, mala, tiff, konec, pole, count);
  } else if (tag === 0x9011 || (tag === 0x9010 && cil.offset === null)) {
    cil.offset = ctiAscii(view, mala, tiff, konec, pole, count);
  } else if (tag === 0x829a) cil.expozice = ctiZlomek(view, mala, tiff, konec, pole, typ, count);
  else if (tag === 0x829d) cil.clona = ctiZlomek(view, mala, tiff, konec, pole, typ, count);
  else if (tag === 0x920a) cil.ohnisko = ctiZlomek(view, mala, tiff, konec, pole, typ, count);
  else if (tag === 0x8827) cil.iso = ctiCele(view, mala, tiff, konec, pole, typ, count);
  else if (tag === 0xa002) cil.sirka = ctiCele(view, mala, tiff, konec, pole, typ, count);
  else if (tag === 0xa003) cil.vyska = ctiCele(view, mala, tiff, konec, pole, typ, count);
}

function ctiAscii(
  view: DataView,
  mala: boolean,
  tiff: number,
  konec: number,
  pole: number,
  count: number,
): string | null {
  if (count === 0) return null;
  const start = count <= 4 ? pole : tiff + view.getUint32(pole, mala);
  if (start < 0 || start + count > konec) return null;
  let text = "";
  for (let i = 0; i < count; i += 1) {
    const znak = view.getUint8(start + i);
    if (znak === 0) break;
    text += String.fromCharCode(znak);
  }
  const orez = text.trim();
  return orez.length > 0 ? orez : null;
}

function ctiCele(
  view: DataView,
  mala: boolean,
  tiff: number,
  konec: number,
  pole: number,
  typ: number,
  count: number,
): number | null {
  if (count < 1 || pole + 4 > view.byteLength) return null;
  if (typ === 3) return view.getUint16(pole, mala);
  if (typ === 4) {
    const hodnota = view.getUint32(pole, mala);
    if (count === 1) return hodnota;
    const start = tiff + hodnota;
    if (start + 4 > konec) return null;
    return view.getUint32(start, mala);
  }
  return null;
}

function ctiZlomek(
  view: DataView,
  mala: boolean,
  tiff: number,
  konec: number,
  pole: number,
  typ: number,
  count: number,
): { citatel: number; jmenovatel: number } | null {
  if (typ !== 5 || count < 1) return null;
  const start = tiff + view.getUint32(pole, mala);
  if (start < tiff || start + 8 > konec) return null;
  const citatel = view.getUint32(start, mala);
  const jmenovatel = view.getUint32(start + 4, mala);
  if (jmenovatel === 0) return null;
  return { citatel, jmenovatel };
}

function shoda(bajty: Uint8Array, start: number, text: string): boolean {
  if (start + text.length > bajty.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bajty[start + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function rozlozExifCas(
  raw: string | null,
  offset: string | null,
): { datum: string; cas: string } | null {
  if (raw === null) return null;
  const shodaCasu = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (shodaCasu === null) return null;
  const rok = Number(shodaCasu[1]);
  const mesic = Number(shodaCasu[2]);
  const den = Number(shodaCasu[3]);
  const hodina = shodaCasu[4] ?? "00";
  const minuta = shodaCasu[5] ?? "00";
  const vterina = shodaCasu[6] ?? "00";
  const denVTydnu = new Date(rok, mesic - 1, den).getDay();
  const offsetText = offset !== null && /^[+-]\d{2}:\d{2}$/.test(offset) ? `, GMT${offset}` : "";
  return {
    datum: `${den}. ${mesic}. ${rok}`,
    cas: `${DNY[denVTydnu] ?? ""} ${hodina}:${minuta}:${vterina}${offsetText}`.trim(),
  };
}

function rozlozIso(iso: string | null): { datum: string; cas: string } | null {
  if (iso === null || iso.length === 0) return null;
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return null;
  const posun = -datum.getTimezoneOffset();
  const znamenko = posun >= 0 ? "+" : "-";
  const absolutni = Math.abs(posun);
  const hodiny = String(Math.floor(absolutni / 60)).padStart(2, "0");
  const minuty = String(absolutni % 60).padStart(2, "0");
  return {
    datum: `${datum.getDate()}. ${datum.getMonth() + 1}. ${datum.getFullYear()}`,
    cas: `${DNY[datum.getDay()] ?? ""} ${pad(datum.getHours())}:${pad(datum.getMinutes())}:${pad(datum.getSeconds())}, GMT${znamenko}${hodiny}:${minuty}`,
  };
}

function formatMegapixelu(sirka: number, vyska: number): string {
  const mp = (sirka * vyska) / 1_000_000;
  const cele = Math.round(mp);
  const text = Math.abs(mp - cele) < 0.05 ? String(cele) : mp.toFixed(1).replace(".", ",");
  return `${text} MP`;
}

function formatVelikosti(bajty: number): string {
  const mib = bajty / (1024 * 1024);
  if (mib >= 0.1) {
    const text = mib >= 10 ? mib.toFixed(0) : mib.toFixed(1);
    return `${text.replace(".", ",")} MiB`;
  }
  const kib = Math.max(1, Math.round(bajty / 1024));
  return `${kib} KiB`;
}

function formatExpozice(zlomek: { citatel: number; jmenovatel: number } | null): string | null {
  if (zlomek === null) return null;
  if (zlomek.jmenovatel > zlomek.citatel) {
    return `1/${Math.max(1, Math.round(zlomek.jmenovatel / zlomek.citatel))} s`;
  }
  return `${formatCisla(zlomek.citatel / zlomek.jmenovatel)} s`;
}

function formatClony(zlomek: { citatel: number; jmenovatel: number } | null): string | null {
  if (zlomek === null) return null;
  return `ƒ/${formatCisla(zlomek.citatel / zlomek.jmenovatel)}`;
}

function formatOhniska(zlomek: { citatel: number; jmenovatel: number } | null): string | null {
  if (zlomek === null) return null;
  return `${formatCisla(zlomek.citatel / zlomek.jmenovatel)} mm`;
}

function slozPristroj(make: string | null, model: string | null): string | null {
  if (make === null && model === null) return null;
  if (make === null) return model;
  if (model === null) return make;
  if (model.toLowerCase().includes(make.toLowerCase())) return model;
  return `${make} ${model}`;
}

function formatCisla(hodnota: number): string {
  const zaokrouhleno = Math.round(hodnota * 100) / 100;
  return String(zaokrouhleno).replace(".", ",");
}

function pad(hodnota: number): string {
  return String(hodnota).padStart(2, "0");
}
