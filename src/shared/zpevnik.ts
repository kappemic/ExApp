/**
 * Pure songbook helpers for the client and the server.
 * A slabika is the grapheme cluster under a chord column, not a linguistic syllable.
 * Diacritics use the same NFD + combining-mark strip as search normalization.
 */

const DIAKRITIKA = /[\u0300-\u036f]/g;

/**
 * Root, optional accidental, optional quality, optional number,
 * optional trailing sus/add/maj number, optional slash bass.
 * A hyphen is the minor quality only in that slot, so a minus inside
 * a word never becomes a chord.
 */
const AKORD =
  /^([A-H])([#b])?(maj|min|mi|dim|aug|sus|add|m|-)?(\d+)?(sus\d+|add\d+|maj\d+)?(?:\/([A-H])([#b])?)?$/;

const GRAFEMY = new Intl.Segmenter("cs", { granularity: "grapheme" });
const RAZENI = new Intl.Collator("cs");

export type TypBloku = "sloka" | "refren";

export type Slabika = {
  text: string;
  /** Czech chord symbol when this grapheme carries one. */
  akord?: string;
};

export type Radek = { slabiky: Slabika[] };

export type Blok = { typ: TypBloku; radky: Radek[] };

export type TeloPisne = { bloky: Blok[] };

export type VysledekVlozeni =
  | { ok: true; telo: TeloPisne }
  | { ok: false; duvod: "chybi_text" };

type UmistenyAkord = { index: number; akord: string };

/** Trim, NFD, strip diacritics, lower case. */
function bezDiakritiky(hodnota: string): string {
  return hodnota.trim().normalize("NFD").replace(DIAKRITIKA, "").toLowerCase();
}

/** Keep the written root. B stays B, H stays H, Bb stays Bb. */
function zaklad(root: string, accidental: string): string {
  return `${root}${accidental}`;
}

function normalizujKvalitu(kvalita: string): string {
  if (kvalita === "min" || kvalita === "mi" || kvalita === "-") return "m";
  return kvalita;
}

/** Czech display chord, or null when the token is not a chord. */
export function normalizujAkord(token: string): string | null {
  const shoda = AKORD.exec(token.trim());
  if (shoda === null) return null;
  const root = shoda[1];
  if (root === undefined) return null;
  const accidental = shoda[2] ?? "";
  const kvalita = shoda[3] ?? "";
  const cislo = shoda[4] ?? "";
  const pokracovani = shoda[5] ?? "";
  const basRoot = shoda[6];
  const basAccidental = shoda[7] ?? "";

  let vysledek =
    zaklad(root, accidental) +
    normalizujKvalitu(kvalita) +
    cislo +
    pokracovani;
  if (basRoot !== undefined) {
    vysledek += `/${zaklad(basRoot, basAccidental)}`;
  }
  return vysledek;
}

function tokenyAkordu(radek: string): UmistenyAkord[] | null {
  const nalezene: UmistenyAkord[] = [];
  const re = /\S+/g;
  let shoda: RegExpExecArray | null = re.exec(radek);
  while (shoda !== null) {
    const token = shoda[0];
    const akord = normalizujAkord(token);
    if (akord === null) return null;
    nalezene.push({ index: shoda.index, akord });
    shoda = re.exec(radek);
  }
  if (nalezene.length === 0) return null;
  return nalezene;
}

/** One chord inside a glued token. No hyphen quality, so "A-A-A" stays a lyric. */
const CAST_AKORDU =
  /[A-H][#b]?(?:maj|min|mi|dim|aug|sus|add|m)?\d*(?:sus\d+|add\d+|maj\d+)?(?:\/[A-H][#b]?)?/y;

/** "AmGAmG" → ["Am", "G", "Am", "G"]. Null unless the whole token is chords. */
function rozdelSlepenyToken(token: string): string[] | null {
  const casti: string[] = [];
  let pozice = 0;
  while (pozice < token.length) {
    CAST_AKORDU.lastIndex = pozice;
    const shoda = CAST_AKORDU.exec(token);
    if (shoda === null) return null;
    casti.push(shoda[0]);
    pozice += shoda[0].length;
  }
  return casti.length >= 2 ? casti : null;
}

/**
 * A chord line where some chords have no space between them, as older PDF
 * imports stored it. A lone word of bare capitals stays a lyric ("AHA").
 */
function slepeneAkordy(radek: string): UmistenyAkord[] | null {
  const nalezene: UmistenyAkord[] = [];
  let slepene = false;
  const re = /\S+/g;
  let shoda: RegExpExecArray | null = re.exec(radek);
  while (shoda !== null) {
    const akord = normalizujAkord(shoda[0]);
    if (akord !== null) {
      nalezene.push({ index: shoda.index, akord });
    } else {
      const casti = rozdelSlepenyToken(shoda[0]);
      if (casti === null) return null;
      slepene = true;
      let index = shoda.index;
      for (const cast of casti) {
        const akordCasti = normalizujAkord(cast);
        if (akordCasti === null) return null;
        nalezene.push({ index, akord: akordCasti });
        index += cast.length;
      }
    }
    shoda = re.exec(radek);
  }
  if (!slepene) return null;
  const jistyAkord = nalezene.some((polozka) => polozka.akord.length > 1);
  const viceTokenu = radek.trim().split(/\s+/).length > 1;
  return jistyAkord || viceTokenu || /^\s/.test(radek) ? nalezene : null;
}

function akordyNaRadku(radek: string): UmistenyAkord[] | null {
  return tokenyAkordu(radek) ?? slepeneAkordy(radek);
}

function jePrazdnyRadek(radek: string): boolean {
  return radek.trim().length === 0;
}

function radekSAkordy(akordy: readonly UmistenyAkord[], lyric: string): Radek {
  const casti: { text: string; zacatek: number; konec: number }[] = [];
  for (const cast of GRAFEMY.segment(lyric)) {
    casti.push({
      text: cast.segment,
      zacatek: cast.index,
      konec: cast.index + cast.segment.length,
    });
  }

  const akordNaZacatku = new Map<number, string>();
  const zaKoncem: string[] = [];
  for (const token of akordy) {
    const cast = casti.find(
      (grafem) => token.index >= grafem.zacatek && token.index < grafem.konec,
    );
    if (cast === undefined) {
      zaKoncem.push(token.akord);
      continue;
    }
    if (!akordNaZacatku.has(cast.zacatek)) {
      akordNaZacatku.set(cast.zacatek, token.akord);
    }
  }

  const slabiky: Slabika[] = casti.map((cast) => {
    const akord = akordNaZacatku.get(cast.zacatek);
    if (akord === undefined) return { text: cast.text };
    return { text: cast.text, akord };
  });
  for (const akord of zaKoncem) {
    slabiky.push({ text: "", akord });
  }
  return { slabiky };
}

/**
 * Chord line directly above a lyric seats each token on the grapheme
 * at that column. A lyric with no chord line above is one slabika.
 * Whitespace-only input fails with `{ ok: false, duvod: "chybi_text" }`.
 */
export function parsujVlozeni(text: string): VysledekVlozeni {
  if (text.trim().length === 0) {
    return { ok: false, duvod: "chybi_text" };
  }

  const radkyTextu = text.split(/\r?\n/);
  const radky: Radek[] = [];
  let i = 0;
  while (i < radkyTextu.length) {
    const radek = radkyTextu[i];
    if (radek === undefined || jePrazdnyRadek(radek)) {
      i += 1;
      continue;
    }
    const akordy = akordyNaRadku(radek);
    const dalsi = radkyTextu[i + 1];
    if (
      akordy !== null &&
      dalsi !== undefined &&
      !jePrazdnyRadek(dalsi) &&
      akordyNaRadku(dalsi) === null
    ) {
      radky.push(radekSAkordy(akordy, dalsi));
      i += 2;
      continue;
    }
    if (akordy !== null) {
      radky.push(radekSAkordy(akordy, ""));
      i += 1;
      continue;
    }
    radky.push({ slabiky: [{ text: radek }] });
    i += 1;
  }

  if (radky.length === 0) {
    return { ok: false, duvod: "chybi_text" };
  }

  return { ok: true, telo: { bloky: [{ typ: "sloka", radky }] } };
}

/**
 * "musil   G#m": a wrapped lyric word sharing a PDF row with the chord for the
 * line below. The first gap of two or more spaces with only chords after it wins.
 */
function slovoSAkordy(text: string): { slovo: string; akordy: UmistenyAkord[] } | null {
  for (const mezera of text.matchAll(/ {2,}/g)) {
    const slovo = text.slice(0, mezera.index);
    if (slovo.trim().length === 0) continue;
    const zacatek = mezera.index + mezera[0].length;
    const akordy = akordyNaRadku(text.slice(zacatek));
    if (akordy !== null) {
      return {
        slovo,
        akordy: akordy.map((polozka) => ({ index: polozka.index + zacatek, akord: polozka.akord })),
      };
    }
  }
  return null;
}

/** "D       řekni, kdo…": the chord for a lyric, stored in front of it. */
function akordPredTextem(text: string): Radek | null {
  const shoda = /^(\S+) {4,}(\S.*)$/.exec(text);
  const akord = normalizujAkord(shoda?.[1] ?? "");
  const lyric = shoda?.[2];
  if (akord === null || lyric === undefined || akordyNaRadku(lyric) !== null) return null;
  return radekSAkordy([{ index: 0, akord }], lyric);
}

function umisteneAkordy(radek: Radek): UmistenyAkord[] {
  const vysledek: UmistenyAkord[] = [];
  let index = 0;
  for (const slabika of radek.slabiky) {
    if (slabika.akord !== undefined) vysledek.push({ index, akord: slabika.akord });
    index += slabika.text.length;
  }
  return vysledek;
}

/**
 * PDF imports can store chords as plain text: glued ("AmGAmG"), beside a
 * wrapped lyric word ("musil   G#m"), or in front of the lyric. Seat them on
 * their lyric, so they show and transpose as chords. The stored song is unchanged.
 */
export function opravRozpadleAkordy(telo: TeloPisne): TeloPisne {
  const textRadku = (radek: Radek): string => radek.slabiky.map((slabika) => slabika.text).join("");
  const bezAkordu = (radek: Radek): boolean => radek.slabiky.every((slabika) => slabika.akord === undefined);
  const jeLyric = (radek: Radek | undefined): radek is Radek => {
    if (radek === undefined) return false;
    const text = textRadku(radek);
    return !jePrazdnyRadek(text) && akordyNaRadku(text) === null;
  };
  return {
    bloky: telo.bloky.map((blok) => {
      const radky: Radek[] = [];
      for (let i = 0; i < blok.radky.length; i += 1) {
        const radek = blok.radky[i];
        if (radek === undefined) continue;
        const text = textRadku(radek);
        const predTextem = bezAkordu(radek) ? akordPredTextem(text) : null;
        if (predTextem !== null) {
          radky.push(predTextem);
          continue;
        }
        const slepene = bezAkordu(radek) ? slepeneAkordy(text) : null;
        const seSlovem = bezAkordu(radek) && slepene === null ? slovoSAkordy(text) : null;
        const akordy = slepene ?? seSlovem?.akordy ?? null;
        if (akordy === null) {
          radky.push(radek);
          continue;
        }
        if (seSlovem !== null) radky.push({ slabiky: [{ text: seSlovem.slovo }] });
        const dalsi = blok.radky[i + 1];
        if (jeLyric(dalsi)) {
          const vsechny = [...umisteneAkordy(dalsi), ...akordy].sort((a, b) => a.index - b.index);
          radky.push(radekSAkordy(vsechny, textRadku(dalsi)));
          i += 1;
        } else {
          radky.push(radekSAkordy(akordy, ""));
        }
      }
      return { typ: blok.typ, radky };
    }),
  };
}

/** Stable pair identity: trimmed, without diacritics, lower case. */
export function klicParu(nazev: string, autor: string): string {
  return `${bezDiakritiky(nazev)}\u001f${bezDiakritiky(autor)}`;
}

export function jeStejnyPar(
  nazevA: string,
  autorA: string,
  nazevB: string,
  autorB: string,
): boolean {
  return klicParu(nazevA, autorA) === klicParu(nazevB, autorB);
}

/** Czech title order (`ch` between `h` and `i`), then author. Does not mutate. */
export function seradPisne<T extends { nazev: string; autor: string }>(
  pisne: readonly T[],
): T[] {
  return [...pisne].sort((a, b) => {
    const podleNazvu = RAZENI.compare(a.nazev, b.nazev);
    if (podleNazvu !== 0) return podleNazvu;
    return RAZENI.compare(a.autor, b.autor);
  });
}

/** First chord in block, row, then slabika order. */
export function prvniAkord(telo: TeloPisne): string | null {
  for (const blok of telo.bloky) {
    for (const radek of blok.radky) {
      for (const slabika of radek.slabiky) {
        if (slabika.akord !== undefined && slabika.akord.length > 0) {
          return slabika.akord;
        }
      }
    }
  }
  return null;
}

export function maAkordy(telo: TeloPisne): boolean {
  return prvniAkord(telo) !== null;
}

const STUPNE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "B", "H"] as const;

function indexStupne(zaklad: string): number | null {
  if (zaklad === "Db") return 1;
  if (zaklad === "Eb") return 3;
  if (zaklad === "Gb") return 6;
  if (zaklad === "Ab") return 8;
  if (zaklad === "H#") return 0;
  const index = STUPNE.indexOf(zaklad as (typeof STUPNE)[number]);
  return index < 0 ? null : index;
}

function rozdelKoren(akord: string): { koren: string; zbytek: string } | null {
  const dvoj = akord.slice(0, 2);
  if (dvoj === "C#" || dvoj === "Db" || dvoj === "D#" || dvoj === "Eb" || dvoj === "F#" || dvoj === "Gb" || dvoj === "G#" || dvoj === "Ab" || dvoj === "H#") {
    return { koren: dvoj, zbytek: akord.slice(2) };
  }
  const jeden = akord.slice(0, 1);
  if ("CDEFGAHB".includes(jeden)) return { koren: jeden, zbytek: akord.slice(1) };
  return null;
}

function posunKoren(koren: string, pultony: number): string | null {
  const index = indexStupne(koren);
  if (index === null) return null;
  const krok = ((pultony % 12) + 12) % 12;
  return STUPNE[(index + krok) % 12] ?? null;
}

/** Move a Czech (or English) chord by semitones. Quality and slash bass stay. */
export function posunAkord(akord: string, pultony: number): string | null {
  const cesky = akord.includes("Bb") ? (normalizujAkord(akord) ?? akord.trim()) : akord.trim();
  const rozdelene = rozdelKoren(cesky);
  if (rozdelene === null) return null;
  const koren = posunKoren(rozdelene.koren, pultony);
  if (koren === null) return null;
  const lomitko = rozdelene.zbytek.indexOf("/");
  if (lomitko < 0) return koren + rozdelene.zbytek;
  const bas = posunKoren(rozdelene.zbytek.slice(lomitko + 1), pultony);
  if (bas === null) return null;
  return `${koren}${rozdelene.zbytek.slice(0, lomitko)}/${bas}`;
}

/** Display copy. The stored song is unchanged. */
export function posunTelo(telo: TeloPisne, pultony: number): TeloPisne {
  if (pultony === 0) return telo;
  return {
    bloky: telo.bloky.map((blok) => ({
      typ: blok.typ,
      radky: blok.radky.map((radek) => ({
        slabiky: radek.slabiky.map((slabika) => {
          if (slabika.akord === undefined) return slabika;
          const akord = posunAkord(slabika.akord, pultony);
          if (akord === null) return { text: slabika.text };
          return { text: slabika.text, akord };
        }),
      })),
    })),
  };
}

/** Chord line above lyrics, so the edit form can load a published song. */
export function textZTela(telo: TeloPisne): string {
  const radky: string[] = [];
  for (const blok of telo.bloky) {
    for (const radek of blok.radky) {
      const lyric = radek.slabiky.map((slabika) => slabika.text).join("");
      const ma = radek.slabiky.some((slabika) => slabika.akord !== undefined);
      if (!ma) {
        radky.push(lyric);
        continue;
      }
      let akordovy = "";
      let sloupec = 0;
      for (const slabika of radek.slabiky) {
        if (slabika.akord !== undefined) {
          if (akordovy.length < sloupec) akordovy += " ".repeat(sloupec - akordovy.length);
          else if (akordovy.length > 0) akordovy += " ";
          akordovy += slabika.akord;
        }
        sloupec += slabika.text.length;
      }
      radky.push(akordovy);
      radky.push(lyric);
    }
  }
  return radky.join("\n");
}

/** Case- and diacritic-insensitive match on title or author. */
export function obsahujeHledani(nazev: string, autor: string, dotaz: string): boolean {
  const klic = bezDiakritiky(dotaz);
  if (klic.length === 0) return true;
  return bezDiakritiky(nazev).includes(klic) || bezDiakritiky(autor).includes(klic);
}

export const NAZEV_MAX = 160;
export const AUTOR_MAX = 160;
export const TEXT_MAX = 20_000;

export type ProblemPisne =
  | "chybi_autor"
  | "chybi_text"
  | "spatne_akordy"
  | "duplicita";

export type DuvodVstupu =
  | "chybi_nazev"
  | "chybi_autor"
  | "chybi_text"
  | "spatne_akordy"
  | "prilis_dlouhe";

export type OverenyVstup = {
  nazev: string;
  autor: string;
  telo: TeloPisne;
  parKlic: string;
};

export type ApiZpevnikPisen = {
  id: string;
  nazev: string;
  autor: string;
  telo: TeloPisne;
  schvalenoAt: string | null;
};

export type ApiZpevnikNavrh = {
  id: string;
  nazev: string;
  autor: string;
  telo: TeloPisne;
  problem: ProblemPisne | null;
  nahledUrl: string | null;
  navrhovatelId: string | null;
  createdAt: string;
  updatedAt: string;
};

function jeZaznam(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

function jeTypBloku(hodnota: unknown): hodnota is TypBloku {
  return hodnota === "sloka" || hodnota === "refren";
}

/** Normalize chords in a body. Null when a token is not a chord. */
export function normalizujTelo(telo: TeloPisne): TeloPisne | null {
  const bloky: Blok[] = [];
  for (const blok of telo.bloky) {
    const radky: Radek[] = [];
    for (const radek of blok.radky) {
      const slabiky: Slabika[] = [];
      for (const slabika of radek.slabiky) {
        if (slabika.akord === undefined || slabika.akord.length === 0) {
          slabiky.push({ text: slabika.text });
          continue;
        }
        const akord = normalizujAkord(slabika.akord);
        if (akord === null) return null;
        slabiky.push({ text: slabika.text, akord });
      }
      radky.push({ slabiky });
    }
    bloky.push({ typ: blok.typ, radky });
  }
  return { bloky };
}

function textTela(telo: TeloPisne): string {
  let text = "";
  for (const blok of telo.bloky) {
    for (const radek of blok.radky) {
      for (const slabika of radek.slabiky) text += slabika.text;
    }
  }
  return text;
}

export function maText(telo: TeloPisne): boolean {
  return textTela(telo).trim().length > 0;
}

/** Parse an untrusted body into blocks. Chords are normalized to Czech. */
export function teloZNeznameho(hodnota: unknown): TeloPisne | null {
  if (!jeZaznam(hodnota) || !Array.isArray(hodnota["bloky"])) return null;
  const bloky: Blok[] = [];
  for (const surovyBlok of hodnota["bloky"]) {
    if (!jeZaznam(surovyBlok) || !jeTypBloku(surovyBlok["typ"])) return null;
    if (!Array.isArray(surovyBlok["radky"])) return null;
    const radky: Radek[] = [];
    for (const surovyRadek of surovyBlok["radky"]) {
      if (!jeZaznam(surovyRadek) || !Array.isArray(surovyRadek["slabiky"])) return null;
      const slabiky: Slabika[] = [];
      for (const surova of surovyRadek["slabiky"]) {
        if (!jeZaznam(surova) || typeof surova["text"] !== "string") return null;
        const text = surova["text"];
        if (surova["akord"] === undefined) {
          slabiky.push({ text });
          continue;
        }
        if (typeof surova["akord"] !== "string") return null;
        const akord = normalizujAkord(surova["akord"]);
        if (akord === null) return null;
        slabiky.push({ text, akord });
      }
      radky.push({ slabiky });
    }
    bloky.push({ typ: surovyBlok["typ"], radky });
  }
  return { bloky };
}

/**
 * Manual proposal and edit: title, author, and at least one line of text.
 * Chords are optional. A bad chord token fails the whole body.
 */
export function overVstupPisne(vstup: unknown): { ok: true; hodnota: OverenyVstup } | { ok: false; duvod: DuvodVstupu } {
  if (!jeZaznam(vstup)) return { ok: false, duvod: "chybi_nazev" };
  if (typeof vstup["nazev"] !== "string") return { ok: false, duvod: "chybi_nazev" };
  if (typeof vstup["autor"] !== "string") return { ok: false, duvod: "chybi_autor" };
  const nazev = vstup["nazev"].trim();
  const autor = vstup["autor"].trim();
  if (nazev.length === 0) return { ok: false, duvod: "chybi_nazev" };
  if (autor.length === 0) return { ok: false, duvod: "chybi_autor" };
  if (nazev.length > NAZEV_MAX || autor.length > AUTOR_MAX) {
    return { ok: false, duvod: "prilis_dlouhe" };
  }
  if (vstup["telo"] === undefined) return { ok: false, duvod: "chybi_text" };
  const telo = teloZNeznameho(vstup["telo"]);
  if (telo === null) return { ok: false, duvod: "spatne_akordy" };
  const text = textTela(telo);
  if (text.length > TEXT_MAX) return { ok: false, duvod: "prilis_dlouhe" };
  if (!maText(telo)) return { ok: false, duvod: "chybi_text" };
  return { ok: true, hodnota: { nazev, autor, telo, parKlic: klicParu(nazev, autor) } };
}

const PREFIX_AUTORA = /^(autor|autorka)\s*:\s*/i;

export type NavrhZeStranky = {
  nazev: string;
  autor: string;
  telo: TeloPisne;
  parKlic: string;
  problem: ProblemPisne | null;
};

/** Chords with no lyric anywhere. A chord-only row beside lyrics is an interlude. */
function maRozpadleAkordy(telo: TeloPisne): boolean {
  let samostatne = false;
  for (const blok of telo.bloky) {
    for (const radek of blok.radky) {
      const text = radek.slabiky.map((slabika) => slabika.text).join("").trim();
      if (text.length > 0) return false;
      if (radek.slabiky.some((slabika) => slabika.akord !== undefined)) samostatne = true;
    }
  }
  return samostatne;
}

/**
 * One page is one song. Line 1 is the title, line 2 is the author.
 * A line starting with Autor/Autorka is just the name.
 */
export function navrhZeStranky(text: string, vydaneParKlice: readonly string[]): NavrhZeStranky {
  const radky = text.split(/\r?\n/);
  let zacatek = 0;
  while (zacatek < radky.length && (radky[zacatek] ?? "").trim().length === 0) zacatek += 1;
  const nazev = (radky[zacatek] ?? "").trim();
  const autor = (radky[zacatek + 1] ?? "").trim().replace(PREFIX_AUTORA, "").trim();
  const vlozeni = parsujVlozeni(radky.slice(zacatek + 2).join("\n"));
  const telo: TeloPisne = vlozeni.ok ? vlozeni.telo : { bloky: [{ typ: "sloka", radky: [] }] };
  const rozpadle = maRozpadleAkordy(telo);
  let problem: ProblemPisne | null = null;
  if (nazev.length === 0) problem = "chybi_text";
  else if (rozpadle) problem = "spatne_akordy";
  else if (!vlozeni.ok || !maText(telo)) problem = "chybi_text";
  else if (autor.length === 0) problem = "chybi_autor";
  else if (vydaneParKlice.includes(klicParu(nazev, autor))) problem = "duplicita";
  return { nazev, autor, telo, parKlic: klicParu(nazev, autor), problem };
}
