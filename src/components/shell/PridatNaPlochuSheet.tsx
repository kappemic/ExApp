import type { JSX } from "react";
import SpodniSheet from "./SpodniSheet";
import { usePwaInstalace } from "../../hooks/usePwaInstalace";

type PridatNaPlochuSheetProps = {
  otevreno: boolean;
  onZavrit: () => void;
};

export default function PridatNaPlochuSheet({
  otevreno,
  onZavrit,
}: PridatNaPlochuSheetProps): JSX.Element {
  const { naPlose, instalace, pridejNaPlochu } = usePwaInstalace();

  async function naInstalaci(): Promise<void> {
    await pridejNaPlochu();
    onZavrit();
  }

  return (
    <SpodniSheet otevreno={otevreno} titulek="Přidat na plochu" onZavrit={onZavrit}>
      {naPlose ? (
        <p className="text-base leading-relaxed text-inkoust">
          ExApp už běží z ikony na ploše.
        </p>
      ) : instalace !== null ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-2xl bg-smrk px-4 text-base font-bold text-papir"
          onClick={() => void naInstalaci()}
        >
          Přidat na plochu
        </button>
      ) : (
        <p className="text-base leading-relaxed text-inkoust">
          Na iPhonu klepni na Sdílet a pak na Přidat na plochu. V ostatních prohlížečích použij
          nabídku prohlížeče, až ikonu nabídne.
        </p>
      )}
    </SpodniSheet>
  );
}