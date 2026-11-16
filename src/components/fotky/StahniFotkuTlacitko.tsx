import { useCallback, useState, type JSX } from "react";
import { stahniFotkuZeUrl } from "../../lib/stahni-fotku";
import { fotkyLightboxIkona } from "./fotky-ui";

const TLACITKO = `${fotkyLightboxIkona} disabled:opacity-60`;

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
        aria-label={probiha ? "Ukládám fotku" : "Stáhnout fotku"}
        title={probiha ? "Ukládám…" : "Stáhnout"}
        className={TLACITKO}
      >
        <IkonaStazeni />
      </button>
      {chyba !== null ? (
        <span role="alert" className="max-w-[14rem] text-right text-xs font-semibold text-red-800">
          {chyba}
        </span>
      ) : null}
    </span>
  );
}

function IkonaStazeni(): JSX.Element {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M12 4v10M8 10.5 12 14.5 16 10.5M5 19h14"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
