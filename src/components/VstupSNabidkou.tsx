import { useEffect, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";

/**
 * Free-text field with a suggestion list. The list is portaled so a
 * scrolling dialog (profile is fine either way; the member modal clips
 * absolute children) does not hide the options.
 */
export default function VstupSNabidkou({
  id,
  name,
  value,
  onChange,
  nabidky,
  placeholder,
  maxLength,
  className,
  neplatny,
  popisId,
  disabled = false,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (hodnota: string) => void;
  nabidky: readonly string[];
  placeholder: string;
  maxLength: number;
  className: string;
  neplatny: boolean;
  popisId: string | undefined;
  disabled?: boolean;
}): JSX.Element {
  const [otevreno, setOtevreno] = useState(false);
  const [filtruj, setFiltruj] = useState(false);
  const [zvyrazneny, setZvyrazneny] = useState(0);
  const [ram, setRam] = useState<{ top: number; left: number; width: number } | null>(null);
  const vstupRef = useRef<HTMLInputElement>(null);
  const dotaz = value.trim().toLowerCase();
  const shody = filtruj
    ? nabidky.filter((polozka) => polozka.toLowerCase().includes(dotaz))
    : [...nabidky];
  const ukaz = otevreno && !disabled && shody.length > 0;
  const seznamId = `${id}-nabidka`;

  useEffect(() => {
    setZvyrazneny(0);
  }, [value]);

  useEffect(() => {
    if (!ukaz) return;
    const vstup = vstupRef.current;
    if (vstup === null) return;

    function mer(): void {
      const aktualni = vstupRef.current;
      if (aktualni === null) return;
      const box = aktualni.getBoundingClientRect();
      setRam({ top: box.bottom + 4, left: box.left, width: box.width });
    }

    mer();
    window.addEventListener("scroll", mer, true);
    window.addEventListener("resize", mer);
    return () => {
      window.removeEventListener("scroll", mer, true);
      window.removeEventListener("resize", mer);
    };
  }, [ukaz, value]);

  function vyber(polozka: string): void {
    onChange(polozka);
    setOtevreno(false);
  }

  const seznam =
    ukaz && ram !== null
      ? createPortal(
          <ul
            id={seznamId}
            role="listbox"
            style={{ top: ram.top, left: ram.left, width: ram.width }}
            className="nabidka-seznam registrace-nabidka fixed z-[70] max-h-48 overflow-y-auto rounded-md border border-linka bg-papir py-1 shadow-denik"
          >
            {shody.map((polozka, index) => (
              <li key={polozka} role="option" aria-selected={index === zvyrazneny}>
                <button
                  type="button"
                  className={`bez-prejeti block min-h-[44px] w-full px-3.5 text-left text-base text-inkoust ${
                    index === zvyrazneny ? "bg-linka" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    vyber(polozka);
                  }}
                  onClick={() => {
                    vyber(polozka);
                  }}
                  onMouseEnter={() => {
                    setZvyrazneny(index);
                  }}
                >
                  {polozka}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <input
        ref={vstupRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={ukaz}
        aria-controls={seznamId}
        aria-autocomplete="list"
        autoComplete="off"
        enterKeyHint="next"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFiltruj(true);
          setOtevreno(true);
        }}
        onMouseDown={() => {
          setFiltruj(false);
          setOtevreno(true);
        }}
        onFocus={() => {
          setFiltruj(false);
          setOtevreno(true);
        }}
        onClick={() => {
          setFiltruj(false);
          setOtevreno(true);
        }}
        onBlur={() => {
          setOtevreno(false);
        }}
        onKeyDown={(e) => {
          if (!ukaz) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setZvyrazneny((index) => (index + 1) % shody.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setZvyrazneny((index) => (index - 1 + shody.length) % shody.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const polozka = shody[zvyrazneny];
            if (polozka !== undefined) vyber(polozka);
          } else if (e.key === "Escape") {
            setOtevreno(false);
          }
        }}
        aria-invalid={neplatny}
        aria-describedby={popisId}
        placeholder={placeholder}
        maxLength={maxLength}
        className={className}
      />
      {seznam}
    </div>
  );
}
