import type { JSX } from "react";
import CodesPanel from "../components/Admin/CodesPanel";
import { useAuth } from "../hooks/useAuth";

/** Stránka /admin/kody — guard řeší RequireAuth(adminOnly + povolitBootstrap) v App.tsx. */
export default function AdminKodyPage(): JSX.Element {
  const { jeBootstrap } = useAuth();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="border-b-2 border-inkoust pb-5">
        <p className="text-sm font-medium text-mech">ExApp · správa</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Pozvánkové kódy
        </h1>
        <p className="mt-2 max-w-2xl text-base text-inkoust/75">
          Vygeneruj kód, pošli ho nováčkovi a on se s ním do 10 minut zaregistruje.
        </p>
      </header>
      {jeBootstrap && (
        <p
          role="status"
          className="mt-4 rounded-md border-2 border-smrk/40 bg-smrk/10 px-3.5 py-2.5 text-sm leading-relaxed text-inkoust"
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
