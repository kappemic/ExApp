import { useRef, useState, type FormEvent, type JSX } from "react";
import { nahrejSoubor, vytvorNavrh } from "../../lib/zpevnik-api";
import { parsujVlozeni } from "../../shared/zpevnik";
import { ZpevnikChip, ZpevnikChipLista } from "./ZpevnikChipy";

type ZalozkaNavrhu = "zapsat" | "fotka" | "pdf";

const ZALOZKY: readonly { id: ZalozkaNavrhu; nazev: string }[] = [
  { id: "zapsat", nazev: "Zapsat" },
  { id: "fotka", nazev: "Z fotky" },
  { id: "pdf", nazev: "Z PDF" },
];

const POLE =
  "mt-2 w-full rounded-xl border border-pole bg-papir px-3 py-3 text-base text-inkoust";

const PRIMARNI =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-smrk px-4 text-sm font-bold text-papir disabled:opacity-60";

const VEDLEJSI =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-pole bg-papir px-4 text-sm font-bold text-inkoust disabled:opacity-60";

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
    <div className="space-y-4">
      {zalozka === "zapsat" && (
        <>
          <label className="block text-sm font-bold text-inkoust" htmlFor="nazev-pisne">
            Název písně
            <input
              id="nazev-pisne"
              required
              value={nazev}
              onChange={(udalost) => setNazev(udalost.target.value)}
              className={POLE}
            />
          </label>
          <label className="block text-sm font-bold text-inkoust" htmlFor="autor-pisne">
            Autor
            <input
              id="autor-pisne"
              required
              value={autor}
              onChange={(udalost) => setAutor(udalost.target.value)}
              className={POLE}
            />
          </label>
        </>
      )}

      <p className="text-xs font-bold tracking-wide text-mech">Jak zadat text</p>
      <ZpevnikChipLista>
        {ZALOZKY.map((polozka) => (
          <ZpevnikChip
            key={polozka.id}
            vybrany={zalozka === polozka.id}
            onClick={() => {
              setZalozka(polozka.id);
              setChyba(null);
            }}
          >
            {polozka.nazev}
          </ZpevnikChip>
        ))}
      </ZpevnikChipLista>

      {zalozka === "zapsat" && (
        <form className="space-y-4" onSubmit={(udalost) => void odeslatText(udalost)}>
          <label className="block text-sm font-bold text-inkoust" htmlFor="text-pisne">
            Text a akordy
            <textarea
              id="text-pisne"
              required
              rows={8}
              wrap="off"
              placeholder="Text a akordy…"
              value={text}
              onChange={(udalost) => setText(udalost.target.value)}
              className={`${POLE} overflow-x-auto whitespace-pre font-mono`}
            />
          </label>
          {chyba !== null && <p className="text-sm text-inkoust">{chyba}</p>}
          <Akce
            odesila={odesila}
            onZavrit={onZavrit}
            submit
            submitLabel={odesila ? "Posílám…" : "Odeslat návrh"}
          />
        </form>
      )}

      {zalozka !== "zapsat" && (
        <div className="space-y-4">
          <p className="text-sm text-mech">
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
          {chyba !== null && <p className="text-sm text-inkoust">{chyba}</p>}
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
    <div className="flex gap-2 pt-2">
      {onZavrit !== undefined && (
        <button type="button" disabled={odesila} onClick={onZavrit} className={VEDLEJSI}>
          Zrušit
        </button>
      )}
      {submit === true ? (
        <button type="submit" disabled={odesila} className={PRIMARNI}>
          {submitLabel}
        </button>
      ) : (
        <button type="button" disabled={odesila} onClick={onVybrat} className={PRIMARNI}>
          {submitLabel}
        </button>
      )}
    </div>
  );
}