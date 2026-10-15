import type { JSX } from "react";

/** Full-tile smrk (green) overlay when selected for download; border/ring on the parent tile. */
export default function StahovaniVyberVrstva({
  vybrana,
}: {
  vybrana: boolean;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 transition-opacity duration-[160ms] ease-out motion-reduce:transition-none ${
        vybrana
          ? "bg-smrk/45 opacity-100"
          : "bg-smrk/0 opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-smrk/15 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
      }`}
    />
  );
}
