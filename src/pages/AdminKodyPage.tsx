import type { JSX } from "react";
import CodesPanel from "../components/Admin/CodesPanel";
import HlavickaZpet from "../components/HlavickaZpet";
import { useAuth } from "../hooks/useAuth";

/** Stránka /admin/kody — guard řeší RequireAuth(adminOnly + povolitBootstrap) v App.tsx. */
export default function AdminKodyPage(): JSX.Element {
  const { jeBootstrap } = useAuth();
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <HlavickaZpet zpet="/vice" zpetPopisek="Zpět na Více" titulek="Pozvánkové kódy" varianta="nadpis" />
      <p className="mt-2 text-[15px] text-ink-3">
        Vytvoř kód a pošli ho nováčkovi. Platí 10 minut.
      </p>
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
      <div className="pt-6">
        <CodesPanel />
      </div>
    </main>
  );
}
