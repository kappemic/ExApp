import type { JSX } from "react";

/** Organizátor výpravy jen pro čtečky, viditelnou vlaječku návrh nemá. */
export default function ZnackaOrganizatora(): JSX.Element {
  return <span className="sr-only"> (organizátor výpravy)</span>;
}
