import type { JSX } from "react";
import VyberVrstva from "./VyberVrstva";

/** Full-tile jantar overlay when selected. The inset ring sits on this layer so it stays above the wash. */
export default function MazaniVyberVrstva({
  vybrana,
}: {
  vybrana: boolean;
}): JSX.Element {
  return (
    <VyberVrstva
      vybrana={vybrana}
      vybranaTrida="bg-jantar/45 opacity-100 ring-2 ring-inset ring-jantar"
      prazdnaTrida="bg-jantar/0 opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-jantar/15 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
    />
  );
}
