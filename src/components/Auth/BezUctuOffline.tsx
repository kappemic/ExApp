import { useState, type JSX } from "react";
import { useAuth } from "../../hooks/useAuth";

/**
 * Server neodpověděl a v telefonu není uložený účet. Přihlášení by bez sítě
 * stejně neprošlo, tak se místo formuláře řekne proč a nabídne nový pokus.
 */
export default function BezUctuOffline(): JSX.Element {
  const { overZnovu } = useAuth();
  const [zkousi, setZkousi] = useState(false);

  async function zkus(): Promise<void> {
    setZkousi(true);
    await overZnovu();
    setZkousi(false);
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-[calc(2.5rem+env(safe-area-inset-top,0px))]">
      <h1 className="font-display text-[28px] font-bold tracking-[-0.6px] text-inkoust">Bez spojení</h1>
      <p className="mt-3 text-base leading-relaxed text-mech">
        Nejde se spojit se serverem a v telefonu není uložený přihlášený účet. Až budeš online, ExApp se otevře sama.
      </p>
      <button
        type="button"
        onClick={() => void zkus()}
        disabled={zkousi}
        className="nahled-press mt-6 inline-flex min-h-11 items-center rounded-xl bg-smrk px-5 text-sm font-semibold text-papir focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60"
      >
        {zkousi ? "Zkouším…" : "Zkusit znovu"}
      </button>
    </main>
  );
}
