import { useId, useRef, type ChangeEvent, type JSX } from "react";
import { acceptPriloh } from "../../lib/prilohy-zpravy";

const TLACITKO =
  "bez-prejeti inline-flex min-h-[44px] min-w-[44px] shrink-0 select-none items-center justify-center rounded-[10px] bg-povrch-2 text-mech [-webkit-touch-callout:none] [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk active:scale-[0.97] motion-safe:transition-transform disabled:cursor-not-allowed disabled:opacity-60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka [@media(hover:hover)_and_(pointer:fine)]:hover:text-inkoust";

const TLACITKO_TICHE =
  "bez-prejeti inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 select-none items-center justify-center rounded-lg text-mech [-webkit-touch-callout:none] [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-inkoust";

export interface TlacitkoPrilohyProps {
  disabled: boolean;
  onVyber: (soubory: File[]) => void;
  /** `tichy` drops the ink ring. Used by the expedition log. */
  vzhled?: "krouzek" | "tichy";
}

/** Paperclip. Opens the system picker; the parent validates before send. */
export function TlacitkoPrilohy({
  disabled,
  onVyber,
  vzhled = "krouzek",
}: TlacitkoPrilohyProps): JSX.Element {
  const vstupId: string = useId();
  const vstupRef = useRef<HTMLInputElement>(null);

  function naZmenu(udalost: ChangeEvent<HTMLInputElement>): void {
    const seznam: FileList | null = udalost.target.files;
    const soubory: File[] = seznam === null ? [] : Array.from(seznam);
    udalost.target.value = "";
    if (soubory.length === 0) return;
    onVyber(soubory);
  }

  return (
    <span className="relative shrink-0">
      <input
        id={vstupId}
        ref={vstupRef}
        type="file"
        multiple
        accept={acceptPriloh()}
        tabIndex={-1}
        className="sr-only"
        aria-hidden="true"
        disabled={disabled}
        onChange={naZmenu}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label="Přiložit soubor"
        title="Přiložit soubor"
        onClick={() => vstupRef.current?.click()}
        className={vzhled === "tichy" ? TLACITKO_TICHE : TLACITKO}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l8.49-8.48a4 4 0 015.65 5.65l-8.48 8.49a2 2 0 01-2.83-2.83l7.78-7.78" />
        </svg>
      </button>
    </span>
  );
}

export interface ChipyPrilohProps {
  soubory: readonly File[];
  disabled: boolean;
  onOdebrat: (index: number) => void;
  /** `tichy` sits on the expedition writing line, not in a chat pill. */
  vzhled?: "krouzek" | "tichy";
}

/** Selected files. Each chip can be removed; long names truncate. */
export function ChipyPriloh({
  soubory,
  disabled,
  onOdebrat,
  vzhled = "krouzek",
}: ChipyPrilohProps): JSX.Element | null {
  if (soubory.length === 0) return null;
  return (
    <ul className="mt-1.5 flex min-w-0 flex-wrap gap-1.5 px-0.5">
      {soubory.map((soubor, index) => {
        const nazev: string = soubor.name.trim().length > 0 ? soubor.name : "soubor";
        return (
          <li
            key={`${nazev}-${soubor.size}-${index}`}
            className={
              vzhled === "tichy"
                ? "flex max-w-full min-w-0 items-center gap-0.5 rounded-lg border border-pole bg-mlha/60 py-0.5 pr-0.5 pl-2.5"
                : "flex max-w-full min-w-0 items-center gap-0.5 rounded-full border border-inkoust/30 bg-papir py-0.5 pr-0.5 pl-2.5"
            }
          >
            <span
              title={nazev}
              className="min-w-0 truncate text-[12px] font-semibold text-inkoust"
            >
              {nazev}
            </span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Odebrat ${nazev}`}
              title={`Odebrat ${nazev}`}
              onClick={() => onOdebrat(index)}
              className="bez-prejeti inline-flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full border-0 bg-transparent text-base leading-none text-inkoust [-webkit-touch-callout:none] [touch-action:manipulation] active:scale-[0.97] disabled:opacity-60"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
