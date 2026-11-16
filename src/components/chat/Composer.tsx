import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from "react";
import { pridejPrilohy } from "../../lib/prilohy-zpravy";
import { VALIDACE } from "../../shared/api-types";
import { nabidkyZminky, rozpracovanaZminka, vlozZminku, type NabidkaZminky } from "../../shared/zminky";
import { ChipyPriloh, TlacitkoPrilohy } from "./VyberPriloh";

export interface ComposerProps {
  /** Popisek nad polem (např. „Napsat do Generalu"). */
  popisek: string;
  /** Placeholder pro prázdné pole. */
  placeholder: string;
  /** Probíhá odesílání (disabled + „Posílám…"). */
  odesilaSe: boolean;
  /** Chyba odeslání pod formulářem (role=alert). */
  chyba: string | null;
  onOdeslat: (text: string, soubory: readonly File[]) => void;
  /** Testovací háček pro autofokus po přepnutí threadu. */
  autoFocus?: boolean;
  /** Vrátí text a soubory do pole, když server odeslání odmítl. */
  navratTextu?: { token: number; text: string; soubory?: readonly File[] } | null;
  /** Global chats can mention a person or a role. */
  zminky?: boolean;
  clenove?: readonly { id: string; jmeno: string }[];
}

const MAX_DELKA: number = VALIDACE.zpravaTextMaxDelka;

/* ------------------------------------------------------------------ */
/* Pure pomocníci — export pro tests/chat-konverzace-step3.test.ts.     */
/* (Stejná pravidla jako DiskuzeBox: trim, 1–1000 znaků po graphemech.) */
/* ------------------------------------------------------------------ */

/** Zbývající znaky do limitu 1000 (může být záporné = přes limit). */
export function spocitejZbyvajiciZnakyComposeru(text: string): number {
  return MAX_DELKA - Array.from(text.trim()).length;
}

/**
 * Odeslat jde s textem (1–1000) nebo aspoň jedním souborem, mimo běh.
 * `pocetSouboru` je volitelný, aby starší volání bez příloh platila dál.
 */
export function muzeOdeslatComposer(
  text: string,
  odesilaSe: boolean,
  pocetSouboru = 0,
): boolean {
  if (odesilaSe) return false;
  const delka: number = Array.from(text.trim()).length;
  if (delka > MAX_DELKA) return false;
  if (pocetSouboru < 0 || pocetSouboru > VALIDACE.prilohyMaxPocet) return false;
  return delka >= 1 || pocetSouboru >= 1;
}

/**
 * Znovupoužitelný composer (Step 3).
 *
 * - Jeden řádek: textarea 16px (`text-base` — bez iOS zoomu), `enterkeyhint="send"`,
 *   tlačítko 44px+ vedle pole. Počítadlo `1000 − délka` jen když zbývá ≤ 80 znaků.
 * - Safe-area padding drží rodič (`KonverzaceDetail` / `DiskuzeBox`);
 *   composer sám je čistý formulář bez sticky/fixed (chat-scroll-fix:
 *   sticky `bottom-0` patří jen obálce uvnitř `data-vlakno-scroll`,
 *   nikdy ke stránce ani modalu — scroll detailu chatem nehýbe).
 * - Po úspěchu volající maže text přes `onOdeslat` → prázdný stav
 *   (composer text drží lokálně, rodič jen posílá).
 */
