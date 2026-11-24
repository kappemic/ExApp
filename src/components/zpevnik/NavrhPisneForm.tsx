import { useRef, useState, type FormEvent, type JSX } from "react";
import { nahrejSoubor, vytvorNavrh } from "../../lib/zpevnik-api";
import { parsujVlozeni } from "../../shared/zpevnik";
import Ikona, { type NazevIkony } from "../Ikona";
import { OBLAST_FORMULARE, POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import {
  NADPIS_ODDILU_PANELU,
  OBSAH_PANELU,
  PATICKA_SHEETU,
  TLACITKO_PATICKY_HLAVNI,
  TLACITKO_PATICKY_ZRUSIT,
} from "../shell/SpodniSheet";

type ZalozkaNavrhu = "zapsat" | "fotka" | "pdf";

const ZALOZKY: readonly { id: ZalozkaNavrhu; nazev: string; ikona: NazevIkony }[] = [
  { id: "zapsat", nazev: "Zapsat", ikona: "pen-line" },
  { id: "fotka", nazev: "Z fotky", ikona: "image" },
  { id: "pdf", nazev: "Z PDF", ikona: "file-text" },
];

/**
 * Proposal entry. Text calls `vytvorNavrh`. Photo and PDF call the existing import.
 */
export function NavrhPisneForm({
  onHotovo,
  onZavrit,
}: {
  onHotovo: () => void;
  onZavrit?: () => void;
}): JSX.Element {
  const [zalozka, setZalozka] = useState<ZalozkaNavrhu>("zapsat");
  const [nazev, setNazev] = useState("");
  const [autor, setAutor] = useState("");
  const [text, setText] = useState("");
  const [chyba, setChyba] = useState<string | null>(null);
  const [odesila, setOdesila] = useState(false);
  const souborVstup = useRef<HTMLInputElement>(null);

  async function odeslatText(udalost: FormEvent): Promise<void> {
    udalost.preventDefault();
    const vlozeni = parsujVlozeni(text);
    if (!vlozeni.ok) {
      setChyba("Napiš aspoň jeden řádek textu.");
      return;
    }
    setOdesila(true);
    setChyba(null);
    const vysledek = await vytvorNavrh(nazev, autor, vlozeni.telo);
    setOdesila(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    onHotovo();
  }

  async function nahrej(soubor: File | undefined): Promise<void> {
    if (soubor === undefined) return;
    setOdesila(true);
    setChyba(null);
    const vysledek = await nahrejSoubor(soubor);
    setOdesila(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      return;
    }
    onHotovo();
  }

  return (
    <div className={OBSAH_PANELU}>
      {zalozka === "zapsat" && (
        <>
          <label className={`block ${POPISEK_POLE}`} htmlFor="nazev-pisne">
            Název písně
            <input
              id="nazev-pisne"
              required
              value={nazev}
              onChange={(udalost) => setNazev(udalost.target.value)}
              className={`mt-1.5 font-normal min-[90rem]:mt-[5px] ${POLE_FORMULARE}`}
            />
          </label>
          <label className={`block ${POPISEK_POLE}`} htmlFor="autor-pisne">
            Autor
            <input
              id="autor-pisne"
              required
              value={autor}
              onChange={(udalost) => setAutor(udalost.target.value)}
              className={`mt-1.5 font-normal min-[90rem]:mt-[5px] ${POLE_FORMULARE}`}
            />
          </label>
        </>
      )}

      <p className={NADPIS_ODDILU_PANELU}>Jak zadat text</p>
      <div className="flex gap-2">
        {ZALOZKY.map((polozka) => {
          const vybrana = zalozka === polozka.id;
          return (
            <button
              key={polozka.id}
              type="button"
              aria-pressed={vybrana}
              onClick={() => {
                setZalozka(polozka.id);
                setChyba(null);
              }}
              className={`nahled-press flex h-9 items-center justify-center gap-[5px] rounded-full border px-3 text-[13px] font-semibold min-[90rem]:h-auto min-[90rem]:flex-1 min-[90rem]:flex-col min-[90rem]:rounded-[10px] min-[90rem]:px-2.5 min-[90rem]:py-[11px] min-[90rem]:text-[11px] ${
                vybrana
                  ? "border-transparent bg-smrk text-povrch min-[90rem]:border-smrk min-[90rem]:bg-mlha min-[90rem]:text-smrk"
                  : "border-linka bg-papir text-mech min-[90rem]:border-transparent min-[90rem]:bg-pole-podklad"
              }`}
            >
              <Ikona nazev={polozka.ikona} className={`hidden size-4 min-[90rem]:block ${vybrana ? "text-smrk" : "text-ink-3"}`} />
              {polozka.nazev}
            </button>
          );
        })}
      </div>

      {zalozka === "zapsat" && (
        <form className={OBSAH_PANELU} onSubmit={(udalost) => void odeslatText(udalost)}>
          <label className="block" htmlFor="text-pisne">
            <span className="sr-only">Text a akordy</span>
            <textarea
              id="text-pisne"
              required
              rows={3}
              wrap="off"
              placeholder="Text a akordy…"
              value={text}
              onChange={(udalost) => setText(udalost.target.value)}
              className={`block min-h-[88px] resize-none overflow-x-auto whitespace-pre ${OBLAST_FORMULARE}`}
            />
            <span className="mt-1.5 block text-[12.5px] leading-[17px] text-mech min-[90rem]:text-[11px] min-[90rem]:leading-[15px]">
              Akordy piš na řádek nad slovy. Prázdný řádek oddělí sloku, refrén začni „R:“.
            </span>
          </label>
          {chyba !== null && (
            <p role="alert" className="text-[13px] font-semibold text-akcent">
              {chyba}
            </p>
          )}
          <Akce
            odesila={odesila}
            onZavrit={onZavrit}
            submit
            submitLabel={odesila ? "Posílám…" : "Odeslat návrh"}
          />
        </form>
      )}

      {zalozka !== "zapsat" && (
        <div className={OBSAH_PANELU}>
          <p className="flex gap-2.5 rounded-[10px] bg-povrch-2 p-[11px] text-[12.5px] leading-[17px] text-mech min-[90rem]:text-[11px] min-[90rem]:leading-[15px]">
            <Ikona nazev={zalozka === "fotka" ? "image" : "file-text"} className="size-3.5 text-ink-3" />
            {zalozka === "fotka"
              ? "Fotka not nebo textu se pošle do stejného importu jako PDF."
              : "PDF se pošle do importu a ve frontě zůstane jako návrh."}
          </p>
          <input
            ref={souborVstup}
            type="file"
            accept={
              zalozka === "fotka"
                ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                : "application/pdf,.pdf"
            }
            className="sr-only"
            disabled={odesila}
            onChange={(udalost) => {
              const soubor = udalost.target.files?.[0];
              udalost.target.value = "";
              void nahrej(soubor);
            }}
          />
          {chyba !== null && (
            <p role="alert" className="text-[13px] font-semibold text-akcent">
              {chyba}
            </p>
          )}
          <Akce
            odesila={odesila}
            onZavrit={onZavrit}
            onVybrat={() => souborVstup.current?.click()}
            submitLabel={
              odesila ? "Nahrávám…" : zalozka === "fotka" ? "Vybrat fotku" : "Vybrat PDF"
            }
          />
        </div>
      )}
    </div>
  );
}

function Akce({
  odesila,
  onZavrit,
  submit,
  onVybrat,
  submitLabel,
}: {
  odesila: boolean;
  onZavrit?: () => void;
  submit?: boolean;
  onVybrat?: () => void;
  submitLabel: string;
}): JSX.Element {
  return (
    <div className={`${PATICKA_SHEETU} -mt-[18px] min-[90rem]:!mt-1.5`}>
      {onZavrit !== undefined && (
        <button type="button" disabled={odesila} onClick={onZavrit} className={TLACITKO_PATICKY_ZRUSIT}>
          Zrušit
        </button>
      )}
      {submit === true ? (
        <button type="submit" disabled={odesila} className={TLACITKO_PATICKY_HLAVNI}>
          {submitLabel}
        </button>
      ) : (
        <button type="button" disabled={odesila} onClick={onVybrat} className={TLACITKO_PATICKY_HLAVNI}>
          {submitLabel}
        </button>
      )}
    </div>
  );
}