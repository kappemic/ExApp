import type { JSX } from "react";

/** Shared full-tile wash. Callers pass complete Tailwind class strings. */
export default function VyberVrstva({
  vybrana,
  vybranaTrida,
  prazdnaTrida,
}: {
  vybrana: boolean;
  vybranaTrida: string;
  prazdnaTrida: string;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-[160ms] ease-out motion-reduce:transition-none ${
        vybrana ? vybranaTrida : prazdnaTrida
      }`}
    />
  );
}
