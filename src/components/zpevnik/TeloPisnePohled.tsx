/**
 * Text písně podle ExApp.pen: písmo aplikace, akord nad slabikou, ke které patří.
 * Řádek je poskládaný ze slov, takže se láme jen mezi slovy a akord se od textu
 * neodtrhne. Na počítači text teče do dvou sloupců (viz ZpevnikPisenPage).
 */
import type { JSX } from "react";
import type { Blok, Radek, TeloPisne, TypBloku } from "../../shared/zpevnik";

const TOKEN_AKORDU =
  /^([A-H])([#b])?(maj|min|mi|dim|aug|sus|add|m|-)?(\d+)?(sus\d+|add\d+|maj\d+)?(?:\/([A-H])([#b])?)?$/;

const POPISEK: Record<TypBloku, string> = {
  sloka: "Sloka",
  refren: "Refrén",
};

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

type Usek = { akord: string | null; text: string };

/** Rozdělí řádek na slova, každé slovo na úseky začínající akordem. */
function slovaRadku(radek: Radek): Usek[][] {
  const slova: Usek[][] = [];
  let slovo: Usek[] = [];
  const uzavri = (): void => {
    if (slovo.length > 0) slova.push(slovo);
    slovo = [];
  };
  for (const slabika of radek.slabiky) {
    let akord = slabika.akord ?? null;
    // Mezera zůstává na konci slova, aby se řádek lámal za ní.
    for (const kus of slabika.text.split(/(?<=\s)(?=\S)/)) {
      if (kus.length === 0 && akord === null) continue;
      const posledni = slovo[slovo.length - 1];
      if (akord === null && posledni !== undefined) posledni.text += kus;
      else slovo.push({ akord, text: kus });
      akord = null;
      if (/\s$/.test(kus)) uzavri();
    }
    if (slabika.text.length === 0 && akord !== null) slovo.push({ akord, text: "" });
  }
  uzavri();
  return slova;
}

function RadekPisne({ radek }: { radek: Radek }): JSX.Element {
  const maAkord = radek.slabiky.some((slabika) => slabika.akord !== undefined);
  if (!maAkord) {
    const text = textRadku(radek);
    return <p className="whitespace-pre-wrap break-inside-avoid">{text.length > 0 ? text : "\u00a0"}</p>;
  }
  return (
    <p className="break-inside-avoid">
      {slovaRadku(radek).map((slovo, i) => (
        <span key={i} className="inline-flex max-w-full items-end whitespace-pre align-bottom">
          {slovo.map((usek, j) => (
            <span key={j} className="inline-flex flex-col gap-0.5 min-[90rem]:gap-0">
              <span className="h-[15px] pr-1 text-xs font-bold leading-[15px] text-okr min-[90rem]:h-[14px] min-[90rem]:text-[10.5px] min-[90rem]:leading-[14px] min-[90rem]:tracking-[1.2px] min-[90rem]:text-akcent">
                {usek.akord ?? ""}
              </span>
              <span>{usek.text.length > 0 ? usek.text : "\u00a0"}</span>
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}

export function TeloPisnePohled({ telo }: { telo: TeloPisne }): JSX.Element {
  const bloky = opravBloky(telo.bloky);
  return (
    <div className="text-[15px] text-inkoust min-[90rem]:text-sm min-[90rem]:leading-5">
      {bloky.map((blok, index) => (
        <section key={`${blok.typ}-${index}`} className={index === 0 ? "" : "mt-5 min-[90rem]:mt-[22px]"}>
          <h2 className="sr-only">{POPISEK[blok.typ]}</h2>
          <div className="flex flex-col gap-2.5 min-[90rem]:block min-[90rem]:space-y-1.5">
            {blok.radky.map((radek, i) => (
              <RadekPisne key={i} radek={radek} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
