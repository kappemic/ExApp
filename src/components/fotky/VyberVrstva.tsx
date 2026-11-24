import type { JSX } from "react";
import Ikona from "../Ikona";

/** Shared full-tile wash. Callers pass complete Tailwind class strings. */
export default function VyberVrstva({
  vybrana,
  vybranaTrida,
  prazdnaTrida,
  znacka = false,
}: {
  vybrana: boolean;
  vybranaTrida: string;
  prazdnaTrida: string;
  /** Kroužek v rohu: i na dotyku je poznat, že se fotky dají označit. */
  znacka?: boolean;
}): JSX.Element {
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-[160ms] ease-out motion-reduce:transition-none ${
          vybrana ? vybranaTrida : prazdnaTrida
        }`}
      />
      {znacka ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full border-2 border-papir shadow-[0_1px_3px_rgba(0,0,0,0.4)] ${
            vybrana ? "bg-smrk text-papir" : "bg-black/25"
          }`}
        >
          {vybrana ? <Ikona nazev="check" className="size-3.5" /> : null}
        </span>
      ) : null}
    </>
  );
}
