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

/**
 * Rozdělí řádek na slova, každé slovo na úseky začínající akordem. Slovo kratší
 * než jeho akord se spojí s dalším, aby akord nedělal v textu díru.
 */
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
      if (akord !== null && /\s$/.test(slovo.at(-1)?.text ?? "")) uzavri();
      const posledni = slovo.at(-1);
      if (akord === null && posledni !== undefined) posledni.text += kus;
      else slovo.push({ akord, text: kus });
      akord = null;
      if (/\s$/.test(kus) && !akordPresahuje(slovo.at(-1))) uzavri();
    }
  }
  uzavri();
  return slova;
}

function akordPresahuje(usek: Usek | undefined): boolean {
  return usek !== undefined && usek.akord !== null && usek.text.trimEnd().length <= usek.akord.length;
}

const AKORD =
  "pr-1 text-[0.8em] font-bold leading-[1.25] text-okr min-[90rem]:text-[0.75em] min-[90rem]:leading-[1.33] min-[90rem]:tracking-[1.2px] min-[90rem]:text-akcent";

function RadekPisne({ radek, akordy }: { radek: Radek; akordy: boolean }): JSX.Element | null {
  const text = textRadku(radek);
  const maAkord = radek.slabiky.some((slabika) => slabika.akord !== undefined);
  if (maAkord && text.trim().length === 0) {
    if (!akordy) return null;
    return (
      <p className="flex flex-wrap gap-x-2.5 break-inside-avoid">
        {radek.slabiky.map((slabika, i) =>
          slabika.akord === undefined ? null : (
            <span key={i} className={AKORD}>
              {slabika.akord}
            </span>
          ),
        )}
      </p>
    );
  }
  if (!maAkord || !akordy) {
    return <p className="whitespace-pre-wrap break-inside-avoid">{text.length > 0 ? text : " "}</p>;
  }
  return (
    <p className="break-inside-avoid">
      {slovaRadku(radek).map((slovo, i) => (
        <span key={i} className="inline-flex max-w-full items-end whitespace-pre align-bottom">
          {slovo.map((usek, j) => (
            <span key={j} className="inline-flex flex-col gap-0.5 min-[90rem]:gap-0">
              {usek.akord !== null ? <span className={AKORD}>{usek.akord}</span> : null}
              <span>{usek.text.length > 0 ? usek.text : " "}</span>
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}

/** `--pismo` je násobek velikosti písma z nastavení čtení. */
export function TeloPisnePohled({ telo, akordy = true }: { telo: TeloPisne; akordy?: boolean }): JSX.Element {
  // Předehra bez akordů nemá co ukázat, prázdný refrén je značka opakování.
  const bloky = opravBloky(telo.bloky).filter(
    (blok) => akordy || blok.typ === "refren" || blok.radky.some((radek) => textRadku(radek).trim().length > 0),
  );
  // Jednolitá píseň ze starého importu se mezi sloupce rozdělit musí.
  const vcelku = bloky.length > 1 ? "break-inside-avoid" : "";
  return (
    <div className="text-[length:calc(15px*var(--pismo,1))] text-inkoust min-[90rem]:text-[length:calc(14px*var(--pismo,1))] min-[90rem]:leading-[1.43]">
      {bloky.map((blok, index) => (
        <section
          key={`${blok.typ}-${index}`}
          className={`${vcelku} ${index === 0 ? "" : "pt-5 min-[90rem]:pt-[22px]"} ${blok.typ === "refren" ? "pl-4" : ""}`}
        >
          <h3
            className={
              blok.typ === "refren"
                ? "mb-1.5 text-[11px] font-bold uppercase leading-4 tracking-[0.8px] text-ink-3"
                : "sr-only"
            }
          >
            {POPISEK[blok.typ]}
          </h3>
          <div className="flex flex-col gap-2.5 min-[90rem]:block min-[90rem]:space-y-1.5">
            {blok.radky.map((radek, i) => (
              <RadekPisne key={i} radek={radek} akordy={akordy} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
