import type { JSX, ReactNode } from "react";

/** Obrysové ikony 16 px pro řádky seznamu a prázdné stavy. Barva = currentColor. */
function Ikona({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {children}
    </svg>
  );
}

export const IkonaPohar = (): JSX.Element => (
  <Ikona>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
  </Ikona>
);

export const IkonaLide = (): JSX.Element => (
  <Ikona>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
  </Ikona>
);

export const IkonaGraf = (): JSX.Element => (
  <Ikona>
    <path d="M4 4v16h16M8 16v-4M12 16V8M16 16v-6" />
  </Ikona>
);

export const IkonaKlic = (): JSX.Element => (
  <Ikona>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M14 9l2 2" />
  </Ikona>
);

export const IkonaNota = (): JSX.Element => (
  <Ikona>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Ikona>
);

export const IkonaNastaveni = (): JSX.Element => (
  <Ikona>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Ikona>
);

export const IkonaOtaznik = (): JSX.Element => (
  <Ikona>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
  </Ikona>
);

export const IkonaInfo = (): JSX.Element => (
  <Ikona>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5h.01" />
  </Ikona>
);

export const IkonaTelefon = (): JSX.Element => (
  <Ikona>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 8v6M9.5 11.5 12 14l2.5-2.5" />
  </Ikona>
);

export const IkonaLupa = (): JSX.Element => (
  <Ikona>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Ikona>
);

export const IkonaKompas = (): JSX.Element => (
  <Ikona>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" />
  </Ikona>
);

export const IkonaBublina = (): JSX.Element => (
  <Ikona>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12Z" />
  </Ikona>
);

export const IkonaObrazek = (): JSX.Element => (
  <Ikona>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m21 16-5-5-9 9" />
  </Ikona>
);

export const IkonaOdhlasit = (): JSX.Element => (
  <Ikona>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
  </Ikona>
);

export const IkonaNahrat = (): JSX.Element => (
  <Ikona>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Ikona>
);

export const IkonaStahnout = (): JSX.Element => (
  <Ikona>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Ikona>
);
