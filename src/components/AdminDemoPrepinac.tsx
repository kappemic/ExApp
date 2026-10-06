import type { JSX } from "react";
import { useAdminFlag } from "../hooks/useAdminFlag";

interface AdminDemoPrepinacProps {
  /** Unikátní id pro spárování popisku s přepínačem. */
  id?: string;
}

/**
 * Malý demo přepínač admin režimu — pouze UI.
 * `role="switch"` + `aria-checked`, klávesově ovladatelný `<button>`,
 * viditelný focus řeší globální `:focus-visible` v index.css.
 */
export default function AdminDemoPrepinac({
  id = "admin-demo",
}: AdminDemoPrepinacProps): JSX.Element {
  const [jeAdmin, setJeAdmin] = useAdminFlag();
  const popisekId = `${id}-popisek`;

  return (
    <div className="flex min-h-[44px] items-center gap-2.5">
      <span
        id={popisekId}
        className="text-xs font-bold tracking-tight text-mech"
      >
        Admin&nbsp;demo
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={jeAdmin}
        aria-labelledby={popisekId}
        title={jeAdmin ? "Vypnout demo admin režim" : "Zapnout demo admin režim"}
        onClick={() => setJeAdmin(!jeAdmin)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 px-0.5 transition-colors ${
          jeAdmin
            ? "border-inkoust bg-smrk"
            : "border-inkoust/40 bg-white"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full border-2 transition-transform ${
            jeAdmin
              ? "translate-x-5 border-papir bg-papir"
              : "translate-x-0 border-inkoust/40 bg-linka"
          }`}
        />
        <span className="sr-only">{jeAdmin ? "Zapnuto" : "Vypnuto"}</span>
      </button>
      <span
        aria-hidden="true"
        className={`hidden rounded border px-1.5 py-0.5 text-[11px] font-bold sm:inline-block ${
          jeAdmin
            ? "border-smrk bg-smrk/10 text-smrk"
            : "border-linka text-mech"
        }`}
      >
        {jeAdmin ? "ZAP" : "VYP"}
      </span>
    </div>
  );
}
