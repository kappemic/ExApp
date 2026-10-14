import type { JSX } from "react";
import type { ApiZprava } from "../../lib/diskuze-api";
import { formatCasKratce } from "../../lib/format-cas";

export interface ZpravaBublinaProps {
  zprava: ApiZprava;
  /** Zobrazované jméno autora (řeší i dlouhý nick / e-mail, viz break-ui). */
  autorPopisek: string;
  jeMoje: boolean;
  muzeMazat: boolean;
  mazeSe: boolean;
  onSmazat: (id: string) => void;
}

/**
 * Vytáhne iniciály z jména po grapheme clusterech (emoji-safe).
 * Bere první a poslední slovo, max 2 znaky. Fallback „?“ pro prázdné.
 * Zrcadleno v tests/diskuze-box.test.tsx (pure kopie).
 */
export function inicialyProJmeno(jmeno: string): string {
  const ciste: string = jmeno.trim();
  if (ciste.length === 0) return "?";
  const slova: string[] = ciste.split(/\s+/).filter((s) => s.length > 0);
  const vybrane: string[] =
    slova.length === 1 ? [slova[0]] : [slova[0], slova[slova.length - 1]];
  const prvniZnak = (slovo: string): string => {
    try {
      const segmenter = new Intl.Segmenter("cs", { granularity: "grapheme" });
      const prvni = segmenter.segment(slovo)[Symbol.iterator]().next();
      if (!prvni.done && typeof prvni.value.segment === "string") {
        return prvni.value.segment;
      }
    } catch {
      /* Intl.Segmenter není všude — fallback na první kódový bod níže. */
    }
    return Array.from(slovo)[0] ?? "?";
  };
  return vybrane
    .map((slovo) => prvniZnak(slovo).toUpperCase())
    .join("")
    .slice(0, 4);
}

/**
 * „1. 10. 10:00" — krátký český formát času zprávy.
 * Re-export z `src/lib/format-cas.ts` pro zpětnou kompatibilitu
 * test-importů; jediná implementace žije ve `formatCasKratce`.
 */
export function formatCasZpravy(iso: string): string {
  return formatCasKratce(iso);
}

/**
 * Jedna bublina vlákna — deníkové tokeny (border-inkoust, bg-papir,
 * shadow-denik). break-ui hardening: avatar `flex-shrink-0`, textový
 * sloupec `min-w-0`, dlouhý nick/e-mail/text `overflow-wrap:anywhere`,
 * akce `flex-shrink-0`, čas `tabular-nums`. React escapuje `{text}`
 * automaticky — text se nikdy nevkládá jako HTML (XSS-safe render).
 */
export default function ZpravaBublina({
  zprava,
  autorPopisek,
  jeMoje,
  muzeMazat,
  mazeSe,
  onSmazat,
}: ZpravaBublinaProps): JSX.Element {
  const cas: string = formatCasZpravy(zprava.createdAt);
  const jeOptimisticka: boolean = zprava.id.startsWith("optimistic-");

  return (
    <li
      className={`flex gap-2.5 ${jeMoje ? "flex-row-reverse" : "flex-row"}`}
    >
      <span
        aria-hidden="true"
        title={autorPopisek}
        className={`flex h-9 w-9 shrink-0 grow-0 basis-9 select-none items-center justify-center rounded-full border-2 border-inkoust text-[13px] font-extrabold ${
          jeMoje ? "bg-inkoust text-papir" : "bg-linka/70 text-inkoust"
        }`}
      >
        {inicialyProJmeno(autorPopisek)}
      </span>

      <div className="min-w-0 flex-1">
        <div
          className={`rounded-2xl border-2 border-inkoust px-3 py-2 shadow-denik ${
            jeMoje ? "bg-smrk text-papir" : "bg-papir text-inkoust"
          } ${jeOptimisticka ? "opacity-70" : ""}`}
        >
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span
              title={autorPopisek}
              className={`min-w-0 flex-1 truncate text-[12px] font-bold ${
                jeMoje ? "text-papir/90" : "text-inkoust/70"
              }`}
              style={{ overflowWrap: "anywhere" }}
            >
              {autorPopisek}
              {jeMoje && (
                <span className="ml-1.5 inline-flex shrink-0 whitespace-nowrap rounded-full border border-current px-1.5 py-px align-middle text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                  ty
                </span>
              )}
            </span>
            {cas.length > 0 && (
              <time
                dateTime={zprava.createdAt}
                className={`shrink-0 text-[11px] tabular-nums ${
                  jeMoje ? "text-papir/75" : "text-inkoust/55"
                }`}
              >
                {cas}
              </time>
            )}
          </div>
          <p
            className="mt-1 min-w-0 break-words text-[15px] leading-relaxed"
            style={{ overflowWrap: "anywhere" }}
          >
            {zprava.text}
            {jeOptimisticka && (
              <span className="sr-only"> (odesílá se…)</span>
            )}
          </p>
        </div>

        <div className="mt-1 flex min-h-[24px] items-center gap-2">
          {jeOptimisticka ? (
            <span
              role="status"
              className={`text-[12px] font-semibold ${
                jeMoje ? "text-right" : ""
              } text-inkoust/55`}
            >
              Odesílá se…
            </span>
          ) : (
            muzeMazat && (
              <button
                type="button"
                onClick={() => onSmazat(zprava.id)}
                disabled={mazeSe}
                aria-label={`Smazat zprávu: ${zprava.text.slice(0, 60)}`}
                title={mazeSe ? "Mazání probíhá…" : "Smazat zprávu"}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2 text-[12px] font-bold text-inkoust/55 underline underline-offset-2 [touch-action:manipulation] motion-safe:transition-colors motion-safe:hover:text-red-800 disabled:opacity-60"
              >
                {mazeSe ? "Mažu…" : "Smazat"}
              </button>
            )
          )}
        </div>
      </div>
    </li>
  );
}
