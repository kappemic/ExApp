import { useEffect, useId, useMemo, useRef, type ChangeEvent, type JSX } from "react";
import { acceptPriloh, formatVelikostiPrilohy, jeFotkaKNahledu } from "../../lib/prilohy-zpravy";
import Ikona from "../Ikona";
import ZnackaSouboru from "./ZnackaSouboru";

const TLACITKO =
  "nahled-press relative inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-mech before:content-[''] hover:text-inkoust disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation] min-[90rem]:size-10 min-[90rem]:bg-povrch-2 [&_svg]:size-[18px] min-[90rem]:[&_svg]:size-4";

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

export interface TacekPrilohProps {
  soubory: readonly File[];
  disabled: boolean;
  onOdebrat: (index: number) => void;
}

/** Vybrané přílohy nad polem zprávy: fotky jako náhledy, soubory jako karty. */
export function TacekPriloh({ soubory, disabled, onOdebrat }: TacekPrilohProps): JSX.Element | null {
  const nahledy = useMemo(
    () => soubory.map((soubor) => (jeFotkaKNahledu(soubor) ? URL.createObjectURL(soubor) : null)),
    [soubory],
  );
  useEffect(
    () => () => {
      for (const url of nahledy) if (url !== null) URL.revokeObjectURL(url);
    },
    [nahledy],
  );

  if (soubory.length === 0) return null;
  return (
    <ul
      aria-label="Přílohy k odeslání"
      className="nabeh-nahoru m-0 mb-2 flex min-w-0 list-none gap-2 overflow-x-auto p-0 pb-1 pr-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {soubory.map((soubor, index) => {
        const nazev: string = soubor.name.trim().length > 0 ? soubor.name : "soubor";
        const nahled = nahledy[index] ?? null;
        return (
          <li key={`${nazev}-${soubor.size}-${index}`} className="relative shrink-0">
            {nahled !== null ? (
              <img src={nahled} alt={nazev} title={nazev} className="block size-16 rounded-xl border border-linka bg-povrch-2 object-cover" />
            ) : (
              <span title={nazev} className="flex h-16 w-[200px] items-center gap-2.5 rounded-xl border border-linka bg-povrch p-2 pr-3">
                <ZnackaSouboru nazev={nazev} />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate text-[12.5px] font-semibold text-inkoust">{nazev}</span>
                  <span className="text-[11px] text-ink-3">{formatVelikostiPrilohy(soubor.size)}</span>
                </span>
              </span>
            )}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Odebrat ${nazev}`}
              title={`Odebrat ${nazev}`}
              onClick={() => onOdebrat(index)}
              className="bez-prejeti absolute -right-1.5 -top-1.5 flex size-6 select-none items-center justify-center rounded-full border-2 border-povrch bg-inkoust text-povrch before:absolute before:-inset-2.5 before:content-[''] [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60"
            >
              <Ikona nazev="x" className="size-3" tloustka={3} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
