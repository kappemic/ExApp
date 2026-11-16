import type { JSX, ReactNode } from "react";

/** In-flow journal frame. Not position:fixed, so the app nav stays usable. */
export default function NahledRamec({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="border-[10px] border-[hsl(var(--ink))]">
      <div className="nahled-snimek border border-[hsl(var(--hairline))] bg-[hsl(var(--background))]">
        <div className="px-4 py-6 md:px-10 md:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
