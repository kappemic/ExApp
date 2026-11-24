import type { JSX } from "react";

/** Barva podle druhu, ať jde PDF od tabulky poznat i bez čtení názvu. */
function tridaTypu(pripona: string): string {
  if (pripona === "pdf") return "bg-akcent-100 text-akcent";
  if (["xls", "xlsx", "ods", "csv"].includes(pripona)) return "bg-mlha text-smrk";
  if (["ppt", "pptx"].includes(pripona)) return "bg-okr-100 text-okr";
  if (pripona === "gpx") return "bg-smrk text-povrch";
  return "bg-povrch-2 text-mech";
}

/** Čtvereček se zkratkou typu souboru: PDF, DOCX, GPX… */
export default function ZnackaSouboru({ nazev, className = "size-10" }: { nazev: string; className?: string }): JSX.Element {
  const pripona = /\.([A-Za-z0-9]{1,5})$/.exec(nazev)?.[1]?.toLowerCase() ?? "";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-[10px] text-[10px] font-bold uppercase tracking-[0.3px] ${tridaTypu(pripona)} ${className}`}
    >
      {pripona.length > 0 ? pripona : "?"}
    </span>
  );
}
