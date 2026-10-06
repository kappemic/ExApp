import type { JSX } from "react";
import type { Expedition } from "../../lib/mock-expeditions";
import ExpeditionCard from "./ExpeditionCard";
import ExpeditionEmpty from "./ExpeditionEmpty";

export interface ExpeditionListProps {
  expedice: Expedition[];
}

export default function ExpeditionList({ expedice }: ExpeditionListProps): JSX.Element {
  if (expedice.length === 0) {
    return <ExpeditionEmpty />;
  }

  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
    >
      {expedice.map((exp) => (
        <li key={exp.id} className="min-w-0">
          <ExpeditionCard expedice={exp} />
        </li>
      ))}
    </ul>
  );
}
