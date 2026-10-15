import { useCallback, useState, type JSX } from "react";
import { stahniFotkuZeUrl } from "../../lib/stahni-fotku";

const TLACITKO =
  "inline-flex min-h-[44px] touch-manipulation select-none items-center justify-center rounded-full border-2 border-inkoust bg-papir px-4 text-sm font-bold text-inkoust active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk";

interface StahniFotkuTlacitkoProps {
  url: string;
  nazevSouboru: string;
}

export default function StahniFotkuTlacitko({
  url,
  nazevSouboru,
}: StahniFotkuTlacitkoProps): JSX.Element {
  const [probiha, setProbiha] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const stahni = useCallback(async (): Promise<void> => {
    if (probiha) return;
    setChyba(null);
    setProbiha(true);
    const vysledek = await stahniFotkuZeUrl(url, nazevSouboru);
    setProbiha(false);
    if (!vysledek.ok) setChyba(vysledek.chyba);
  }, [nazevSouboru, probiha, url]);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          void stahni();
        }}
        disabled={probiha || url.length === 0}
        aria-label="Stáhnout fotku"
        className={TLACITKO}
      >
        {probiha ? "Ukládám…" : "Stáhnout"}
      </button>
      {chyba !== null ? (
        <span role="alert" className="max-w-[14rem] text-right text-xs font-semibold text-red-800">
          {chyba}
        </span>
      ) : null}
    </span>
  );
}
