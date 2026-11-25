import type { JSX } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSpojeni } from "../lib/spojeni";

/** Řádek nad obsahem stránky, dokud server neodpovídá. */
export default function OfflinePruh(): JSX.Element | null {
  const { bezOvereni } = useAuth();
  const spojeno = useSpojeni();
  const { pathname, search } = useLocation();
  // Otevřené vlákno chatu má přesnou výšku displeje a výpadek hlásí samo.
  const vlaknoChatu = pathname === "/chat" && new URLSearchParams(search).has("konverzace");
  if ((spojeno && !bezOvereni) || vlaknoChatu) return null;
  return (
    <div className="mx-auto w-full max-w-[46rem] px-5 pt-3 sm:px-6 min-[90rem]:max-w-none min-[90rem]:px-10">
      <p
        role="status"
        className="flex items-center gap-2.5 rounded-xl border border-linka bg-povrch px-3.5 py-2.5 text-[13px] leading-[18px] text-inkoust"
      >
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-okr" />
        Bez spojení. Vidíš naposledy uložená data, změny teď uložit nejdou.
      </p>
    </div>
  );
}
