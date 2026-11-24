import type { JSX } from "react";
import VyberVrstva from "./VyberVrstva";

/** Full-tile smrk overlay when selected for download or in the trash. The inset ring sits on this layer so it stays above the wash. */
export default function StahovaniVyberVrstva({
  vybrana,
}: {
  vybrana: boolean;
}): JSX.Element {
  return (
    <VyberVrstva
      vybrana={vybrana}
      znacka
      vybranaTrida="bg-smrk/45 opacity-100 ring-2 ring-inset ring-smrk"
      prazdnaTrida="bg-smrk/0 opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-smrk/15 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
    />
  );
}
