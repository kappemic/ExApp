import type { JSX } from "react";

const SIPKA =
  "bez-prejeti flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-inkoust transition-colors motion-reduce:transition-none hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]";

const DNES =
  "bez-prejeti min-h-[44px] rounded-xl bg-mlha px-4 text-sm font-semibold text-inkoust transition-colors motion-reduce:transition-none hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]";

function Sipka({ smer }: { smer: "vlevo" | "vpravo" }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d={smer === "vlevo" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

/** Previous / today / next controls shared by the month and week calendars. */
export default function KalendarPosun({
  predchozi,
  dalsi,
  onPredchozi,
  onDalsi,
  onDnes,
}: {
  predchozi: string;
  dalsi: string;
  onPredchozi: () => void;
  onDalsi: () => void;
  onDnes: () => void;
}): JSX.Element {
  return (
    <>
      <button type="button" title={predchozi} aria-label={predchozi} onClick={onPredchozi} className={SIPKA}>
        <Sipka smer="vlevo" />
      </button>
      <button type="button" onClick={onDnes} className={DNES}>
        Dnes
      </button>
      <button type="button" title={dalsi} aria-label={dalsi} onClick={onDalsi} className={SIPKA}>
        <Sipka smer="vpravo" />
      </button>
    </>
  );
}
