import type { JSX } from "react";
import Ikona from "../Ikona";

/** Songbook search field with pen-style rounded bar. */
export function ZpevnikHledani({
  id,
  value,
  onChange,
  placeholder = "Hledat píseň",
}: {
  id: string;
  value: string;
  onChange: (hodnota: string) => void;
  placeholder?: string;
}): JSX.Element {
  return (
    <label className="relative block" htmlFor={id}>
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3" aria-hidden="true">
        <Ikona nazev="search" className="size-4 min-[90rem]:size-[17px]" />
      </span>
      <input
        id={id}
        value={value}
        onChange={(udalost) => onChange(udalost.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-linka bg-povrch pl-10 pr-3.5 text-base text-inkoust placeholder:text-[#9aa189] focus:border-pole min-[90rem]:h-[46px] min-[90rem]:text-sm min-[90rem]:placeholder:text-ink-3"
      />
    </label>
  );
}