import type { JSX } from "react";

/** Small ink pennant: this person created the expedition. */
export default function ZnackaOrganizatora(): JSX.Element {
  return (
    <span
      title="Organizátor výpravy"
      className="ml-1.5 inline-flex shrink-0 align-middle text-current"
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        className="inline-block"
      >
        <path fill="currentColor" d="M3 1.5h1.4V14.5H3z" />
        <path fill="currentColor" d="M4.4 2.2 13.2 5.4 4.4 8.6z" />
      </svg>
      <span className="sr-only">Organizátor výpravy</span>
    </span>
  );
}
