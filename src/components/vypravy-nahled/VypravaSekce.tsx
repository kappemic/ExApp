import type { JSX, ReactNode } from "react";
import SectionTag from "./SectionTag";
import VerticalLabel from "./VerticalLabel";

export default function VypravaSekce({
  tag,
  tagId,
  svisle,
  strana,
  pozadi,
  odstin,
  pocetText,
  uvod,
  children,
}: {
  tag: string;
  tagId: string;
  svisle: string;
  strana: "vlevo" | "vpravo";
  pozadi: "papir" | "panel";
  /** Faded print wash behind the rows. Omitted sections stay the paper. */
  odstin?: "ruz" | "mech" | "nebe";
  pocetText: string;
  uvod?: string;
  children: ReactNode;
}): JSX.Element {
  const papir = pozadi === "papir";
  return (
    <section
      aria-labelledby={tagId}
      className={`relative scroll-mt-24 border border-[hsl(var(--hairline))] px-4 pb-8 pt-10 md:px-8 ${
        odstin === "ruz"
          ? "nahled-odstin-ruz"
          : odstin === "mech"
            ? "nahled-odstin-mech"
            : odstin === "nebe"
              ? "nahled-odstin-nebe"
              : papir
                ? "bg-[hsl(var(--background))]"
                : "bg-[hsl(var(--secondary))]"
      } ${strana === "vlevo" ? "xl:pl-14" : "xl:pr-14"}`}
    >
      <SectionTag id={tagId} text={tag} />
      <VerticalLabel text={svisle} strana={strana} />
      {pocetText.length > 0 ? (
        <p className="absolute right-4 top-5 font-condensed text-[11px] font-semibold uppercase tracking-[0.25em] tabular-nums text-[hsl(var(--muted-foreground))]">
          {pocetText}
        </p>
      ) : null}
      {uvod !== undefined && uvod.length > 0 ? (
        <p className="max-w-[70ch] text-sm leading-relaxed text-[hsl(var(--foreground)/0.8)]">
          {uvod}
        </p>
      ) : null}
      <div className={uvod !== undefined && uvod.length > 0 ? "mt-6" : undefined}>
        {children}
      </div>
    </section>
  );
}