export default function Composer({
  popisek,
  placeholder,
  odesilaSe,
  chyba,
  onOdeslat,
  autoFocus = false,
  navratTextu = null,
  zminky = false,
  clenove = [],
}: ComposerProps): JSX.Element {
  const [text, setText] = useState<string>("");
  const [caret, setCaret] = useState(0);
  const [otevreno, setOtevreno] = useState(false);
  const [vybrany, setVybrany] = useState(0);
  const [soubory, setSoubory] = useState<File[]>([]);
  const [chybaSouboru, setChybaSouboru] = useState<string | null>(null);
  const poleRef = useRef<HTMLTextAreaElement>(null);
  const poleId: string = useId();
  const pocitadloId: string = useId();
  const rozepsane = zminky ? rozpracovanaZminka(text, caret) : null;
  const nabidky: NabidkaZminky[] =
    zminky && (otevreno || rozepsane !== null)
      ? nabidkyZminky(rozepsane?.dotaz ?? "", clenove)
      : [];

  useEffect(() => {
    if (navratTextu === null) return;
    setText(navratTextu.text);
    if (navratTextu.soubory !== undefined) setSoubory([...navratTextu.soubory]);
  }, [navratTextu]);

  const zbyva: number = spocitejZbyvajiciZnakyComposeru(text);
  const muze: boolean = muzeOdeslatComposer(text, odesilaSe, soubory.length);

  function vloz(nabidka: NabidkaZminky): void {
    const pole = poleRef.current;
    const od = rozepsane?.od ?? caret;
    const dalsi = vlozZminku(text, od, caret, nabidka.token);
    setText(dalsi);
    setOtevreno(false);
    const novaPozice = od + nabidka.token.length + 1;
    setCaret(novaPozice);
    requestAnimationFrame(() => {
      pole?.focus();
      pole?.setSelectionRange(novaPozice, novaPozice);
    });
  }

  function naKlavesu(udalost: KeyboardEvent<HTMLTextAreaElement>): void {
    if (nabidky.length > 0 && (udalost.key === "ArrowDown" || udalost.key === "ArrowUp")) {
      udalost.preventDefault();
      setVybrany((pred) =>
        udalost.key === "ArrowDown" ? (pred + 1) % nabidky.length : (pred - 1 + nabidky.length) % nabidky.length,
      );
      return;
    }
    if (nabidky.length > 0 && udalost.key === "Escape") {
      udalost.preventDefault();
      setOtevreno(false);
      return;
    }
    if (nabidky.length > 0 && udalost.key === "Enter" && !udalost.shiftKey) {
      udalost.preventDefault();
      const nabidka = nabidky[vybrany] ?? nabidky[0];
      if (nabidka !== undefined) vloz(nabidka);
      return;
    }
    if (udalost.key !== "Enter" || udalost.shiftKey || udalost.nativeEvent.isComposing) return;
    udalost.preventDefault();
    if (!muze) return;
    udalost.currentTarget.form?.requestSubmit();
  }

  function naVyberSouboru(nove: File[]): void {
    const vysledek = pridejPrilohy(soubory, nove);
    setSoubory(vysledek.soubory);
    setChybaSouboru(vysledek.chyba);
  }

  function naOdebratSoubor(index: number): void {
    setSoubory((prev) => prev.filter((_, i) => i !== index));
    setChybaSouboru(null);
  }

  function naSubmit(udalost: FormEvent<HTMLFormElement>): void {
    udalost.preventDefault();
    if (!muzeOdeslatComposer(text, odesilaSe, soubory.length)) return;
    const odeslane: File[] = soubory;
    onOdeslat(text.trim(), odeslane);
    setText("");
    setSoubory([]);
    setChybaSouboru(null);
  }

  const ukazPocitadlo: boolean = zbyva <= 80;

  return (
    <form
      onSubmit={naSubmit}
      aria-label={popisek}
      className="rounded-2xl border-2 border-inkoust bg-papir p-1.5 shadow-denik"
    >
      <label htmlFor={poleId} className="sr-only">
        {popisek}
      </label>
      {zminky && (
        <div className="mb-1 flex justify-end px-1">
          <button
            type="button"
            onClick={() => {
              setOtevreno((pred) => !pred);
              setVybrany(0);
              poleRef.current?.focus();
            }}
            className="inline-flex min-h-[44px] items-center rounded-md border-2 border-inkoust bg-papir px-3 text-sm font-bold text-inkoust [touch-action:manipulation]"
          >
            Označit
          </button>
        </div>
      )}
      {nabidky.length > 0 && (
        <ul
          role="listbox"
          aria-label="Koho označit"
          className="mb-1 max-h-56 overflow-y-auto rounded-xl border-2 border-inkoust bg-papir shadow-denik"
        >
          {nabidky.map((nabidka, index) => (
            <li key={nabidka.token}>
              <button
                type="button"
                role="option"
                aria-selected={index === vybrany}
                onMouseDown={(udalost) => udalost.preventDefault()}
                onClick={() => vloz(nabidka)}
                className={`flex min-h-[44px] w-full items-center px-3 text-left text-base font-bold [touch-action:manipulation] ${
                  index === vybrany ? "bg-linka text-inkoust" : "bg-papir text-inkoust"
                }`}
              >
                {nabidka.popisek}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex min-w-0 items-end gap-1.5">
        <TlacitkoPrilohy disabled={odesilaSe} onVyber={naVyberSouboru} />
        <textarea
          id={poleId}
          ref={poleRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setVybrany(0);
            setOtevreno(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={naKlavesu}
          rows={1}
          maxLength={MAX_DELKA + 50}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
          autoFocus={autoFocus}
          aria-describedby={ukazPocitadlo ? pocitadloId : undefined}
          className="block max-h-24 min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border-2 border-inkoust/25 bg-papir px-3 py-2 text-base leading-snug placeholder:text-inkoust/40"
        />
        <button
          type="submit"
          disabled={!muze}
          title={odesilaSe ? "Odesílání probíhá…" : "Poslat zprávu"}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border-2 border-okr bg-okr px-4 text-sm font-bold text-inkoust [touch-action:manipulation] motion-safe:transition-colors motion-safe:hover:bg-okr-tmavy disabled:cursor-not-allowed disabled:opacity-60"
        >
          {odesilaSe ? "Posílám…" : "Poslat"}
        </button>
      </div>
      <ChipyPriloh soubory={soubory} disabled={odesilaSe} onOdebrat={naOdebratSoubor} />
      {ukazPocitadlo && (
        <span
          id={pocitadloId}
          role="status"
          className={`mt-1 block min-w-0 truncate px-1 text-[12px] font-semibold tabular-nums ${
            zbyva < 0 ? "text-red-800" : "text-inkoust/60"
          }`}
          style={{ overflowWrap: "anywhere" }}
        >
          {zbyva < 0
            ? `O ${Math.abs(zbyva)} znaků přes limit`
            : `Zbývá ${zbyva} z ${MAX_DELKA}`}
        </span>
      )}
      {chybaSouboru !== null && (
        <p role="alert" className="mt-1 min-w-0 break-words px-1 text-sm font-semibold text-red-800">
          {chybaSouboru}
        </p>
      )}
      {chyba !== null && (
        <p role="alert" className="mt-1 min-w-0 break-words px-1 text-sm font-semibold text-red-800">
          {chyba}
        </p>
      )}
    </form>
  );
}
