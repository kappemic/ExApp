import type { JSX } from "react";
import CodesPanel from "../components/Admin/CodesPanel";
import HlavickaZpet, { ZpetPocitac } from "../components/HlavickaZpet";
import { useAuth } from "../hooks/useAuth";

/** Stránka /admin/kody — guard řeší RequireAuth(adminOnly + povolitBootstrap) v App.tsx. */
export default function AdminKodyPage(): JSX.Element {
  const { jeBootstrap } = useAuth();
  return (
    <main className="mx-auto w-full max-w-lg px-5 sm:max-w-[46rem] pb-6 pt-4 sm:px-6 sm:pt-8 min-[90rem]:max-w-none min-[90rem]:px-10 min-[90rem]:pb-14 min-[90rem]:pt-11">
      <HlavickaZpet zpet="/vice" zpetPopisek="Zpět na Více" titulek="Pozvánkové kódy" varianta="nadpis" className="min-[90rem]:hidden" />
      <ZpetPocitac zpet="/cleny" popisek="Zpět" />
      <h1 className="hidden font-display text-[46px] font-bold leading-[45px] tracking-[-1.4px] text-inkoust min-[90rem]:block">
        Pozvánkové kódy
      </h1>
      {jeBootstrap && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-smrk/30 bg-mlha px-3.5 py-2.5 text-sm leading-relaxed text-inkoust"
        >
          Prvotní nastavení: v systému ještě není žádný vedoucí. Vygeneruj první
          kód níže a pak se s ním zaregistruj — první účet se automaticky stane
          správcem (admin).
        </p>
      )}
      <div className="pt-5 min-[90rem]:pt-8">
        <CodesPanel />
      </div>
    </main>
  );
}
