import type { JSX, ReactNode } from "react";

/** Trip-list section: a display heading and the rows. No count, no intro line. */
export default function VypravaSekce({
  nadpis,
  nadpisId,
  children,
}: {
  nadpis: string;
  nadpisId: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section aria-labelledby={nadpisId} className="scroll-mt-24">
      <h2 id={nadpisId} className="text-2xl font-bold text-inkoust">
        {nadpis}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
