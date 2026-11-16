/**
 * Rebuild a chord sheet from PDF text positions.
 * A chord sticks to the nearest letter on the lyric line under it,
 * not to a page-wide column that shifts the whole row.
 */
import { normalizujAkord } from "../../src/shared/zpevnik";

export type TextovaPolozka = {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

type Znak = { text: string; x: number; width: number };

function median(cisla: readonly number[]): number {
  if (cisla.length === 0) return 6;
  const serazene = [...cisla].sort((a, b) => a - b);
  return serazene[Math.floor(serazene.length / 2)] ?? 6;
}

function jednotkaSirky(polozky: readonly TextovaPolozka[]): number {
  const sirky: number[] = [];
  for (const polozka of polozky) {
    const delka = [...polozka.str].filter((znak) => znak.trim().length > 0).length;
    if (delka === 0 || polozka.width <= 0) continue;
    sirky.push(polozka.width / delka);
  }
  const vysledek = median(sirky);
  return vysledek > 0.5 ? vysledek : 6;
}

type Radek = { y: number; polozky: TextovaPolozka[] };

function rozdelRadky(polozky: readonly TextovaPolozka[], tolerance: number): Radek[] {
  const serazene = [...polozky]
    .filter((polozka) => polozka.str.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const radky: Radek[] = [];
  for (const polozka of serazene) {
    const posledni = radky[radky.length - 1];
    if (posledni === undefined || Math.abs(posledni.y - polozka.y) > tolerance) {
      radky.push({ y: polozka.y, polozky: [polozka] });
      continue;
    }
    posledni.polozky.push(polozka);
  }
  return radky;
}

function jeAkordovyRadek(radek: Radek): boolean {
  const tokeny = radek.polozky
    .map((polozka) => polozka.str.trim())
    .filter((text) => text.length > 0);
  if (tokeny.length === 0) return false;
  const akordy = tokeny.filter((text) => normalizujAkord(text) !== null);
  return akordy.length > 0 && akordy.length >= tokeny.length * 0.6;
}

function sestavZnaky(polozky: readonly TextovaPolozka[], jednotka: number): Znak[] {
  const serazene = [...polozky].sort((a, b) => a.x - b.x);
  const znaky: Znak[] = [];
  let konec = Number.NEGATIVE_INFINITY;
  for (const polozka of serazene) {
    const kusy = [...polozka.str];
    if (kusy.every((znak) => znak.trim().length === 0)) continue;
    if (znaky.length > 0 && polozka.x > konec + jednotka * 0.35) {
      const pocet = Math.max(1, Math.round((polozka.x - konec) / jednotka));
      for (let i = 0; i < pocet; i += 1) {
        znaky.push({ text: " ", x: konec + i * jednotka, width: jednotka });
      }
    }
    const sirka = kusy.length > 0 && polozka.width > 0 ? polozka.width / kusy.length : jednotka;
    kusy.forEach((znak, index) => {
      znaky.push({ text: znak, x: polozka.x + index * sirka, width: sirka });
    });
    konec = polozka.x + Math.max(polozka.width, sirka * kusy.length);
  }
  return znaky;
}

function nejblizsiPismeno(znaky: readonly Znak[], x: number): number {
  let nej = -1;
  let vzdalenost = Number.POSITIVE_INFINITY;
  znaky.forEach((znak, index) => {
    if (znak.text.trim().length === 0) return;
    const uvnitr = x >= znak.x && x < znak.x + znak.width;
    const rozdil = uvnitr ? 0 : Math.abs(znak.x - x);
    if (rozdil < vzdalenost) {
      vzdalenost = rozdil;
      nej = index;
    }
  });
  return nej;
}

function zapisAkord(radek: string[], index: number, akord: string): void {
  const obsazeno = (znak: string | undefined): boolean => znak !== " " && znak !== undefined;
  let od = Math.max(0, index);
  // Keep a gap after the previous chord, or "Am" + "G" reads as one bad token.
  while (obsazeno(radek[od - 1]) || radek.slice(od, od + akord.length).some(obsazeno)) {
    od += 1;
  }
  while (radek.length < od + akord.length) radek.push(" ");
  for (let i = 0; i < akord.length; i += 1) {
    const znak = akord[i];
    if (znak !== undefined) radek[od + i] = znak;
  }
}

function samostatneAkordy(radek: Radek, jednotka: number): string {
  const serazene = [...radek.polozky].sort((a, b) => a.x - b.x);
  const zacatek = serazene[0]?.x ?? 0;
  const znaky: string[] = [];
  for (const polozka of serazene) {
    const akord = normalizujAkord(polozka.str.trim());
    if (akord !== null) zapisAkord(znaky, Math.round((polozka.x - zacatek) / jednotka), akord);
  }
  return znaky.join("").trimEnd();
}

function textSloupce(polozky: readonly TextovaPolozka[], jednotka: number): string {
  const velikosti = polozky.map((polozka) => polozka.fontSize).filter((velikost) => velikost > 0);
  const tolerance = Math.max(1.5, median(velikosti) * 0.45);
  const radky = rozdelRadky(polozky, tolerance);
  const font = median(velikosti);
  const vystup: string[] = [];
  for (let i = 0; i < radky.length; i += 1) {
    const radek = radky[i];
    if (radek === undefined) continue;
    if (jeAkordovyRadek(radek)) {
      const dalsi = radky[i + 1];
      const maVers =
        dalsi !== undefined && !jeAkordovyRadek(dalsi) && radek.y - dalsi.y < font * 2.2;
      if (!maVers) {
        // Intro or interlude: chords with no lyric. The blank line keeps the
        // next lyric from being read as theirs.
        const hotovy = samostatneAkordy(radek, jednotka);
        if (hotovy.length > 0) vystup.push(hotovy, "");
      }
      continue;
    }
    const znaky = sestavZnaky(radek.polozky, jednotka);
    const text = znaky.map((znak) => znak.text).join("");
    if (text.trim().length === 0) continue;
    const pred = radky[i - 1];
    const blizko =
      pred !== undefined &&
      jeAkordovyRadek(pred) &&
      pred.y - radek.y > 0 &&
      pred.y - radek.y < font * 2.2;
    if (blizko && pred !== undefined) {
      const akordovy: string[] = [];
      for (const polozka of pred.polozky) {
        const akord = normalizujAkord(polozka.str.trim());
        if (akord === null) continue;
        const index = nejblizsiPismeno(znaky, polozka.x);
        if (index < 0) continue;
        zapisAkord(akordovy, index, akord);
      }
      const hotovy = akordovy.join("").trimEnd();
      if (hotovy.trim().length > 0) vystup.push(hotovy);
    }
    vystup.push(text);
  }
  return vystup.join("\n");
}

/**
 * Items of the left column. A long left line can spill past the middle of the
 * gap: a word that follows it at a normal word gap stays left, and so does a
 * chord sitting over that longer line. Where a row starts says nothing here,
 * because repeated spills and indented chords both line up.
 */
function polozkyVlevo(
  polozky: readonly TextovaPolozka[],
  stred: number,
  jednotka: number,
): Set<TextovaPolozka> {
  const vlevo = new Set<TextovaPolozka>();
  const radky = rozdelRadky(polozky, jednotka);
  const konceVlevo = radky.map((radek) => {
    let konec = Number.NEGATIVE_INFINITY;
    for (const polozka of [...radek.polozky].sort((a, b) => a.x - b.x)) {
      const navazuje =
        polozka.x - konec < jednotka * 2.5 && normalizujAkord(polozka.str.trim()) === null;
      if (polozka.x >= stred && !navazuje) continue;
      vlevo.add(polozka);
      konec = Math.max(konec, polozka.x + Math.max(polozka.width, 0));
    }
    return konec;
  });
  const velikosti = polozky.map((polozka) => polozka.fontSize).filter((velikost) => velikost > 0);
  const dosah = median(velikosti) * 2.2;
  radky.forEach((radek, index) => {
    // A left lyric on this row cannot have its own chord beside it.
    const levyVers = radek.polozky.some(
      (polozka) => vlevo.has(polozka) && normalizujAkord(polozka.str.trim()) === null,
    );
    if (levyVers) return;
    const pod = radky[index + 1];
    const konecPod =
      pod !== undefined && radek.y - pod.y < dosah ? (konceVlevo[index + 1] ?? null) : null;
    // A chord never shares a row with its own lyric, so one in front of a
    // right-column verse belongs to the left line, even past that line's end.
    // PDF text comes word by word. Two words make a verse, one may be a "2x" mark.
    const verse = radek.polozky
      .filter((polozka) => !vlevo.has(polozka))
      .filter((polozka) => normalizujAkord(polozka.str.trim()) === null)
      .map((polozka) => polozka.x);
    const zacatekVerse = verse.length >= 2 ? Math.min(...verse) : Number.NEGATIVE_INFINITY;
    for (const polozka of radek.polozky) {
      if (normalizujAkord(polozka.str.trim()) === null) continue;
      // Next to the verse at a word gap it is the verse's first word ("A přijde").
      const predVersem = polozka.x + Math.max(polozka.width, 0) + jednotka * 2.5 < zacatekVerse;
      // A closing chord can start right where the line under it ends.
      const nadVersem = konecPod !== null && polozka.x < konecPod + jednotka;
      if (predVersem || nadVersem) vlevo.add(polozka);
    }
  });
  return vlevo;
}

function rozdelSloupce(polozky: readonly TextovaPolozka[], jednotka: number): TextovaPolozka[][] {
  const mezera = jednotka * 8;
  const rezy: number[] = [];
  for (const radek of rozdelRadky(polozky, jednotka)) {
    const serazene = [...radek.polozky].sort((a, b) => a.x - b.x);
    for (let i = 1; i < serazene.length; i += 1) {
      const pred = serazene[i - 1];
      const dalsi = serazene[i];
      if (pred === undefined || dalsi === undefined) continue;
      const dira = dalsi.x - (pred.x + Math.max(pred.width, 0));
      if (dira > mezera) rezy.push((pred.x + Math.max(pred.width, 0) + dalsi.x) / 2);
    }
  }
  if (rezy.length < 4) return [polozky.slice()];
  const levy = polozkyVlevo(polozky, median(rezy), jednotka);
  const vlevo = polozky.filter((polozka) => levy.has(polozka));
  const vpravo = polozky.filter((polozka) => !levy.has(polozka));
  if (vlevo.length < 4 || vpravo.length < 4) return [polozky.slice()];
  return [vlevo, vpravo];
}

/** One page: chords snapped to the letter underneath, columns read separately. */
export function textZeSouradnic(polozky: readonly TextovaPolozka[]): string {
  if (polozky.length === 0) return "";
  const maxY = Math.max(...polozky.map((polozka) => polozka.y));
  const bezZapati = polozky.filter(
    (polozka) => polozka.y > maxY * 0.05 && !polozka.str.includes("akordy.kytary"),
  );
  const zdroj = bezZapati.length > 0 ? bezZapati : polozky;
  const jednotka = jednotkaSirky(zdroj);
  return rozdelSloupce(zdroj, jednotka)
    .map((sloupec) => textSloupce(sloupec, jednotka))
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}
