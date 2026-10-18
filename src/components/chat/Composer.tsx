import { useId, useState, type FormEvent, type JSX } from "react";
import { VALIDACE } from "../../shared/api-types";

export interface ComposerProps {
  /** Popisek nad polem (např. „Napsat do Generalu"). */
  popisek: string;
  /** Placeholder pro prázdné pole. */
  placeholder: string;
  /** Probíhá odesílání (disabled + „Posílám…"). */
  odesilaSe: boolean;
  /** Chyba odeslání pod formulářem (role=alert). */
  chyba: string | null;
  onOdeslat: (text: string) => void;
  /** Testovací háček pro autofokus po přepnutí threadu. */
  autoFocus?: boolean;
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

/** Odeslat jde jen s neprázdným textem do 1000 znaků a mimo běh. */
export function muzeOdeslatComposer(text: string, odesilaSe: boolean): boolean {
  if (odesilaSe) return false;
  const delka: number = Array.from(text.trim()).length;
  return delka >= 1 && delka <= MAX_DELKA;
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
}: ComposerProps): JSX.Element {
  const [text, setText] = useState<string>("");
  const poleId: string = useId();
  const pocitadloId: string = useId();

  const zbyva: number = spocitejZbyvajiciZnakyComposeru(text);
  const muze: boolean = muzeOdeslatComposer(text, odesilaSe);

  function naSubmit(udalost: FormEvent<HTMLFormElement>): void {
    udalost.preventDefault();
    if (!muzeOdeslatComposer(text, odesilaSe)) return;
    onOdeslat(text.trim());
    setText("");
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
      <div className="flex min-w-0 items-end gap-1.5">
        <textarea
          id={poleId}
          value={text}
          onChange={(e) => setText(e.target.value)}
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
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-2 border-inkoust bg-smrk px-4 text-sm font-bold text-papir [touch-action:manipulation] motion-safe:transition-colors motion-safe:hover:bg-inkoust disabled:cursor-not-allowed disabled:opacity-60"
        >
          {odesilaSe ? "Posílám…" : "Poslat"}
        </button>
      </div>
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
      {chyba !== null && (
        <p role="alert" className="mt-1 min-w-0 break-words px-1 text-sm font-semibold text-red-800">
          {chyba}
        </p>
      )}
    </form>
  );
}
