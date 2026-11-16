/**
 * Chord sheet in a fixed-width grid. Spaces stay where they were typed
 * and each chord starts on the same column as its letter.
 * Wide screens use two real columns of whole lines when the longest line fits.
 * CSS column flow was slicing a chord line away from its lyric, so the right
 * column looked broken.
 */
import { useLayoutEffect, useRef, useState, type JSX } from "react";
import type { Blok, Radek, TeloPisne, TypBloku } from "../../shared/zpevnik";

const NEJVETSI_PX = 20;
const NEJMENSI_PX = 12;
/** `lg:text-lg` and `lg:gap-x-16` on the sheet. */
const SIROKE_PX = 18;
const MEZERA_SLOUPCU_PX = 64;
const TOKEN_AKORDU =
  /^([A-H])([#b])?(maj|min|mi|dim|aug|sus|add|m|-)?(\d+)?(sus\d+|add\d+|maj\d+)?(?:\/([A-H])([#b])?)?$/;

const POPISEK: Record<TypBloku, string> = {
  sloka: "Sloka",
  refren: "Refrén",
};

function zobrazeni(radek: Radek): { akordy: string; text: string } {
  let text = "";
  const akordy: string[] = [];
  for (const slabika of radek.slabiky) {
    if (slabika.akord !== undefined) {
      // Chords past a short lyric share a column, so each one goes after the last.
      const zacatek = akordy.length > 0 && akordy.length >= text.length ? akordy.length + 1 : text.length;
      while (akordy.length < zacatek) akordy.push(" ");
      akordy.push(...slabika.akord);
    }
    text += slabika.text;
  }
  return { akordy: akordy.join("").trimEnd(), text };
}

function textRadku(radek: Radek): string {
  return radek.slabiky.map((slabika) => slabika.text).join("");
}

function jeAkord(token: string): boolean {
  return TOKEN_AKORDU.test(token);
}

function akordyRadku(radek: Radek): { index: number; akord: string }[] {
  const vysledek: { index: number; akord: string }[] = [];
  let index = 0;
  for (const slabika of radek.slabiky) {
    if (slabika.akord !== undefined) vysledek.push({ index, akord: slabika.akord });
    index += slabika.text.length;
  }
  return vysledek;
}

function sestavRadek(text: string, akordy: { index: number; akord: string }[]): Radek {
  const mapa = new Map<number, string>();
  for (const polozka of akordy) {
    if (polozka.index >= 0 && polozka.index <= text.length) mapa.set(polozka.index, polozka.akord);
  }
  const slabiky: Radek["slabiky"] = [];
  let buf = "";
  let akord: string | undefined;
  const uloz = (): void => {
    if (buf.length === 0 && akord === undefined) return;
    slabiky.push(akord === undefined ? { text: buf } : { text: buf, akord });
    buf = "";
    akord = undefined;
  };
  for (let i = 0; i <= text.length; i += 1) {
    const dalsi = mapa.get(i);
    if (dalsi !== undefined) {
      uloz();
      akord = dalsi;
    }
    if (i < text.length) buf += text[i] ?? "";
  }
  uloz();
  if (slabiky.length === 0) slabiky.push({ text });
  return { slabiky };
}

/**
 * PDF import sometimes leaves a chord letter at the start of a lyric.
 * Remove it before the sheet is split into columns.
 */
function opravRadky(radky: Radek[]): Radek[] {
  const vysledek: Radek[] = [];
  for (let i = 0; i < radky.length; i += 1) {
    const radek = radky[i];
    if (radek === undefined) continue;
    const text = textRadku(radek);
    const akordy = akordyRadku(radek);
    const prefix = text.match(/^(\S+)( {4,})(\S.*)$/);
    if (prefix !== null && akordy.length > 0 && jeAkord(prefix[1] ?? "")) {
      const usek = (prefix[1] ?? "").length + (prefix[2] ?? "").length;
      const novy = prefix[3] ?? "";
      vysledek.push(
        sestavRadek(
          novy,
          akordy.map((polozka) => ({ index: polozka.index - usek, akord: polozka.akord })).filter((polozka) => polozka.index >= 0),
        ),
      );
      continue;
    }
    vysledek.push(radek);
  }
  return vysledek;
}

function opravBloky(bloky: Blok[]): Blok[] {
  return bloky.map((blok) => ({ ...blok, radky: opravRadky([...blok.radky]) }));
}

/** First half, then second half, splitting only between whole lines. */
function naDvaSloupce(bloky: Blok[]): [Blok[], Blok[]] {
  const radky = bloky.flatMap((blok) => blok.radky.map((radek) => ({ typ: blok.typ, radek })));
  const rez = Math.ceil(radky.length / 2);
  return [seskup(radky.slice(0, rez)), seskup(radky.slice(rez))];
}

function seskup(polozky: { typ: TypBloku; radek: Radek }[]): Blok[] {
  const vysledek: Blok[] = [];
  for (const polozka of polozky) {
    const posledni = vysledek[vysledek.length - 1];
    if (posledni !== undefined && posledni.typ === polozka.typ) {
      posledni.radky.push(polozka.radek);
      continue;
    }
    vysledek.push({ typ: polozka.typ, radky: [polozka.radek] });
  }
  return vysledek;
}

function Sloupec({ bloky, pokracovani }: { bloky: Blok[]; pokracovani: boolean }): JSX.Element {
  return (
    <div className="min-w-0 space-y-6">
      {bloky.map((blok, indexBloku) => (
        <section key={`${blok.typ}-${indexBloku}`} className="space-y-3">
          {(indexBloku > 0 || !pokracovani) && (
            <h2 className="text-xs font-bold uppercase tracking-wide text-mech">{POPISEK[blok.typ]}</h2>
          )}
          <div className="max-w-full font-mono leading-tight lg:leading-snug">
            {blok.radky.map((radek, indexRadku) => {
              const { akordy, text } = zobrazeni(radek);
              return (
                <div key={indexRadku} data-zpevnik-radek="" className="mb-3 w-full whitespace-pre">
                  {akordy.length > 0 && <div className="font-bold text-red-700">{akordy}</div>}
                  {(text.length > 0 || akordy.length === 0) && <div>{text.length > 0 ? text : "\u00a0"}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TeloPisnePohled({ telo }: { telo: TeloPisne }): JSX.Element {
  const list = useRef<HTMLDivElement>(null);
  const [dvaSloupce, setDvaSloupce] = useState(false);
  const opravene = opravBloky(telo.bloky);
  const [levy, pravy] = dvaSloupce ? naDvaSloupce(opravene) : [opravene, []];
  const pokracuje = pravy[0] !== undefined && levy[levy.length - 1]?.typ === pravy[0].typ;

  useLayoutEffect(() => {
    const koren = list.current;
    if (koren === null) return;
    const siroke = window.matchMedia("(min-width: 1024px)");
    const platno = document.createElement("canvas").getContext("2d");
    let posledni = "";

    const prizpusob = (): void => {
      if (platno === null) {
        posledni = "";
        koren.style.fontSize = "";
        setDvaSloupce(false);
        return;
      }
      const misto = koren.clientWidth;
      if (misto <= 0) return;
      const vzor = koren.querySelector("[data-zpevnik-radek]");
      const rodina = vzor === null ? "monospace" : getComputedStyle(vzor).fontFamily;
      let nejdelsi = "";
      for (const radek of koren.querySelectorAll("[data-zpevnik-radek]")) {
        for (const dite of radek.children) {
          const text = dite.textContent ?? "";
          if (text.length > nejdelsi.length) nejdelsi = text;
        }
      }
      if (nejdelsi.length === 0) return;
      const sirka = (px: number): number => {
        platno.font = `700 ${px}px ${rodina}`;
        return platno.measureText(nejdelsi).width;
      };
      // Two columns only when the longest line fits in half the sheet.
      const sirkaNaSirokem = sirka(SIROKE_PX);
      setDvaSloupce(siroke.matches && sirkaNaSirokem <= (misto - MEZERA_SLOUPCU_PX) / 2);
      if (siroke.matches && sirkaNaSirokem <= misto) {
        posledni = "";
        koren.style.fontSize = "";
        return;
      }
      const nejvetsi = siroke.matches ? SIROKE_PX : NEJVETSI_PX;
      let zvolene = nejvetsi;
      for (let px = nejvetsi; px >= NEJMENSI_PX; px -= 1) {
        zvolene = px;
        if (sirka(px) <= misto) break;
      }
      const text = `${zvolene}px`;
      if (text === posledni) return;
      posledni = text;
      koren.style.fontSize = text;
    };

    prizpusob();
    const pozorovatel = new ResizeObserver(prizpusob);
    pozorovatel.observe(koren);
    siroke.addEventListener("change", prizpusob);
    return () => {
      pozorovatel.disconnect();
      siroke.removeEventListener("change", prizpusob);
    };
  }, [telo]);

  return (
    <div
      ref={list}
      data-dva-sloupce={pravy.length > 0 ? "" : undefined}
      className={`min-w-0 lg:text-lg ${
        pravy.length > 0 ? "max-lg:space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-16" : ""
      }`}
    >
      <Sloupec bloky={levy} pokracovani={false} />
      {pravy.length > 0 && <Sloupec bloky={pravy} pokracovani={pokracuje} />}
    </div>
  );
}
