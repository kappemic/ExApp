import type { JSX, ReactNode } from "react";

/** Category / queue filter chips — selected state matches pen ($brand / smrk). */
export function ZpevnikChip({
  vybrany,
  children,
  onClick,
}: {
  vybrany: boolean;
  children: ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={vybrany}
      className={`inline-flex h-8 shrink-0 items-center justify-center rounded-full border px-3 text-[13px] transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk min-[90rem]:h-auto min-[90rem]:px-3.5 min-[90rem]:py-2 ${
        vybrany
          ? "border-transparent bg-smrk font-semibold text-povrch min-[90rem]:bg-inkoust"
          : "border-linka bg-povrch font-medium text-mech min-[90rem]:bg-transparent"
      }`}
    >
      {children}
    </button>
  );
}

export function ZpevnikChipLista({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}